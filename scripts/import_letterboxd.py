#!/usr/bin/env python3
"""
Import a Letterboxd export (likes / watched / ratings) into src/data/movies.ts.

Usage:
    python scripts/import_letterboxd.py [csv_path] [--omdb-key KEY] [--out PATH]

What it does
------------
* Reads the Letterboxd CSV (columns: title, year, slug, url, rating, genres,
  cast, directors, poster).
* Downloads each poster once into .poster_cache/ and samples it with PIL:
    - `spine` = average colour of the poster's LEFT 6% (the edge that shows on
      the shelf when the case is turned side-on)
    - `band`  = the most saturated mid-luminance pixel, saturation boosted
    - `ink`   = near-black on light spines, near-white on dark ones
* Derives the physical props (discs / width / height / finish / lean / depth /
  wear / face / caps) deterministically from an MD5 hash of the film's slug, so
  the shelf looks lived-in but is byte-identical on every re-run.
* Writes src/data/movies.ts, newest-rated first.

Optional OMDb enrichment (--omdb-key)
-------------------------------------
Letterboxd exports carry no runtime, studio or plot. Pass --omdb-key to fill
those in (free key: https://www.omdbapi.com/apikey.aspx). Without a key those
fields are left empty and the UI simply omits them.

Column mapping notes
--------------------
Letterboxd separates multi-values with "|", not ", ". Its genre vocabulary is
TMDB's ("Science Fiction", not "Sci-Fi"), which is already standardised, so the
genre pills are generated straight from the data with no remapping.
"""

from __future__ import annotations

import argparse
import colorsys
import csv
import hashlib
import io
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

try:
    from PIL import Image
except ImportError:  # pragma: no cover
    sys.exit("Pillow is required:  pip install Pillow")

ROOT = Path(__file__).resolve().parent.parent
CACHE = ROOT / ".poster_cache"

# ---------------------------------------------------------------------------
# Deterministic per-title randomness
# ---------------------------------------------------------------------------


def _hash(seed: str) -> int:
    return int.from_bytes(hashlib.md5(seed.encode("utf-8")).digest()[:8], "big")


def rnd(seed: str, salt: str, lo: float, hi: float) -> float:
    """Stable float in [lo, hi) derived from the seed + salt."""
    h = _hash(f"{seed}:{salt}")
    return lo + (h % 100_000) / 100_000 * (hi - lo)


def pick(seed: str, salt: str, options: list[str]) -> str:
    return options[_hash(f"{seed}:{salt}") % len(options)]


def is_int(seed: str, salt: str, pct: int) -> bool:
    return _hash(f"{seed}:{salt}") % 100 < pct


# ---------------------------------------------------------------------------
# Physical sizing
# ---------------------------------------------------------------------------

# Real Amaray keepcases are all the same 191mm shell; only spine thickness
# varies. Height stays in a narrow band and width carries all the variety.
FRANCHISES = (
    "lord of the rings",
    "matrix",
    "star wars",
    "spider-man",
    "deadpool",
    "dune",
    "blade runner",
    "top gun",
    "attack on titan",
    "demon slayer",
    "jujutsu kaisen",
    "friday the 13th",
    "indiana jones",
    "harry potter",
    "godfather",
    "avengers",
    "batman",
    "alien",
    "terminator",
)


def derive_discs(title: str, runtime: int, rating: int) -> str:
    """boxset for franchises / very long films, double for favourites, else single."""
    t = title.lower()
    if any(f in t for f in FRANCHISES) or runtime > 165:
        return "boxset"
    if runtime > 110 or rating >= 9:
        return "double"
    return "single"


WIDTH_BANDS = {"single": (16.0, 20.0), "double": (26.0, 34.0), "boxset": (42.0, 58.0)}


def physical(seed: str, title: str, runtime: int, rating: int) -> dict:
    discs = derive_discs(title, runtime, rating)
    lo, hi = WIDTH_BANDS[discs]
    return {
        "discs": discs,
        # near-constant: real keepcases do not vary in height
        "height": 224 + int(rnd(seed, "h", 0, 11)),
        "width": round(rnd(seed, "w", lo, hi)),
        # ~65/35 clear shell vs printed matte sleeve, for shelf variety
        "finish": "clear" if is_int(seed, "fin", 65) else "matte",
        "lean": round(rnd(seed, "lean", -5, 0), 2),
        "depth": round(rnd(seed, "depth", -7, 7), 2),
        "wear": round(rnd(seed, "wear", 0, 0.35), 3),
        "face": pick(seed, "face", ["serif", "serif", "serif", "sans", "mono"]),
        "caps": is_int(seed, "caps", 45),
    }


