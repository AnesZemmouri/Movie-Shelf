import type { CSSProperties } from "react";
import type { Movie } from "../data/movies";
import { caseBand, cachedPoster, type CaseGeometry } from "./geometry";
import { UNITS_PER_TILE, type SurfaceUrls } from "../lib/textures";

const WRAP = "/5875003108012789722.jpg";

/** Generated once and shared with the WebGL panel and the archive's shelf, so
 *  every renderer draws the same surface rather than several similar ones.
 *  Re-exported from lib/textures so the study's own imports keep working. */
export type { SurfaceUrls } from "../lib/textures";

type Props = {
  movie: Movie;
  geometry: CaseGeometry;
  /** Cover hinge angle in degrees; 0 is shut. */
  open: number;
  finish: "clear" | "matte";
  wear: number;
  /** Sheen sweep, in degrees, driven by the shared light control. */
  lightAngle: number;
  yaw: number;
  pitch: number;
  showDisc: boolean;
  /** Distance from the viewer to the case, shared with the WebGL camera. */
  viewerDistance: number;
  /** 0 turns every surface layer off, so the relief can be A/B'd. */
  surfaceDetail: number;
  surfaces: SurfaceUrls | null;
};

/**
 * The shelf keepcase rebuilt as a closed box.
 *
 * MovieCase.tsx draws two planes and a cheated top lip. Here every face of a
 * real keepcase exists, so the object stays solid from any angle: back, spine,
 * the right edge, top and bottom, a disc tray inside, and a front cover hinged
 * off the spine side that can swing open.
 */
