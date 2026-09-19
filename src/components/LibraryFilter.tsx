import { useEffect, useMemo, useRef, useState } from "react";
import type { Movie } from "../data/movies";
import { searchLibrary } from "../lib/librarySearch";

/** Long enough that a half-typed mood doesn't fire a request per keystroke. */
const DEBOUNCE_MS = 600;
const MIN_CHARS = 2;

type Result = { q: string; ids: string[]; error: string };

type Props = {
  movies: Movie[];
  /** The visible list, or `null` to mean "no filter — show everything". */
  onChange: (visible: Movie[] | null) => void;
  className?: string;
};

/**
 * The search + genre controls.
 *
 * Two filters compose: the mood query produces a *ranked* id list, the genre
 * pills produce a *subset*. When both are on, the subset is ordered by the
 * query's ranking rather than by shelf order.
 *
 * Nothing here mirrors props into state — the search result carries the query
 * it answered, so "still searching" and "no results" are both *derived* rather
 * than stored, and a slow response can never overwrite a newer one.
 */
export function LibraryFilter({ movies, onChange, className }: Props) {
  const [query, setQuery] = useState("");
  const [genre, setGenre] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);

  /** Guards against a slow request landing after a newer one. */
  const reqId = useRef(0);

  // Genre pills are generated from whatever the data actually contains, so
  // there's no fixed list to keep in sync when the library is re-imported.
  const genres = useMemo(() => {
    const counts = new Map<string, number>();
    for (const m of movies) {
      for (const g of m.genres ?? []) counts.set(g, (counts.get(g) ?? 0) + 1);
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([name, count]) => ({ name, count }));
  }, [movies]);

  const q = query.trim();
  const active = q.length >= MIN_CHARS;

  // A genre the library no longer contains (after a re-import) simply stops
  // counting as selected, rather than being cleared by an effect.
  const activeGenre = genre !== null && genres.some((g) => g.name === genre) ? genre : null;

  useEffect(() => {
    const term = query.trim();
    if (term.length < MIN_CHARS) {
      reqId.current += 1; // orphan anything still in flight
      return;
    }

    const id = ++reqId.current;
    const timer = window.setTimeout(() => {
      searchLibrary(term, movies)
        .then((ids) => {
          if (id === reqId.current) setResult({ q: term, ids, error: "" });
        })
        .catch(() => {
          if (id === reqId.current)
            setResult({ q: term, ids: [], error: "Couldn't read the shelves." });
        });
    }, DEBOUNCE_MS);

    return () => window.clearTimeout(timer);
  }, [query, movies]);

  // Results only count for the query that produced them; anything else is
  // stale, which is exactly what "still searching" means.
  const fresh = active && result?.q === q ? result : null;
  const ranked = fresh ? fresh.ids : null;
  const searching = active && fresh === null;

  const visible = useMemo(() => {
    if (ranked === null && activeGenre === null) return null;

    const byId = new Map(movies.map((m) => [m.id, m]));
    const list = ranked === null ? movies : ranked.flatMap((id) => byId.get(id) ?? []);
    return activeGenre ? list.filter((m) => m.genres?.includes(activeGenre)) : list;
  }, [ranked, activeGenre, movies]);

  // `visible === null` means "no filter at all" — the parent shows the full
  // shelf. An empty array is a real result ("nothing matches").
  useEffect(() => {
    onChange(visible);
  }, [visible, onChange]);

  const status = fresh?.error
    ? fresh.error
    : searching
      ? "Reading the shelves…"
      : ranked === null
        ? ""
        : `${visible?.length ?? 0} found`;

  return (
    <div className={className}>
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="What are you in the mood for?"
        aria-label="What are you in the mood for?"
        className="border-border bg-card/60 placeholder:text-muted-foreground focus:border-primary w-full rounded-sm border px-4 py-3 text-[15px] outline-none transition-colors"
      />

      <div className="mt-3 flex items-baseline justify-between gap-4">
        <div
          className="no-scrollbar flex flex-nowrap items-center gap-2 overflow-x-auto"
          role="group"
          aria-label="Filter by genre"
        >
          <button
            type="button"
            onClick={() => setGenre(null)}
            aria-pressed={activeGenre === null}
            className={`font-mono shrink-0 rounded-sm border px-2.5 py-1 text-[10px] tracking-widest uppercase transition-colors ${
              activeGenre === null
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border text-muted-foreground hover:bg-secondary"
            }`}
          >
            All
          </button>
          {genres.map((g) => (
            <button
              key={g.name}
              type="button"
              onClick={() => setGenre(activeGenre === g.name ? null : g.name)}
              aria-pressed={activeGenre === g.name}
              className={`font-mono shrink-0 rounded-sm border px-2.5 py-1 text-[10px] tracking-widest uppercase transition-colors ${
                activeGenre === g.name
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border text-muted-foreground hover:bg-secondary"
              }`}
            >
              {g.name}
              <span className="ml-1.5 opacity-50">{g.count}</span>
            </button>
          ))}
        </div>

        <p
          aria-live="polite"
          className={`font-mono shrink-0 text-[10px] tracking-widest uppercase ${
            fresh?.error ? "text-destructive" : "text-muted-foreground"
          }`}
        >
          {status}
        </p>
      </div>
    </div>
  );
}