# ---------------------------------------------------------------------------
# Poster palette sampling
# ---------------------------------------------------------------------------


def luminance(rgb: tuple[int, int, int]) -> float:
    r, g, b = (c / 255 for c in rgb)
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def saturation(rgb: tuple[int, int, int]) -> float:
    r, g, b = (c / 255 for c in rgb)
    mx, mn = max(r, g, b), min(r, g, b)
    return 0.0 if mx == 0 else (mx - mn) / mx


def hexof(rgb: tuple[int, int, int]) -> str:
    return "#%02x%02x%02x" % rgb


# A spine sampled from a poster's white edge comes out near-white (#fdfdfd for
# Django Unchained, for one). The case then renders as a blank white slab
# against the paper background — it reads as a missing cover even though the
# poster is fine. Clamping lightness keeps the poster's hue, so a pale-blue
# edge still gives a blue case; it just can't give a white one.
MAX_SPINE_LIGHTNESS = 0.52


def tame_spine(rgb: tuple[int, int, int]) -> tuple[int, int, int]:
    """Darken an over-light spine to the clamp, preserving hue and saturation."""
    r, g, b = (c / 255 for c in rgb)
    h, l, s = colorsys.rgb_to_hls(r, g, b)
    if l <= MAX_SPINE_LIGHTNESS:
        return rgb
    return tuple(round(c * 255) for c in colorsys.hls_to_rgb(h, MAX_SPINE_LIGHTNESS, s))


def fetch_poster(url: str, slug: str) -> Image.Image | None:
    CACHE.mkdir(exist_ok=True)
    ext = os.path.splitext(url.split("?")[0])[1] or ".jpg"
    cached = CACHE / f"{slug}{ext}"
    if cached.exists():
        try:
            return Image.open(cached).convert("RGB")
        except Exception:
            cached.unlink(missing_ok=True)
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "movieshelf-import/1.0"})
        with urllib.request.urlopen(req, timeout=25) as resp:
            data = resp.read()
        cached.write_bytes(data)
        return Image.open(io.BytesIO(data)).convert("RGB")
    except (urllib.error.URLError, OSError, ValueError) as exc:
        print(f"  ! poster fetch failed for {slug}: {exc}", file=sys.stderr)
        return None


