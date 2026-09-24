import type { CSSProperties } from "react";
import type { Movie } from "../data/movies";
import { UNITS_PER_TILE, type SurfaceUrls } from "../lib/textures";
import { POSTER_W, faceFont } from "./caseFaces";

/** Same-origin poster copies, served from .poster_cache by the dev middleware in
 *  vite.config.ts. Defining the path here rather than importing it from the
 *  study's geometry.ts keeps the archive working if src/mockup/ is ever deleted,
 *  which vite.config.ts lists as an option. */
const cachedPoster = (movie: Movie) => `/poster-cache/${movie.id}.jpg`;

const WRAP = "/5875003108012789722.jpg";

/** The archive has no light control, so the sheen keeps the angle the old
 *  two-plane case used. */
const LIGHT_ANGLE = 102;

/** Baseline of the vertical director line, and the most of the spine it may
 *  cover. Without the cap the line is as tall as the name it prints and reaches
 *  up into the title.
 *
 *  64 rather than the old case's 84: capping at 84 keeps the two lines apart
 *  only if the title also gives up 84px of spine, which leaves it ~8 characters
 *  of room at 14px. The director is the least important thing printed here, so
 *  it yields first. Raise this if the director should read in full and the
 *  title can afford to lose the space. */
const DIRECTOR_BOTTOM = 14;
const DIRECTOR_MAX = 64;

type Props = {
  movie: Movie;
  /** Generated noise from lib/textures, or null before it exists. Null just
   *  skips the grain and the masked sheen. */
  surfaces: SurfaceUrls | null;
};

/**
 * The shelf's keepcase: the mockup's solid box, folded spine-out.
 *
 * `CssKeepcase` in the study is the same construction seen face-on and able to
 * swing open. This one is deliberately a separate component rather than a mode
 * flag on that one, because the shelf case never opens — no disc tray, no cover
 * inner, no hinge angle — and threading three always-false props through the
 * study's renderer would cost more than this file does.
 *
 * The box is authored in its own space (x = 0..coverW across the cover, z = 0
 * at the back to z = spine at the front cover) and then rotated 90deg about its
 * *left* edge. That maps a local point (x, y, z) to (z, y, -x), which is what
 * puts a shelved case's faces where they belong:
 *
 *   spine   x=0,     z in [0,spineW]   ->  x in [0,spineW], z=0          facing you
 *   cover   z=spineW, x in [0,coverW]  ->  x=spineW, z in [-coverW,0]    running back
 *   back    z=0                        ->  x=0                           facing away
 *   top     y=0                        ->  x in [0,spineW], z in [-coverW,0]
 *
 * So the case occupies exactly `movie.width` of the rail — the same slot the
 * two-plane case did — and gains the other four faces for free.
 *
 * The cover's depth is POSTER_W, the archive's existing cover constant, not the
 * mockup's own 135/190 of the case height. MovieDetail.tsx opens a case by
 * hinging a POSTER_W-wide cover off the spine rect and scaling it, so matching
 * that here is what keeps the pull-out free of a visible width jump.
 */
