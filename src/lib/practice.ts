import { generatePuzzle, setAt, type Difficulty } from "../../convex/lib/sudoku";
import { grade, nextLesson, TECHNIQUES, type TechniqueId } from "./coach";

/** The hardest trick each practice level is built around (1 = singles only, 4 = advanced). */
export const LEVEL_TRICKS: Record<Difficulty, 1 | 2 | 3 | 4> = { easy: 1, medium: 2, hard: 3, expert: 4 };
/** Which generator settings most often give puzzles of that kind (measured on 300 puzzles each). */
const SOURCES: Record<Difficulty, Difficulty[]> = { easy: ["easy"], medium: ["expert", "hard"], hard: ["expert"], expert: ["expert", "hard"] };
const TRIES = 150;
/** After the first good puzzle, keep looking a little for one with more of the level's tricks. */
const EXTRA_TRIES = 12;

export type PracticePuzzle = {
  puzzle: string;
  solution: string;
  hardest: number;
  used: TechniqueId[];
  graded: boolean;
  /** Drills start part-way through: the board as it stands when the trick is needed. */
  start?: string;
  drill?: TechniqueId;
};

/**
 * A practice puzzle the coach can solve all the way, whose hardest trick matches the level.
 * Among the matches it prefers the one that uses that level's tricks the most.
 * If none turns up in time, the closest solvable one is used instead.
 */
export function practicePuzzle(level: Difficulty, rand: () => number = Math.random): PracticePuzzle {
  const target = LEVEL_TRICKS[level];
  const sources = SOURCES[level];
  let best: PracticePuzzle | null = null;
  let bestCount = -1;
  let stopAt = TRIES;
  for (let t = 0; t < stopAt; t++) {
    const p = generatePuzzle(sources[t % sources.length], rand);
    const g = grade(p.puzzle);
    if (!g.solved) continue;
    const found = { ...p, hardest: g.hardest, used: g.used, graded: true };
    const onTarget = g.hardest === target;
    const count = onTarget ? g.levels[target] : -1;
    if (onTarget) {
      if (bestCount < 0) stopAt = Math.min(TRIES, t + 1 + EXTRA_TRIES);
      if (count > bestCount) { best = found; bestCount = count; }
    } else if (bestCount < 0 && (!best || Math.abs(g.hardest - target) < Math.abs(best.hardest - target))) best = found;
  }
  return best ?? { ...generatePuzzle(level, rand), hardest: 0, used: [], graded: false };
}

/** How many puzzles a drill may look through. Some tricks are rare. */
const DRILL_TRIES = 900;

/**
 * A drill: a real puzzle, started at the moment the next move needs this trick.
 * Returns null if the trick didn't turn up in time (it's rare).
 */
export function drillPuzzle(trick: TechniqueId): PracticePuzzle | null {
  const level = TECHNIQUES[trick].level;
  const sources: Difficulty[] = level <= 2 ? ["hard", "expert"] : ["expert"];
  for (let t = 0; t < DRILL_TRIES; t++) {
    const p = generatePuzzle(sources[t % sources.length]);
    let values = p.puzzle;
    for (let guard = 0; guard < 81 && values.includes("0"); guard++) {
      // A fresh lesson from this position, as if you'd just asked Kubo.
      const lesson = nextLesson(values, new Set());
      if (lesson.steps[0]?.technique === trick && !lesson.stuck) {
        return { ...p, start: values, drill: trick, hardest: level, used: [trick], graded: true };
      }
      const last = lesson.steps.at(-1);
      if (lesson.stuck || !last?.place) break;
      values = setAt(values, last.place.cell, String(last.place.digit));
    }
  }
  return null;
}
