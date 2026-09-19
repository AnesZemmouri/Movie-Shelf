# movieshelf

A single-page personal movie library. Films are shelved as 3D DVD keepcases —
real poster art on the cover, a spine colour sampled from that poster, and a
spine **thickness** driven by disc count — on a horizontally scrolling rail that
curves away at the edges.

Hover a case and it pulls toward you with a metadata card. Click one and it
slides out of the shelf into a large poster view, with the shelf blurred behind
it.

## Quick start

```bash
npm install
npm run dev      # http://localhost:5173
```

| Script | Does |
| --- | --- |
| `npm run dev` | Vite dev server with HMR |
| `npm run build` | `tsc -b` then `vite build` → `dist/` |
| `npm run lint` | oxlint |
| `npm run preview` | serve the built `dist/` |

Stack: Vite 8, React 19, TypeScript, Tailwind v4 (via `@tailwindcss/vite`).
No test runner is configured.

## The library data

`src/data/movies.ts` is **generated — don't edit it by hand.** Rebuild it from a
Letterboxd export:

```bash
python scripts/import_letterboxd.py [csv] [--omdb-key KEY]
```

Requires Python 3 and Pillow (`pip install Pillow`). The default input is
`sonnytrush_likes.csv`, with Letterboxd's columns:
`title, year, slug, url, rating, genres, cast, directors, poster`.

What the importer does:

- Downloads each poster once into `.poster_cache/`, then samples it — the **left
  6%** averaged into `spine`, the most saturated mid-tone into `band`, and `ink`
  chosen for contrast.
- Derives every physical prop (`discs`, `width`, `height`, `finish`, `lean`,
  `depth`, `wear`, `face`, `caps`) from an **MD5 hash of the slug**. The shelf
  looks lived-in but is byte-identical on every re-run, except for the palette
  colours, which come from the artwork.
- Writes `movies.ts` rated-first.

`--omdb-key` is optional and only enriches `runtime`, `studio` and `blurb`
(free key at <https://www.omdbapi.com/apikey.aspx>). Without it those stay empty
and the UI omits them. `--no-cache` re-downloads every poster.

`.poster_cache/` is a local download cache and isn't in `.gitignore` — add it if
you commit this.

**`spine` lightness is clamped at 0.52.** A poster whose left edge is white
(Django Unchained is one) otherwise produces a white case that reads as a
missing cover. Clamping keeps the poster's hue, so a pale-blue edge still gives
a blue case — it just can't give a white one.

## How the shelf is built

| File | Job |
| --- | --- |
| `src/data/movies.ts` | The `Movie` type and the library array. Generated. |
| `src/components/MovieCase.tsx` | One 3D keepcase: spine, cover, top edge, hover card. |
| `src/components/Shelf.tsx` | The scrolling rail: curve, drag, loop, pull-out. |
| `src/components/MovieDetail.tsx` | The case sliding out of the shelf. |
| `src/components/LibraryFilter.tsx` | Mood search + genre pills. |
| `src/components/TypedTitle.tsx` | The typed heading. |
| `src/components/caseFaces.ts` | `POSTER_W` and the face→font map. |
| `src/lib/librarySearch.ts` | Client-side ranking for the mood bar. |
| `src/styles.css` | Design tokens, utilities, keyframes. |

### Things that look wrong but aren't

These are deliberate, and each one was a bug before it was a fix:

- **Spine height is near-constant (224–234px).** Real Amaray keepcases are all
  the same shell; only the spine *thickness* varies. All size variety is in
  `width`. Varying height too reads as "books", not "DVDs".
- **The outer `<button>` never transforms.** It stays put as the hover/click hit
  target while an inner `<span>` does all the 3D work. If the button moved, the
  case would slide out from under the pointer.
- **The front cover sets `backfaceVisibility: hidden`.** A cover plane's normal
  sits at 90°, so the rail's `rotateY` curve faces it toward you on one side and
  shows its *back* on the other. Without this the back renders as a mirrored
  poster slab and the left end of the rail becomes a pile of overlapping art.
- **The case top is a shallow lip (`TOP_DEPTH = 26`), not the real case depth.**
  The 3D transform multiplies depth by `sin(ry)`, so a full-depth top slides
  ~100px sideways at the rail's ±34° and paints dark diagonals over neighbours.
- **`Shelf` tracks `shouldLoop` and `overflows` separately.** They answer
  different questions (is 3 copies worth the seamless wrap *vs.* does the row
  spill past the viewport). Conflating them killed the edge fades and applied
  `justify-center` to content wider than its container, which clipped the start
  of the shelf out of reach.
- **Pointer capture is deferred until a drag crosses `DRAG_THRESHOLD`.** Calling
  `setPointerCapture` on every `pointerdown` retargets `pointerup` to the
  scroller, so the browser resolves the click against the scroller and the
  case's own `onClick` never fires — clicking a movie did nothing.

## Design system

Warm neutral paper tones in **oklch**, defined in `:root` of `src/styles.css`
and mapped to Tailwind utilities in `@theme inline`. Nothing should hardcode a
colour in a component — use the tokens.

Type is Cormorant Garamond (display), Karla (body) and Space Mono (labels),
loaded in `index.html`.

## Not built

- **AI natural-language search.** `src/lib/librarySearch.ts` is the guide's
  no-key fallback: lowercase matching over title, director, genres and blurb.
  Real mood matching needs a server endpoint to hold the API key, and a Vite SPA
  has no server — any key in the frontend ships to visitors. The UI wouldn't
  change; only that file would.
- **The "Recommend a movie" dialog and second shelf.** Needs an OMDb key, and a
  database for the recommendations the guide specifies.
- Tests of any kind.

## Reference

`virtual_movie_library_build_guide.md` is the build brief this was made from —
fonts, motion values, the physical-props rules and the component map. Where this
code deviates from it, it's noted in a comment at the deviation.
