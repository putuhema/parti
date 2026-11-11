/**
 * Kubo the coach: finds the next logical Sudoku move and explains the trick behind it.
 *
 * It works the way a person does: list the candidates (what could still go in each
 * empty cell), look for a single, and if there isn't one, use a technique to rule
 * candidates out until a single appears. Techniques are tried easiest first.
 */

import { setAt } from "../../convex/lib/sudoku";

export type TechniqueId =
  | "fullHouse" | "hiddenSingle" | "nakedSingle"
  | "pointing" | "boxLine" | "nakedPair"
  | "hiddenPair" | "nakedTriple" | "hiddenTriple" | "xWing" | "skyscraper" | "kite"
  | "yWing" | "xyzWing" | "wWing" | "swordfish" | "coloring" | "uniqueRectangle" | "xyChain";

export const TECHNIQUES: Record<TechniqueId, { name: string; level: 1 | 2 | 3 | 4; tip: string }> = {
  fullHouse: { name: "Full house", level: 1, tip: "When a row, column or box has just one empty cell left, it gets the one number that's missing." },
  hiddenSingle: { name: "Hidden single", level: 1, tip: "Pick a number and a box (or row, or column). If that number fits in only one of its cells, it goes there, even if the cell could hold other numbers." },
  nakedSingle: { name: "Naked single", level: 1, tip: "Check one cell against its row, column and box. If only one number isn't already used around it, that's the answer." },
  pointing: { name: "Pointing pair", level: 2, tip: "If a number's only spots inside a box all sit in one row (or column), the box will use that row for it. So that number can't go anywhere else in that row." },
  boxLine: { name: "Box/line reduction", level: 2, tip: "If a number's only spots in a row (or column) are all inside one box, the box's copy of that number must be on that line. So it can't go in the rest of that box." },
  nakedPair: { name: "Naked pair", level: 2, tip: "Two cells in the same row, column or box that can only hold the same two numbers will use up those two numbers. Cross them off everywhere else in that group." },
  hiddenPair: { name: "Hidden pair", level: 3, tip: "If two numbers can only go in the same two cells of a group, those cells are reserved for them. Any other candidates in those two cells can go." },
  nakedTriple: { name: "Naked triple", level: 3, tip: "Three cells in one group that only hold three numbers between them use up those three numbers. Cross them off in the rest of the group." },
  hiddenTriple: { name: "Hidden triple", level: 3, tip: "If three numbers can only go in the same three cells of a group, those cells are reserved for them. Any other candidates in those cells can go." },
  xWing: { name: "X-Wing", level: 3, tip: "When a number has exactly two spots in each of two rows, and the spots line up in the same two columns, it forms a rectangle. Either diagonal can be the answer, but both use those two columns, so the number can't go anywhere else in them. Works with rows and columns swapped too." },
  skyscraper: { name: "Skyscraper", level: 3, tip: "Two rows (or columns) each have a number in exactly two spots, and one end of each lines up. Only one of those lined-up ends can be the number, so one of the two other ends (the tops of the towers) must be. A cell that sees both tops can't be that number." },
  kite: { name: "2-String Kite", level: 3, tip: "A number has exactly two spots in a row and two in a column, and one spot of each shares a box. They can't both be the number, so one of the far ends is. Any cell seeing both far ends can't be it." },
  yWing: { name: "Y-Wing", level: 4, tip: "A pivot cell with two options (A or B) sees two wing cells: one with A or C, one with B or C. Whatever the pivot becomes, one wing turns into C. So any cell that sees both wings can't be C." },
  xyzWing: { name: "XYZ-Wing", level: 4, tip: "Like a Y-Wing, but the pivot has three options (A, B or C) and the wings are A/C and B/C. One of the three cells must be C, so a cell that sees all three can't be C." },
  wWing: { name: "W-Wing", level: 4, tip: "Two cells far apart can only be the same two numbers, A or B. If a strong link on A connects them (A has just two spots in some group, one seeing each cell), they can't both be A. So one of them is B, and any cell seeing both can't be B." },
  swordfish: { name: "Swordfish", level: 4, tip: "An X-Wing with three rows: if a number's spots in three rows all fall inside the same three columns, it can't go anywhere else in those columns." },
  coloring: { name: "Simple coloring", level: 4, tip: "Pick one number and follow its strong links (groups where it has only two spots), coloring the cells two colors in turn. One color is all right and the other all wrong. If two cells of the same color see each other, that color is wrong. And any cell that sees both colors can't be the number." },
  uniqueRectangle: { name: "Unique rectangle", level: 4, tip: "Four cells in a rectangle across two boxes can't all hold just the same two numbers: the two could swap, giving two solutions, and a proper Sudoku has only one. So if three corners are just A or B, the fourth corner can't be A or B." },
  xyChain: { name: "XY-Chain", level: 4, tip: "Link cells that each have two options, where neighbors see each other and share a number. Start by saying \"if the first cell isn't Z\" and follow the chain: each cell is forced in turn, until the last one must be Z. So one end or the other is Z, and any cell that sees both ends can't be Z." },
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
  /** Simple coloring: the two sets of chain cells. */
  colors?: { a: number[]; b: number[] };
  /** Chains: the cells in the order to follow them (shown numbered). */
  order?: number[];
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
          ? `In ${unitName(u)}, ${d} only fits in one cell: ${cellName(cell)}. The other cells were already ruled out (crossed off in your notes).`
          : ruledOut
            ? `Look for ${d} in ${unitName(u)}. The ${d}s you can see nearby (highlighted) block most of its empty cells, and the rest were already ruled out (crossed off in your notes). So ${d} can only go in ${cellName(cell)}.`
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
      text: `Check ${cellName(i)} against its row, column and box. Every other number is already used around it${afterElims ? " or crossed off in your notes" : ""}, so it has to be ${digit}.`,
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


// ---------- More eliminations: chains and wings ----------
/** Units where digit d has exactly two spots: a "strong link" (one of the two must be d). */
function strongLinks(cand: number[], d: number) {
  const out: { a: number; b: number; unit: number[] }[] = [];
  const seen = new Set<string>();
  for (const u of UNITS) {
    const spots = u.filter((i) => cand[i] & bit(d));
    if (spots.length !== 2) continue;
    const key = `${spots[0]}-${spots[1]}`;
    if (seen.has(key)) continue; // the same pair can be linked by a row and a box
    seen.add(key);
    out.push({ a: spots[0], b: spots[1], unit: u });
  }
  return out;
}
const seeingAll = (cand: number[], d: number, cells: number[]) =>
  Array.from({ length: 81 }, (_, i) => i).filter((i) => cand[i] & bit(d) && !cells.includes(i) && cells.every((c) => sees(i, c)));

function hiddenTriple(cand: number[]): Step | null {
  for (const u of UNITS) {
    const where = (d: number) => u.filter((i) => cand[i] & bit(d));
    const ds = [1, 2, 3, 4, 5, 6, 7, 8, 9].filter((d) => where(d).length >= 2 && where(d).length <= 3);
    for (const trio of combos(ds, 3)) {
      const cells = [...new Set(trio.flatMap(where))];
      if (cells.length !== 3) continue;
      const out = cells.flatMap((cell) => digitsOf(cand[cell]).filter((d) => !trio.includes(d)).map((digit) => ({ cell, digit })));
      const s = elimStep(cand, "hiddenTriple", out, {
        area: u, focus: cells, clues: [], show: trio,
        text: `In ${unitName(u)}, ${list(trio)} can only go in the three highlighted cells. Those cells are reserved for them, so their other candidates can go.`,
      });
      if (s) return s;
    }
  }
  return null;
}

function skyscraper(cand: number[]): Step | null {
  for (let d = 1; d <= 9; d++) {
    for (const [base, cOf, bw, cw] of [[ROWS, colOf, "row", "column"], [COLS, rowOf, "column", "row"]] as const) {
      const lines = base.map((l, n) => ({ n, spots: l.filter((i) => cand[i] & bit(d)) })).filter((x) => x.spots.length === 2);
      for (const [l1, l2] of combos(lines, 2)) {
        for (const e1 of l1.spots) for (const e2 of l2.spots) {
          if (cOf(e1) !== cOf(e2)) continue;
          const t1 = l1.spots.find((x) => x !== e1)!, t2 = l2.spots.find((x) => x !== e2)!;
          if (cOf(t1) === cOf(t2)) continue; // that's an X-Wing
          const s = elimStep(cand, "skyscraper", seeingAll(cand, d, [t1, t2]).map((cell) => ({ cell, digit: d })), {
            area: [...base[l1.n], ...base[l2.n]], focus: [e1, e2, t1, t2], clues: [], show: [d],
            text: `${d} has exactly two spots in ${bw} ${l1.n + 1} and in ${bw} ${l2.n + 1}, and one end of each lines up in ${cw} ${cOf(e1) + 1}. Only one of those two can be ${d}, so one of the other ends (${cellName(t1)} or ${cellName(t2)}) must be ${d}. Any cell that sees both of them can't be ${d}.`,
          });
          if (s) return s;
        }
      }
    }
  }
  return null;
}

function kite(cand: number[]): Step | null {
  for (let d = 1; d <= 9; d++) {
    const rows = ROWS.map((l, n) => ({ n, spots: l.filter((i) => cand[i] & bit(d)) })).filter((x) => x.spots.length === 2);
    const cols = COLS.map((l, n) => ({ n, spots: l.filter((i) => cand[i] & bit(d)) })).filter((x) => x.spots.length === 2);
    for (const r of rows) for (const c of cols) {
      for (const x of r.spots) for (const y of c.spots) {
        if (x === y || boxOf(x) !== boxOf(y)) continue;
        const rt = r.spots.find((i) => i !== x)!, ct = c.spots.find((i) => i !== y)!;
        if (rt === ct || rt === y || ct === x) continue;
        const s = elimStep(cand, "kite", seeingAll(cand, d, [rt, ct]).map((cell) => ({ cell, digit: d })), {
          area: [...ROWS[r.n], ...COLS[c.n]], focus: [x, y, rt, ct], clues: [], show: [d],
          text: `${d} has two spots in row ${r.n + 1} and two in column ${c.n + 1}, and one spot of each sits in ${boxName(boxOf(x))}. Those two can't both be ${d}, so one of the far ends (${cellName(rt)} or ${cellName(ct)}) must be. A cell that sees both far ends can't be ${d}.`,
        });
        if (s) return s;
      }
    }
  }
  return null;
}

function xyzWing(cand: number[]): Step | null {
  const bi = cand.map((m, i) => (count(m) === 2 ? i : -1)).filter((i) => i >= 0);
  for (let pivot = 0; pivot < 81; pivot++) {
    if (count(cand[pivot]) !== 3) continue;
    const wings = bi.filter((w) => sees(pivot, w) && (cand[w] & cand[pivot]) === cand[w]);
    for (const [w1, w2] of combos(wings, 2)) {
      const shared = cand[w1] & cand[w2];
      if (count(shared) !== 1 || (cand[w1] | cand[w2]) !== cand[pivot]) continue;
      const z = digitsOf(shared)[0];
      const s = elimStep(cand, "xyzWing", seeingAll(cand, z, [pivot, w1, w2]).map((cell) => ({ cell, digit: z })), {
        area: [], focus: [pivot, w1, w2], clues: [], show: digitsOf(cand[pivot]),
        text: `The pivot at ${cellName(pivot)} is ${list(digitsOf(cand[pivot]))}, and the two wings it sees share ${z}. However the pivot turns out, one of these three cells is ${z}. So a cell that sees all three can't be ${z}.`,
      });
      if (s) return s;
    }
  }
  return null;
}

function wWing(cand: number[]): Step | null {
  const bi = cand.map((m, i) => (count(m) === 2 ? i : -1)).filter((i) => i >= 0);
  for (const [p, q] of combos(bi, 2)) {
    if (cand[p] !== cand[q] || sees(p, q)) continue;
    const [a, b] = digitsOf(cand[p]);
    for (const [x, y] of [[a, b], [b, a]]) {
      for (const link of strongLinks(cand, x)) {
        const { a: m, b: n } = link;
        if ([m, n].includes(p) || [m, n].includes(q)) continue;
        if (!((sees(m, p) && sees(n, q)) || (sees(m, q) && sees(n, p)))) continue;
        const s = elimStep(cand, "wWing", seeingAll(cand, y, [p, q]).map((cell) => ({ cell, digit: y })), {
          area: link.unit, focus: [p, q, m, n], clues: [], show: [a, b],
          text: `${cap(cellName(p))} and ${cellName(q)} can only be ${a} or ${b}. In ${unitName(link.unit)}, ${x} has just two spots, and each sees one of them, so they can't both be ${x}. One of them is ${y}, which means a cell that sees both can't be ${y}.`,
        });
        if (s) return s;
      }
    }
  }
  return null;
}

function coloring(cand: number[]): Step | null {
  for (let d = 1; d <= 9; d++) {
    const links = strongLinks(cand, d);
    const adj = new Map<number, number[]>();
    for (const { a, b } of links) { adj.set(a, [...(adj.get(a) ?? []), b]); adj.set(b, [...(adj.get(b) ?? []), a]); }
    const color = new Map<number, 0 | 1>();
    for (const start of adj.keys()) {
      if (color.has(start)) continue;
      // Two-color this chain.
      const comp: number[] = [];
      const stack = [start];
      color.set(start, 0);
      let ok = true;
      while (stack.length) {
        const c = stack.pop()!;
        comp.push(c);
        for (const n of adj.get(c) ?? []) {
          if (!color.has(n)) { color.set(n, color.get(c) === 0 ? 1 : 0); stack.push(n); }
          else if (color.get(n) === color.get(c)) ok = false;
        }
      }
      if (!ok || comp.length < 4) continue;
      const A = comp.filter((c) => color.get(c) === 0), B = comp.filter((c) => color.get(c) === 1);
      // Wrap: two cells of one color see each other, so that whole color is wrong.
      for (const [same, other, label] of [[A, B, "blue"], [B, A, "green"]] as const) {
        const clash = combos(same, 2).find(([x, y]) => sees(x, y));
        if (!clash) continue;
        const s = elimStep(cand, "coloring", same.map((cell) => ({ cell, digit: d })), {
          area: [], focus: [...same, ...other], clues: [], show: [d],
          text: `Follow the chain of ${d}s: each link is a group where ${d} has only two spots, so the colors alternate and one color is all ${d}s. Two ${label} cells (${cellName(clash[0])} and ${cellName(clash[1])}) see each other, so ${label} can't be the ${d}s. Cross ${d} off every ${label} cell.`,
        });
        if (s) return { ...s, colors: { a: A, b: B } };
      }
      // Trap: a cell outside the chain that sees both colors.
      const out = Array.from({ length: 81 }, (_, i) => i)
        .filter((i) => cand[i] & bit(d) && !comp.includes(i) && A.some((x) => sees(i, x)) && B.some((x) => sees(i, x)))
        .map((cell) => ({ cell, digit: d }));
      const s = elimStep(cand, "coloring", out, {
        area: [], focus: comp, clues: [], show: [d],
        text: `Follow the chain of ${d}s: each link is a group where ${d} has only two spots, so the colors alternate. Either all blue cells are ${d} or all green ones are (the colors on the board). A cell that sees a blue cell and a green cell sees a ${d} either way, so it can't be ${d}.`,
      });
      if (s) return { ...s, colors: { a: A, b: B } };
    }
  }
  return null;
}

function uniqueRectangle(cand: number[]): Step | null {
  for (const [r1, r2] of combos([0, 1, 2, 3, 4, 5, 6, 7, 8], 2)) {
    for (const [c1, c2] of combos([0, 1, 2, 3, 4, 5, 6, 7, 8], 2)) {
      const cells = [r1 * 9 + c1, r1 * 9 + c2, r2 * 9 + c1, r2 * 9 + c2];
      if (new Set(cells.map(boxOf)).size !== 2 || cells.some((i) => !cand[i])) continue;
      const pairs = cells.filter((i) => count(cand[i]) === 2);
      if (pairs.length !== 3 || !pairs.every((i) => cand[i] === cand[pairs[0]])) continue;
      const corner = cells.find((i) => !pairs.includes(i))!;
      const ab = cand[pairs[0]];
      if ((cand[corner] & ab) !== ab) continue;
      const [a, b] = digitsOf(ab);
      const s = elimStep(cand, "uniqueRectangle", [{ cell: corner, digit: a }, { cell: corner, digit: b }], {
        area: [], focus: cells, clues: [], show: [a, b],
        text: `These four cells make a rectangle across two boxes, and three corners can only be ${a} or ${b}. If ${cellName(corner)} were ${a} or ${b} too, the ${a}s and ${b}s could swap and the puzzle would have two answers. A proper Sudoku has just one, so that corner can't be ${a} or ${b}.`,
      });
      if (s) return s;
    }
  }
  return null;
}

/** Spell out an XY-Chain link by link: "If ① isn't 5 it's 4, so ② can't be 4: it's 7 …". */
function chainText(path: number[], z: number, other: (cell: number, digit: number) => number) {
  const n = (k: number) => `(${k + 1})`;
  let carry = other(path[0], z);
  const links = [`If ${n(0)} at ${cellName(path[0])} isn't ${z}, it must be ${carry}.`];
  for (let k = 1; k < path.length; k++) {
    const next = other(path[k], carry);
    links.push(`Then ${n(k)} can't be ${carry}, so it's ${next}.`);
    carry = next;
  }
  return `Follow the numbered cells; each has only two options. ${links.join(" ")} So if ${n(0)} isn't ${z}, ${n(path.length - 1)} is. One end of the chain is always ${z}, so any cell that sees both ends can't be ${z}.`;
}

function xyChain(cand: number[]): Step | null {
  const bi = cand.map((m, i) => (count(m) === 2 ? i : -1)).filter((i) => i >= 0);
  const other = (i: number, d: number) => digitsOf(cand[i]).find((x) => x !== d)!;
  // Shortest chains first: they're the easiest to follow.
  for (let len = 4; len <= 8; len++) {
    for (const start of bi) {
      for (const z of digitsOf(cand[start])) {
        const path = [start];
        // `carry` is the value `cur` is forced to take if the start cell isn't z.
        const walk = (cur: number, carry: number): Step | null => {
          if (path.length === len) {
            if (carry !== z) return null;
            const s = elimStep(cand, "xyChain", seeingAll(cand, z, [start, cur]).filter((i) => !path.includes(i)).map((cell) => ({ cell, digit: z })), {
              area: [], focus: [...path], clues: [], show: [],
              text: chainText(path, z, (i, d) => other(i, d)),
            });
            if (s) {
              // Show both options in every chain cell, and the crossed-out digit where it's removed.
              const marks: Step["marks"] = {};
              for (const c of path) marks[c] = { show: digitsOf(cand[c]), strike: [] };
              for (const e of s.elim) marks[e.cell] = { show: [e.digit], strike: [e.digit] };
              s.marks = marks;
              s.order = [...path];
            }
            return s;
          }
          for (const n of bi) {
            if (path.includes(n) || !sees(cur, n) || !(cand[n] & bit(carry))) continue;
            path.push(n);
            const s = walk(n, other(n, carry));
            path.pop();
            if (s) return s;
          }
          return null;
        };
        const s = walk(start, other(start, z));
        if (s) return s;
      }
    }
  }
  return null;
}

const ELIMINATORS: ((cand: number[]) => Step | null)[] = [
  // Easiest first, so the coach always teaches the simplest way forward.
  pointing, boxLine, (c) => nakedSubset(c, 2),
  hiddenPair, (c) => nakedSubset(c, 3), hiddenTriple, (c) => fish(c, 2), skyscraper, kite,
  yWing, xyzWing, wWing, (c) => fish(c, 3), coloring, uniqueRectangle, xyChain,
];

/** How many elimination steps a single lesson may take before giving up. */
export const LESSON_STEPS = 30;

/**
 * The next thing to learn: any eliminations needed, then the cell they unlock.
 * `known` holds eliminations from earlier lessons ("cell:digit"); new ones are added to it.
 */
export function nextLesson(values: string, known: Set<string>, maxSteps = LESSON_STEPS): Lesson {
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

/** What's still possible in each cell, given the eliminations the player has been shown. */
export function candidateDigits(values: string, known: Set<string>) {
  return candidates(values, known).map(digitsOf);
}

/**
 * The first, gentle hint for a step: where to look, without giving the move away.
 * `cells` are tinted on the board.
 */
export function nudgeOf(step: Step): { text: string; cells: number[] } {
  const d = step.place?.digit ?? step.elim[0]?.digit;
  const unit = step.area.length === 9 ? unitName(step.area) : null;
  const shown = [...new Set(Object.values(step.marks).flatMap((m) => m.show))];
  switch (step.technique) {
    case "fullHouse": return { text: `${cap(unit!)} is almost full. What's missing?`, cells: step.area };
    case "hiddenSingle": return { text: `Where can ${d} go in ${unit}?`, cells: step.area };
    case "nakedSingle": return { text: `Look closely at ${cellName(step.focus[0])}. What's left for it?`, cells: [step.focus[0]] };
    case "pointing": return { text: `Look at where ${d} can go in ${unit}.`, cells: step.area };
    case "boxLine": return { text: `Look at where ${d} can go in ${unit}.`, cells: step.area };
    case "nakedPair":
    case "nakedTriple": return { text: `In ${unit}, look for cells that share the same few options.`, cells: step.area };
    case "hiddenPair":
    case "hiddenTriple": return { text: `In ${unit}, some numbers have very few places to go.`, cells: step.area };
    case "xWing":
    case "swordfish": return { text: `Track where ${d} can go in each of the highlighted lines.`, cells: step.area };
    case "skyscraper":
    case "kite": return { text: `Find rows and columns where ${d} has exactly two spots.`, cells: step.area };
    case "yWing":
    case "xyzWing": return { text: `Look at ${cellName(step.focus[0])} and the cells around it with only two options.`, cells: [step.focus[0]] };
    case "wWing": return { text: `${cap(cellName(step.focus[0]))} and ${cellName(step.focus[1])} have the same two options. Can something link them?`, cells: step.focus.slice(0, 2) };
    case "coloring": return { text: `Follow the ${d}s that have only two spots in a row, column or box.`, cells: [] };
    case "uniqueRectangle": return { text: `Look for a rectangle of cells that can only be ${list(shown)}.`, cells: step.focus };
    case "xyChain": return { text: `Start at ${cellName(step.focus[0])} and follow cells that have only two options.`, cells: [step.focus[0]] };
  }
}

/**
 * Solve a puzzle the way the coach would, to rate it: can the coach finish it,
 * and what's the hardest trick it needs (level 1 = singles only)?
 */
export function grade(puzzle: string) {
  let values = puzzle;
  const known = new Set<string>();
  const used = new Set<TechniqueId>();
  let hardest = 1;
  while (values.includes("0")) {
    const l = nextLesson(values, known);
    for (const st of l.steps) { used.add(st.technique); hardest = Math.max(hardest, TECHNIQUES[st.technique].level); }
    const last = l.steps.at(-1);
    if (l.stuck || !last?.place) return { solved: false, hardest, used: [...used] };
    values = setAt(values, last.place.cell, String(last.place.digit));
  }
  return { solved: true, hardest, used: [...used] };
}

const cap = (s: string) => s[0].toUpperCase() + s.slice(1);
