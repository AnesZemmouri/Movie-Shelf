import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  PointerEvent as ReactPointerEvent,
  ReactNode,
  Ref,
} from "react";
import { movies } from "../data/movies";
import type { Movie } from "../data/movies";
import { CssKeepcase } from "./CssKeepcase";
import type { SurfaceUrls } from "./CssKeepcase";
import { FOV, WebglKeepcase } from "./WebglKeepcase";
import { caseGeometry, realSpineScale, clamp } from "./geometry";
import { surfaceTextures } from "../lib/textures";

/** One pick per spine class × finish, so the picker actually exercises the
 *  geometry rather than showing six near-identical doubles. */
const PICKS = [
  "the-silence-of-the-lambs",
  "jackie-brown",
  "in-the-mood-for-love",
  "star-wars",
  "the-shawshank-redemption",
  "eternity-2025-1",
];

const DEFAULTS = {
  spineScale: 1,
  open: 0,
  lightAngle: 128,
  wear: 0.12,
  yaw: -26,
  pitch: 9,
  surfaceDetail: 1,
};

export function MockupApp() {
  const options = useMemo(
    () =>
      PICKS.map((id) => movies.find((m) => m.id === id)).filter(
        (m): m is Movie => Boolean(m),
      ),
    [],
  );

  const [movie, setMovie] = useState<Movie>(options[0] ?? movies[0]);
  const [spineScale, setSpineScale] = useState(DEFAULTS.spineScale);
  const [open, setOpen] = useState(DEFAULTS.open);
  const [lightAngle, setLightAngle] = useState(DEFAULTS.lightAngle);
  const [wear, setWear] = useState(DEFAULTS.wear);
  const [finish, setFinish] = useState<Movie["finish"]>(movie.finish);
  const [yaw, setYaw] = useState(DEFAULTS.yaw);
  const [pitch, setPitch] = useState(DEFAULTS.pitch);
  const [spin, setSpin] = useState(false);
  const [showDisc, setShowDisc] = useState(true);
  const [surfaceDetail, setSurfaceDetail] = useState(DEFAULTS.surfaceDetail);
  const [dragging, setDragging] = useState(false);

  // The procedural noise field costs a few hundred ms to build. Generating it
  // on the first tick rather than during render keeps that off the critical
  // path, so the case is on screen before the surface detail arrives.
  const [surfaces, setSurfaces] = useState<SurfaceUrls | null>(null);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      const generated = surfaceTextures();
      setSurfaces({
        grain: generated.grain,
        sheenMask: generated.sheenMask,
      });
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  const geometry = useMemo(
    () => caseGeometry(movie, spineScale),
    [movie, spineScale],
  );

  // One viewer distance drives both renderers — the CSS `perspective` and the
  // three.js camera sit at the same spot. At this distance the perspective
  // divide is exactly 1, so a world unit lands on one CSS pixel in both panels
  // and any difference you see is the renderer's, not the framing.
  const stageEl = useRef<HTMLDivElement | null>(null);
  const [stageH, setStageH] = useState(560);
  useEffect(() => {
    const el = stageEl.current;
    if (!el) return;
    const measure = () => setStageH(el.clientHeight || 560);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const viewerDistance = useMemo(
    () => stageH / (2 * Math.tan(((FOV * Math.PI) / 180) / 2)),
    [stageH],
  );

  const pick = useCallback((next: Movie) => {
    setMovie(next);
    setFinish(next.finish);
  }, []);

  // ---- drag either stage to orbit both --------------------------------------
  // Shared state is the whole point of the comparison: one drag, two renderers,
  // identical camera, so any difference you see is the renderer's.
  const drag = useRef<{ x: number; y: number } | null>(null);

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    drag.current = { x: event.clientX, y: event.clientY };
    setDragging(true);
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const from = drag.current;
    if (!from) return;
    setYaw((value) => value + (event.clientX - from.x) * 0.36);
    setPitch((value) =>
      clamp(value - (event.clientY - from.y) * 0.3, -78, 78),
    );
    drag.current = { x: event.clientX, y: event.clientY };
  };

  const endDrag = () => {
    drag.current = null;
    setDragging(false);
  };

  // ---- idle spin ------------------------------------------------------------
  useEffect(() => {
    if (!spin) return;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const delta = now - last;
      last = now;
      setYaw((value) => value + delta * 0.018);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [spin]);

  const reset = () => {
    setSpineScale(DEFAULTS.spineScale);
    setOpen(DEFAULTS.open);
    setLightAngle(DEFAULTS.lightAngle);
    setWear(DEFAULTS.wear);
    setYaw(DEFAULTS.yaw);
    setPitch(DEFAULTS.pitch);
    setSurfaceDetail(DEFAULTS.surfaceDetail);
    setFinish(movie.finish);
    setSpin(false);
    setShowDisc(true);
  };

  const shared = {
    movie,
    geometry,
    open,
    wear,
    lightAngle,
    yaw,
    pitch,
    showDisc,
    viewerDistance,
    surfaceDetail,
  };

  return (
    <div className="mk-page">
      <header className="mk-header">
        <div>
          <p className="mk-eyebrow">Keepcase study / not wired into the archive</p>
          <h1>DVD case in three dimensions</h1>
        </div>
        <div className="mk-picker">
          {options.map((option) => (
            <button
              key={option.id}
              type="button"
              aria-pressed={option.id === movie.id}
              onClick={() => pick(option)}
            >
              {option.title}
            </button>
          ))}
        </div>
      </header>

      <div className="mk-panels">
        <Panel
          title="CSS 3D"
          note={`transform-style: preserve-3d · ${geometry.spineMm.toFixed(1)}mm spine`}
          dragging={dragging}
          stageRef={stageEl}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
        >
          <CssKeepcase {...shared} finish={finish} surfaces={surfaces} />
        </Panel>

        <Panel
          title="WebGL · three.js"
          note={`real geometry · ${geometry.spineMm.toFixed(1)}mm spine`}
          dragging={dragging}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
        >
          <WebglKeepcase {...shared} finish={finish} />
        </Panel>
      </div>

      <aside className="mk-controls">
        <Slider
          label="spine thickness"
          value={spineScale}
          min={0.3}
          max={1.8}
          step={0.01}
          readout={`${geometry.spineMm.toFixed(1)}mm`}
          onChange={setSpineScale}
        />
        <Slider
          label="cover open"
          value={open}
          min={0}
          max={135}
          step={1}
          readout={`${Math.round(open)}°`}
          onChange={setOpen}
        />
        <Slider
          label="turn"
          value={yaw}
          min={-80}
          max={80}
          step={1}
          readout={`${Math.round(yaw)}°`}
          onChange={setYaw}
        />
        <Slider
          label="tilt"
          value={pitch}
          min={-60}
          max={60}
          step={1}
          readout={`${Math.round(pitch)}°`}
          onChange={setPitch}
        />
        <Slider
          label="light angle"
          value={lightAngle}
          min={0}
          max={360}
          step={1}
          readout={`${Math.round(lightAngle)}°`}
          onChange={setLightAngle}
        />
        <Slider
          label="wear"
          value={wear}
          min={0}
          max={0.5}
          step={0.01}
          readout={wear.toFixed(2)}
          onChange={setWear}
        />
        <Slider
          label="surface detail"
          value={surfaceDetail}
          min={0}
          max={1}
          step={0.01}
          readout={surfaceDetail.toFixed(2)}
          onChange={setSurfaceDetail}
        />

        <div className="mk-toggles">
          <button
            type="button"
            className="mk-picker-button"
            onClick={() => setSpineScale(realSpineScale(movie))}
          >
            real 14mm spine
          </button>
          <button type="button" className="mk-picker-button" onClick={reset}>
            reset
          </button>
        </div>

        <div className="mk-toggles">
          {(["clear", "matte"] as const).map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={finish === option}
              className="mk-picker-button"
              onClick={() => setFinish(option)}
            >
              {option}
            </button>
          ))}
          <label className="mk-toggle">
            <input
              type="checkbox"
              checked={spin}
              onChange={(e) => setSpin(e.target.checked)}
            />
            auto-spin
          </label>
          <label className="mk-toggle">
            <input
              type="checkbox"
              checked={showDisc}
              onChange={(e) => setShowDisc(e.target.checked)}
            />
            disc
          </label>
        </div>

        <p className="mk-readout">
          <span>
            cover <b>{Math.round(geometry.coverW)}px</b>
          </span>
          <span>
            height <b>{Math.round(geometry.height)}px</b>
          </span>
          <span>
            spine <b>{geometry.spine.toFixed(1)}px</b>
          </span>
          <span>
            shelf says <b>{movie.width}×{movie.height}</b>
          </span>
        </p>
      </aside>
    </div>
  );
}

type PanelProps = {
  title: string;
  note: string;
  dragging: boolean;
  children: ReactNode;
  stageRef?: Ref<HTMLDivElement>;
  onPointerDown: (e: ReactPointerEvent<HTMLDivElement>) => void;
  onPointerMove: (e: ReactPointerEvent<HTMLDivElement>) => void;
  onPointerUp: () => void;
  onPointerCancel: () => void;
};

function Panel({
  title,
  note,
  dragging,
  children,
  stageRef,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
}: PanelProps) {
  return (
    <section className="mk-panel">
      <div className="mk-panel-head">
        <strong>{title}</strong>
        <span>{note}</span>
      </div>
      <div
        ref={stageRef}
        className={`mk-stage${dragging ? " is-dragging" : ""}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
      >
        <span className="mk-shadow" aria-hidden="true" />
        {children}
      </div>
    </section>
  );
}

type SliderProps = {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  readout: string;
  onChange: (value: number) => void;
};

function Slider({
  label,
  value,
  min,
  max,
  step,
  readout,
  onChange,
}: SliderProps) {
  return (
    <label className="mk-control">
      <span>
        {label} <output>{readout}</output>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  );
}