export function CssKeepcase({
  movie,
  geometry,
  open,
  finish,
  wear,
  lightAngle,
  yaw,
  pitch,
  showDisc,
  viewerDistance,
  surfaceDetail,
  surfaces,
}: Props) {
  const { coverW, height, spine, halfSpine } = geometry;
  const band = caseBand(movie);
  const spineFont = clampNumber(spine * 0.42, 10, 24);
  const surface = surfaceDetail > 0.02 ? surfaces : null;

  // Local cached copy first, remote as the fallback layer. A failed CSS
  // background layer simply paints nothing, so the second one still shows.
  const poster = movie.poster
    ? `url("${cachedPoster(movie)}"), url("${movie.poster}")`
    : "none";

  const sheen =
    finish === "clear"
      ? `linear-gradient(${lightAngle}deg, transparent 33%, rgba(255,255,255,0.40) 46%, transparent 57%)`
      : `linear-gradient(${lightAngle}deg, transparent 24%, rgba(255,255,255,0.15) 50%, transparent 76%)`;

  // The specular layer, masked by the shared roughness noise so the highlight
  // breaks into patches instead of sweeping clean across the face.
  const sheenStyle = (backgroundImage: string): CSSProperties =>
    surface
      ? {
          backgroundImage,
          maskImage: `url(${surface.sheenMask})`,
          WebkitMaskImage: `url(${surface.sheenMask})`,
        }
      : { backgroundImage };

  const grain = surface ? (
    <span
      className="kc-grain"
      style={{
        backgroundImage: `url(${surface.grain})`,
        // Deliberately low: overlay at 0.5 is neutral, so the generated noise
        // modulates brightness by roughly ±(0.45 × opacity). Past ~0.3 the
        // mould texture stops reading as grain and starts reading as dirt.
        opacity: 0.26 * surfaceDetail,
      }}
    />
  ) : null;

  return (
    <div
      className="kc-stage"
      aria-hidden="true"
      style={
        {
          perspective: `${viewerDistance}px`,
        } as CSSProperties
      }
    >
      <div
        className="kc-rig"
        style={{ transform: `rotateX(${pitch}deg) rotateY(${yaw}deg)` }}
      >
        <div
          className="kc-box"
          style={
            {
              width: coverW,
              height,
              transform: `translateZ(${-halfSpine}px)`,
              // Set on the box rather than on .kc-stage: keepcase.css declares a
              // default on .kc-box itself, and a declaration on the element beats
              // an inherited one, so a value on the stage would be ignored.
              // Shared with WebGL so CSS grain tiles at the same physical size.
              "--tile": `${UNITS_PER_TILE}px`,
            } as CSSProperties
          }
        >
          {/* ---- back ---- */}
          <div
            className="kc-face kc-back"
            style={{ ["--spine" as string]: `${spine}px` } as CSSProperties}
          >
            {movie.poster ? (
              <span
                className="kc-back-art"
                style={{ backgroundImage: poster }}
              />
            ) : null}
          </div>

          {/* ---- spine: the left wall, hinged side ---- */}
          <div
            className="kc-face kc-spine"
            style={{
              left: 0,
              top: 0,
              bottom: 0,
              width: spine,
              // The wall itself: swung -90deg about its left edge so it runs
              // back along Z instead of lying flat over the cover.
              transformOrigin: "left center",
              transform: "rotateY(-90deg)",
              backgroundColor: movie.spine,
            }}
          >
            <span
              className="kc-spine-band"
              style={{ top: 3, backgroundColor: band }}
            />
            <span
              className="kc-spine-title"
              style={{
                color: movie.ink,
                fontFamily: fontStack(movie.face),
                fontWeight: movie.face === "serif" ? 400 : 500,
                letterSpacing: movie.caps ? "0.14em" : "0.01em",
                textTransform: movie.caps ? "uppercase" : "none",
                fontSize: spineFont,
              }}
            >
              {movie.title}
            </span>
            {spine >= 34 ? (
              <span className="kc-spine-dir" style={{ color: movie.ink }}>
                {movie.director}
              </span>
            ) : null}
            <span
              className="kc-spine-band"
              style={{ bottom: 3, backgroundColor: band }}
            />
            {grain}
            <span
              className="kc-sheen"
              style={{ ...sheenStyle(sheen), borderRadius: 3 }}
            />
          </div>

          {/* ---- right edge ---- */}
          <div
            className="kc-face kc-edge"
            style={{
              right: 0,
              top: 0,
              bottom: 0,
              width: spine,
              transformOrigin: "right center",
              transform: "rotateY(90deg)",
              backgroundColor: movie.spine,
            }}
          />

          {/* ---- top edge ---- */}
          <div
            className="kc-face kc-edge kc-edge-top"
            style={{
              left: 0,
              right: 0,
              top: 0,
              height: spine,
              transformOrigin: "top center",
              transform: "rotateX(90deg)",
              backgroundColor: movie.spine,
            }}
          />

          {/* ---- bottom edge ---- */}
          <div
            className="kc-face kc-edge kc-edge-bottom"
            style={{
              left: 0,
              right: 0,
              bottom: 0,
              height: spine,
              transformOrigin: "bottom center",
              transform: "rotateX(-90deg)",
              backgroundColor: movie.spine,
            }}
          />

          {/* ---- disc tray, seen once the cover swings clear ---- */}
          {showDisc ? (
            <div
              className="kc-tray"
              style={{ transform: `translateZ(${spine * 0.42}px)` }}
            >
              <span className="kc-disc" />
            </div>
          ) : null}

          {/* ---- front cover, hinged at the spine ---- */}
          {/* A real keepcase is opened by pulling the right edge toward you, so
              the cover sweeps forward through +Z and ends up flat to the left.
              Negative here, because rotateY(+) would swing it backwards through
              the case instead. WebglKeepcase matches this sign. */}
          <div
            className="kc-cover"
            style={{
              transformOrigin: "left center",
              transform: `rotateY(${-open}deg) translateZ(${spine}px)`,
            }}
          >
            <div
              className="kc-cover-outer"
              style={{ backgroundColor: movie.spine }}
            >
              {movie.poster ? (
                <span
                  className="kc-cover-poster"
                  style={{
                    backgroundImage: poster,
                    // A matte sleeve mutes its artwork; a clear shell lets it
                    // sit bright under the plastic.
                    filter:
                      finish === "clear"
                        ? "saturate(1)"
                        : "saturate(0.82) contrast(1.04)",
                  }}
                />
              ) : null}
              <span
                className="kc-hologram"
                style={{
                  backgroundImage: `url(${WRAP})`,
                  opacity: finish === "clear" ? 0.34 : 0.12,
                }}
              />
              {/* Cover art already carries the film's own title treatment, so
                  the lockup is only for cases with no poster to print. */}
              {movie.poster ? null : (
                <span className="kc-label" style={{ color: movie.ink }}>
                  <span>
                    {movie.studio || "Home video"} / {movie.year}
                  </span>
                  <strong
                    style={{
                      fontFamily: fontStack(movie.face),
                      textTransform: movie.caps ? "uppercase" : "none",
                    }}
                  >
                    {movie.title}
                  </strong>
                  <span>{movie.director}</span>
                </span>
              )}
              {grain}
              <span className="kc-sheen" style={sheenStyle(sheen)} />
              {wear > 0 ? (
                <span className="kc-wear" style={{ opacity: wear }} />
              ) : null}
            </div>

            {/* Inside of the cover. Without it the open case shows a mirrored
                poster, which is the tell that this is two planes, not a box. */}
            <div className="kc-cover-inner">
              <span
                className="kc-sheen"
                style={sheenStyle(
                  `linear-gradient(${lightAngle + 180}deg, transparent 30%, rgba(255,255,255,0.10) 48%, transparent 66%)`,
                )}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function fontStack(face: Movie["face"]) {
  if (face === "serif") return "var(--font-display)";
  if (face === "mono") return "var(--font-mono)";
  return "var(--font-sans)";
}

function clampNumber(value: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, value));
}
