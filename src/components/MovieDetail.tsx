import { useCallback, useEffect, useMemo, useState } from "react";
import type { Movie } from "../data/movies";
import { POSTER_W, faceFont } from "./caseFaces";

const TRANSITION = "transform 900ms cubic-bezier(0.16, 1, 0.3, 1)";
const RETRACT_MS = 620;

type Props = {
  movie: Movie;
  rect: DOMRect;
  hasPrev: boolean;
  hasNext: boolean;
  onPrev: () => void;
  onNext: () => void;
  onClose: () => void;
};

/**
 * The pulled-out movie.
 *
 * Geometry note — the container is the *spine* rect, but the thing you actually
 * see is the hinged cover. The container's transform-origin sits on the hinge
 * (`100% 50%`, the spine's right edge) so that:
 *
 *   cover's own rotateY(90deg) + container's rotateY(-90deg) = net 0deg
 *
 * ...which swings the cover round to face you while leaving the hinge fixed.
 * A cover point at local (u, v) relative to the hinge then lands at (u, v) on
 * screen, so the cover's centre ends up exactly POSTER_W/2 to the right of the
 * hinge, and scaling about that origin maps it to posterW = POSTER_W * scale.
 */
export function MovieDetail({
  movie,
  rect,
  hasPrev,
  hasNext,
  onPrev,
  onNext,
  onClose,
}: Props) {
  const [out, setOut] = useState(false);
  const [vp, setVp] = useState(() => ({
    w: typeof window === "undefined" ? 1440 : window.innerWidth,
    h: typeof window === "undefined" ? 900 : window.innerHeight,
  }));

  useEffect(() => {
    const onResize = () =>
      setVp({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // Kick the transition on the next frame so the browser paints the shelf pose first.
  useEffect(() => {
    const id = requestAnimationFrame(() =>
      requestAnimationFrame(() => setOut(true)),
    );
    return () => cancelAnimationFrame(id);
  }, []);

  const retract = useCallback(() => {
    setOut(false);
    window.setTimeout(onClose, RETRACT_MS);
  }, [onClose]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        retract();
      } else if (e.key === "ArrowLeft" && hasPrev) {
        e.preventDefault();
        onPrev();
      } else if (e.key === "ArrowRight" && hasNext) {
        e.preventDefault();
        onNext();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [retract, onPrev, onNext, hasPrev, hasNext]);

  const geom = useMemo(() => {
    const narrow = vp.w < 720;
    const posterH = Math.min(vp.h * (narrow ? 0.35 : 0.6), 480);
    const scale = posterH / rect.height;
    const posterW = POSTER_W * scale;

    const posterLeft = narrow
      ? (vp.w - posterW) / 2
      : Math.max(24, vp.w * 0.12);
    const posterTop = narrow ? Math.max(34, vp.h * 0.08) : (vp.h - posterH) / 2;

    // The cover's centre lands at (rect.left + rect.width + posterW/2,
    // rect.top + rect.height/2) before translation, so solve for the delta.
    const dx =
      posterLeft + posterW / 2 - (rect.left + rect.width + posterW / 2);
    const dy = posterTop + posterH / 2 - (rect.top + rect.height / 2);

    return { narrow, scale, posterW, posterH, posterLeft, posterTop, dx, dy };
  }, [vp, rect]);

  const { narrow, scale, posterW, posterH, posterLeft, posterTop, dx, dy } =
    geom;
  const font = faceFont[movie.face];

  return (
    <div className="fixed inset-0 z-[90]">
      {/* backdrop — fades in over 700ms */}
      <div
        onClick={retract}
        className="bg-background/70 absolute inset-0 backdrop-blur-xl"
        style={{ opacity: out ? 1 : 0, transition: "opacity 700ms ease" }}
      />

      {/* the case itself, still in 3D, swinging round to face you */}
      <div
        className="pointer-events-none absolute"
        style={{
          left: rect.left,
          top: rect.top,
          width: rect.width,
          height: rect.height,
          transformStyle: "preserve-3d",
          transformOrigin: "100% 50%",
          transform: out
            ? `translate3d(${dx}px, ${dy}px, 0) scale(${scale}) rotateY(-90deg)`
            : `translate3d(0, 0, 0) scale(1) rotateY(-26deg)`,
          transition: TRANSITION,
        }}
      >
        <div
          className="absolute top-0 overflow-hidden bg-muted shadow-[0_40px_120px_-30px_rgba(0,0,0,0.6)]"
          style={{
            left: "100%",
            width: POSTER_W,
            height: rect.height,
            transformOrigin: "left center",
            transform: "rotateY(90deg)",
            borderRadius: 3,
          }}
        >
          {movie.poster ? (
            <img
              src={movie.poster}
              alt=""
              className="h-full w-full object-cover"
              draggable={false}
            />
          ) : (
            <div
              className={`flex h-full w-full flex-col items-center justify-center gap-3 p-6 text-center ${font}`}
              style={{ backgroundColor: movie.spine, color: movie.ink }}
            >
              <span className="text-[22px] leading-tight">{movie.title}</span>
              <span className="font-mono text-[11px] tracking-widest uppercase opacity-70">
                {movie.director}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* details panel — fades and rises in 260ms behind the case */}
      <div
        className="absolute"
        style={{
          left: narrow ? 24 : posterLeft + posterW + 48,
          right: narrow ? 24 : 48,
          top: narrow ? posterTop + posterH + 18 : posterTop,
          opacity: out ? 1 : 0,
          transform: out ? "translateY(0)" : "translateY(14px)",
          transition: `opacity 700ms ease ${out ? 260 : 0}ms, transform 700ms cubic-bezier(0.16,1,0.3,1) ${
            out ? 260 : 0
          }ms`,
        }}
      >
        <div className="movie-detail-panel max-w-[30rem]">
          <p className="font-mono text-muted-foreground text-[11px] tracking-[0.22em] uppercase">
            {movie.recommender
              ? `Recommended by ${movie.recommender}`
              : movie.watched
                ? `Watched ${movie.watched}`
                : `${movie.year}`}
          </p>

          <h2 className="font-display mt-3 text-[clamp(1.9rem,4vw,3.1rem)] leading-[1.03] font-light">
            {movie.title}
          </h2>

          <p className="text-muted-foreground mt-2 text-[15px]">
            {movie.director}
          </p>

          <div className="font-mono text-muted-foreground mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] tracking-widest uppercase">
            <span>{movie.year}</span>
            {movie.runtime > 0 ? <span>· {movie.runtime} min</span> : null}
            {movie.studio ? <span>· {movie.studio}</span> : null}
            <span>· {movie.discs}</span>
            <span>· {movie.finish}</span>
          </div>

          <p className="mt-4 text-[15px]">
            {movie.rating > 0 ? (
              <>
                <span className="text-primary tracking-[0.2em]">
                  {"★".repeat(Math.round(movie.rating / 2))}
                  <span className="opacity-30">
                    {"★".repeat(5 - Math.round(movie.rating / 2))}
                  </span>
                </span>{" "}
                <span className="font-mono text-muted-foreground text-[11px] tracking-widest">
                  {movie.rating}/10
                </span>
              </>
            ) : (
              <span className="font-mono text-muted-foreground text-[11px] tracking-widest uppercase">
                Unrated
              </span>
            )}
          </p>

          <p className="text-muted-foreground mt-4 max-w-[46ch] text-[15px] leading-relaxed">
            {movie.blurb ||
              `A ${movie.genres?.[0]?.toLowerCase() ?? "memorable"} film from ${movie.year}, directed by ${movie.director}. Selected for this collection.`}
          </p>

          {movie.genres?.length ? (
            <p className="font-mono text-muted-foreground mt-4 text-[11px] tracking-widest uppercase">
              {movie.genres.join(" · ")}
            </p>
          ) : null}

          <div className="mt-7 flex items-center gap-2">
            <button
              type="button"
              onClick={onPrev}
              disabled={!hasPrev}
              className="font-mono border-border hover:bg-secondary rounded-sm border px-3 py-1.5 text-[11px] tracking-widest uppercase transition-colors disabled:opacity-30"
            >
              ← Prev
            </button>
            <button
              type="button"
              onClick={onNext}
              disabled={!hasNext}
              className="font-mono border-border hover:bg-secondary rounded-sm border px-3 py-1.5 text-[11px] tracking-widest uppercase transition-colors disabled:opacity-30"
            >
              Next →
            </button>
            <button
              type="button"
              onClick={retract}
              className="font-mono bg-primary text-primary-foreground hover:opacity-90 rounded-sm px-3 py-1.5 text-[11px] tracking-widest uppercase transition-opacity"
            >
              Shelve it
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
