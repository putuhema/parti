// Picks and grades practice puzzles off the main thread, so the screen stays smooth.
import type { Difficulty } from "../../convex/lib/sudoku";
import type { TechniqueId } from "./coach";
import { drillPuzzle, practicePuzzle } from "./practice";

addEventListener("message", (e: MessageEvent<{ id: number; level?: Difficulty; drill?: TechniqueId }>) => {
  const { id, level, drill } = e.data;
  postMessage({ id, result: drill ? drillPuzzle(drill) : practicePuzzle(level!) });
});
