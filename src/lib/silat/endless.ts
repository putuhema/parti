// Raja Silat endless runs: every prison, every fight and every boss is generated from the run's seed.
//
// You never finish a run. Beat a prison's boss and you escape, only to be dragged into the next, deeper
// prison. Each depth has its own name, colour, map, board size and boss. Fights grow from a difficulty
// budget that buys chess pieces, placed in real chess formations (pawn chains, castled kings,
// fianchetto bishops...), so reading the board like a chess player pays off.
import { BALANCE, ENEMIES, fillText, type Variant } from "./config";
import { PIECE, TRAITS, type Kind, type Scene, type Setup, type Thing, type Trait } from "./rules";

export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
type R = () => number;
const pick = <T,>(r: R, list: T[]) => list[Math.floor(r() * list.length)];
function weighted<T>(r: R, items: [T, number][]): T {
  const total = items.reduce((a, [, w]) => a + w, 0);
  let x = r() * total;
  for (const [it, w] of items) if ((x -= w) < 0) return it;
  return items[items.length - 1][0];
}

// ---------------------------------------------------------------- prisons

export interface Prison {
  depth: number;
  name: string;
  /** Colour wash over the board (null = the plain look). */
  tint: string | null;
  /** Board size: 6, then 7, then 8 from depth 3 on. */
  n: number;
}

const PRISON_WORDS = ["Batu", "Besi", "Kabut", "Pasir", "Bayang", "Karang", "Hujan", "Api", "Rawa", "Gunung", "Angin", "Garam", "Duri", "Senja", "Tulang", "Petir"];

export function prisonFor(seed: number, depth: number): Prison {
  if (depth <= 1) return { depth: 1, name: "Penjara Raja Hitam", tint: null, n: 6 };
  const r = rng(seed * 977 + depth * 7919);
  const prev = depth > 2 ? prisonFor(seed, depth - 1).name : "";
  let name = `Penjara ${pick(r, PRISON_WORDS)}`;
  for (let i = 0; i < 5 && name === prev; i++) name = `Penjara ${pick(r, PRISON_WORDS)}`;
  const hue = Math.floor(r() * 360);
  return { depth, name, tint: `hsl(${hue} 70% 45%)`, n: depth === 2 ? 7 : 8 };
}

// ---------------------------------------------------------------- difficulty

/** What a piece costs out of a fight's budget. */
export const COST: Record<Kind, number> = Object.fromEntries(Object.entries(ENEMIES.pieces).map(([k, p]) => [k, p.cost])) as Record<Kind, number>;

/** How much army a fight gets. Grows with the map floor and, faster, with depth. Elites get 40% more. */
const D = BALANCE.difficulty;
export function budgetFor(depth: number, row: number, elite = false): number {
  const base = D.budgetBase + D.budgetPerFloor * row + D.budgetPerDepth * (depth - 1);
  return Math.round(base * (elite ? D.eliteMultiplier : 1));
}
/** Deeper prisons: tougher pieces, harder hits, more of them acting each turn. */
export const hpScale = (depth: number) => 1 + D.hpPerDepth * (depth - 1);
export const hitBonus = (depth: number) => Math.floor((depth - 1) / D.hitEveryDepths);
export const actorsFor = (depth: number, row: number) => Math.min(D.maxActors, D.actorsBase + Math.ceil(row / 2) + (depth - 1));

// ---------------------------------------------------------------- formations

type Unit = Setup["units"][number];
interface Ctx {
  n: number;
  r: R;
  depth: number;
  row: number;
  budget: number;
  taken: Set<number>;
  hero: number;
  units: Unit[];
}
const sqAt = (c: Ctx, col: number, row: number) => row * c.n + col;
/** Rows by role, top (enemy side) down. */
const rows = (c: Ctx) => {
  const big = c.n >= 7;
  return { back: big ? [0, 1] : [0], mid: big ? [1, 2] : [1], front: big ? [2, 3] : [2], near: [c.n - 3, c.n - 2] };
};

