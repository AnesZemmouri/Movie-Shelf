import { useCallback, useState } from "react";
import type { Movie } from "./data/movies";
import { movies as library } from "./data/movies";
import { LibraryFilter } from "./components/LibraryFilter";
import { Shelf } from "./components/Shelf";
import { TypedTitle } from "./components/TypedTitle";

function App() {
  const [filtered, setFiltered] = useState<Movie[] | null>(null);
  const onFilter = useCallback(
    (visible: Movie[] | null) => setFiltered(visible),
    [],
  );
  const shown = filtered ?? library;

  return (
    <div className="grain archive-room relative min-h-screen overflow-x-hidden">
      <header className="archive-header mx-auto w-full max-w-[1500px] px-6 pt-10 md:px-12 md:pt-14">
        <div className="flex items-center justify-between gap-6">
          <p className="font-mono text-muted-foreground text-[10px] tracking-[0.32em] uppercase">
            Sonny's Archive
          </p>
          {/* <span className="archive-status"><i /> online</span> */}
        </div>

        <div className="mt-5 flex flex-wrap items-end justify-between gap-x-10 gap-y-6">
          <div>
            <TypedTitle />
          </div>
          <div className="archive-stat">
            <strong>{shown.length}</strong>
            <span>{shown.length === 1 ? "film" : "films"} on shelf</span>
          </div>
        </div>

        <LibraryFilter
          movies={library}
          onChange={onFilter}
          className="mt-9 max-w-[52rem]"
        />
      </header>

      <main className="archive-main mt-4">
        {shown.length === 0 ? (
          <p className="font-mono text-muted-foreground py-28 text-center text-[11px] tracking-[0.3em] uppercase">
            No movies match
          </p>
        ) : (
          <Shelf movies={shown} />
        )}
      </main>

      <footer className="archive-footer mx-auto flex w-full max-w-[1500px] items-center justify-between gap-6 px-6 pb-12 md:px-12">
        <p className="font-mono text-muted-foreground text-[10px] tracking-[0.32em] uppercase">
          Collection one / home video
        </p>
        <p className="font-mono text-muted-foreground text-[10px] tracking-[0.24em] uppercase">
          Drag to browse <span className="text-primary">·</span> click to
          inspect
        </p>
      </footer>
    </div>
  );
}

export default App;
