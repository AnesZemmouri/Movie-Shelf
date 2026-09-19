# Virtual Movie Library Build Guide

> **What this is.** This document is a **build brief you hand to a vibe-coding platform** (Lovable, Bolt, v0, Claude Code, Cursor, Replit, Windsurf, or a human developer). Attach it in chat alongside your IMDb ratings export, then let the platform build the site. The user is not expected to write code — only to export their IMDb ratings (Section 4) and attach that file.
> **If you're the AI platform / assistant reading this:** you are the builder. Build the site described below in your project's existing stack. React + TypeScript + Tailwind CSS is assumed; any React framework (TanStack Start, Next.js, Remix, Vite SPA) works. Translate the Vite/TanStack file paths here to your host conventions — don't fight them. Do **not** swap the design, fonts, or motion values for defaults. Do **not** invent placeholder movies: if no IMDb CSV is attached yet, stop after the core shelf scaffolding and ask the user to attach `ratings.csv`, then run the import in Section 4 before populating `movies`. Everything else in this guide is your job to implement.

This guide is **platform-agnostic**. Anywhere it says "the platform", "the AI", or "your editor", it means whichever tool received this brief. Platform-specific details (backend, AI key, how to attach a file to chat) are isolated in Section 2 so nothing else in the guide depends on them.

---

## 1. What you're building

A single-page personal movie shelf:

- A horizontal, infinitely scrolling rail of real movies, each rendered in 3D as a physical **DVD keepcase** — fixed case height, spine thickness that varies with disc count (single disc, double-disc special edition, box set) — with its actual poster art on the front and a case-spine color sampled from that poster.
- Hover a case and it pulls toward you, with a floating metadata card (title, director, year, format, rating, genres).
- Click a case and it physically slides out of the shelf into a large front-poster detail view, with the shelf blurred behind it.
- An AI-powered **"What are you in the mood for?"** search bar that understands plain English ("cozy comfort-watch with a happy ending"), plus genre filter pills.
- A **"Recommend a movie"** button that lets visitors search real movies and send you recommendations, which animate onto a second "Recommended to me" shelf.
- A typed-in heading: *Welcome to my library*.

### Design ethos

Ethereal, editorial, dreamlike — but warm rather than cold-blue:

- Warm neutral **paper tones** (oklch) for the background, not dark blue.
- Serif display type for titles, a clean sans for body, and tiny uppercase **mono** labels for metadata/dates/counts.
- Motion is slow and floating (drift, rise, soft fades). No bouncy springs.

### Fonts

Loaded once via a `<link>` in `src/routes/__root.tsx`:

- **Cormorant Garamond** (display serif)
- **Karla** (body sans)
- **Space Mono** (labels)

```
https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,500;1,300;1,400&family=Karla:wght@300;400;500&family=Space+Mono:wght@400;700&display=swap
```

---

## 2. Prerequisites — the three things your platform must supply

| # | What's needed | Why | How to satisfy it |
| --- | --- | --- | --- |
| 1 | A **React + TypeScript + Tailwind** project | The whole UI | Any React framework: TanStack Start, Next.js, Remix, or a plain Vite SPA. Keep whatever the platform gives you. |
| 2 | A **server-side place to call an AI model** | Natural-language search must hide the API key | TanStack server function, Next.js route handler / server action, Remix action, Express route — any server endpoint. |
| 3 | A **Postgres database with a public-insert table** *(optional)* | Only for the visitor "Recommend a movie" shelf | Supabase, Neon, Replit DB/Postgres, or any Postgres. Skip it entirely if you don't want visitor recommendations. |

### Platform notes

- **Lovable** — new project starts on TanStack Start v1 + React 19 + Vite 7 + Tailwind v4. Enable **Lovable Cloud** for the database. The AI key `LOVABLE_API_KEY` is auto-provisioned; the gateway is `https://ai.gateway.lovable.dev/v1/chat/completions` (OpenAI-compatible).
- **Claude Code / Cursor / Windsurf** — scaffold with `npm create vite@latest -- --template react-ts` plus Tailwind, or any React framework you prefer. Add your own `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` and `OMDB_API_KEY` to `.env` and use that provider in Section 5.
- **Replit** — use a React + Vite template; store the AI key and `OMDB_API_KEY` in Secrets; use Replit's Postgres for the recommendations table.
- **Bolt / v0** — same as above; for v0 (Next.js), put the search endpoint in `app/api/search/route.ts`.

