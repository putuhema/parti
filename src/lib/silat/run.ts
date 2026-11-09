// Raja Silat: a run is a path through a map of fights, elites, campfires, shops, mystery
// events and treasure, ending with a boss. You collect cards, gold and Pusaka (relics).
// Saved on the device.
import { CARDS, POOL, STARTER, isAttack } from "./cards";
import { MAP_ROWS, makeMap, nextNodes, nodeById, type MapNode, type RunMap } from "./map";
import { ALL_RELICS, RELICS } from "./relics";
import { makeFight, type Fight, type Kind, type Setup } from "./rules";

export const FLOORS = MAP_ROWS; // the last row is the boss
export const HEAL_AFTER_FIGHT = 1;
export const START_HP = 16;
const KEY = "pums:silat-run";
const BEST_KEY = "pums:silat-best";

export type RunStatus = "map" | "fight" | "reward" | "camp" | "shop" | "event" | "treasure" | "won" | "lost";

export interface Reward { gold: number; cards: string[]; relics: string[] }
export interface ShopItem { id: string; price: number; sold: boolean }
export interface Shop { cards: ShopItem[]; relic: ShopItem | null; removePrice: number; removed: boolean; healPrice: number; healed: boolean }

export interface Run {
  v: 2;
  seed: number;
  /** The row of the map you're on (0 = Warm-up, last = boss). */
  floor: number;
  hp: number;
  max: number;
  gold: number;
  deck: string[];
  relics: string[];
  map: RunMap;
  at: string | null;
  path: string[];
  status: RunStatus;
  fight: Fight | null;
  reward: Reward | null;
  shop: Shop | null;
  event: string | null;
  treasure: string[] | null;
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
const pickOne = <T,>(r: () => number, list: T[]) => list[Math.floor(r() * list.length)];

export const floorName = (floor: number) => (floor >= FLOORS - 1 ? "Boss: Mandor Benteng" : `Floor ${floor + 1}`);

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
    ? [{ kind: "r", sq: pick([0]), target: true, boss: "Mandor Benteng", hp: 30, heavy: true, hit: 4 }, ...(["p", "p", "n", "n", "b", "p"] as Kind[]).map((kind) => ({ kind, sq: pick([1, 2, 3]) }))]
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

function fightSetup(run: Run, node: MapNode): Setup {
  const base = node.row === 0
    ? firstFight(run.hp, run.max, run.deck, run.seed)
    : randomFight(node.kind === "boss" ? FLOORS - 1 : Math.min(FLOORS - 2, node.row + (node.kind === "elite" ? 1 : 0)), run.hp, run.max, run.deck, node.seed);
  if (node.kind === "elite") {
    // Elites: every piece is tougher.
    base.units = base.units.map((u) => ({ ...u, hp: (u.hp ?? { p: 3, n: 5, b: 5, r: 7, q: 7, k: 16 }[u.kind]) + 2 }));
    base.name = `Elite · ${base.name}`;
  }
  return { ...base, relics: run.relics };
}

export function fightFor(run: Run, node: MapNode): Fight {
  return makeFight(fightSetup(run, node), isAttack);
}

export function newRun(seed = Math.floor(Math.random() * 2 ** 31)): Run {
  const r = rng(seed * 13 + 5);
  // Every run starts with a random common Pusaka, so runs differ from the first fight.
  const starter = pickOne(r, ALL_RELICS.filter((x) => !x.rare)).id;
  return {
    v: 2, seed, floor: 0, hp: START_HP, max: START_HP, gold: 20, deck: [...STARTER], relics: [starter],
    map: makeMap(seed), at: null, path: [], status: "map",
    fight: null, reward: null, shop: null, event: null, treasure: null, ringOuts: 0, bestCombo: 0,
  };
}

// ---------- Moving on the map ----------

export const canEnter = (run: Run, id: string) => run.status === "map" && nextNodes(run.map, run.at).includes(id);

export function enter(run: Run, id: string): Run {
  if (!canEnter(run, id)) return run;
  const node = nodeById(run.map, id);
  const r = rng(node.seed);
  const moved: Run = { ...run, at: id, path: [...run.path, id], floor: node.row };
  switch (node.kind) {
    case "fight":
    case "elite":
    case "boss":
      return { ...moved, status: "fight", fight: fightFor(moved, node) };
    case "camp":
      return { ...moved, status: "camp" };
    case "shop":
      return { ...moved, status: "shop", shop: stockShop(moved, r) };
    case "event":
      return { ...moved, status: "event", event: pickOne(r, Object.keys(EVENTS)) };
    case "treasure":
      return { ...moved, status: "treasure", treasure: relicChoices(moved, r, 2) };
  }
}

const backToMap = (run: Run): Run => ({ ...run, status: "map", fight: null, reward: null, shop: null, event: null, treasure: null });

// ---------- Rewards ----------

function cardChoices(run: Run, r: () => number, n = 3): string[] {
  const out: string[] = [];
  // The first reward always has something flashy.
  if (run.floor === 0) out.push(pickOne(r, ["badai", "tolak", "benteng"]));
  const pool = POOL.filter((id) => !out.includes(id));
  while (out.length < n && pool.length) {
    const weighted = pool.flatMap((id) => (CARDS[id].rare ? [id] : [id, id, id]));
    const id = pickOne(r, weighted);
    out.push(id);
    pool.splice(pool.indexOf(id), 1);
  }
  return out;
}

function relicChoices(run: Run, r: () => number, n: number): string[] {
  const pool = ALL_RELICS.map((x) => x.id).filter((id) => !run.relics.includes(id));
  const out: string[] = [];
  while (out.length < n && pool.length) out.push(pool.splice(Math.floor(r() * pool.length), 1)[0]);
  return out;
}

/** Call after the fight changes: moves the run on when a fight is won or lost. */
export function settle(run: Run): Run {
  const f = run.fight;
  if (!f || run.status !== "fight") return run;
  if (f.status !== "won" && f.status !== "lost") return run;
  const stats = { ringOuts: run.ringOuts + f.ringOuts, bestCombo: Math.max(run.bestCombo, f.bestCombo) };
  if (f.status === "lost") return { ...run, ...stats, hp: 0, status: "lost" };
  const node = run.at ? nodeById(run.map, run.at) : null;
  const heal = HEAL_AFTER_FIGHT + (run.relics.includes("jamu") ? 4 : 0);
  const done: Run = { ...run, ...stats, hp: Math.min(run.max, f.hero.hp + heal) };
  if (node?.kind === "boss") return { ...done, status: "won", fight: null };
  const r = rng((node?.seed ?? run.seed) + 99);
  const elite = node?.kind === "elite";
  const gold = elite ? 25 + Math.floor(r() * 11) : 10 + Math.floor(r() * 7);
  return { ...done, status: "reward", fight: null, reward: { gold, cards: cardChoices(done, r), relics: elite ? relicChoices(done, r, 2) : [] } };
}

export function takeReward(run: Run, card: string | null, relic: string | null): Run {
  if (!run.reward) return run;
  return backToMap({
    ...run,
    gold: run.gold + run.reward.gold,
    deck: card ? [...run.deck, card] : run.deck,
    relics: relic ? [...run.relics, relic] : run.relics,
  });
}

// ---------- Campfire ----------

export const REST_HEAL = 5;
export const rest = (run: Run): Run => backToMap({ ...run, hp: Math.min(run.max, run.hp + REST_HEAL) });
/** Train: remove a card from your deck for good. */
export const train = (run: Run, index: number): Run => backToMap({ ...run, deck: run.deck.filter((_, i) => i !== index) });

// ---------- Shop (Warung) ----------

function stockShop(run: Run, r: () => number): Shop {
  const cards = cardChoices({ ...run, floor: 1 }, r, 3).map((id) => ({ id, price: CARDS[id].rare ? 55 + Math.floor(r() * 11) : 30 + Math.floor(r() * 11), sold: false }));
  const relicId = relicChoices(run, r, 1)[0];
  const relic = relicId ? { id: relicId, price: RELICS[relicId].rare ? 90 : 65, sold: false } : null;
  return { cards, relic, removePrice: 40, removed: false, healPrice: 20, healed: false };
}

export const SHOP_HEAL = 5;

export function buyCard(run: Run, i: number): Run {
  const item = run.shop?.cards[i];
  if (!run.shop || !item || item.sold || run.gold < item.price) return run;
  const cards = run.shop.cards.map((c, j) => (j === i ? { ...c, sold: true } : c));
  return { ...run, gold: run.gold - item.price, deck: [...run.deck, item.id], shop: { ...run.shop, cards } };
}
export function buyRelic(run: Run): Run {
  const item = run.shop?.relic;
  if (!run.shop || !item || item.sold || run.gold < item.price) return run;
  return { ...run, gold: run.gold - item.price, relics: [...run.relics, item.id], shop: { ...run.shop, relic: { ...item, sold: true } } };
}
export function buyRemove(run: Run, index: number): Run {
  if (!run.shop || run.shop.removed || run.gold < run.shop.removePrice || run.deck.length <= 5) return run;
  return { ...run, gold: run.gold - run.shop.removePrice, deck: run.deck.filter((_, i) => i !== index), shop: { ...run.shop, removed: true } };
}
export function buyHeal(run: Run): Run {
  if (!run.shop || run.shop.healed || run.gold < run.shop.healPrice || run.hp >= run.max) return run;
  return { ...run, gold: run.gold - run.shop.healPrice, hp: Math.min(run.max, run.hp + SHOP_HEAL), shop: { ...run.shop, healed: true } };
}
export const leave = (run: Run): Run => backToMap(run);

// ---------- Mystery events ----------

export interface EventChoice { id: string; label: string; detail: string; needsCard?: boolean; cost?: number }
export interface GameEvent { title: string; text: string; choices: EventChoice[] }

export const EVENTS: Record<string, GameEvent> = {
  dukun: {
    title: "The Dukun",
    text: "An old dukun offers you a powerful jurus, written on a palm leaf. \"Everything has a price,\" he says.",
    choices: [
      { id: "take", label: "Learn it", detail: "Gain a random rare card. Lose 4 HP." },
      { id: "leave", label: "Walk away", detail: "Nothing happens." },
    ],
  },
  warung: {
    title: "Warung Kopi",
    text: "A little coffee stall by the rice fields. The owner waves you over.",
    choices: [
      { id: "coffee", label: "Kopi tubruk", detail: "Pay 15 gold. Heal 7 HP.", cost: 15 },
      { id: "leave", label: "Keep walking", detail: "Nothing happens." },
    ],
  },
  guru: {
    title: "The Old Master",
    text: "A silat master watches you train. \"Your stance is weak. Let me help.\"",
    choices: [
      { id: "forget", label: "Unlearn a bad habit", detail: "Remove a card from your deck.", needsCard: true },
      { id: "toughen", label: "Toughen up", detail: "+3 max HP." },
    ],
  },
  shrine: {
    title: "Mossy Shrine",
    text: "Something glints between the offerings at an old shrine.",
    choices: [
      { id: "take", label: "Take it", detail: "Gain a random Pusaka. Lose 6 HP." },
      { id: "pray", label: "Pray", detail: "Heal 4 HP." },
    ],
  },
};

export function chooseEvent(run: Run, choice: string, cardIndex?: number): Run {
  const ev = run.event;
  const r = rng(run.seed + run.path.length * 17);
  let next = run;
  if (ev === "dukun" && choice === "take") {
    const rares = POOL.filter((id) => CARDS[id].rare);
    next = { ...run, deck: [...run.deck, pickOne(r, rares)], hp: Math.max(1, run.hp - 4) };
  } else if (ev === "warung" && choice === "coffee") {
    if (run.gold < 15) return run;
    next = { ...run, gold: run.gold - 15, hp: Math.min(run.max, run.hp + 7) };
  } else if (ev === "guru" && choice === "forget") {
    if (cardIndex === undefined) return run;
    next = { ...run, deck: run.deck.filter((_, i) => i !== cardIndex) };
  } else if (ev === "guru" && choice === "toughen") {
    next = { ...run, max: run.max + 3, hp: run.hp + 3 };
  } else if (ev === "shrine" && choice === "take") {
    const relic = relicChoices(run, r, 1)[0];
    next = { ...run, relics: relic ? [...run.relics, relic] : run.relics, hp: Math.max(1, run.hp - 6) };
  } else if (ev === "shrine" && choice === "pray") {
    next = { ...run, hp: Math.min(run.max, run.hp + 4) };
  }
  return backToMap(next);
}

// ---------- Treasure ----------

export function takeTreasure(run: Run, relic: string | null): Run {
  return backToMap({ ...run, relics: relic ? [...run.relics, relic] : run.relics });
}

// ---------- Saving ----------

export function loadRun(): Run | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const r = JSON.parse(raw) as Run;
    return r?.v === 2 ? r : null; // older runs (no map) are dropped
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
