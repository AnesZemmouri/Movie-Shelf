import { useCallback, useState } from "react";
import type { Movie } from "./data/movies";
import { movies as library } from "./data/movies";
import { LibraryFilter } from "./components/LibraryFilter";
import { Shelf } from "./components/Shelf";
import { TypedTitle } from "./components/TypedTitle";

function App() {
  /** `null` means the filter is inactive and the whole library is on the shelf. */
  const [filtered, setFiltered] = useState<Movie[] | null>(null);

  const onFilter = useCallback((visible: Movie[] | null) => setFiltered(visible), []);

  const shown = filtered ?? library;
  const count = shown.length;

  return (
    <div className="grain relative min-h-screen overflow-x-hidden">
      {/* warm haze, drifting slowly behind everything */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 -z-10"
      >
        <div
          className="animate-drift absolute inset-[-10%]"
          style={{
            background:
              "radial-gradient(60% 45% at 22% 18%, var(--color-glow) 0%, transparent 70%), radial-gradient(50% 40% at 82% 12%, var(--color-accent) 0%, transparent 72%)",
          }}
        />
      </div>

      <header className="mx-auto w-full max-w-[1500px] px-6 pt-14 md:px-12 md:pt-20">
        <p className="font-mono text-muted-foreground text-[10px] tracking-[0.32em] uppercase">
          Sonny's archive
        </p>

        <div className="mt-5 flex flex-wrap items-end justify-between gap-x-10 gap-y-6">
          <TypedTitle />
          <p className="font-mono text-muted-foreground pb-2 text-[10px] tracking-[0.32em] uppercase">
            {count} {count === 1 ? "film" : "films"}
          </p>
        </div>

        <LibraryFilter
          movies={library}
          onChange={onFilter}
          className="mt-9 max-w-[52rem]"
        />
      </header>

      <main className="mt-4">
        {count === 0 ? (
          <p className="font-mono text-muted-foreground py-28 text-center text-[11px] tracking-[0.3em] uppercase">
            No movies match
          </p>
        ) : (
          <Shelf movies={shown} />
        )}
      </main>

      <footer className="mx-auto w-full max-w-[1500px] px-6 pb-16 md:px-12">
        <p className="font-mono text-muted-foreground text-[10px] tracking-[0.32em] uppercase">
          Shelf-scroll, click a case, or press ← →
        </p>
      </footer>
    </div>
  );
}

export default App;