### Everything is optional except the shelf

The **static movie data + 3D shelf + detail pull-out** is the core. The **AI search** needs item 2. The **recommendations shelf** needs item 3. Build the core first; the site is complete and beautiful without the other two.

---

## 3. The Movie data model

Every movie is a plain object in `src/data/movies.ts`. The personal library is **one static array** — this file is the single source of truth for both the shelf and the AI search. The type:

```ts
export type Movie = {
  id: string;
  title: string;
  director: string;
  genres?: string[];          // genre tags shown as filter pills
  poster: string;              // real poster art (OMDb/TMDB URL)
  year: number;
  blurb: string;               // short synopsis
  rating: number;               // your rating out of 10; 0 means unrated
  watched: string;              // e.g. "Jul 2026"
  recommender?: string;        // set only when a visitor recommended it
  studio: string;
  runtime: number;              // minutes
  discs: "single" | "double" | "boxset";  // drives spine thickness, not height
  finish: "clear" | "matte";    // clear plastic shell vs. opaque printed sleeve
  spine: string;                // base color, sampled from the poster's left edge
  band?: string;                // accent pulled from the poster art
  ink: string;                  // lettering color
  face: "serif" | "sans" | "mono";        // lettering style
  caps?: boolean;
  width: number;                // case-spine width in px — the ONLY size axis that varies
  height: number;               // case-spine height in px — near-constant across the whole shelf
  lean: number;                 // degrees of lean on the shelf
  depth: number;                // how far forward/back the case sits, px
  wear: number;                 // 0–1 edge wear and ink fade (shelf-worn cardboard/plastic look)
  spineImage?: string;
};
```

A representative object (from the real library):

```ts
{
  id: "tt0111161-0",
  title: "The Shawshank Redemption",
  director: "Frank Darabont",
  genres: ["Drama"],
  poster: "https://m.media-amazon.com/images/M/MV5BNDE3ODcxYzMtY2YzZC00NmNlLWJiNDMtZDViZWM2MzIxZDYwXkEyXkFqcGdeQXVyNjAwNDUxODI@._V1_SX300.jpg",
  year: 1994,
  blurb: "Two imprisoned men bond over a number of years, finding solace and eventual redemption through acts of common decency…",
  rating: 10,
  watched: "Jul 2026",
  studio: "Castle Rock Entertainment",
  runtime: 142,
  discs: "double",
  finish: "clear",
  spine: "#241f19",
  band: "#8a6d3f",
  ink: "#faf7f0",
  face: "serif",
  caps: false,
  width: 27,
  height: 231,
  lean: 0,
  depth: -2.7,
  wear: 0.12,
}
```

**Why height is almost fixed:** real DVD keepcases (Amaray) are all the same 191mm-tall shell regardless of what's inside — only the spine *thickness* changes (14mm single disc, ~24mm double-disc special edition, wider still for a box set). That's the opposite of the book version, where height varied and width was the main size cue. Keep `height` within a narrow jitter band (±2–4px) for the whole shelf and let `width` (driven by `discs`) carry all the visual variety — this reads as far more "real DVD shelf" than varying both axes.

The physical fields (`discs`, `finish`, `spine`, `band`, `ink`, `face`, `caps`, `width`, `height`, `lean`, `depth`, `wear`) are what make each case look like a real, individual object rather than a flat rectangle. You don't write them by hand — see Step 4.

---

## 4. Import your IMDb ratings (AI-assisted)

This is how you load **your own movies**. You do **not** build an upload button — you hand your IMDb export to whichever AI coding tool you're using and let it generate the data file from it.

### Step 4a — Export from IMDb

1. Go to IMDb → your profile → **Your Ratings**.
2. Click the **⋯** menu → **Export**.
3. Download `ratings.csv` to your computer.

(If you track movies on **Letterboxd** instead, export your `watched.csv`/`diary.csv` from Settings → Import & Export, and tell the AI to use that format instead — it has `Name`, `Year`, `Rating`, `Watched Date` but no director/genres, so the AI will need to fetch those too.)

### Step 4b — Give the AI your export and generate `src/data/movies.ts`

