// Picks and grades practice puzzles off the main thread, so the screen stays smooth.
import type { Difficulty } from "../../convex/lib/sudoku";
import { practicePuzzle } from "./practice";

addEventListener("message", (e: MessageEvent<{ id: number; level: Difficulty }>) => {
  postMessage({ id: e.data.id, ...practicePuzzle(e.data.level) });
});
