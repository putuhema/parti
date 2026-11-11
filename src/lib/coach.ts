/**
 * Kubo the coach: finds the next logical Sudoku move and explains the trick behind it.
 *
 * It works the way a person does: list the candidates (what could still go in each
 * empty cell), look for a single, and if there isn't one, use a technique to rule
 * candidates out until a single appears. Techniques are tried easiest first.
 */

export type TechniqueId =
  | "fullHouse" | "hiddenSingle" | "nakedSingle"
  | "pointing" | "boxLine" | "nakedPair" | "hiddenPair" | "nakedTriple"
  | "xWing" | "yWing" | "swordfish";

export const TECHNIQUES: Record<TechniqueId, { name: string; level: 1 | 2 | 3 | 4; tip: string }> = {
  fullHouse: { name: "Full house", level: 1, tip: "When a row, column or box has just one empty cell left, it gets the one number that's missing." },
  hiddenSingle: { name: "Hidden single", level: 1, tip: "Pick a number and a box (or row, or column). If that number fits in only one of its cells, it goes there, even if the cell could hold other numbers." },
  nakedSingle: { name: "Naked single", level: 1, tip: "Check one cell against its row, column and box. If only one number isn't already used around it, that's the answer." },
  pointing: { name: "Pointing pair", level: 2, tip: "If a number's only spots inside a box all sit in one row (or column), the box will use that row for it. So that number can't go anywhere else in that row." },
  boxLine: { name: "Box/line reduction", level: 2, tip: "If a number's only spots in a row (or column) are all inside one box, the box's copy of that number must be on that line. So it can't go in the rest of that box." },
  nakedPair: { name: "Naked pair", level: 2, tip: "Two cells in the same row, column or box that can only hold the same two numbers will use up those two numbers. Cross them off everywhere else in that group." },
  hiddenPair: { name: "Hidden pair", level: 3, tip: "If two numbers can only go in the same two cells of a group, those cells are reserved for them. Any other candidates in those two cells can go." },
  nakedTriple: { name: "Naked triple", level: 3, tip: "Three cells in one group that only hold three numbers between them use up those three numbers. Cross them off in the rest of the group." },
  xWing: { name: "X-Wing", level: 4, tip: "When a number has exactly two spots in each of two rows, and the spots line up in the same two columns, it forms a rectangle. Either diagonal can be the answer, but both use those two columns, so the number can't go anywhere else in them. Works with rows and columns swapped too." },
  yWing: { name: "Y-Wing", level: 4, tip: "A pivot cell with two options (A or B) sees two wing cells: one with A or C, one with B or C. Whatever the pivot becomes, one wing turns into C. So any cell that sees both wings can't be C." },
  swordfish: { name: "Swordfish", level: 4, tip: "An X-Wing with three rows: if a number's spots in three rows all fall inside the same three columns, it can't go anywhere else in those columns." },
};

export const LEVEL_NAMES = { 1: "Beginner", 2: "Intermediate", 3: "Tricky", 4: "Advanced" } as const;

export type Elim = { cell: number; digit: number };
export type Step = {
  technique: TechniqueId;
  text: string;
  /** Cells of the row/column/box the step is about (lightly tinted). */
  area: number[];
  /** Cells that make the pattern (strongly tinted). */
  focus: number[];
  /** Placed digits that explain the step, e.g. the 7s blocking the other cells. */
  clues: number[];
  /** Candidates to draw, per cell. `strike` are the ones this step rules out. */
  marks: Record<number, { show: number[]; strike: number[] }>;
  place?: { cell: number; digit: number };
  elim: Elim[];
};
export type Lesson = { steps: Step[]; stuck: boolean };