Two things must happen together: **the AI must have the file**, and **it must have the prompt below**.

1. **Get the CSV to the AI.**
   - *Lovable / Bolt / v0 / ChatGPT-style chat:* click the **attach (paperclip)** button in the composer and select `ratings.csv`. Confirm it appears attached before sending.
   - *Claude Code / Cursor / Windsurf / any terminal-based agent:* copy the CSV into the project folder (e.g. `./ratings.csv`) and mention that path in your message — the agent reads it from disk.
   - *Replit:* upload the CSV into the file tree, then reference it by path in the chat.
2. **Send this prompt** with it:

```
Here is my IMDb ratings export (ratings.csv — attached, or in the project
root). Please regenerate src/data/movies.ts with my real library, following
these rules:

- Read only rows where "Title Type" is "movie" (skip TV series/episodes
  unless I say otherwise).
- For each movie: title, director(s) (join with ", "), year, genres (split
  the "Genres" column on ", "), studio (leave "" if not present), runtime
  from "Runtime (mins)", rating (my "Your Rating"; 0 if blank), and watched
  date from "Date Rated" (format as "Mon YYYY").
- Fetch the real poster art and a short blurb from OMDb by IMDb ID (the
  "Const" column, e.g. tt0111161): GET
  https://www.omdbapi.com/?i=<imdbID>&plot=short&apikey=<OMDB_API_KEY>.
  Use the returned "Poster" URL directly.
- Sample each poster's LEFT-EDGE color into `spine`, and pick a saturated
  accent from the poster into `band`. Set `ink` to dark (#241f19) if the
  spine is light, else near-white (#faf7f0).
- Derive physical props (all cases are standard DVD Amaray keepcases):
    height  = near-constant, 224–234px (small random jitter only — real keepcases
              don't vary in height)
    discs   = "boxset" if the title is part of a well-known trilogy/franchise you
              recognize (e.g. Lord of the Rings, The Matrix) OR runtime > 165;
              "double" if runtime > 110 OR rating >= 9 (treat favorites as the
              2-disc special edition you'd actually buy); else "single"
    width   = "single" -> 16–20px, "double" -> 26–34px, "boxset" -> 42–58px
              (small per-title jitter within each band)
    finish  = ~65/35 "clear"/"matte" (random per title, for shelf variety)
- Assign genres directly from IMDb's "Genres" column (no remapping needed —
  they're already standardized: Action, Comedy, Drama, Horror, Sci-Fi,
  Thriller, Documentary, Animation, etc.).
- Deterministically vary `lean` (-5..0), `depth` (-7..7), `wear` (0..0.35),
  `face`, and `caps` per movie using a hash of the IMDb id, so the shelf
  looks lived-in.
- Fallbacks: missing poster -> a palette default color and no poster image;
  unrated -> rating 0; missing studio -> "".
- Keep the existing `Movie` type exactly. Export `movies` as a single array,
  newest watched date first. Overwrite src/data/movies.ts entirely.
```

The AI will parse the CSV, fetch posters/synopses, sample spine colors from the artwork, derive physical sizing, assign genres, and overwrite `src/data/movies.ts`. Because the shelf and the AI search both read from this array, your library is live the moment the file is regenerated.

**IMDb columns that matter:** `Const` (imdbID), `Title`, `Title Type`, `Directors`, `Your Rating`, `Date Rated`, `Runtime (mins)`, `Year`, `Genres`.

**OMDb API key:** free at `https://www.omdbapi.com/apikey.aspx` (1,000 requests/day). Only needed at import time to fetch posters/blurbs — not needed at runtime.

**Genre pills:** generated dynamically from whatever genres exist in the data, sorted by count — no fixed set to keep in sync, since IMDb's genre list is already standardized.

---

## 5. AI natural-language search

One server endpoint, any AI provider. It reads the same `movies` array the shelf uses, so it works the moment your library exists.

**What the endpoint does** (in this project: `src/lib/librarySearch.functions.ts`, a TanStack server function; elsewhere: a Next.js route handler, Remix action, or Express `POST /api/search`):