function free(c: Ctx, sq: number) {
  return sq >= 0 && sq < c.n * c.n && !c.taken.has(sq);
}
/** A free square in these rows (and columns, if given), or null. */
function spot(c: Ctx, rowList: number[], cols?: number[]): number | null {
  for (let i = 0; i < 60; i++) {
    const col = cols ? pick(c.r, cols) : Math.floor(c.r() * c.n);
    const sq = sqAt(c, Math.max(0, Math.min(c.n - 1, col)), pick(c.r, rowList));
    if (free(c, sq)) return sq;
  }
  for (const rr of rowList) for (let col = 0; col < c.n; col++) if (free(c, sqAt(c, col, rr))) return sqAt(c, col, rr);
  return null;
}
function put(c: Ctx, kind: Kind, sq: number | null, extra: Partial<Unit> = {}) {
  if (sq === null || !free(c, sq)) return false;
  c.taken.add(sq);
  c.units.push({ kind, sq, ...extra });
  if (kind !== "k") c.budget -= COST[kind];
  return true;
}
const maxUnits = (c: Ctx) => c.n + 2 + Math.floor(c.depth / 2);

/** Spend what's left of the budget on pieces from `menu`, each in the rows that suit it. */
function fill(c: Ctx, menu: [Kind, number][]) {
  const R0 = rows(c);
  const home: Record<Kind, number[]> = { p: R0.front, n: [...R0.mid, ...R0.front], b: R0.mid, r: R0.back, q: R0.back, k: R0.back };
  for (let guard = 0; guard < 40 && c.units.length < maxUnits(c); guard++) {
    const affordable = menu.filter(([k]) => COST[k] <= c.budget);
    if (!affordable.length) break;
    const kind = weighted(c.r, affordable);
    if (!put(c, kind, spot(c, home[kind]))) break;
  }
}

interface Formation {
  name: string;
  /** First depth / map row it can appear on. */
  minDepth: number;
  minRow: number;
  weight: number;
  survive?: (c: Ctx) => number;
  build: (c: Ctx) => void;
}

const centre = (c: Ctx) => Math.floor(c.n / 2) - (c.r() < 0.5 ? 1 : 0);