// ---------- Board geometry ----------
const ROWS = Array.from({ length: 9 }, (_, r) => Array.from({ length: 9 }, (_, c) => r * 9 + c));
const COLS = Array.from({ length: 9 }, (_, c) => Array.from({ length: 9 }, (_, r) => r * 9 + c));
const BOXES = Array.from({ length: 9 }, (_, b) =>
  Array.from({ length: 9 }, (_, k) => (Math.floor(b / 3) * 3 + Math.floor(k / 3)) * 9 + (b % 3) * 3 + (k % 3)),
);
const UNITS = [...BOXES, ...ROWS, ...COLS]; // boxes first: they're the easiest place to spot singles
const rowOf = (i: number) => Math.floor(i / 9);
const colOf = (i: number) => i % 9;
const boxOf = (i: number) => Math.floor(rowOf(i) / 3) * 3 + Math.floor(colOf(i) / 3);
const PEERS = Array.from({ length: 81 }, (_, i) => {
  const s = new Set([...ROWS[rowOf(i)], ...COLS[colOf(i)], ...BOXES[boxOf(i)]]);
  s.delete(i);
  return [...s];
});
const sees = (a: number, b: number) => a !== b && (rowOf(a) === rowOf(b) || colOf(a) === colOf(b) || boxOf(a) === boxOf(b));

const BOX_NAMES = ["top-left", "top-middle", "top-right", "middle-left", "center", "middle-right", "bottom-left", "bottom-middle", "bottom-right"];
const boxName = (b: number) => `the ${BOX_NAMES[b]} box`;
function unitName(u: number[]) {
  const a = u[0], b = u[1];
  if (rowOf(a) === rowOf(b) && rowOf(a) === rowOf(u[8])) return `row ${rowOf(a) + 1}`;
  if (colOf(a) === colOf(b) && colOf(a) === colOf(u[8])) return `column ${colOf(a) + 1}`;
  return boxName(boxOf(a));
}
const cellName = (i: number) => `row ${rowOf(i) + 1}, column ${colOf(i) + 1}`;
const list = (xs: (string | number)[]) => (xs.length < 2 ? String(xs[0] ?? "") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);

// ---------- Candidates (bitmask: bit d-1 set means d still fits) ----------
const bit = (d: number) => 1 << (d - 1);
const digitsOf = (m: number) => [1, 2, 3, 4, 5, 6, 7, 8, 9].filter((d) => m & bit(d));
const count = (m: number) => digitsOf(m).length;

function candidates(values: string, elim: Set<string>) {
  const cand = new Array<number>(81).fill(0);
  for (let i = 0; i < 81; i++) {
    if (values[i] !== "0") continue;
    let m = 0x1ff;
    for (const p of PEERS[i]) if (values[p] !== "0") m &= ~bit(Number(values[p]));
    for (let d = 1; d <= 9; d++) if (elim.has(`${i}:${d}`)) m &= ~bit(d);
    cand[i] = m;
  }
  return cand;
}

/** Turn proposed eliminations into a step, if any of them actually removes something. */
function elimStep(cand: number[], technique: TechniqueId, raw: Elim[], partial: Omit<Step, "technique" | "elim" | "marks"> & { show: number[] }): Step | null {
  const elim = raw.filter((e) => cand[e.cell] & bit(e.digit));
  if (!elim.length) return null;
  const marks: Step["marks"] = {};
  for (const c of partial.focus) if (cand[c]) marks[c] = { show: digitsOf(cand[c]).filter((d) => partial.show.includes(d)), strike: [] };
  for (const e of elim) {
    const m = (marks[e.cell] ??= { show: digitsOf(cand[e.cell]).filter((d) => partial.show.includes(d) || d === e.digit), strike: [] });
    if (!m.show.includes(e.digit)) m.show.push(e.digit);
    m.strike.push(e.digit);
  }
  const { show: _show, ...rest } = partial; // eslint-disable-line @typescript-eslint/no-unused-vars
  return { technique, elim, marks, ...rest };
}

