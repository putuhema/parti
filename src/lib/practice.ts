import { generatePuzzle, type Difficulty } from "../../convex/lib/sudoku";
import { grade, type TechniqueId } from "./coach";

/** The hardest trick each practice level is built around (1 = singles only, 4 = advanced). */
export const LEVEL_TRICKS: Record<Difficulty, 1 | 2 | 3 | 4> = { easy: 1, medium: 2, hard: 3, expert: 4 };
/** Which generator settings most often give puzzles of that kind (measured on 300 puzzles each). */
const SOURCES: Record<Difficulty, Difficulty[]> = { easy: ["easy"], medium: ["expert", "hard"], hard: ["expert"], expert: ["expert", "hard"] };
const TRIES = 150;

export type PracticePuzzle = { puzzle: string; solution: string; hardest: number; used: TechniqueId[]; graded: boolean };

/**
 * A practice puzzle the coach can solve all the way, whose hardest trick matches the level.
 * If none turns up in time, the closest solvable one is used instead.
 */
export function practicePuzzle(level: Difficulty): PracticePuzzle {
  const target = LEVEL_TRICKS[level];
  const sources = SOURCES[level];
  let best: PracticePuzzle | null = null;
  for (let t = 0; t < TRIES; t++) {
    const p = generatePuzzle(sources[t % sources.length]);
    const g = grade(p.puzzle);
    if (!g.solved) continue;
    const found = { ...p, hardest: g.hardest, used: g.used, graded: true };
    if (g.hardest === target) return found;
    if (!best || Math.abs(g.hardest - target) < Math.abs(best.hardest - target)) best = found;
  }
  return best ?? { ...generatePuzzle(level), hardest: 0, used: [], graded: false };
}