const FORMATIONS: Formation[] = [
  {
    // Pawn chain: each pawn guards the next, like a chess pawn structure. Break the base first.
    name: "Pawn Chain", minDepth: 1, minRow: 1, weight: 3,
    build: (c) => {
      const R0 = rows(c);
      const k = centre(c);
      put(c, "k", sqAt(c, k, R0.back[0]));
      const len = Math.min(c.n - 1, Math.max(3, Math.floor(c.budget * 0.55)));
      const start = Math.max(0, Math.min(c.n - len, k - Math.floor(len / 2)));
      const up = c.r() < 0.5;
      // Zigzag across two rows: each back pawn guards the front pawns beside it.
      for (let i = 0; i < len && c.budget >= 1; i++) put(c, "p", sqAt(c, start + i, R0.front[0] - ((i % 2 === 0) === up ? 0 : 1)));
      fill(c, [["n", 3], ["b", 2], ["r", 1]]);
    },
  },
  {
    // Cavalry: knights that fork the squares around you.
    name: "Cavalry", minDepth: 1, minRow: 1, weight: 2,
    build: (c) => {
      put(c, "k", spot(c, rows(c).back));
      fill(c, [["n", 4], ["p", 2]]);
    },
  },
  {
    // Castled king: tucked in a corner behind a rook and a pawn shield. Chess players know where to hit.
    name: "Castled King", minDepth: 1, minRow: 2, weight: 2,
    build: (c) => {
      const left = c.r() < 0.5;
      const kc = left ? 1 : c.n - 2;
      put(c, "k", sqAt(c, kc, 0));
      if (c.budget >= 5) put(c, "r", sqAt(c, left ? kc + 1 : kc - 1, 0));
      for (const dc of [-1, 0, 1]) if (c.budget >= 1) put(c, "p", sqAt(c, kc + dc, 1));
      fill(c, [["n", 2], ["b", 2], ["p", 2], ["q", 1]]);
    },
  },
  {
    // Fianchetto: bishops on the long diagonals behind a pawn wall. Stay off those lines.
    name: "Fianchetto", minDepth: 1, minRow: 2, weight: 2,
    build: (c) => {
      const R0 = rows(c);
      put(c, "k", sqAt(c, centre(c), 0));
      for (const col of [1, c.n - 2]) if (c.budget >= 3) put(c, "b", sqAt(c, col, R0.mid[0]));
      for (const col of [0, 2, c.n - 3, c.n - 1]) if (c.budget >= 1) put(c, "p", sqAt(c, col, R0.front[0]));
      fill(c, [["p", 2], ["n", 2], ["r", 1]]);
    },
  },
  {
    // Snipers: long-range pieces in the back corners, a thin screen in front.
    name: "Snipers", minDepth: 1, minRow: 2, weight: 2,
    build: (c) => {
      put(c, "k", spot(c, [0], [Math.floor(c.n / 2) - 1, Math.floor(c.n / 2)]));
      if (c.budget >= 5) put(c, c.budget >= 12 ? "q" : "r", spot(c, rows(c).back, [c.n - 1, c.n - 2]));
      if (c.budget >= 3) put(c, "b", spot(c, rows(c).back, [0, 1]));
      fill(c, [["p", 3], ["b", 1], ["r", 1]]);
    },
  },
  {
    // Siege: pieces closing in on both of your flanks from the start.
    name: "Siege", minDepth: 1, minRow: 3, weight: 2,
    build: (c) => {
      const R0 = rows(c);
      put(c, "k", spot(c, R0.back));
      for (const col of [0, c.n - 1]) {
        if (c.budget >= 3) put(c, "n", spot(c, R0.near, [col, col === 0 ? 1 : c.n - 2]));
        if (c.budget >= 1) put(c, "p", spot(c, [R0.near[0]], [col]));
      }
      fill(c, [["p", 2], ["b", 1], ["r", 1]]);
    },
  },
  {
    // Ambush: two pieces are already right next to you. The rest wait at the back.
    name: "Ambush", minDepth: 1, minRow: 3, weight: 1,
    build: (c) => {
      const hc = c.hero % c.n;
      put(c, "k", spot(c, [0]));
      for (const dc of [-2, 2]) if (c.budget >= 3) put(c, "n", spot(c, [c.n - 3], [hc + dc]));
      fill(c, [["p", 2], ["b", 2], ["r", 1], ["q", 1]]);
    },
  },
  {
    // Hold Out: a big crowd; survive a few turns (or beat the King).
    name: "Hold Out", minDepth: 1, minRow: 3, weight: 1,
    survive: (c) => 5 + Math.floor((c.depth - 1) / 3),
    build: (c) => {
      c.budget = Math.round(c.budget * 1.3);
      put(c, "k", spot(c, [0]));
      fill(c, [["p", 3], ["n", 2], ["b", 1], ["r", 1]]);
    },
  },
];

// ---------------------------------------------------------------- variants

/** Pick a variant from config/enemies.json for a piece on this floor and depth, by weight. */
export function pickVariant(r: R, kind: Kind, row: number, depth: number): Variant | undefined {
  const ok = ENEMIES.variants.filter(
    (v) => v.piece === kind && (v.minRow ?? 0) <= row && (v.maxRow ?? 99) >= row && (v.minDepth ?? 1) <= depth,
  );
  if (!ok.length) return undefined;
  return weighted(r, ok.map((v) => [v, v.weight ?? 1] as [Variant, number]));
}