// ---------- Placements ----------
function fullHouse(values: string): Step | null {
  for (const u of UNITS) {
    const empty = u.filter((i) => values[i] === "0");
    if (empty.length !== 1) continue;
    const used = new Set(u.map((i) => values[i]));
    const digit = [1, 2, 3, 4, 5, 6, 7, 8, 9].find((d) => !used.has(String(d)))!;
    const cell = empty[0];
    return {
      technique: "fullHouse", area: u, focus: [cell], clues: [], elim: [], place: { cell, digit },
      marks: { [cell]: { show: [digit], strike: [] } },
      text: `${cap(unitName(u))} has only one empty cell left, and the only number it's missing is ${digit}.`,
    };
  }
  return null;
}

function hiddenSingle(values: string, cand: number[]): Step | null {
  for (const u of UNITS) {
    for (let d = 1; d <= 9; d++) {
      if (u.some((i) => values[i] === String(d))) continue;
      const spots = u.filter((i) => cand[i] & bit(d));
      if (spots.length !== 1) continue;
      const cell = spots[0];
      // The placed d's that rule out the unit's other empty cells.
      const clues = new Set<number>();
      let ruledOut = 0; // other cells that only lost d to an earlier elimination step
      for (const i of u) {
        if (values[i] !== "0" || i === cell) continue;
        const blocker = PEERS[i].find((p) => values[p] === String(d));
        if (blocker !== undefined) clues.add(blocker);
        else ruledOut++;
      }
      return {
        technique: "hiddenSingle", area: u, focus: [cell], clues: [...clues], elim: [], place: { cell, digit: d },
        marks: { [cell]: { show: [d], strike: [] } },
        text: !clues.size
          ? `In ${unitName(u)}, ${d} only fits in one cell: ${cellName(cell)}. The other cells were ruled out by the step before.`
          : ruledOut
            ? `Look for ${d} in ${unitName(u)}. The ${d}s you can see nearby (highlighted) block most of its empty cells, and the step before ruled out the rest. So ${d} can only go in ${cellName(cell)}.`
            : `Look for ${d} in ${unitName(u)}. The ${d}s you can see nearby (highlighted) block every other empty cell, so ${d} can only go in ${cellName(cell)}.`,
      };
    }
  }
  return null;
}

function nakedSingle(values: string, cand: number[], afterElims: boolean): Step | null {
  for (let i = 0; i < 81; i++) {
    if (values[i] !== "0" || count(cand[i]) !== 1) continue;
    const digit = digitsOf(cand[i])[0];
    return {
      technique: "nakedSingle", area: [...new Set([...ROWS[rowOf(i)], ...COLS[colOf(i)], ...BOXES[boxOf(i)]])], focus: [i], clues: [], elim: [],
      place: { cell: i, digit }, marks: { [i]: { show: [digit], strike: [] } },
      text: `Check ${cellName(i)} against its row, column and box. Every other number is already used around it${afterElims ? " or ruled out above" : ""}, so it has to be ${digit}.`,
    };
  }
  return null;
}

// ---------- Eliminations ----------
function pointing(cand: number[]): Step | null {
  for (let b = 0; b < 9; b++) {
    for (let d = 1; d <= 9; d++) {
      const spots = BOXES[b].filter((i) => cand[i] & bit(d));
      if (spots.length < 2) continue;
      for (const [line, of, word] of [[ROWS, rowOf, "row"], [COLS, colOf, "column"]] as const) {
        if (!spots.every((i) => of(i) === of(spots[0]))) continue;
        const n = of(spots[0]);
        const out = line[n].filter((i) => boxOf(i) !== b).map((cell) => ({ cell, digit: d }));
        const s = elimStep(cand, "pointing", out, {
          area: BOXES[b], focus: spots, clues: [], show: [d],
          text: `In ${boxName(b)}, ${d} can only go in ${word} ${n + 1} (the highlighted cells). So that box's ${d} will be in ${word} ${n + 1}, which means no other cell in ${word} ${n + 1} can be ${d}.`,
        });
        if (s) return s;
      }
    }
  }
  return null;
}

