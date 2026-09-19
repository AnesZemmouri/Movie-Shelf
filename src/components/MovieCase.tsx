import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Movie } from "../data/movies";
import { POSTER_W, faceFont } from "./caseFaces";

/** How far the case pulls toward the viewer on hover, and how much it lifts. */
const PULL = 96;
const LIFT = -26;
/** Grace period before the metadata card unmounts, so the transform settling
 *  under the pointer doesn't make it flicker. */
const LEAVE_GRACE_MS = 90;
/** How much case-top shows above the spine, in px. A real keepcase is ~178px
 *  deep, but modelling the top as the full depth is what makes it read badly:
 *  the shelf's curve multiplies depth by sin(ry), so at the rail's ±34deg the
 *  plane slides up to ~100px sideways and paints a dark diagonal across its
 *  neighbours. The top is only ever a sliver from a near-frontal view anyway,
 *  so it is modelled shallow — enough to catch the light, too short to shear. */
const TOP_DEPTH = 26;
/** Tilt that turns TOP_DEPTH into a visible lip (~8px tall, ~25px deep). */
const TOP_TILT = 72;

type Props = {
  movie: Movie;
  onOpen: (movie: Movie, rect: DOMRect) => void;
  caseRef?: (el: HTMLButtonElement | null) => void;
  justAdded?: boolean;
};

