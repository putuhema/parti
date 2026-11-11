import type { TechniqueId } from "./coach";
import { DRILL_BANK } from "./drillBank";

export type Drill = { puzzle: string; solution: string; start: string };

/**
 * Tricks too rare to collect as a lesson's first step. Their drills may start a step or two
 * early; the app applies the easier eliminations first and opens the lesson at the rare trick.
 */
export const RARE: TechniqueId[] = ["swordfish", "coloring", "xChain"];

export const hasDrill = (t: TechniqueId) => DRILL_BANK[t].length > 0;

/**
 * A drill for one trick: a saved position where the next move needs it, disguised so it
 * feels new each time. Relabelling digits, shuffling rows within a band (and bands),
 * columns within a stack (and stacks), and transposing keep every Sudoku rule and trick intact.
 */
export function drillFor(t: TechniqueId, rand: () => number = Math.random): Drill | null {
  const rows = DRILL_BANK[t];
  if (!rows.length) return null;
  const [puzzle, solution, start] = rows[Math.floor(rand() * rows.length)];
  const perm = (n: number) => {
    const a = Array.from({ length: n }, (_, i) => i);
    for (let i = n - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };
  const digit = [0, ...perm(9).map((d) => d + 1)];
  const rowOrder = perm(3).flatMap((band) => perm(3).map((r) => band * 3 + r));
  const colOrder = perm(3).flatMap((stack) => perm(3).map((c) => stack * 3 + c));
  const transpose = rand() < 0.5;
  const disguise = (board: string) => {
    let out = "";
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        const [sr, sc] = transpose ? [colOrder[c], rowOrder[r]] : [rowOrder[r], colOrder[c]];
        const ch = board[sr * 9 + sc];
        out += ch === "0" ? "0" : String(digit[Number(ch)]);
      }
    }
    return out;
  };
  return { puzzle: disguise(puzzle), solution: disguise(solution), start: disguise(start) };
}