function boxLine(cand: number[]): Step | null {
  for (const [line, word] of [[ROWS, "row"], [COLS, "column"]] as const) {
    for (let n = 0; n < 9; n++) {
      for (let d = 1; d <= 9; d++) {
        const spots = line[n].filter((i) => cand[i] & bit(d));
        if (spots.length < 2 || !spots.every((i) => boxOf(i) === boxOf(spots[0]))) continue;
        const b = boxOf(spots[0]);
        const out = BOXES[b].filter((i) => !spots.includes(i) && !line[n].includes(i)).map((cell) => ({ cell, digit: d }));
        const s = elimStep(cand, "boxLine", out, {
          area: line[n], focus: spots, clues: [], show: [d],
          text: `In ${word} ${n + 1}, ${d} can only go inside ${boxName(b)}. So the box's ${d} has to be on ${word} ${n + 1}, and the rest of ${boxName(b)} can't be ${d}.`,
        });
        if (s) return s;
      }
    }
  }
  return null;
}

function combos<T>(xs: T[], k: number): T[][] {
  if (k === 0) return [[]];
  return xs.flatMap((x, i) => combos(xs.slice(i + 1), k - 1).map((c) => [x, ...c]));
}

function nakedSubset(cand: number[], k: 2 | 3): Step | null {
  for (const u of UNITS) {
    const open = u.filter((i) => cand[i] && count(cand[i]) <= k);
    for (const group of combos(open, k)) {
      const union = group.reduce((m, i) => m | cand[i], 0);
      if (count(union) !== k) continue;
      const ds = digitsOf(union);
      const out = u.filter((i) => !group.includes(i) && cand[i]).flatMap((cell) => ds.map((digit) => ({ cell, digit })));
      const s = elimStep(cand, k === 2 ? "nakedPair" : "nakedTriple", out, {
        area: u, focus: group, clues: [], show: ds,
        text: `The highlighted cells in ${unitName(u)} can only hold ${list(ds)} between them. Those ${k} numbers are used up there, so cross ${list(ds)} off the other cells of ${unitName(u)}.`,
      });
      if (s) return s;
    }
  }
  return null;
}

function hiddenPair(cand: number[]): Step | null {
  for (const u of UNITS) {
    const where = (d: number) => u.filter((i) => cand[i] & bit(d));
    for (const [a, b] of combos([1, 2, 3, 4, 5, 6, 7, 8, 9], 2)) {
      const wa = where(a), wb = where(b);
      if (wa.length !== 2 || wb.length !== 2 || wa[0] !== wb[0] || wa[1] !== wb[1]) continue;
      const out = wa.flatMap((cell) => digitsOf(cand[cell]).filter((d) => d !== a && d !== b).map((digit) => ({ cell, digit })));
      const s = elimStep(cand, "hiddenPair", out, {
        area: u, focus: wa, clues: [], show: [a, b],
        text: `In ${unitName(u)}, ${a} and ${b} can only go in the two highlighted cells. Those cells are reserved for ${a} and ${b}, so their other candidates can go.`,
      });
      if (s) return s;
    }
  }
  return null;
}