export function MovieCase({ movie, onOpen, caseRef, justAdded }: Props) {
  const [hovered, setHovered] = useState(false);
  const [card, setCard] = useState<{ left: number; top: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement | null>(null);
  const leaveTimer = useRef<number | null>(null);

  const setRefs = useCallback(
    (el: HTMLButtonElement | null) => {
      btnRef.current = el;
      caseRef?.(el);
    },
    [caseRef],
  );

  const placeCard = useCallback(() => {
    const el = btnRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setCard({ left: r.left + r.width / 2, top: r.top });
  }, []);

  const enter = useCallback(() => {
    if (leaveTimer.current !== null) {
      window.clearTimeout(leaveTimer.current);
      leaveTimer.current = null;
    }
    placeCard();
    setHovered(true);
  }, [placeCard]);

  const leave = useCallback(() => {
    if (leaveTimer.current !== null) window.clearTimeout(leaveTimer.current);
    leaveTimer.current = window.setTimeout(() => {
      setHovered(false);
      setCard(null);
      leaveTimer.current = null;
    }, LEAVE_GRACE_MS);
  }, []);

  useEffect(
    () => () => {
      if (leaveTimer.current !== null) window.clearTimeout(leaveTimer.current);
    },
    [],
  );

  // Keep the card glued to the case if the rail scrolls under the pointer.
  useEffect(() => {
    if (!hovered) return;
    const onScroll = () => placeCard();
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onScroll);
    };
  }, [hovered, placeCard]);

  const { width, height, spine, ink } = movie;
  const band = movie.band ?? ink;
  const font = faceFont[movie.face];

  return (
    <>
      {/* The OUTER button never transforms — it stays put as the hit target, so
          the case can never slide out from under the pointer mid-hover. */}
      <button
        ref={setRefs}
        type="button"
        aria-label={`${movie.title}, ${movie.year}`}
        className="relative shrink-0 cursor-pointer outline-none"
        style={{
          width,
          height,
          zIndex: hovered ? 40 : undefined,
          ["--spine-w" as string]: `${width}px`,
        }}
        onMouseEnter={enter}
        onMouseLeave={leave}
        onFocus={enter}
        onBlur={leave}
        onClick={() => {
          const el = btnRef.current;
          if (el) onOpen(movie, el.getBoundingClientRect());
        }}
      >
        {/* ...and the inner span is the only thing that moves. */}
        <span
          className={`absolute inset-0 block ${justAdded ? "animate-shelve-in" : ""}`}
          style={{
            transformStyle: "preserve-3d",
            transform: `rotateY(var(--ry, 0deg)) rotateZ(${hovered ? 0 : movie.lean}deg) translateZ(${
              (hovered ? PULL : 0) + movie.depth
            }px) translateY(${hovered ? LIFT : 0}px)`,
            transition:
              "transform 620ms cubic-bezier(0.16, 1, 0.3, 1), width 1100ms cubic-bezier(0.22, 1, 0.32, 1)",
          }}
        >
          {/* ---- spine face ------------------------------------------------- */}
          <span
            className="absolute inset-0 block overflow-hidden"
            style={{
              backgroundColor: spine,
              borderRadius: 1,
              boxShadow: `inset 0 0 0 1px rgba(255,255,255,0.06)`,
            }}
          >
            {/* poster-art wraparound: the poster's own left edge bleeds onto the spine */}
            {movie.poster ? (
              <span
                className="absolute inset-y-0 left-0 block"
                style={{
                  width: Math.max(4, Math.round(width * 0.42)),
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
                background: `linear-gradient(180deg, rgba(255,255,255,0.10) 0%, rgba(0,0,0,0.05) 35%, rgba(0,0,0,0.22) 100%)`,
                backgroundColor: spine,
                opacity: 0.72,
              }}
            />

            {/* top / bottom rules in the accent pulled from the poster */}
            <span
              className="absolute inset-x-0 top-0 block"
              style={{ height: 2, backgroundColor: band, opacity: 0.85 }}
            />
            <span
              className="absolute inset-x-0 bottom-0 block"
              style={{ height: 2, backgroundColor: band, opacity: 0.85 }}
            />

            {/* vertical title */}
            <span
              className={`absolute inset-x-0 flex justify-center ${font}`}
              style={{
                top: 12,
                bottom: width >= 26 ? 42 : 12,
                writingMode: "vertical-rl",
                color: ink,
                fontWeight: movie.face === "serif" ? 400 : 500,
                letterSpacing: movie.caps ? "0.14em" : "0.01em",
                textTransform: movie.caps ? "uppercase" : "none",
                fontSize: Math.min(14, Math.max(9.5, width * 0.42)),
                lineHeight: 1.08,
                textAlign: "center",
                overflow: "hidden",
                textShadow: "0 1px 0 rgba(0,0,0,0.18)",
              }}
            >
              {movie.title}
            </span>

            {/* vertical director — only on spines wide enough to hold it */}
            {width >= 30 ? (
              <span
                className="font-mono absolute inset-x-0 flex justify-center"
                style={{
                  bottom: 14,
                  writingMode: "vertical-rl",
                  color: ink,
                  opacity: 0.72,
                  fontSize: 7.5,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  maxHeight: 84,
                  overflow: "hidden",
                }}
              >
                {movie.director}
              </span>
            ) : null}

            {/* studio / rating-cert mark at the foot */}
            {width >= 26 ? (
              <span
                className="font-mono absolute inset-x-0 flex justify-center"
                style={{ bottom: 5, color: ink, opacity: 0.6, fontSize: 6.5, letterSpacing: "0.1em" }}
              >
                {movie.rating > 0 ? movie.rating : "—"}
              </span>
            ) : null}

            {/* material texture — over the ink, so type reads as PRINTED INTO
                the case rather than floating on top of it */}
            <span
              className="absolute inset-0 block"
              style={{
                backgroundImage:
                  "repeating-linear-gradient(90deg, rgba(255,255,255,0.045) 0 1px, rgba(0,0,0,0.03) 1px 3px)",
                opacity: 0.55,
                pointerEvents: "none",
              }}
            />

            {/* plastic sheen — clear shells get a tight, bright specular; matte
                sleeves get a broad, soft one */}
            <span
              className="absolute inset-0 block"
              style={{
                background:
                  movie.finish === "clear"
                    ? "linear-gradient(102deg, rgba(255,255,255,0) 34%, rgba(255,255,255,0.42) 47%, rgba(255,255,255,0) 58%)"
                    : "linear-gradient(102deg, rgba(255,255,255,0) 26%, rgba(255,255,255,0.16) 50%, rgba(255,255,255,0) 74%)",
                pointerEvents: "none",
              }}
            />

            {/* edge wear */}
            {movie.wear > 0 ? (
              <span
                className="absolute inset-0 block"
                style={{
                  background:
                    "linear-gradient(180deg, rgba(255,255,255,0.5) 0%, rgba(255,255,255,0) 12%), linear-gradient(0deg, rgba(0,0,0,0.45) 0%, rgba(0,0,0,0) 16%)",
                  opacity: movie.wear,
                  pointerEvents: "none",
                }}
              />
            ) : null}

            {/* inset highlight */}
            <span
              className="absolute inset-0 block"
              style={{
                boxShadow: "inset 1px 0 0 rgba(255,255,255,0.18), inset -1px 0 0 rgba(0,0,0,0.25)",
                pointerEvents: "none",
              }}
            />
          </span>

          {/* ---- hinged front cover ---------------------------------------- */}
          {/* A cover has a front. The plane's normal sits at 90deg, so the
              shelf's rotateY makes it face you on one side of the curve and
              show its *back* on the other — and with no backface-visibility the
              back renders as a mirrored poster slab, which is what turns the
              left end of the rail into a pile of overlapping artwork. Hidden,
              the cover reads as a glimpse of the next case's edge, the way it
              does on a real packed shelf. */}
          <span
            className="absolute inset-y-0 block overflow-hidden"
            style={{
              left: "100%",
              width: POSTER_W,
              transformOrigin: "left center",
              transform: "rotateY(90deg)",
              backfaceVisibility: "hidden",
              backgroundColor: spine,
              borderRadius: 2,
            }}
          >
            {movie.poster ? (
              <img
                src={movie.poster}
                alt=""
                loading="lazy"
                draggable={false}
                className="h-full w-full object-cover"
              />
            ) : (
              <span
                className={`flex h-full w-full items-center justify-center p-4 text-center ${font}`}
                style={{ color: ink, fontSize: 13 }}
              >
                {movie.title}
              </span>
            )}
          </span>

          {/* ---- top edge of the case --------------------------------------- */}
          {/* A shallow lip rather than the case's full depth — see TOP_DEPTH.
              Dark, because a case top seen from eye level catches no light, and
              near-constant across the row so the tops line up as one shelf. */}
          <span
            className="absolute inset-x-0 top-0 block"
            style={{
              height: TOP_DEPTH,
              transformOrigin: "top center",
              transform: `rotateX(${TOP_TILT}deg)`,
              backgroundColor: spine,
              backgroundImage:
                "linear-gradient(180deg, rgba(0,0,0,0.34) 0%, rgba(0,0,0,0.62) 100%)",
            }}
          />
        </span>
      </button>

      {hovered && card
        ? createPortal(
            <div
              className="pointer-events-none fixed z-[100] w-[248px]"
              style={{
                left: card.left,
                top: card.top - 14,
                transform: "translate(-50%, -100%)",
              }}
            >
              <div className="animate-rise border border-border/70 bg-card/95 px-4 py-3 shadow-[0_18px_50px_-18px_rgba(0,0,0,0.5)] backdrop-blur-sm">
                <p className="font-display text-[20px] leading-tight font-normal">{movie.title}</p>
                <p className="text-muted-foreground mt-0.5 text-[15px]">{movie.director}</p>
                <p className="font-mono mt-1.5 text-[14px] tracking-wide uppercase opacity-70">
                  {movie.year}
                  {movie.runtime > 0 ? ` · ${movie.runtime}m` : ""}
                  {movie.discs !== "single" ? ` · ${movie.discs}` : ""}
                </p>
                {movie.rating > 0 ? (
                  <p className="font-mono mt-1 text-[14px] opacity-70">
                    {"★".repeat(Math.round(movie.rating / 2))} {movie.rating}/10
                  </p>
                ) : null}
                {movie.genres?.length ? (
                  <p className="text-muted-foreground mt-1.5 text-[14px]">
                    {movie.genres.join(" · ")}
                  </p>
                ) : null}
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
