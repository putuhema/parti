/**
 * The coach must never teach a wrong move. These tests replay many seeded puzzles
 * and check every elimination and placement against the real solution.
 * Run with `npm test`.
 */
import { describe, expect, it } from "vitest";
import { generatePuzzle, mulberry32, setAt, type Difficulty } from "../../convex/lib/sudoku";
import { explainMove, grade, nextLesson, nudgeOf, TECHNIQUES, type Lesson, type TechniqueId } from "./coach";
import { DRILL_BANK } from "./drillBank";
import { drillFor, RARE } from "./drills";
import { LEVEL_TRICKS, practicePuzzle } from "./practice";

/** Every elimination keeps the true digit, and every placement is the true digit. */
function wrongMoves(lesson: Lesson, solution: string) {
  const bad: string[] = [];
  for (const s of lesson.steps) {
    for (const e of s.elim) if (solution[e.cell] === String(e.digit)) bad.push(`${s.technique} removed ${e.digit} from cell ${e.cell}`);
    if (s.place && solution[s.place.cell] !== String(s.place.digit)) bad.push(`${s.technique} placed ${s.place.digit} in cell ${s.place.cell}`);
  }
  return bad;
}

/** Let the coach solve a puzzle on its own, checking every move. */
function coachSolve(puzzle: string, solution: string) {
  let values = puzzle;
  const known = new Set<string>();
  const bad: string[] = [];
  const used = new Set<TechniqueId>();
  while (values.includes("0")) {
    const lesson = nextLesson(values, known);
    bad.push(...wrongMoves(lesson, solution));
    lesson.steps.forEach((s) => used.add(s.technique));
    const last = lesson.steps.at(-1);
    if (lesson.stuck || !last?.place) return { solved: false, bad, used };
    values = setAt(values, last.place.cell, String(last.place.digit));
  }
  return { solved: true, bad, used };
}

const validSolution = (s: string) =>
  Array.from({ length: 9 }).every((_, k) => {
    const row = new Set(), col = new Set(), box = new Set();
    for (let j = 0; j < 9; j++) {
      row.add(s[k * 9 + j]);
      col.add(s[j * 9 + k]);
      box.add(s[(Math.floor(k / 3) * 3 + Math.floor(j / 3)) * 9 + (k % 3) * 3 + (j % 3)]);
    }
    return row.size === 9 && col.size === 9 && box.size === 9 && !row.has("0");
  });

describe("coach correctness", () => {
  // How much the coach must solve on its own, by generator level. Guards against regressions.
  const floor: Record<Difficulty, number> = { easy: 1, medium: 0.95, hard: 0.85, expert: 0.75 };
  for (const level of ["easy", "medium", "hard", "expert"] as Difficulty[]) {
    it(`never makes a wrong move on ${level} puzzles, and solves enough of them`, () => {
      const N = 60;
      let solved = 0;
      for (let k = 0; k < N; k++) {
        const { puzzle, solution } = generatePuzzle(level, mulberry32(10_000 + k));
        const r = coachSolve(puzzle, solution);
        expect(r.bad, `puzzle seed ${10_000 + k}`).toEqual([]);
        if (r.solved) solved++;
      }
      expect(solved / N).toBeGreaterThanOrEqual(floor[level]);
    });
  }

  it("stays correct when the player fills cells in their own order", () => {
    const rand = mulberry32(42);
    for (const level of ["medium", "hard", "expert"] as Difficulty[]) {
      for (let k = 0; k < 8; k++) {
        const { puzzle, solution } = practicePuzzle(level, mulberry32(500 + k));
        let values = puzzle;
        const known = new Set<string>();
        while (values.includes("0")) {
          if (rand() < 0.6) {
            const empty = [...values].flatMap((c, i) => (c === "0" ? [i] : []));
            const c = empty[Math.floor(rand() * empty.length)];
            values = setAt(values, c, solution[c]);
            continue;
          }
          const lesson = nextLesson(values, known);
          expect(wrongMoves(lesson, solution)).toEqual([]);
          const last = lesson.steps.at(-1);
          expect(lesson.stuck, `${level} practice puzzle got the coach stuck`).toBe(false);
          values = setAt(values, last!.place!.cell, String(last!.place!.digit));
        }
      }
    }
  });
});

describe("graded practice", () => {
  for (const level of ["easy", "medium", "hard", "expert"] as Difficulty[]) {
    it(`${level} puzzles are solvable by the coach and use that level's tricks`, () => {
      for (let k = 0; k < 4; k++) {
        const p = practicePuzzle(level, mulberry32(900 + k));
        const g = grade(p.puzzle);
        expect(g.solved).toBe(true);
        expect(g.hardest).toBe(LEVEL_TRICKS[level]);
      }
    });
  }
});