/** Give every non-boss piece a variant, and scale its stats for the depth. */
function dress(c: Ctx, units: Unit[], elite: boolean) {
  const scale = hpScale(c.depth), plus = hitBonus(c.depth);
  for (const u of units) {
    if (u.boss) continue;
    const v = pickVariant(c.r, u.kind, c.row, c.depth);
    if (v) u.variant = v.id;
    if (v?.traits?.length) u.traits = [...(u.traits ?? []), ...(v.traits as Trait[])];
    u.hp = Math.round((v?.hp ?? PIECE[u.kind].hp) * scale) + (elite ? D.eliteHpBonus : 0);
    const hit = (v?.hit ?? PIECE[u.kind].hit) + plus;
    if (hit !== PIECE[u.kind].hit) u.hit = hit;
  }
}

// ---------------------------------------------------------------- terrain

/** Each part of the prison brings its own objects. */
const TERRAIN: Record<Scene, { mud: number; batu: number; petasan: number }> = {
  cell: { mud: 0, batu: 0, petasan: 1 },
  corridor: { mud: 0, batu: 2, petasan: 0 },
  yard: { mud: 2, batu: 1, petasan: 1 },
  wall: { mud: 0, batu: 2, petasan: 1 },
  gate: { mud: 3, batu: 0, petasan: 0 },
};

function terrain(c: Ctx, scene: Scene) {
  const t = TERRAIN[scene];
  const things: { kind: Thing["kind"]; sq: number }[] = [];
  const mud: number[] = [];
  const near = (sq: number) => Math.abs((sq % c.n) - (c.hero % c.n)) <= 1 && Math.abs(Math.floor(sq / c.n) - Math.floor(c.hero / c.n)) <= 1;
  const middle = Array.from({ length: c.n - 3 }, (_, i) => i + 1);
  const place = () => {
    for (let i = 0; i < 30; i++) {
      const sq = sqAt(c, Math.floor(c.r() * c.n), pick(c.r, middle));
      if (free(c, sq) && !near(sq) && !mud.includes(sq)) return sq;
    }
    return null;
  };
  for (let i = 0; i < t.batu; i++) { const sq = place(); if (sq !== null) { c.taken.add(sq); things.push({ kind: "batu", sq }); } }
  for (let i = 0; i < t.petasan; i++) { const sq = place(); if (sq !== null) { c.taken.add(sq); things.push({ kind: "petasan", sq }); } }
  for (let i = 0; i < t.mud; i++) { const sq = place(); if (sq !== null) mud.push(sq); }
  return { things, mud };
}

// ---------------------------------------------------------------- fights

const ELITE_TRAITS = ENEMIES.eliteTraits as Trait[];

export interface FightPlan {
  depth: number;
  row: number;
  kind: "fight" | "elite";
  scene: Scene;
  seed: number;
}

/** A regular or elite fight: formation, pieces, terrain and scaling, all from the seed. */
export function generateFight(p: FightPlan, base: Pick<Setup, "heroHp" | "heroMax" | "deck">): Setup {
  const n = p.depth <= 1 ? 6 : p.depth === 2 ? 7 : 8;
  const r = rng(p.seed * 7919 + p.row * 131 + p.depth * 17);
  const hero = (n - 1) * n + Math.floor(n / 2) - 1 + Math.floor(r() * 2);
  const c: Ctx = { n, r, depth: p.depth, row: p.row, budget: budgetFor(p.depth, p.row, p.kind === "elite"), taken: new Set([hero]), hero, units: [] };
  const options = FORMATIONS.filter((f) => p.depth >= f.minDepth && (p.row >= f.minRow || p.depth > 1));
  const form = weighted(r, options.map((f) => [f, f.weight] as [Formation, number]));
  form.build(c);
  if (!c.units.some((u) => u.kind === "k")) put(c, "k", spot(c, [0]) ?? spot(c, [1]));
  const intro: string[] = [];
  // Variants (signature moves) and depth scaling.
  dress(c, c.units, p.kind === "elite");
  for (const u of c.units) {
    const v = ENEMIES.variants.find((x) => x.id === u.variant);
    for (const id of v?.moves ?? []) {
      const m = ENEMIES.moves[id];
      const line = m && `${v!.name ?? PIECE[u.kind].name} · ${m.name}: ${fillText(m.text, m as unknown as Record<string, unknown>)}`;
      if (line && !intro.includes(line)) intro.push(line);
    }
  }
  // Elites: one or two pieces get a power.
  if (p.kind === "elite") {
    const picks = c.units.filter((u) => u.kind !== "k" && u.kind !== "p").sort(() => r() - 0.5).slice(0, p.depth >= 3 ? 2 : 1);
    for (const u of picks) {
      const t = pick(r, ELITE_TRAITS);
      u.traits = [t];
      intro.push(`${PIECE[u.kind].name} (${TRAITS[t].name}): ${TRAITS[t].text}`);
    }
  }
  const { things, mud } = terrain(c, p.scene);
  return {
    n,
    hero,
    heroHp: base.heroHp,
    heroMax: base.heroMax,
    deck: base.deck,
    units: c.units,
    things,
    mud,
    seed: p.seed + p.row * 101 + p.depth * 7,
    limit: actorsFor(p.depth, p.row),
    name: p.kind === "elite" ? `Elite · ${form.name}` : form.name,
    survive: form.survive?.(c),
    scene: p.scene,
    intro,
  };
}