def palette(img: Image.Image | None) -> dict:
    """spine = left-edge average, band = punchiest mid-tone, ink = contrast pick."""
    if img is None:
        return {"spine": "#584f46", "band": None, "ink": "#faf7f0"}

    w, h = img.size
    scale = 80 / w if w > 80 else 1.0
    small = img.resize((max(1, round(w * scale)), max(1, round(h * scale))))
    w, h = small.size
    px = small.load()

    # --- spine: average of the left 6% of the poster
    edge_w = max(1, round(w * 0.06))
    tr = tg = tb = n = 0
    for y in range(h):
        for x in range(edge_w):
            r, g, b = px[x, y]
            tr += r
            tg += g
            tb += b
            n += 1
    spine = (tr // n, tg // n, tb // n)

    # --- band: most saturated pixel that isn't near-black or blown out
    best, best_score = None, -1.0
    for y in range(0, h, 2):
        for x in range(0, w, 2):
            rgb = px[x, y]
            lum = luminance(rgb)
            if not (0.22 < lum < 0.78):
                continue
            score = saturation(rgb)
            if score > best_score:
                best, best_score = rgb, score
    band = None
    if best is not None:
        # push the accent away from grey so it reads as a printed rule, not a smudge
        mean = sum(best) / 3
        band = tuple(min(255, max(0, round(mean + (c - mean) * 1.35))) for c in best)

    spine = tame_spine(spine)
    ink = "#241f19" if luminance(spine) > 0.55 else "#faf7f0"
    return {"spine": hexof(spine), "band": hexof(band) if band else None, "ink": ink}


# ---------------------------------------------------------------------------
# Optional OMDb enrichment
# ---------------------------------------------------------------------------


def omdb_lookup(title: str, year: str, key: str) -> dict:
    url = (
        "https://www.omdbapi.com/?"
        + urllib.parse.urlencode({"t": title, "y": year, "plot": "short", "apikey": key})
    )
    try:
        with urllib.request.urlopen(url, timeout=20) as resp:
            data = json.load(resp)
    except Exception as exc:
        print(f"  ! OMDb lookup failed for {title}: {exc}", file=sys.stderr)
        return {}
    if data.get("Response") != "True":
        return {}
    runtime = 0
    try:
        runtime = int(str(data.get("Runtime", "0")).split(" ")[0])
    except ValueError:
        pass
    return {
        "runtime": runtime,
        "studio": data.get("Production") or data.get("Production Company") or "",
        "blurb": (data.get("Plot") or "").strip(),
    }


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------


def ts_str(value) -> str:
    if value is None:
        return "undefined"
    return json.dumps(value, ensure_ascii=False)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("csv", nargs="?", default=str(ROOT / "sonnytrush_likes.csv"))
    ap.add_argument("--out", default=str(ROOT / "src" / "data" / "movies.ts"))
    ap.add_argument("--omdb-key", default=os.environ.get("OMDB_API_KEY", ""))
    ap.add_argument("--no-cache", action="store_true")
    args = ap.parse_args()

    if args.no_cache and CACHE.exists():
        for f in CACHE.iterdir():
            f.unlink()

    with open(args.csv, encoding="utf-8") as fh:
        rows = [r for r in csv.DictReader(fh) if (r.get("title") or "").strip()]

    if not rows:
        sys.exit(f"No rows found in {args.csv}")

    if args.omdb_key:
        print(f"OMDb enrichment ON ({len(rows)} titles)")
    else:
        print("OMDb enrichment OFF — runtime/studio/blurb will be empty")

    out: list[dict] = []
    seen: set[str] = set()

    for i, r in enumerate(rows, 1):
        title = r["title"].strip()
        slug = (r.get("slug") or "").strip() or title.lower().replace(" ", "-")
        uid = slug
        if uid in seen:
            uid = f"{slug}-{i}"
        seen.add(uid)

        # Letterboxd multi-values are "|"-separated
        genres = [g.strip() for g in (r.get("genres") or "").split("|") if g.strip()]
        directors = [d.strip() for d in (r.get("directors") or "").split("|") if d.strip()]
        rating = int(r["rating"]) if (r.get("rating") or "").strip().isdigit() else 0
        year = int(r["year"]) if (r.get("year") or "").strip().isdigit() else 0

        extra = {}
        if args.omdb_key:
            extra = omdb_lookup(title, str(year), args.omdb_key)

        runtime = int(extra.get("runtime") or 0)

        print(f"  [{i}/{len(rows)}] {title}")
        img = fetch_poster(r["poster"].strip(), uid) if r.get("poster") else None
        pal = palette(img)

        movie = {
            "id": uid,
            "title": title,
            "director": ", ".join(directors),
            "genres": genres,
            "poster": (r.get("poster") or "").strip(),
            "year": year,
            "blurb": extra.get("blurb", ""),
            "rating": rating,
            "watched": "",
            "studio": extra.get("studio", ""),
            "runtime": runtime,
            **physical(uid, title, runtime, rating),
            "spine": pal["spine"],
            "ink": pal["ink"],
        }
        if pal["band"]:
            movie["band"] = pal["band"]
        out.append(movie)

    # newest-rated first — Letterboxd rows are already in reverse-chronological
    # order in most exports, so keep file order but let unrated titles sink.
    out.sort(key=lambda m: (m["rating"] == 0,))

    lines = [
        "// GENERATED by scripts/import_letterboxd.py — do not edit by hand.",
        "// Re-run:  python scripts/import_letterboxd.py",
        "",
        "export type Movie = {",
        "  id: string;",
        "  title: string;",
        "  director: string;",
        "  genres?: string[];",
        "  poster: string;",
        "  year: number;",
        "  blurb: string;",
        "  rating: number;",
        "  watched: string;",
        "  recommender?: string;",
        "  studio: string;",
        "  runtime: number;",
        '  discs: "single" | "double" | "boxset";',
        '  finish: "clear" | "matte";',
        "  spine: string;",
        "  band?: string;",
        "  ink: string;",
        '  face: "serif" | "sans" | "mono";',
        "  caps?: boolean;",
        "  width: number;",
        "  height: number;",
        "  lean: number;",
        "  depth: number;",
        "  wear: number;",
        "  spineImage?: string;",
        "};",
        "",
        "export const movies: Movie[] = [",
    ]

    order = [
        "id", "title", "director", "genres", "poster", "year", "blurb", "rating",
        "watched", "studio", "runtime", "discs", "finish", "spine", "band", "ink",
        "face", "caps", "width", "height", "lean", "depth", "wear",
    ]
    for m in out:
        lines.append("  {")
        for k in order:
            if k not in m or m[k] is None:
                continue
            lines.append(f"    {k}: {ts_str(m[k])},")
        lines.append("  },")
    lines.append("];")
    lines.append("")

    dest = Path(args.out)
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_text("\n".join(lines), encoding="utf-8")
    print(f"\nWrote {len(out)} movies -> {dest}")


if __name__ == "__main__":
    main()
