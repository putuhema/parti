// Raja Silat: a run is a string of fights with a card reward after each one,
// ending with a boss. Saved on the device.
import { CARDS, POOL, STARTER, isAttack } from "./cards";
import { makeFight, type Fight, type Kind, type Setup } from "./rules";

export const FLOORS = 7; // floor 6 is the boss
export const HEAL_AFTER_FIGHT = 6;
/** Extra heal when every villager survived the fight. */
export const SAVED_ALL_HEAL = 3;
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
  wargaLost?: number;
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

/** The first fight is handmade: kick the boulder into the firecracker crate. */
function firstFight(hp: number, max: number, deck: string[], seed: number): Setup {
  const sq = (c: number, r: number) => r * 6 + c;
  return {
    hero: sq(2, 4),
    heroHp: hp,
    heroMax: max,
    units: [
      { kind: "k", sq: sq(4, 0) },
      { kind: "p", sq: sq(1, 1) },
      { kind: "p", sq: sq(3, 1) },
      { kind: "n", sq: sq(5, 1) },
    ],
    things: [
      { kind: "batu", sq: sq(2, 3) },
      { kind: "petasan", sq: sq(2, 2) },
      { kind: "warga", sq: sq(4, 3) },
    ],
    mud: [sq(0, 5), sq(1, 5)],
    deck,
    seed,
  };
}

const ARMIES: Kind[][] = [
  [],
  ["p", "p", "p", "n"],
  ["p", "p", "b", "n", "p"],
  ["p", "p", "n", "r", "b"],
  ["p", "p", "n", "b", "r", "p"],
  ["p", "p", "n", "n", "q", "b"],
];

function randomFight(floor: number, hp: number, max: number, deck: string[], seed: number): Setup {
  const r = rng(seed * 7919 + floor);
  const n = 6;
  const taken = new Set<number>();
  const pick = (rows: number[]) => {
    for (let i = 0; i < 200; i++) {
      const sq = rows[Math.floor(r() * rows.length)] * n + Math.floor(r() * n);
      if (!taken.has(sq)) { taken.add(sq); return sq; }
    }
    throw new Error("board full");
  };
  const hero = 5 * n + 2 + Math.floor(r() * 2);
  taken.add(hero);
  const boss = floor === FLOORS - 1;
  const units: Setup["units"] = boss
    ? [{ kind: "r", sq: pick([0]), target: true, boss: "Mandor Benteng", hp: 24, heavy: true, hit: 4 }, ...(["p", "p", "n", "b", "p"] as Kind[]).map((kind) => ({ kind, sq: pick([1, 2, 3]) }))]
    : [{ kind: "k" as Kind, sq: pick([0]) }, ...ARMIES[Math.min(floor, ARMIES.length - 1)].map((kind) => ({ kind, sq: pick([1, 2, 3]) }))];
  const things: Setup["things"] = [];
  const crates = 1 + Math.floor(r() * 2);
  for (let i = 0; i < crates; i++) things.push({ kind: "petasan", sq: pick([2, 3, 4]) });
  if (r() < 0.7) things.push({ kind: "batu", sq: pick([3, 4]) });
  for (let i = 0; i < 2; i++) things.push({ kind: "warga", sq: pick([3, 4]) });
  const mud: number[] = [];
  for (let i = 0; i < 2; i++) mud.push(pick([4, 5]));
  return { hero, heroHp: hp, heroMax: max, units, things, mud, deck, seed: seed + floor * 101, limit: floor >= 4 ? 99 : floor >= 2 ? 4 : floor >= 1 ? 3 : 2 };
}

export function fightFor(run: Pick<Run, "floor" | "hp" | "max" | "deck" | "seed">): Fight {
  const setup = run.floor === 0 ? firstFight(run.hp, run.max, run.deck, run.seed) : randomFight(run.floor, run.hp, run.max, run.deck, run.seed);
  return makeFight(setup, isAttack);
}

export function newRun(seed = Math.floor(Math.random() * 2 ** 31)): Run {
  const base = { v: 1 as const, seed, floor: 0, hp: 30, max: 30, deck: [...STARTER] };
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
  const stats = { ringOuts: run.ringOuts + f.ringOuts, bestCombo: Math.max(run.bestCombo, f.bestCombo), wargaLost: (run.wargaLost ?? 0) + f.wargaLost };
  if (f.status === "lost") return { ...run, ...stats, hp: 0, status: "lost" };
  const done = { ...run, ...stats, hp: Math.min(run.max, f.hero.hp + HEAL_AFTER_FIGHT + (f.wargaLost === 0 ? SAVED_ALL_HEAL : 0)) };
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