// ---------------------------------------------------------------- the Warm-up

const KNIGHT_JUMPS = [[1, -2], [2, -1], [2, 1], [1, 2], [-1, 2], [-2, 1], [-2, -1], [-1, -2]];

/** The first fight of a run: easy, and different every run, but it always teaches the kick.
 *  A pawn sits right next to you with something lined up behind it (a pawn or a firecracker crate),
 *  so one Tendang sends it flying into the other. Nothing guards that pawn, so the shot always works. */
export function generateWarmup(seed: number, base: Pick<Setup, "heroHp" | "heroMax" | "deck">): Setup {
  const n = 6;
  const r = rng(seed * 2_654_435 + 17);
  const at = (c: number, row: number) => row * n + c;
  const inside = (c: number, row: number) => c >= 0 && c < n && row >= 0 && row < n;
  // Where you stand, and which way the shot goes (straight up, or up a diagonal).
  let hc = 1 + Math.floor(r() * 4);
  let dx = pick(r, [-1, 0, 0, 1]);
  if (!inside(hc + dx * 3, 1)) dx = -dx;
  if (!inside(hc + dx * 3, 1)) { dx = 0; hc = 2 + Math.floor(r() * 2); }
  const hero = at(hc, 4);
  const front = at(hc + dx, 3);
  const line = [at(hc + dx * 2, 2)];
  const back = at(hc + dx * 3, 1);
  const units: Setup["units"] = [{ kind: "p", sq: front }];
  const things: { kind: Thing["kind"]; sq: number }[] = [];
  const crate = r() < 0.3;
  if (crate) things.push({ kind: "petasan", sq: back });
  else units.push({ kind: "p", sq: back });
  const taken = new Set([hero, front, back, ...line]);
  const fc = front % n, fr = Math.floor(front / n);
  const hr = Math.floor(hero / n);
  /** Would a piece here guard the front pawn, or start right next to you? */
  const bad = (kind: Kind, sq: number) => {
    const c = sq % n, rr = Math.floor(sq / n);
    if (Math.max(Math.abs(c - hc), Math.abs(rr - hr)) <= 1) return true;
    if (kind === "n") return KNIGHT_JUMPS.some(([x, y]) => c + x === fc && rr + y === fr);
    if (kind === "p") return rr + 1 === fr && Math.abs(c - fc) === 1;
    if (kind === "k") return Math.max(Math.abs(c - fc), Math.abs(rr - fr)) <= 1;
    return false;
  };
  const place = (kind: Kind, rows: number[]) => {
    for (let i = 0; i < 40; i++) {
      const sq = at(Math.floor(r() * n), pick(r, rows));
      if (!taken.has(sq) && !bad(kind, sq)) { taken.add(sq); units.push({ kind, sq }); return; }
    }
  };
  place("k", [0]);
  // One or two extras: something to deal with after the big kick.
  const extras = 1 + (r() < 0.5 ? 1 : 0);
  for (let i = 0; i < extras; i++) place(pick(r, ["n", "n", "p"] as Kind[]), [1, 2]);
  const mud: number[] = [];
  for (let i = 0; i < 2; i++) {
    const sq = at(Math.floor(r() * n), 5);
    if (!taken.has(sq) && !mud.includes(sq)) mud.push(sq);
  }
  return { n, hero, ...base, units, things, mud, seed, name: "Warm-up", scene: "cell", limit: 2 };
}

