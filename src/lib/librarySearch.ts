import type { Movie } from "../data/movies";

/**
 * Ranking for the mood bar.
 *
 * This is the guide's no-AI-key fallback: plain lowercase matching of the query
 * against title, director, genres and blurb. The UI is identical to the
 * server-ranked version — only the ordering is dumber.
 *
 * To swap in a model-backed ranking later, point this at a server endpoint that
 * returns `{"ids": [...]}` best-match-first and keep the signature. Nothing in
 * LibraryFilter.tsx has to change.
 *
 * It's async purely so the call site already has the shape of a network request
 * (race-guarding, a "reading the shelves" state) and needs no rework.
 */
export async function searchLibrary(query: string, movies: Movie[]): Promise<string[]> {
  const terms = query
    .toLowerCase()
    .split(/[^a-z0-9']+/)
    .filter((t) => t.length > 1);

  if (!terms.length) return [];

  const scored: { id: string; score: number }[] = [];

  for (const m of movies) {
    const title = m.title.toLowerCase();
    const director = m.director.toLowerCase();
    const genres = (m.genres ?? []).join(" ").toLowerCase();
    const blurb = m.blurb.toLowerCase();

    let score = 0;
    for (const term of terms) {
      if (title === term) score += 40;
      else if (title.startsWith(term)) score += 24;
      else if (title.includes(term)) score += 16;
      if (director.includes(term)) score += 12;
      if (genres.includes(term)) score += 8;
      if (blurb.includes(term)) score += 4;
    }

    // Every term has to land somewhere, otherwise "cozy heist" would return
    // every heist film regardless of how un-cozy it is.
    if (score > 0 && terms.length > 1) {
      const hits = terms.filter((t) => title.includes(t) || director.includes(t) || genres.includes(t) || blurb.includes(t));
      if (hits.length < terms.length) score = Math.round(score / 3);
    }

    if (score > 0) scored.push({ id: m.id, score });
  }

  // Ties break toward the better-rated film — a decent stand-in for "the one
  // you'd actually recommend".
  const byId = new Map(movies.map((m) => [m.id, m]));
  const rating = (id: string) => byId.get(id)?.rating ?? 0;
  scored.sort((a, b) => b.score - a.score || rating(b.id) - rating(a.id));

  return scored.map((s) => s.id);
}
