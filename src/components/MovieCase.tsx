import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Movie } from "../data/movies";
import type { SurfaceUrls } from "../lib/textures";
import { ShelfKeepcase } from "./ShelfKeepcase";

/** How far the case pulls toward the viewer on hover, and how much it lifts. */
const PULL = 96;
const LIFT = -26;
/** Grace period before the metadata card unmounts, so the transform settling
 *  under the pointer doesn't make it flicker. */
const LEAVE_GRACE_MS = 90;

type Props = {
  movie: Movie;
  surfaces: SurfaceUrls | null;
  onOpen: (movie: Movie, rect: DOMRect) => void;
  caseRef?: (el: HTMLButtonElement | null) => void;
  justAdded?: boolean;
};

/**
 * One case on the rail.
 *
 * The case itself is ShelfKeepcase — the mockup's solid box. What is left here
 * is everything the shelf owns rather than the case does: the slot the case
 * occupies in the row, the hover pull and lift, the metadata card, and the
 * rect handed to MovieDetail on click.
 */
export function MovieCase({
  movie,
  surfaces,
  onOpen,
  caseRef,
  justAdded,
}: Props) {
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
    // Touch devices should tap straight into the detail view, without a
    // synthetic hover state getting stuck over the case.
    if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches)
      return;
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

  const { width, height } = movie;

  return (
    <>
      {/* The OUTER button never transforms — it stays put as the hit target, so
          the case can never slide out from under the pointer mid-hover. Its box
          is exactly the slot the case takes on the rail, which is also the rect
          MovieDetail opens from. */}
      <button
        ref={setRefs}
        type="button"
        aria-label={`${movie.title}, ${movie.year}`}
        className="dvd-shelf-case relative shrink-0 cursor-pointer outline-none"
        style={{
          width,
          height,
          // --z comes from Shelf.tsx's curve pass and orders the row by depth;
          // a hovered case has to beat the whole of it, hence 40.
          zIndex: hovered ? 40 : "var(--z, 0)",
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
          aria-hidden={false}
          className={`dvd-case-body absolute inset-0 block ${justAdded ? "animate-shelve-in" : ""}`}
          style={{
            transformStyle: "preserve-3d",
            transform: `rotateY(var(--ry, 0deg)) rotateZ(${hovered ? 0 : movie.lean}deg) translateZ(${
              (hovered ? PULL : 0) + movie.depth
            }px) translateY(${hovered ? LIFT : 0}px)`,
            transition:
              "transform 620ms cubic-bezier(0.16, 1, 0.3, 1), width 1100ms cubic-bezier(0.22, 1, 0.32, 1)",
          }}
        >
          <ShelfKeepcase movie={movie} surfaces={surfaces} />
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
                <p className="font-display text-[20px] leading-tight font-normal">
                  {movie.title}
                </p>
                <p className="text-muted-foreground mt-0.5 text-[15px]">
                  {movie.director}
                </p>
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