- Reads the AI API key from env **inside the handler** — never in browser code.
- Builds a catalogue string from `movies`: `id :: title :: director :: year :: genres :: blurb` (blurb truncated to 160 chars).
- Sends one chat-completion request with a system prompt saying: match the viewer's natural-language request against these catalogue lines and return ONLY `{"ids":["id1","id2"]}`, best match first, at most 20; empty array if nothing fits. Request JSON output (`response_format: { type: "json_object" }` on OpenAI-compatible APIs).
- Validates returned ids against real movie ids (drops anything unknown) and maps errors to friendly messages (429 → "Too many searches…", 402 → "Search credits exhausted.").

**Provider options** — all OpenAI-compatible, so only the URL, key, and model name change:

| Platform | Endpoint | Env var | Model |
| --- | --- | --- | --- |
| Lovable | `https://ai.gateway.lovable.dev/v1/chat/completions` | `LOVABLE_API_KEY` (auto-provisioned) | `google/gemini-2.5-flash` |
| OpenAI | `https://api.openai.com/v1/chat/completions` | `OPENAI_API_KEY` | `gpt-4o-mini` |
| Anthropic | `https://api.anthropic.com/v1/messages` (different shape) | `ANTHROPIC_API_KEY` | `claude-haiku-4-5` |
| Google | `https://generativelanguage.googleapis.com/v1beta/openai/chat/completions` | `GEMINI_API_KEY` | `gemini-2.5-flash` |
| OpenRouter / Groq | their `/v1/chat/completions` | their key | any fast model |

Pick a cheap, fast model — the task is simple matching.

**No AI key at all?** Fall back to plain client-side filtering: lowercase-match the query against title, director, genres, and blurb. The UI is identical; only the ranking is dumber.

Because the catalogue is generated from `movies` at request time, search reflects your imported library automatically. If you later move movies into a database, point the endpoint at that data source instead.

---

## 6. Database (optional) — the recommendations table

Skip this section entirely if you don't want the visitor "Recommend a movie" shelf. The **only** database piece is that shelf; your personal library is the static file from Step 4.

Any Postgres works (Supabase, Lovable Cloud, Neon, Replit). Run this SQL — the client reads and inserts with the project's anon/public key, so the grants and row-level policies below are what keep it safe. On a non-Postgres backend, mirror the same shape: public read, public insert with length limits, no update/delete.

```sql
CREATE TABLE public.recommendations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  recommender text NOT NULL,
  note text,
  title text NOT NULL,
  director text NOT NULL,
  poster text NOT NULL DEFAULT '',
  year int NOT NULL DEFAULT 0,
  studio text NOT NULL DEFAULT '',
  runtime int NOT NULL DEFAULT 0,
  discs text NOT NULL DEFAULT 'single',
  finish text NOT NULL DEFAULT 'matte',
  spine text NOT NULL DEFAULT '#584f46',
  band text,
  ink text NOT NULL DEFAULT '#faf7f0',
  face text NOT NULL DEFAULT 'serif',
  caps boolean NOT NULL DEFAULT false,
  width int NOT NULL DEFAULT 30,
  height int NOT NULL DEFAULT 220,
  lean real NOT NULL DEFAULT 0,
  depth real NOT NULL DEFAULT 0,
  wear real NOT NULL DEFAULT 0
);

GRANT SELECT, INSERT ON public.recommendations TO anon;
GRANT SELECT, INSERT ON public.recommendations TO authenticated;
GRANT ALL ON public.recommendations TO service_role;

ALTER TABLE public.recommendations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Recommendations are publicly readable"
  ON public.recommendations FOR SELECT TO anon, authenticated USING (true);

CREATE POLICY "Anyone can recommend a movie"
  ON public.recommendations FOR INSERT TO anon, authenticated
  WITH CHECK (
    length(trim(recommender)) BETWEEN 1 AND 60
    AND length(title) BETWEEN 1 AND 300
    AND length(director) <= 200
    AND (note IS NULL OR length(note) <= 500)
  );
```

Notes:

- **GRANTs are mandatory** — without them the app can't read or write the table, even with policies.
- The two policies: anyone (anon or signed-in) can **read** all recommendations, and anyone can **insert** one with basic length limits (recommender 1–60 chars, title 1–300, director ≤200, note ≤500). There's no `UPDATE`/`DELETE` grant, so recommendations can't be edited or deleted through the public API.
- The columns mirror the physical fields on `Movie`, so a recommended movie can be shelved and rendered exactly like a watched one.

