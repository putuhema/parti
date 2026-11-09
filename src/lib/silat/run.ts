// Raja Silat: a run is a string of fights with a card reward after each one,
// ending with a boss. Saved on the device.
import { CARDS, POOL, STARTER, isAttack } from "./cards";
import { makeFight, type Fight, type Kind, type Setup } from "./rules";

export const FLOORS = 7; // floor 6 is the boss
export const HEAL_AFTER_FIGHT = 2;
const KEY = "pums:silat-run";
const BEST_KEY = "pums:silat-best";

export interface Run {
  v: 1;
  seed: number;
  floor: number;
  hp: number;
  max: number;
  deck: string[];
  fight: Fight | null;
  reward: string[] | null;
  status: "fight" | "reward" | "won" | "lost";
  ringOuts: number;
  bestCombo: number;
}

export interface Best { floor: number; wins: number; runs: number }

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const floorName = (floor: number) => (floor === FLOORS - 1 ? "Boss: Mandor Benteng" : `Fight ${floor + 1}`);

/** The first fight is handmade: kick the pawn in front of you into the pawn behind it. */
function firstFight(hp: number, max: number, deck: string[], seed: number): Setup {
  const sq = (c: number, r: number) => r * 6 + c;
  return {
    hero: sq(2, 4),
    heroHp: hp,
    heroMax: max,
    units: [
      { kind: "k", sq: sq(4, 0) },
      { kind: "p", sq: sq(2, 3) },
      { kind: "p", sq: sq(2, 1) },
      { kind: "n", sq: sq(5, 1) },
    ],
    mud: [sq(0, 5), sq(1, 5)],
    deck,
    seed,
    name: "Warm-up",
  };
}

/** Enemy formations. Each picks squares for its army. */
type PickSq = (rows: number[], cols?: number[]) => number;
interface Layout {
  name: string;
  /** Win by surviving this many turns (knocking out the king still wins too). */
  survive?: number;
  army: (pick: PickSq, floor: number) => Setup["units"];
}

const LAYOUTS: Record<string, Layout> = {
  barisan: {
    name: "Pawn Wall",
    army: (pick, floor) => {
      // A staggered line: each back pawn guards the two front pawns beside it.
      const king = pick([0], [1, 2, 3]);
      const c = Math.min(2, Math.max(0, (king % 6) - 1)); // the wall spans columns c..c+3, in front of the king
      const units: Setup["units"] = [{ kind: "k", sq: king }];
      for (let i = 0; i < 4; i++) units.push({ kind: "p", sq: pick([i % 2 ? 1 : 2], [c + i]) });
      if (floor >= 2) units.push({ kind: "n", sq: pick([1, 2]) });
      return units;
    },
  },
  kuda: {
    name: "Cavalry",
    army: (pick, floor) => [
      { kind: "k", sq: pick([0]) },
      { kind: "n", sq: pick([1, 2]) },
      { kind: "n", sq: pick([1, 2]) },
      ...(floor >= 3 ? [{ kind: "n" as Kind, sq: pick([2]) }] : []),
      { kind: "p", sq: pick([2]) },
    ],
  },
  pemanah: {
    name: "Snipers",
    army: (pick, floor) => [
      { kind: "k", sq: pick([0], [2, 3]) },
      { kind: "b", sq: pick([0, 1], [0, 1]) },
      { kind: floor >= 3 ? "q" : "r", sq: pick([0, 1], [4, 5]) },
      { kind: "p", sq: pick([2]) },
      { kind: "p", sq: pick([2]) },
    ],
  },
  kepung: {
    name: "Siege",
    army: (pick, floor) => [
      { kind: "k", sq: pick([0]) },
      { kind: "p", sq: pick([3, 4], [0]) },
      { kind: "p", sq: pick([3, 4], [5]) },
      { kind: "n", sq: pick([2, 3], [0, 1]) },
      { kind: "n", sq: pick([2, 3], [4, 5]) },
      ...(floor >= 4 ? [{ kind: "b" as Kind, sq: pick([1]) }] : []),
    ],
  },
  bertahan: {
    name: "Hold Out",
    survive: 5,
    army: (pick, floor) => [
      { kind: "k", sq: pick([0]) },
      ...(["p", "p", "p", "n", "n", floor >= 3 ? "r" : "b"] as Kind[]).map((kind) => ({ kind, sq: pick([1, 2]) })),
    ],
  },
};

/** Which formations can show up on each floor (floor 0 is the handmade first fight, the last is the boss). */
const FLOOR_LAYOUTS: string[][] = [
  [],
  ["barisan", "kuda"],
  ["pemanah", "barisan", "kuda"],
  ["kepung", "bertahan", "kuda"],
  ["pemanah", "kepung", "bertahan"],
  ["barisan", "kuda", "pemanah", "kepung", "bertahan"],
];