export function ShelfKeepcase({ movie, surfaces }: Props) {
  // Read as the thickness of the case, and not to be confused with movie.spine,
  // which is the colour printed on it. CssKeepcase names the same number `spine`
  // off its geometry object, where no colour of that name is in scope.
  const spineW = movie.width;
  const band = movie.band ?? movie.ink;
  const font = faceFont[movie.face];
  const clear = movie.finish === "clear";
  const titleSize = Math.min(14, Math.max(9.5, spineW * 0.42));

  // The two marks at the foot of the spine, and the room the title has to leave
  // for them. A vertical director line is only as tall as the name it prints,
  // so it grows *upward* from its baseline and will climb into the title if
  // nothing bounds it — hence DIRECTOR_MAX, which caps it the way the old
  // two-plane case did. The title then reserves exactly what is below it rather
  // than a flat 44px: a spine too narrow for either mark gets its full height.
  const showDirector = spineW >= 30;
  const showRating = spineW >= 26;
  const footReserve = showDirector ? DIRECTOR_BOTTOM + DIRECTOR_MAX + 4 : showRating ? 42 : 12;

  // Local cached copy first, remote as the fallback layer. A failed CSS
  // background layer simply paints nothing, so the second one still shows.
  const poster = movie.poster
    ? `url("${cachedPoster(movie)}"), url("${movie.poster}")`
    : "none";

  // Clear shells catch a tight, bright specular; matte sleeves a broad, soft one.
  const sheen = clear
    ? `linear-gradient(${LIGHT_ANGLE}deg, transparent 33%, rgba(255,255,255,0.40) 46%, transparent 57%)`
    : `linear-gradient(${LIGHT_ANGLE}deg, transparent 24%, rgba(255,255,255,0.15) 50%, transparent 76%)`;

  // The specular layer, masked by the shared roughness noise so the highlight
  // breaks into patches instead of sweeping clean across the face.
  const sheenStyle = (backgroundImage: string): CSSProperties =>
    surfaces
      ? {
          backgroundImage,
          maskImage: `url(${surfaces.sheenMask})`,
          WebkitMaskImage: `url(${surfaces.sheenMask})`,
        }
      : { backgroundImage };

  const grain = surfaces ? (
    <span
      className="kc-grain"
      style={{ backgroundImage: `url(${surfaces.grain})`, opacity: 0.26 }}
    />
  ) : null;

  return (
    <div
      className="kc-box"
      style={
        {
          position: "absolute",
          left: 0,
          top: 0,
          width: POSTER_W,
          height: "100%",
          transformOrigin: "left center",
          transform: "rotateY(90deg)",
          "--tile": `${UNITS_PER_TILE}px`,
        } as CSSProperties
      }
    >
      {/* ---- back: the case's left face -----------------------------------
          The left half of the rail sees this head-on, because a positive --ry
          turns each case's right side away. So it has to read as a printed back
          cover in the case's own colour. The study's .kc-back is a near-black
          interior, which it can afford — you only reach it by orbiting the case
          round — but on the shelf these faces are half the row, and left black
          they read as gaps in it. */}
      <div
        className="kc-face kc-back"
        style={{
          backgroundColor: movie.spine,
          boxShadow:
            "inset 0 0 0 1px rgba(255,255,255,0.10), inset 0 0 40px rgba(0,0,0,0.42)",
        }}
      >
        {movie.poster ? (
          <span
            className="kc-back-art"
            style={{
              backgroundImage: poster,
              opacity: 0.5,
              filter: "grayscale(0.4) brightness(0.78) contrast(1.12)",
            }}
          />
        ) : null}
        {/* a printed back sits darker than the front, and darkens further toward
            the foot the way a real sleeve does */}
        <span
          className="absolute inset-0 block"
          style={{
            background:
              "linear-gradient(180deg, rgba(0,0,0,0.26), rgba(0,0,0,0.48) 62%, rgba(0,0,0,0.64))",
          }}
        />
      </div>

      {/* ---- spine: the only face the shelf is really about ---- */}
      <div
        className="kc-face kc-spine"
        style={{
          left: 0,
          top: 0,
          bottom: 0,
          width: spineW,
          transformOrigin: "left center",
          transform: "rotateY(-90deg)",
          backgroundColor: movie.spine,
          boxShadow:
            "inset 0 0 0 1px rgba(255,255,255,0.14), inset -2px 0 0 rgba(0,0,0,0.24)",
        }}
      >
        {/* poster-art wraparound: the poster's own left edge bleeds onto the spine */}
        {movie.poster ? (
          <span
            className="absolute inset-y-0 left-0 block"
            style={{
              width: Math.max(4, Math.round(spineW * 0.42)),
              backgroundImage: `url("${movie.poster}")`,
              backgroundSize: "cover",
              backgroundPosition: "left center",
              opacity: 0.5,
              mixBlendMode: "soft-light",
            }}
          />
        ) : null}

        {/* base colour settle — stops the wraparound from looking pasted on */}
        <span
          className="absolute inset-0 block"
          style={{
            background:
              "linear-gradient(180deg, rgba(255,255,255,0.10) 0%, rgba(0,0,0,0.05) 35%, rgba(0,0,0,0.22) 100%)",
            backgroundColor: movie.spine,
            opacity: 0.72,
          }}
        />

        {/* rules at the head and foot, in the accent pulled from the poster */}
        <span
          className="kc-spine-band"
          style={{ top: 3, backgroundColor: band }}
        />

        <span
          className={`kc-spine-title ${font}`}
          style={{
            // Overrides the class's flat `inset: 14px 0 44px` — see footReserve.
            top: 12,
            bottom: footReserve,
            color: movie.ink,
            fontWeight: movie.face === "serif" ? 400 : 500,
            letterSpacing: movie.caps ? "0.14em" : "0.01em",
            textTransform: movie.caps ? "uppercase" : "none",
            fontSize: titleSize,
          }}
        >
          {movie.title}
        </span>

        {/* vertical director — only on spines wide enough to hold it, and only
            as far up the spine as DIRECTOR_MAX allows */}
        {showDirector ? (
          <span
            className="kc-spine-dir"
            style={{
              bottom: DIRECTOR_BOTTOM,
              maxHeight: DIRECTOR_MAX,
              color: movie.ink,
              fontSize: 7.5,
              letterSpacing: "0.08em",
            }}
          >
            {movie.director}
          </span>
        ) : null}

        {/* rating-cert mark at the foot */}
        {showRating ? (
          <span
            className="font-mono absolute inset-x-0 flex justify-center"
            style={{
              bottom: 5,
              color: movie.ink,
              opacity: 0.6,
              fontSize: 6.5,
              letterSpacing: "0.1em",
            }}
          >
            {movie.rating > 0 ? movie.rating : "—"}
          </span>
        ) : null}

        <span
          className="kc-spine-band"
          style={{ bottom: 3, backgroundColor: band }}
        />

        {grain}
        <span className="kc-sheen" style={sheenStyle(sheen)} />
        {movie.wear > 0 ? (
          <span className="kc-wear" style={{ opacity: movie.wear }} />
        ) : null}
      </div>

      {/* ---- right edge, at the far end of the case's depth ---- */}
      <div
        className="kc-face kc-edge"
        style={{
          right: 0,
          top: 0,
          bottom: 0,
          width: spineW,
          transformOrigin: "right center",
          transform: "rotateY(90deg)",
          backgroundColor: movie.spine,
        }}
      />

      {/* ---- top edge ---- */}
      {/* Full depth, exactly as the study draws it. That is the point of the
          exercise: the old case cheated this face down to a 26px lip because a
          tilted plane at real depth sheared across its neighbours. A genuine
          horizontal face is seen from the rail's raised vanishing point as a
          real case top, and the rail's curve swings its far edge the way a real
          shelf's would. Not clamped — but it is the first thing to clamp if the
          ends of the rail ever read as a smear. */}
      <div
        className="kc-face kc-edge kc-edge-top"
        style={{
          left: 0,
          right: 0,
          top: 0,
          height: spineW,
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
          height: spineW,
          transformOrigin: "bottom center",
          transform: "rotateX(-90deg)",
          backgroundColor: movie.spine,
        }}
      />

      {/* ---- front cover, hinged at the spine and shut ---- */}
      <div
        className="kc-cover"
        style={{
          transformOrigin: "left center",
          transform: `translateZ(${spineW}px)`,
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
                // A matte sleeve mutes its artwork; a clear shell lets it sit
                // bright under the plastic.
                filter: clear ? "saturate(1)" : "saturate(0.82) contrast(1.04)",
              }}
            />
          ) : null}
          <span
            className="kc-hologram"
            style={{
              backgroundImage: `url(${WRAP})`,
              opacity: clear ? 0.34 : 0.12,
            }}
          />
          {/* Cover art already carries the film's own title treatment, so the
              lockup is only for cases with no poster to print. */}
          {movie.poster ? null : (
            <span className="kc-label" style={{ color: movie.ink }}>
              <span>
                {movie.studio || "Home video"} / {movie.year}
              </span>
              <strong
                className={font}
                style={{ textTransform: movie.caps ? "uppercase" : "none" }}
              >
                {movie.title}
              </strong>
              <span>{movie.director}</span>
            </span>
          )}
          {grain}
          <span className="kc-sheen" style={sheenStyle(sheen)} />
          {movie.wear > 0 ? (
            <span className="kc-wear" style={{ opacity: movie.wear }} />
          ) : null}
        </div>
      </div>
    </div>
  );
}