---

## 7. Component map & build order

Build in roughly this order. Each subsection names the file, its job, and the non-obvious details to get right.

### `src/data/movies.ts`

The `Movie` type (Section 3) and the `movies` array (Step 4). Nothing else.

### `src/components/caseFaces.ts`

Shared constants for the poster plane. Defines `POSTER_W = 178` (front-poster depth in un-scaled spine space) and a `faceFont` map (`serif → font-display`, `sans → font-sans`, `mono → font-mono`).

### `src/components/TypedTitle.tsx`

Types **"Welcome to my library"** one character every **95ms** in the italic display font, with a blinking caret that pulses once finished. `FULL = "Welcome to my library"`; renders an `<h1 aria-label={FULL}>` with the visible typed slice inside `aria-hidden`.

### `src/components/MovieCase.tsx`

The 3D case spine. The key trick for stability:

- An **outer `<button>` stays stationary** as the hover/click hit target (it never transforms). This stops the case sliding out from under the pointer.
- An **inner `<span>` is the only thing that moves**, with `transformStyle: preserve-3d` and transform `rotateY(var(--ry)) rotateZ(lean) translateZ(pull+depth) translateY(lift)`.

Exact hover values: **pull = 96**, **lift = -26**, **lean = 0** while hovered (otherwise `movie.lean`). On hover the button gets `zIndex: 40`.