function randomFight(floor: number, hp: number, max: number, deck: string[], seed: number): Setup {
  const r = rng(seed * 7919 + floor);
  const n = 6;
  const taken = new Set<number>();
  const pick: PickSq = (rows, cols) => {
    for (let i = 0; i < 200; i++) {
      const c = cols ? cols[Math.floor(r() * cols.length)] : Math.floor(r() * n);
      const sq = rows[Math.floor(r() * rows.length)] * n + Math.min(n - 1, Math.max(0, c));
      if (!taken.has(sq)) { taken.add(sq); return sq; }
    }
    // Fall back to any free square in those rows.
    for (const row of rows) for (let c = 0; c < n; c++) if (!taken.has(row * n + c)) { taken.add(row * n + c); return row * n + c; }
    throw new Error("board full");
  };
  const hero = 5 * n + 2 + Math.floor(r() * 2);
  taken.add(hero);
  const boss = floor === FLOORS - 1;
  const options = FLOOR_LAYOUTS[Math.min(floor, FLOOR_LAYOUTS.length - 1)];
  const layout = boss ? null : LAYOUTS[options[Math.floor(r() * options.length)]];
  const units: Setup["units"] = boss
    ? [{ kind: "r", sq: pick([0]), target: true, boss: "Mandor Benteng", hp: 24, heavy: true, hit: 4 }, ...(["p", "p", "n", "b", "p"] as Kind[]).map((kind) => ({ kind, sq: pick([1, 2, 3]) }))]
    : layout!.army(pick, floor);
  const things: Setup["things"] = [];
  const mud: number[] = [];
  for (let i = 0; i < 2; i++) mud.push(pick([4, 5]));
  return {
    hero, heroHp: hp, heroMax: max, units, things, mud, deck, seed: seed + floor * 101,
    limit: floor >= 4 ? 99 : floor >= 2 ? 4 : floor >= 1 ? 3 : 2,
    name: boss ? "Mandor Benteng" : layout!.name,
    survive: layout?.survive,
  };
}

export function fightFor(run: Pick<Run, "floor" | "hp" | "max" | "deck" | "seed">): Fight {
  const setup = run.floor === 0 ? firstFight(run.hp, run.max, run.deck, run.seed) : randomFight(run.floor, run.hp, run.max, run.deck, run.seed);
  return makeFight(setup, isAttack);
}

export function newRun(seed = Math.floor(Math.random() * 2 ** 31)): Run {
  const base = { v: 1 as const, seed, floor: 0, hp: 20, max: 20, deck: [...STARTER] };
  return { ...base, fight: fightFor(base), reward: null, status: "fight", ringOuts: 0, bestCombo: 0 };
}

function rewardsFor(run: Run): string[] {
  const r = rng(run.seed * 31 + run.floor);
  // The first reward always has something flashy.
  const flashy = ["badai", "tolak", "benteng"];
  const out: string[] = [];
  if (run.floor === 0) out.push(flashy[Math.floor(r() * flashy.length)]);
  const pool = POOL.filter((id) => !out.includes(id));
  while (out.length < 3 && pool.length) {
    const weighted = pool.flatMap((id) => (CARDS[id].rare ? [id] : [id, id, id]));
    const id = weighted[Math.floor(r() * weighted.length)];
    out.push(id);
    pool.splice(pool.indexOf(id), 1);
  }
  return out;
}

/** Call after the fight changes: moves the run on when a fight is won or lost. */
export function settle(run: Run): Run {
  const f = run.fight;
  if (!f || run.status !== "fight") return run;
  if (f.status !== "won" && f.status !== "lost") return run;
  const stats = { ringOuts: run.ringOuts + f.ringOuts, bestCombo: Math.max(run.bestCombo, f.bestCombo) };
  if (f.status === "lost") return { ...run, ...stats, hp: 0, status: "lost" };
  const done = { ...run, ...stats, hp: Math.min(run.max, f.hero.hp + HEAL_AFTER_FIGHT) };
  if (run.floor >= FLOORS - 1) return { ...done, status: "won", fight: null };
  return { ...done, status: "reward", reward: rewardsFor(run), fight: null };
}

export function takeReward(run: Run, id: string | null): Run {
  const deck = id ? [...run.deck, id] : run.deck;
  const next = { ...run, deck, floor: run.floor + 1, reward: null, status: "fight" as const };
  return { ...next, fight: fightFor(next) };
}

// ---------- Saving ----------

export function loadRun(): Run | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const r = JSON.parse(raw) as Run;
    return r?.v === 1 ? r : null;
  } catch {
    return null;
  }
}

export function saveRun(run: Run | null) {
  try {
    if (run) localStorage.setItem(KEY, JSON.stringify(run));
    else localStorage.removeItem(KEY);
  } catch {}
}

export function loadBest(): Best {
  try {
    return { floor: 0, wins: 0, runs: 0, ...JSON.parse(localStorage.getItem(BEST_KEY) ?? "{}") };
  } catch {
    return { floor: 0, wins: 0, runs: 0 };
  }
}

export function recordEnd(run: Run) {
  const b = loadBest();
  const next: Best = { floor: Math.max(b.floor, run.floor + 1), wins: b.wins + (run.status === "won" ? 1 : 0), runs: b.runs + 1 };
  try { localStorage.setItem(BEST_KEY, JSON.stringify(next)); } catch {}
  return next;
}
