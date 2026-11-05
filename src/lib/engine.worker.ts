// Runs the chess engine off the main thread so the board stays smooth while the bot thinks.
import type { Rules, State } from "../../convex/lib/chess";
import { think, type Goal } from "./engine";

addEventListener("message", (e: MessageEvent<{ id: number; state: State; rating: number; goal?: Goal; rules?: Rules }>) => {
  const { id, state, rating, goal, rules } = e.data;
  const t = think(state, { rating, goal, rules });
  postMessage({ id, move: t.move, score: t.score, depth: t.depth });
});
