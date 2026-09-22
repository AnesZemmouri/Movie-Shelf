import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { Movie } from "../data/movies";
import { MovieCase } from "./MovieCase";
import { MovieDetail } from "./MovieDetail";

/** Above this total shelf width the rail loops seamlessly. Below it the row is
 *  rendered once and centred — 3 copies of a short row would show duplicates. */
const LOOP_THRESHOLD = 2600;
const COPIES = 3;
/** Max Y-rotation at the far edge of the rail, in degrees. */
const MAX_RY = 34;
const RY_EXPONENT = 1.35;
const KEY_STEP = 320;
/** How far the pointer must travel before a press counts as a drag rather than
 *  a click. Pointer capture is deferred until this is crossed — see onPointerDown. */
const DRAG_THRESHOLD = 4;

type Props = {
  movies: Movie[];
  justAdded?: string | null;
  onOpenChange?: (open: boolean) => void;
};

type OpenState = { movie: Movie; index: number; rect: DOMRect };

export function Shelf({ movies, justAdded, onOpenChange }: Props) {
  const scroller = useRef<HTMLDivElement | null>(null);
  const caseEls = useRef<(HTMLButtonElement | null)[]>([]);
  const carry = useRef<number | null>(null);
  const rafPending = useRef(false);
  const drag = useRef<{
    startX: number;
    startScroll: number;
    moved: boolean;
  } | null>(null);
  /** Set once a press becomes a drag, so the click that follows a drag doesn't
   *  open the case the user was only trying to scroll past. */
  const suppressClick = useRef(false);

  const [shouldLoop, setShouldLoop] = useState(false);
  const [overflows, setOverflows] = useState(false);
  const [open, setOpen] = useState<OpenState | null>(null);

  // Two different questions, previously conflated into one flag:
  //   shouldLoop — is the row long enough that 3 copies are worth the seamless wrap?
  //   overflows  — does the row spill past the viewport, so it needs edge fades
  //                and must NOT be centred (justify-center on overflowing flex
  //                content clips the start out of reach).
  const looping = shouldLoop && movies.length > 0;

  // The DOM row is either 3 copies (looped) or 1.
  const row = useMemo(
    () =>
      looping ? Array.from({ length: COPIES }, () => movies).flat() : movies,
    [looping, movies],
  );

  const applyCurve = useCallback(() => {
    rafPending.current = false;
    const el = scroller.current;
    if (!el) return;

    const vw = el.clientWidth;
    const centre = el.scrollLeft + vw / 2;

    for (const node of caseEls.current) {
      if (!node) continue;
      const r = node.getBoundingClientRect();
      const scrollerRect = el.getBoundingClientRect();
      const cx = r.left - scrollerRect.left + el.scrollLeft + r.width / 2;
      const t = Math.max(-1, Math.min(1, (cx - centre) / (vw / 2)));
      const eased = Math.sign(t) * Math.pow(Math.abs(t), RY_EXPONENT);
      node.style.setProperty("--ry", `${(-MAX_RY * eased).toFixed(2)}deg`);
    }
  }, []);

  const scheduleCurve = useCallback(() => {
    if (rafPending.current) return;
    rafPending.current = true;
    requestAnimationFrame(applyCurve);
  }, [applyCurve]);

  const wrap = useCallback(() => {
    const el = scroller.current;
    if (!el || !looping) return;
    const segment = el.scrollWidth / COPIES;
    if (segment <= 0) return;
    // Keep the viewport inside the middle copy; translate scrollLeft by exactly
    // one segment so the swap is visually identical.
    if (el.scrollLeft < segment) {
      carry.current = el.scrollLeft + segment;
      el.scrollLeft += segment;
    } else if (el.scrollLeft >= segment * 2) {
      carry.current = el.scrollLeft - segment;
      el.scrollLeft -= segment;
    }
  }, [looping]);

  // Measure the row; decide whether it loops, and re-centre on change.
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;

    const measure = () => {
      const content = el.scrollWidth / (looping ? COPIES : 1);
      const loop = content > LOOP_THRESHOLD;
      setShouldLoop(loop);
      setOverflows(content > el.clientWidth);
      if (loop) {
        // park in the middle copy
        el.scrollLeft = el.scrollWidth / COPIES + (carry.current ?? 0);
        carry.current = null;
      } else {
        el.scrollLeft = 0;
      }
      scheduleCurve();
    };

    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [movies, looping, scheduleCurve]);

  // Re-centre whenever the filtered set changes length.
  useEffect(() => {
    const el = scroller.current;
    if (el && looping) el.scrollLeft = el.scrollWidth / COPIES;
    scheduleCurve();
  }, [movies, looping, scheduleCurve]);

  // Vertical wheel drives horizontal scroll.
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
      e.preventDefault();
      el.scrollLeft += e.deltaY;
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  // Arrow keys nudge the rail, but only when nothing is pulled out.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (open) return;
      const el = scroller.current;
      if (!el) return;
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        el.scrollBy({ left: -KEY_STEP, behavior: "smooth" });
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        el.scrollBy({ left: KEY_STEP, behavior: "smooth" });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const onScroll = useCallback(() => {
    wrap();
    scheduleCurve();
  }, [wrap, scheduleCurve]);

  // A freshly shelved recommendation glides in and gets centred.
  useEffect(() => {
    if (!justAdded) return;
    const idx = row.findIndex((m) => m.id === justAdded);
    const node = caseEls.current[idx];
    if (node)
      node.scrollIntoView({
        inline: "center",
        block: "nearest",
        behavior: "smooth",
      });
  }, [justAdded, row]);

  const openAt = useCallback(
    (index: number) => {
      if (suppressClick.current) return;
      const node = caseEls.current[index];
      const movie = row[index];
      if (!movie) return;
      const rect = node?.getBoundingClientRect();
      if (!rect) return;
      setOpen({ movie, index, rect });
      onOpenChange?.(true);
    },
    [row, onOpenChange],
  );

  const close = useCallback(() => {
    setOpen(null);
    onOpenChange?.(false);
  }, [onOpenChange]);

  const step = useCallback(
    (delta: number) => {
      setOpen((cur) => {
        if (!cur) return cur;
        const next = cur.index + delta;
        if (next < 0 || next >= row.length) return cur;
        const node = caseEls.current[next];
        const rect = node?.getBoundingClientRect();
        if (!rect) return cur;
        return { movie: row[next], index: next, rect };
      });
    },
    [row],
  );

  return (
    <div className="relative w-full">
      <div
        ref={scroller}
        onScroll={onScroll}
        onPointerDown={(e) => {
          suppressClick.current = false;
          // Deliberately NO setPointerCapture here. Capturing on every press
          // retargets pointerup to this element, so the browser resolves the
          // click against the common ancestor (this div) and the case's own
          // onClick never fires — clicking a movie would do nothing. Capture is
          // only worth taking once the gesture is definitely a drag.
          drag.current = {
            startX: e.clientX,
            startScroll: scroller.current?.scrollLeft ?? 0,
            moved: false,
          };
        }}
        onPointerMove={(e) => {
          const d = drag.current;
          const el = scroller.current;
          if (!d || !el) return;
          if (e.buttons === 0) {
            drag.current = null;
            return;
          }
          const dx = e.clientX - d.startX;
          if (!d.moved) {
            if (Math.abs(dx) < DRAG_THRESHOLD) return;
            d.moved = true;
            suppressClick.current = true;
            (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
          }
          el.scrollLeft = d.startScroll - dx;
        }}
        onPointerUp={() => {
          drag.current = null;
        }}
        onPointerLeave={() => {
          drag.current = null;
        }}
        className={`shelf-scroller no-scrollbar flex cursor-grab items-end gap-0 overflow-x-auto pt-16 pb-6 active:cursor-grabbing ${
          overflows ? "" : "justify-center"
        }`}
        style={{ perspective: 1400, perspectiveOrigin: "50% 65%" }}
      >
        {row.map((m, i) => (
          <MovieCase
            key={`${m.id}-${i}`}
            movie={m}
            justAdded={justAdded === m.id}
            caseRef={(el) => {
              caseEls.current[i] = el;
            }}
            onOpen={() => openAt(i)}
          />
        ))}
      </div>

      {/* edge fades — only meaningful when the row actually overflows */}
      {overflows ? (
        <>
          <div className="shelf-edge-fade from-background pointer-events-none absolute inset-y-0 left-0 w-24 bg-gradient-to-r to-transparent" />
          <div className="shelf-edge-fade from-background pointer-events-none absolute inset-y-0 right-0 w-24 bg-gradient-to-l to-transparent" />
        </>
      ) : null}

      {/* shelf lip + ground shadow */}
      <div className="shelf-rail pointer-events-none relative -mt-6 h-3 w-full" />
      <div className="shelf-ground pointer-events-none h-10 w-full" />

      {open ? (
        <MovieDetail
          movie={open.movie}
          rect={open.rect}
          hasPrev={open.index > 0}
          hasNext={open.index < row.length - 1}
          onPrev={() => step(-1)}
          onNext={() => step(1)}
          onClose={close}
        />
      ) : null}
    </div>
  );
}