Layers on the case spine (in order): poster-art wraparound (left edge), base color settle, top/bottom rules in the `band` accent, vertical title, vertical director (only if `width >= 30`, since single-disc spines are narrow), studio/rating-cert mark at the foot (only if `width >= 26`), material **texture** over the ink, a **plastic sheen** (`finish === "clear"` gets a brighter, sharper specular highlight than `"matte"`'s soft one, mimicking clear shell vs. printed cardboard sleeve), edge **wear** (shelf-wear gradient at `opacity: wear`), inset highlight. Putting texture & sheen *over* the lettering makes the type look printed into the case, not floating on top of it.

A hinged **front cover** face sits at `left-full`, `width: POSTER_W`, `transformOrigin: left center`, `rotateY(90deg)`, showing the real poster image. A **case-spine top edge** tops the case (`rotateX(78deg)`) — since height is near-constant, this edge lines up cleanly across the whole shelf, which is what actually sells the "real DVD shelf" read.

**Hover metadata card:** portaled to `document.body` via `createPortal` so it floats above the filter bar. It's `fixed`, `z-[100]`, `w-[248px]`, positioned at the case's top-center (`left: center, top: top-14`), translated up. Text sizes: title **20px**, director **15px**, metadata/genres **14px**. A 90ms leave-grace timer prevents flicker as the transform moves.

### `src/components/Shelf.tsx`

The scroll rail. Receives `movies` and optional `justAdded` (a movie id to animate in).

- **Seamless loop:** if total shelf width > **2600px**, render **3 copies** and keep the viewport in the middle copy (start at `scrollWidth/3`); wrap scroll position at segment boundaries. If the row is short (≤2600px), render **1 copy** — this prevents duplicate cases during filtering.
- **Curved perspective:** on scroll/resize, compute each case's `rotateY` from its distance to the viewport center. `--ry` up to **±34°**, eased with `pow(|t|, 1.35)` so the middle stays flat. `perspective: 1400px`, `perspectiveOrigin: 50% 65%`.
- **Horizontal wheel:** intercept vertical wheel deltas and apply to `scrollLeft` (`passive: false`).
- **Drag:** pointer down/move/leave update `scrollLeft`.
- **Arrow keys** (Left/Right by 320px) when no movie is open.
- **Short-row centering:** a `ResizeObserver` sets `overflowing`; when not overflowing, center the row (`justify-center`) and hide the edge fade gradients.
- **`justAdded`:** find the freshly shelved movie, `scrollIntoView({ inline: "center" })`, and apply the `animate-shelve-in` class (Section 8) for ~1.1s.
- **Pull-out origin:** `openAt(i)` captures the case's `getBoundingClientRect()` into a `rect` (`{left, top, width, height}`) and passes it to `MovieDetail`.
- Spacing: `gap-[2px]`, `items-end`, top padding `pt-16`, bottom `pb-6`.
- Below the rail: a thin center-line gradient + a soft ground shadow (`from-foreground/8`).

### `src/components/MovieDetail.tsx`

The pulled-out movie. Receives the captured `rect`.

- On mount, starts at the shelf pose `translate3d(0,0,0) scale(1) rotateY(-26deg)`, then a `requestAnimationFrame` flips `out=true` so the transition runs to the final pose `translate3d(dx, dy, 0) scale(scale) rotateY(-90deg)` (front poster facing you).
- Transition: **`transform 900ms cubic-bezier(0.16, 1, 0.3, 1)`**.
- Target position is responsive: `narrow = vp.w < 720`; poster height `min(vp.h*0.6, 480)` (mobile `vp.h*0.42`). `scale = posterH / rect.height`; `posterW = POSTER_W * scale`.
- Backdrop blurs/dims (`bg-background/70 backdrop-blur-xl`), fading in over 700ms.
- Details panel fades/rises in with a **260ms delay**; shows recommender or "Watched {date}", title, director, blurb, star rating (or "Unrated"), runtime, and Previous/Next/Shelve-it controls.
- Keys: **Escape** = retract (then close after 620ms), **← / →** = prev/next.
- Fallbacks: missing poster → a typeset title/director card; rating 0 → "Unrated".

### `src/components/RecommendMovieDialog.tsx`

The visitor recommendation modal.

- Live OMDb search, debounced **280ms**, min 2 chars, abortable (`https://www.omdbapi.com/?s=<query>&type=movie&apikey=…`).
- Result list shows poster thumbnail + title + director/year + a "Pick" affordance.
- After picking: poster, director/year, **Your name** (1–60) and **Why should I watch it?** (≤500) fields.
- On submit: `buildMovie(picked)` → `onRecommend(...)` → insert into the `recommendations` table. Errors show inline.
- Placeholder for the search field: **"Search by title or director…"**.

### `src/hooks/useRecommendations.ts`

Loads recommendations from the database client (Supabase client here; use whatever your platform provides): `select("*")`, newest first (`order("created_at", { ascending: false })`), `limit(200)`. `recommend(input)` inserts a row, prepends the returned movie to local state, and sets `justAdded` for **1400ms** (driving the slide-in animation). Maps DB rows → `Movie` via `toMovie` (note: recommendation's `blurb` becomes the visitor's note, `watched` becomes "Recommended by {name}"). If you skipped Section 6, delete this hook and the second shelf.

### `src/components/LibraryFilter.tsx`

The search + genre controls.

- Debounced AI search: **600ms**, min 2 chars, race-guarded by a `reqId` ref. Calls the `smartSearch` server function; renders "Reading the shelves…", then "{n} found" or an error.
- Genre pills are built **dynamically** from the genres present in `movies`, sorted by count. They're a single **horizontal no-wrap line** (scrollable, hidden scrollbar). Placeholder: **"What are you in the mood for?"**.
- Filtering: if an AI result set exists, intersect with the selected genre and **order by the AI's ranking**. Passes the visible list (or `null` = show all) up via `onChange`.

### `src/lib/movieDb.ts`

Three exports used by the recommend dialog (and reused by the import logic conceptually):

- `searchMovies(q, signal)` → calls `https://www.omdbapi.com/?s=<q>&type=movie&apikey=…`, then fetches full details per result (`?i=<imdbID>`) for director/runtime/genres; keeps results with a title + poster; poster URL comes straight from OMDb's `Poster` field.
- `readPosterPalette(src)` → loads the poster with `crossOrigin="anonymous"`, draws to an 80px-wide canvas, samples the **left 6%** (`edgeW = round(w*0.06)`) averaged into `spine`, finds the most saturated mid-luminance pixel into `band`, and sets `ink` dark if the spine is light (`lum > 0.55`) else near-white.
- `buildMovie(result)` → derives physical props **deterministically** from a hash of the IMDb id: `discs` from runtime/rating/franchise recognition, near-constant `height` (224–234px), `width` from the disc-count band (16–20 / 26–34 / 42–58px), `finish`, lean/depth/wear/face/caps, and the poster palette. Falls back to an HSL palette if poster sampling fails.

### `src/lib/librarySearch.functions.ts`

Covered in Section 5.

### `src/routes/index.tsx` (the home page)

Composes everything:

- `grain` background with a radial warm gradient overlay.
- Header: tiny uppercase "A personal archive" label, `<TypedTitle />`, a "{n} films" counter, a **"Recommend a movie"** button, and `<LibraryFilter />`.
- Main `<Shelf movies={shown} />` (or "No movies match" empty state).
- When recommendations exist, a second "Recommended to me" shelf: `<Shelf movies={recommendations} justAdded={justAdded} />`. Tight spacing between the two shelves (main `pb-2`, recommended header `pt-2`).
- `<RecommendMovieDialog />` toggled by the button.
- SEO `head()`: title **"Your virtual movie library"** (change to your own), description, `og:title/description`, `og:type=website`, `twitter:card=summary_large_image`.

### `src/routes/__root.tsx`

Loads the Google Fonts `<link>`, the stylesheet, favicon; sets base `<html lang="en">`, viewport, and a default title/description (override per route in `index.tsx`). Keeps `<Outlet />` so child routes render.

### `src/styles.css`

Tailwind v4 (`@import "tailwindcss"` + `@source "../src"`). Key pieces:

- `@theme inline` maps the font tokens (`--font-display/sans/mono`) and color tokens (`--color-background`, `--color-primary`, …, `--color-glow`) to utilities.
- `:root` warm neutral palette in **oklch** (e.g. `--background: oklch(0.895 0.004 95)`, `--foreground: oklch(0.28 0.008 80)`, `--primary: oklch(0.5 0.085 52)`). No dark-blue dominance.
- `@utility grain` — an SVG fractal-noise overlay via `::after` at `opacity:0.35`, `mix-blend-mode: overlay`.
- `@utility no-scrollbar` — hides scrollbars.
- Keyframes/animations: `drift` (background haze), `rise`, and **`shelve-in`** — the gap opens to `--spine-w` while the case glides in from the right (`translateX/translateZ/rotateY/rotate`) and settles; exposed as `@utility animate-shelve-in { animation: shelve-in 1100ms cubic-bezier(0.22,1,0.32,1) both; }`.
- Cases use `transformStyle: preserve-3d` (set inline in components).

---

## 8. Customize & publish

- **Your name / title:** edit the typed string in `TypedTitle.tsx` and the SEO `head()` in `index.tsx`.
- **Hover feel:** in `MovieCase.tsx`, change `pull` (96) and `lift` (-26).
- **Pull-out speed:** in `MovieDetail.tsx`, the `900ms` transition (and the 620ms retract delay).
- **Genre pills:** these regenerate automatically from `Genres` in the IMDb data — nothing to maintain.
- **Color palette:** adjust the oklch tokens in `:root` of `styles.css`; never hardcode colors in components.
- **Publish:** deploy however your platform does it (Lovable/Replit/Bolt: one-click publish; elsewhere: Vercel, Netlify, or Cloudflare — the app is a standard React build). Verify the `og:`/`twitter` metadata reflects your title before publishing.

---

## 9. Quick reference — the import prompt

```
I'm attaching my IMDb ratings export (ratings.csv). Regenerate
src/data/movies.ts with my real library, styled as a shelf of physical DVD
keepcases. Read only "movie" title-type rows; fetch real posters + short
blurbs from OMDb by imdbID (the "Const" column, using my OMDB_API_KEY);
sample each poster's left edge into `spine` and a saturated accent into
`band`; keep `height` near-constant (224-234px, real keepcases don't vary
in height) and derive `discs` (single/double/boxset) and `width` from
runtime, rating, and franchise recognition, with `width` carrying all the
size variety; derive `finish` (clear/matte) randomly; use the Genres column
directly for genre pills; vary lean/depth/wear/face/caps deterministically
per movie; fall back gracefully on missing poster/rating/studio. Keep the
existing Movie type; export `movies` newest-watched-first and overwrite
src/data/movies.ts entirely.
```

**Before you send this prompt, make sure the AI actually has `ratings.csv`** — attach it with the paperclip button in a chat-based tool, or drop it in the project root and name the path for a terminal-based agent. The prompt alone won't work; the AI needs the file to read your movies. Your shelf is live the moment `src/data/movies.ts` regenerates, and AI search picks it up automatically.
