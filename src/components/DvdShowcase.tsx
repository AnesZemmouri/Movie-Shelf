import { useState } from "react";
import type { CSSProperties, PointerEvent } from "react";
import { movies } from "../data/movies";

const movie = movies[0];
const hologramMap = "/5875003108012789722.jpg";

type Values = {
  tilt: number;
  depth: number;
  hologram: number;
  wrap: number;
};

const initialValues: Values = { tilt: 18, depth: 34, hologram: 72, wrap: 62 };

export function DvdShowcase() {
  const [values, setValues] = useState<Values>(initialValues);
  const [pointer, setPointer] = useState({ x: 0, y: 0 });
  const [open, setOpen] = useState(false);

  const updateValue = (key: keyof Values, value: number) => {
    setValues((current) => ({ ...current, [key]: value }));
  };

  const onPointerMove = (event: PointerEvent<HTMLButtonElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    const x = ((event.clientX - bounds.left) / bounds.width - 0.5) * 2;
    const y = ((event.clientY - bounds.top) / bounds.height - 0.5) * 2;
    setPointer({ x, y });
  };

  const caseStyle = {
    "--pointer-x": pointer.x,
    "--pointer-y": pointer.y,
    "--tilt": `${values.tilt}deg`,
    "--depth": `${values.depth}px`,
    "--hologram": values.hologram / 100,
    "--wrap": values.wrap / 100,
  } as CSSProperties;

  return (
    <main className="dvd-showcase">
      <section className="dvd-stage" aria-label="Interactive 3D DVD showcase">
        <div className="dvd-halo" aria-hidden="true" />
        <button
          type="button"
          className={`dvd-object ${open ? "is-open" : ""}`}
          style={caseStyle}
          onClick={() => setOpen((current) => !current)}
          onPointerMove={onPointerMove}
          onPointerLeave={() => setPointer({ x: 0, y: 0 })}
          aria-label={`${open ? "Close" : "Open"} ${movie.title} DVD`}
        >
          <span className="dvd-turntable">
            <span className="dvd-cover dvd-cover-front">
              <img src={movie.poster} alt="" draggable={false} />
              <span className="dvd-poster-ink" />
              <span className="dvd-title-lockup">
                <small>Criterion collection / 1991</small>
                <strong>{movie.title}</strong>
                <span>{movie.director}</span>
              </span>
              <span
                className="dvd-hologram"
                style={{ backgroundImage: `url(${hologramMap})` }}
              />
              <span className="dvd-map-grid" />
              <span className="dvd-shrink-wrap" />
              <span className="dvd-edge-glint" />
            </span>
            <span className="dvd-cover dvd-cover-back" aria-hidden="true">
              <span
                className="dvd-back-map"
                style={{ backgroundImage: `url(${hologramMap})` }}
              />
              <strong>DISC 01</strong>
              <span>FEATURE FILM / {movie.year}</span>
            </span>
          </span>
        </button>

        <div
          className={`dvd-info ${open ? "is-visible" : ""}`}
          aria-live="polite"
        >
          <span className="dvd-info-index">Now viewing / 001</span>
          <h1>{movie.title}</h1>
          <p className="dvd-director">Directed by {movie.director}</p>
          <p className="dvd-meta">
            {movie.year} <i /> {movie.genres?.slice(0, 3).join(" / ")} <i />{" "}
            {movie.discs} edition
          </p>
          <p className="dvd-blurb">
            {movie.blurb ||
              "A studied object for the shelf: a film case, a printed image, and a little light caught between them."}
          </p>
          <span className="dvd-action">Click case to close</span>
        </div>
      </section>

      <aside className="dvd-controls" aria-label="DVD effect controls">
        <div className="dvd-controls-heading">
          <span>Object controls</span>
          <button
            type="button"
            onClick={() => {
              setValues(initialValues);
              setOpen(false);
            }}
          >
            Reset
          </button>
        </div>
        {(["tilt", "depth", "hologram", "wrap"] as const).map((key) => {
          const labels = {
            tilt: "cursor tilt",
            depth: "click reveal depth",
            hologram: "hologram map",
            wrap: "plastic wrap",
          };
          const ranges = {
            tilt: [0, 36],
            depth: [0, 70],
            hologram: [0, 100],
            wrap: [0, 100],
          };
          return (
            <label className="dvd-control" key={key}>
              <span>
                {labels[key]}{" "}
                <output>
                  {values[key]}
                  {key === "tilt" || key === "depth" ? "px" : "%"}
                </output>
              </span>
              <input
                type="range"
                min={ranges[key][0]}
                max={ranges[key][1]}
                value={values[key]}
                onChange={(event) =>
                  updateValue(key, Number(event.target.value))
                }
              />
            </label>
          );
        })}
      </aside>
    </main>
  );
}