describe("drills", () => {
  it("every saved position needs its trick first", () => {
    for (const [t, rows] of Object.entries(DRILL_BANK) as [TechniqueId, [string, string, string][]][]) {
      for (const [puzzle, solution, start] of rows) {
        expect(validSolution(solution)).toBe(true);
        expect([...start].every((c, i) => c === "0" || c === solution[i])).toBe(true);
        expect([...puzzle].every((c, i) => c === "0" || start[i] === c)).toBe(true);
        const steps = nextLesson(start, new Set()).steps.map((s) => s.technique);
        if (RARE.includes(t)) expect(steps).toContain(t);
        else expect(steps[0]).toBe(t);
      }
    }
  });

  it("disguised drills keep their trick and a valid solution", () => {
    const rand = mulberry32(7);
    for (const t of Object.keys(DRILL_BANK) as TechniqueId[]) {
      for (let k = 0; k < 5; k++) {
        const d = drillFor(t, rand);
        if (!d) continue;
        expect(validSolution(d.solution)).toBe(true);
        const steps = nextLesson(d.start, new Set()).steps.map((s) => s.technique);
        if (RARE.includes(t)) expect(steps).toContain(t);
        else expect(steps[0]).toBe(t);
      }
    }
  });
});

describe("lesson text", () => {
  it("reads cleanly: starts with a capital, no undefined or NaN, nudges say where to look", () => {
    const seen = new Set<TechniqueId>();
    for (let k = 0; k < 40; k++) {
      let values = generatePuzzle("expert", mulberry32(3000 + k)).puzzle;
      const known = new Set<string>();
      while (values.includes("0")) {
        const lesson = nextLesson(values, known);
        for (const s of lesson.steps) {
          seen.add(s.technique);
          for (const text of [s.text, nudgeOf(s).text]) {
            expect(text, s.technique).toMatch(/^[A-Z0-9]/);
            expect(text, s.technique).not.toMatch(/undefined|NaN|\[object/);
          }
        }
        const last = lesson.steps.at(-1);
        if (lesson.stuck || !last?.place) break;
        values = setAt(values, last.place.cell, String(last.place.digit));
      }
    }
    // Make sure the sample actually exercised the harder tricks.
    expect([...seen].filter((t) => TECHNIQUES[t].level >= 3).length).toBeGreaterThanOrEqual(4);
  });
});

describe("crediting the player's own moves", () => {
  it("explains every move the coach would make, and never credits a wrong digit", () => {
    let explained = 0, advanced = 0;
    for (let k = 0; k < 25; k++) {
      const { puzzle, solution } = generatePuzzle("expert", mulberry32(7000 + k));
      let values = puzzle;
      const known = new Set<string>();
      while (values.includes("0")) {
        const before = new Set(known);
        const lesson = nextLesson(values, known);
        const last = lesson.steps.at(-1);
        if (lesson.stuck || !last?.place) break;
        const { cell, digit } = last.place;
        const credit = explainMove(values, before, cell, digit);
        expect(credit, `cell ${cell}`).not.toBeNull();
        // Credit names real tricks, no more than the lesson needed, ending with the single that places it.
        expect(credit!.every((t) => t in TECHNIQUES)).toBe(true);
        expect(credit!.length).toBeLessThanOrEqual(lesson.steps.length);
        expect(["fullHouse", "hiddenSingle", "nakedSingle"]).toContain(credit!.at(-1));
        // A wrong digit never earns credit.
        const wrong = (digit % 9) + 1;
        if (String(wrong) !== solution[cell]) expect(explainMove(values, before, cell, wrong)).toBeNull();
        explained++;
        if (credit!.length > 1) advanced++;
        values = setAt(values, cell, String(digit));
      }
    }
    expect(explained).toBeGreaterThan(500);
    expect(advanced).toBeGreaterThan(0);
  });

  it("only credits deductions the move actually needs", () => {
    // From the start of a puzzle, any cell a single can fill needs no advanced trick.
    for (let k = 0; k < 10; k++) {
      const { puzzle } = generatePuzzle("medium", mulberry32(8000 + k));
      const lesson = nextLesson(puzzle, new Set());
      const p = lesson.steps.at(-1)!.place!;
      if (lesson.steps.length === 1) expect(explainMove(puzzle, new Set(), p.cell, p.digit)).toEqual([lesson.steps[0].technique]);
    }
  });
});