// ---------------------------------------------------------------- bosses

export interface Boss {
  name: string;
  kind: Kind;
  hp: number;
  hit: number;
  traits: Trait[];
}

const B = ENEMIES.bosses;

/** Each prison's boss: a piece, a name and 1-3 powers. Depth 1 is always Raja Hitam. */
export function bossFor(seed: number, depth: number): Boss {
  if (depth <= 1) return { name: B.first.name, kind: B.first.piece, hp: B.first.hp, hit: B.first.hit, traits: B.first.traits as Trait[] };
  const r = rng(seed * 104729 + depth * 31);
  const prev = bossFor(seed, depth - 1).name;
  const kind = pick(r, B.pieces as Kind[]);
  let name = "";
  for (let i = 0; i < 6 && (!name || name === prev); i++) name = `${pick(r, B.titles[kind] ?? [PIECE[kind].name])} ${pick(r, B.epithets)}`;
  const count = (BALANCE.bosses.powersByDepth.find(([upTo]) => depth <= upTo) ?? [0, 3])[1];
  const traits: Trait[] = [];
  const pool = [...B.powers] as Trait[];
  while (traits.length < count && pool.length) traits.push(pool.splice(Math.floor(r() * pool.length), 1)[0]);
  const BB = BALANCE.bosses;
  return { name, kind, hp: BB.hpBase + BB.hpPerDepth * depth, hit: BB.hitBase + Math.floor(depth / BB.hitEveryDepths), traits };
}

/** The boss fight: the boss on the back row, an escort from the budget, the gate's terrain. */
export function generateBossFight(seed: number, depth: number, base: Pick<Setup, "heroHp" | "heroMax" | "deck">): Setup {
  const boss = bossFor(seed, depth);
  const n = depth <= 1 ? 6 : depth === 2 ? 7 : 8;
  const r = rng(seed * 6007 + depth * 13);
  const hero = (n - 1) * n + Math.floor(n / 2) - 1 + Math.floor(r() * 2);
  const c: Ctx = { n, r, depth, row: 6, budget: Math.round(budgetFor(depth, 5) * D.bossEscortMultiplier), taken: new Set([hero]), hero, units: [] };
  put(c, boss.kind, sqAt(c, Math.floor(n / 2) - (r() < 0.5 ? 1 : 0), 0), {
    target: true, boss: boss.name, hp: boss.hp, hit: boss.hit, heavy: true, traits: boss.traits,
  });
  if (depth <= 1) {
    // Raja Hitam's own guard, as before.
    put(c, "r", spot(c, [0], [0, n - 1]));
    for (const k of ["b", "n", "n", "p", "p", "p"] as Kind[]) put(c, k, spot(c, [1, 2]));
  } else {
    fill(c, [["p", 3], ["n", 2], ["b", 2], ["r", 1], ...(depth >= 4 ? [["q", 1] as [Kind, number]] : [])]);
    dress(c, c.units, false);
  }
  const { things, mud } = terrain(c, "gate");
  return {
    n,
    hero,
    heroHp: base.heroHp,
    heroMax: base.heroMax,
    deck: base.deck,
    units: c.units,
    things,
    mud,
    seed: seed + depth * 997,
    limit: depth <= 1 ? 99 : actorsFor(depth, 6),
    name: boss.name,
    scene: "gate",
    intro: boss.traits.map((t) => `${boss.name} · ${TRAITS[t].name}: ${TRAITS[t].text}`),
  };
}