/** X-Wing (size 2) and Swordfish (size 3), in both directions. */
function fish(cand: number[], size: 2 | 3): Step | null {
  const name: TechniqueId = size === 2 ? "xWing" : "swordfish";
  for (let d = 1; d <= 9; d++) {
    for (const [base, cover, bOf, cOf, bw, cw] of [[ROWS, COLS, rowOf, colOf, "rows", "columns"], [COLS, ROWS, colOf, rowOf, "columns", "rows"]] as const) {
      const lines = base.map((l) => l.filter((i) => cand[i] & bit(d))).map((spots, n) => ({ n, spots }))
        .filter((x) => x.spots.length >= 2 && x.spots.length <= size);
      for (const group of combos(lines, size)) {
        const covers = [...new Set(group.flatMap((g) => g.spots.map(cOf)))];
        if (covers.length !== size) continue;
        const baseNs = group.map((g) => g.n);
        const out = covers.flatMap((c) => cover[c].filter((i) => !baseNs.includes(bOf(i)))).map((cell) => ({ cell, digit: d }));
        const focus = group.flatMap((g) => g.spots);
        const s = elimStep(cand, name, out, {
          area: [...group.flatMap((g) => base[g.n])], focus, clues: [], show: [d],
          text: `${d} has only ${size === 2 ? "two" : "two or three"} spots in each of ${bw} ${list(baseNs.map((n) => n + 1))}, and they all fall in ${cw} ${list(covers.sort((a, b) => a - b).map((n) => n + 1))}. Those ${bw} will take the ${d}s of those ${cw}, so ${d} can't go anywhere else in ${cw} ${list(covers.map((n) => n + 1))}.`,
        });
        if (s) return s;
      }
    }
  }
  return null;
}

function yWing(cand: number[]): Step | null {
  const bi = cand.map((m, i) => (count(m) === 2 ? i : -1)).filter((i) => i >= 0);
  for (const pivot of bi) {
    const [a, b] = digitsOf(cand[pivot]);
    const wings = bi.filter((w) => sees(pivot, w));
    for (const w1 of wings) {
      for (const w2 of wings) {
        if (w1 >= w2) continue;
        const m1 = cand[w1], m2 = cand[w2];
        const c1 = digitsOf(m1), c2 = digitsOf(m2);
        // One wing is {a,c}, the other {b,c}.
        for (const [x, y] of [[a, b], [b, a]]) {
          if (!c1.includes(x) || !c2.includes(y)) continue;
          const z1 = c1.find((d) => d !== x)!, z2 = c2.find((d) => d !== y)!;
          if (z1 !== z2 || z1 === a || z1 === b) continue;
          const c = z1;
          const out = Array.from({ length: 81 }, (_, i) => i)
            .filter((i) => i !== pivot && i !== w1 && i !== w2 && sees(i, w1) && sees(i, w2))
            .map((cell) => ({ cell, digit: c }));
          const s = elimStep(cand, "yWing", out, {
            area: [], focus: [pivot, w1, w2], clues: [], show: [a, b, c],
            text: `The pivot at ${cellName(pivot)} is ${a} or ${b}. If it's ${x}, the wing at ${cellName(w1)} must be ${c}; if it's ${y}, the wing at ${cellName(w2)} must be ${c}. Either way one wing is ${c}, so any cell that sees both wings can't be ${c}.`,
          });
          if (s) return s;
        }
      }
    }
  }
  return null;
}

const ELIMINATORS: ((cand: number[]) => Step | null)[] = [
  pointing, boxLine, (c) => nakedSubset(c, 2), hiddenPair, (c) => nakedSubset(c, 3), (c) => fish(c, 2), yWing, (c) => fish(c, 3),
];

/**
 * The next thing to learn: any eliminations needed, then the cell they unlock.
 * `known` holds eliminations from earlier lessons ("cell:digit"); new ones are added to it.
 */
export function nextLesson(values: string, known: Set<string>, maxSteps = 6): Lesson {
  const steps: Step[] = [];
  for (let guard = 0; guard < maxSteps; guard++) {
    const fh = fullHouse(values);
    if (fh) return { steps: [...steps, fh], stuck: false };
    const cand = candidates(values, known);
    const single = hiddenSingle(values, cand) ?? nakedSingle(values, cand, steps.length > 0 || known.size > 0);
    if (single) return { steps: [...steps, single], stuck: false };
    let found: Step | null = null;
    for (const f of ELIMINATORS) if ((found = f(cand))) break;
    if (!found) return { steps, stuck: true };
    for (const e of found.elim) known.add(`${e.cell}:${e.digit}`);
    steps.push(found);
  }
  return { steps, stuck: true };
}

const cap = (s: string) => s[0].toUpperCase() + s.slice(1);
