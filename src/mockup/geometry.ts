import type { Movie } from "../data/movies";

/**
 * Shared description of the keepcase, in px, used by BOTH renderers so that the
 * CSS and WebGL mockups are provably drawing the same object rather than two
 * things that merely look similar.
 *
 * Real Amaray keepcases are 190mm tall with a 135mm cover. The shelf stores
 * thickness as a *spine width in px* against a ~230px case, and that ratio is
 * stylised to roughly twice a real 14mm spine — which is why spineScale 1 looks
 * chunky and ~0.52 lands back on real-world proportions.
 */
export const CASE_HEIGHT = 460;

const COVER_RATIO = 135 / 190;
const REAL_SPINE_RATIO = 14 / 190;
/** Millimetres that one CASE_HEIGHT px represents, for the size readout. */
const MM_PER_UNIT = 190 / CASE_HEIGHT;

export type CaseGeometry = {
  /** Front-cover width. */
  coverW: number;
  height: number;
  /** Spine thickness — how deep the closed box is. */
  spine: number;
  halfSpine: number;
  /** The same thickness in millimetres, for the readout. */
  spineMm: number;
};

export function caseGeometry(movie: Movie, spineScale = 1): CaseGeometry {
  const height = CASE_HEIGHT;
  const shelfRatio = movie.width / movie.height;
  const spine = clamp(
    shelfRatio * height * spineScale,
    height * 0.035,
    height * 0.32,
  );
  return {
    coverW: height * COVER_RATIO,
    height,
    spine,
    halfSpine: spine / 2,
    spineMm: spine * MM_PER_UNIT,
  };
}

/** The spineScale that reproduces a real 14mm single-disc Amaray spine. */
export function realSpineScale(movie: Movie): number {
  return REAL_SPINE_RATIO / (movie.width / movie.height);
}

/** Accent used for the rules at the head and foot of the spine. */
export const caseBand = (movie: Movie) => movie.band ?? movie.ink;

/**
 * Same-origin copy of the poster, served from .poster_cache by the dev
 * middleware in vite.config.ts. The remote Letterboxd URL cannot be used for
 * the WebGL texture: it returns no Access-Control-Allow-Origin, so uploading it
 * to a GPU texture is a SecurityError.
 */
export const cachedPoster = (movie: Movie) => `/poster-cache/${movie.id}.jpg`;

export function clamp(value: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, value));
}
