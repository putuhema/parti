// Chess Journey: a roguelike run of bot battles across three acts.
// Pure data + rules here; the screens live in app/chess/journey.
import type { Card } from "../../convex/lib/chess";
import type { Goal } from "./engine";

export const KEY = "parti:journey2";
export const BEST_KEY = "parti:journey-best";
export const ROWS = 6; // per act; the last row is the boss
export const LANES = 4;

// ---------- Acts ----------
export interface Act { name: string; sub: string; face: string; edge: string; soft: string; ink: string; boss: string }
export const ACTS: Act[] = [
  { name: "Act I · Rubber Duck Meadow", sub: "Gentle hills, suspicious ducks", face: "#58CC02", edge: "#46A302", soft: "#D7FFB8", ink: "#2F6E00", boss: "Duchess Duckworth" },
  { name: "Act II · Iron Fortress", sub: "Rooks on every wall", face: "#1CB0F6", edge: "#1899D6", soft: "#DDF4FF", ink: "#1478A8", boss: "The Twin Towers" },
  { name: "Act III · Storm Throne", sub: "Where King Bolt waits", face: "#CE82FF", edge: "#A568CC", soft: "#F3E2FF", ink: "#8A4FB5", boss: "King Bolt" },
];

// ---------- Map ----------
export type NodeKind = "battle" | "elite" | "treasure" | "rest" | "mystery" | "shop" | "boss";
export type Twist = "none" | "threecheck" | "blitz" | "pawnstorm" | "hill" | "survive" | "ducks" | "queenhunt" | "fog" | "horde" | "mirror";
export type Trait = "armored" | "frost" | "swift" | "tough" | "smart";

export interface MapNode { id: string; row: number; lane: number; kind: NodeKind; twist: Twist; traits: Trait[]; seed: number }
export interface ActMap { nodes: MapNode[]; edges: [string, string][] }

export const NODE_INFO: Record<NodeKind, { name: string; sub: string; face: string; edge: string; icon: string }> = {
  battle: { name: "Battle", sub: "Beat a bot, earn gold and a reward", face: "#1CB0F6", edge: "#1899D6", icon: "M4 20 L20 4 M14 4 h6 v6 M20 20 L4 4 M4 10 V4 h6" },
  elite: { name: "Elite", sub: "Tougher bot with tricks. Rare relic reward", face: "#FF4B4B", edge: "#EA2B2B", icon: "M12 2 L15 9 L22 9.5 L16.5 14 L18.5 21 L12 17 L5.5 21 L7.5 14 L2 9.5 L9 9z" },
  treasure: { name: "Treasure", sub: "Pick a free relic", face: "#FFC800", edge: "#E5A800", icon: "M3 10 h18 v10 H3z M3 10 l2-5 h14 l2 5 M12 10 v10 M10 14 h4" },
  rest: { name: "Campfire", sub: "Heal, train or craft a card", face: "#FF9600", edge: "#E08600", icon: "M12 3 c3 4 5 6 5 9 a5 5 0 0 1 -10 0 c0-2 1-3 2-4 c0 2 1 3 2 3 c0-3 -1-5 1-8z M5 21 L19 17 M5 17 L19 21" },
  mystery: { name: "Mystery", sub: "A strange event with a choice", face: "#CE82FF", edge: "#A568CC", icon: "M9 9 a3 3 0 1 1 4 2.8 c-.8 .4 -1 1 -1 2 M12 17 h.01" },
  shop: { name: "Shop", sub: "Spend gold on pieces, cards and relics", face: "#2BB673", edge: "#1E8F59", icon: "M4 8 h16 l-1.5 12 h-13z M8 8 V6 a4 4 0 0 1 8 0 v2" },
  boss: { name: "Boss", sub: "Beat it to finish the act", face: "#4B4B4B", edge: "#262626", icon: "M3 18 h18 l-2-11 -4.5 4.5 L12 4 9.5 11.5 5 7z" },
};

export const TWIST_INFO: Record<Twist, { name: string; text: string; color: string } | null> = {
  none: null,
  threecheck: { name: "Three-Check", text: "Give 3 checks to win. So can they!", color: "#FF86D0" },
  blitz: { name: "Blitz", text: "Win within 25 moves or you lose", color: "#FF4B4B" },
  pawnstorm: { name: "Pawn Storm", text: "The enemy brings a full wall of pawns", color: "#6F6F6F" },
  hill: { name: "King of the Hill", text: "First king to reach the 4 center squares wins", color: "#58CC02" },
  survive: { name: "Hold the Line", text: "A huge army attacks. Survive 15 moves to win", color: "#FF9600" },
  ducks: { name: "Duck Pond", text: "Rubber ducks block squares. Nobody can pass them", color: "#FFC800" },
  queenhunt: { name: "Queen Hunt", text: "Capture their queen to win instantly", color: "#CE82FF" },
  fog: { name: "Fog of War", text: "You only see what your pieces can reach. Take the king to win", color: "#4B4B4B" },
  horde: { name: "Reinforcements", text: "The enemy gets a new pawn every 4 moves", color: "#B81F1F" },
  mirror: { name: "Mirror Match", text: "The enemy copies your army", color: "#1CB0F6" },
};

export const TRAIT_INFO: Record<Trait, { name: string; text: string }> = {
  armored: { name: "Armored", text: "Its 2 best pieces start shielded for 3 turns" },
  frost: { name: "Frost", text: "Every 5 moves it freezes your best piece" },
  swift: { name: "Swift", text: "Moves twice on its first turn" },
  tough: { name: "Tough", text: "Brings a bigger army" },
  smart: { name: "Clever", text: "Plays stronger than usual" },
};

// ---------- Relics ----------
export type RelicId =
  | "locket" | "eyes" | "turner" | "pickpocket" | "double" | "march" | "clover" | "vampire"
  | "golden" | "bastion" | "smoke" | "cardshark" | "phoenix" | "recruiter";
export interface Relic { id: RelicId; name: string; text: string; color: string; rare?: boolean }

export const RELICS: Record<RelicId, Relic> = {
  locket: { id: "locket", name: "Heart Locket", text: "+1 max heart, and heal fully.", color: "#FF4B4B" },
  eyes: { id: "eyes", name: "Owl Eyes", text: "+1 hint every battle.", color: "#FFC800" },
  turner: { id: "turner", name: "Time Turner", text: "+1 undo every battle.", color: "#CE82FF" },
  pickpocket: { id: "pickpocket", name: "Pickpocket", text: "Enemies start each battle missing a piece.", color: "#6F6F6F", rare: true },
  double: { id: "double", name: "Battle Cry", text: "Your first turn each battle, you move twice.", color: "#FF9600", rare: true },
  march: { id: "march", name: "Forward March", text: "Your pawns start one square ahead.", color: "#58CC02" },
  clover: { id: "clover", name: "Lucky Clover", text: "Rewards offer 4 choices instead of 3.", color: "#2BB673" },
  vampire: { id: "vampire", name: "Vampire Fang", text: "Win a battle in under 20 moves to heal 1 heart.", color: "#B81F1F" },
  golden: { id: "golden", name: "Golden Pawn", text: "+12 gold after every battle you win.", color: "#E5A800" },
  bastion: { id: "bastion", name: "Bastion", text: "Your 2 best pieces start shielded for 3 turns.", color: "#1899D6" },
  smoke: { id: "smoke", name: "Smoke Bomb", text: "Enemy pieces (not pawns) can't move on its first 2 turns.", color: "#4B4B4B", rare: true },
  cardshark: { id: "cardshark", name: "Card Shark", text: "Each battle, +1 use of a random card.", color: "#A568CC" },
  phoenix: { id: "phoenix", name: "Phoenix Feather", text: "Once per run, survive a defeat with 1 heart.", color: "#FF86D0", rare: true },
  recruiter: { id: "recruiter", name: "Recruiter's Badge", text: "After a win, the best piece you captured may join you.", color: "#1CB0F6" },
};
const RELIC_POOL = Object.keys(RELICS) as RelicId[];
const STACKABLE: RelicId[] = ["eyes", "turner", "golden"];

// ---------- Rewards ----------
export type Reward =
  | { t: "recruit"; piece: "n" | "b" | "r" | "q" | "p" }
  | { t: "pawns"; n: number }
  | { t: "upgrade" }
  | { t: "card"; card: Card }
  | { t: "relic"; id: RelicId }
  | { t: "heal"; n: number }
  | { t: "maxheart" }
  | { t: "gold"; n: number };

export const CARD_KEYS: Card[] = ["shield", "freeze", "swap", "rocket"];
export const CARD_INFO: Record<Card, { name: string; face: string; edge: string; icon: string; help: string }> = {
  shield: { name: "Shield", face: "#FFC800", edge: "#E5A800", icon: "M12 3 L20 6 V12 C20 17 16 20 12 21 C8 20 4 17 4 12 V6z", help: "Tap one of your pieces to protect it until your next turn." },
  freeze: { name: "Freeze", face: "#1CB0F6", edge: "#1899D6", icon: "M12 2 v20 M3.3 7 l17.4 10 M3.3 17 L20.7 7", help: "Tap an enemy piece. It can't move for 2 turns." },
  swap: { name: "Swap", face: "#CE82FF", edge: "#A568CC", icon: "M7 4 L3 8 L7 12 M3 8 H17 M17 12 L21 16 L17 20 M21 16 H7", help: "Tap two of your pieces to trade places. Uses your move." },
  rocket: { name: "Rocket", face: "#FF9600", edge: "#E08600", icon: "M6 13 L12 7 L18 13 M6 19 L12 13 L18 19", help: "Tap a pawn to jump it two squares. Uses your move." },
};

// ---------- Run ----------
export interface Run {
  v: 2;
  act: number;
  map: ActMap;
  at: string | null; // node id you're standing on (null = start of act)
  path: string[]; // node ids visited this act
  hearts: number;
  maxHearts: number;
  gold: number;
  army: string; // 16 chars: rank 2 (a..h) then rank 1 (a..h)
  cards: Record<Card, number>;
  relics: RelicId[];
  phoenixUsed: boolean;
  wins: number;
  seed: number;
}

export interface Best { act: number; clears: number; runs: number; wins: number }

export const START_ARMY = "PPPPPPPP.N..K.N.";

// ---------- Random ----------
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
export const pick = <T,>(r: () => number, list: readonly T[]) => list[Math.floor(r() * list.length)];
function weighted<T extends string>(r: () => number, table: Partial<Record<T, number>>): T {
  const entries = Object.entries(table) as [T, number][];
  let x = r() * entries.reduce((a, [, w]) => a + w, 0);
  for (const [k, w] of entries) { x -= w; if (x <= 0) return k; }
  return entries[0][0];
}

// ---------- Map generation ----------
const TWISTS_BY_ACT: Twist[][] = [
  ["threecheck", "pawnstorm", "ducks", "hill", "queenhunt", "blitz"],
  ["threecheck", "pawnstorm", "ducks", "hill", "queenhunt", "blitz", "survive", "horde", "mirror", "fog"],
  ["threecheck", "ducks", "hill", "queenhunt", "blitz", "survive", "horde", "mirror", "fog"],
];
const TRAITS: Trait[] = ["armored", "frost", "swift", "tough", "smart"];

function kindFor(row: number, act: number, r: () => number): NodeKind {
  if (row === 0) return "battle";
  if (row === ROWS - 2) return weighted<NodeKind>(r, { rest: 7, shop: 3 });
  if (row === 1) return weighted<NodeKind>(r, { battle: 5, mystery: 3, shop: act ? 2 : 1 });
  return weighted<NodeKind>(r, { battle: 4, mystery: 3, elite: act ? 3 : 2, treasure: row === 2 ? 2 : 1, shop: 2 });
}

export function makeMap(act: number, seed: number): ActMap {
  const r = rng(seed);
  const nodes = new Map<string, MapNode>();
  const edges: [string, string][] = [];
  const id = (row: number, lane: number) => `${act}-${row}-${lane}`;
  const crosses = (row: number, a: number, b: number) =>
    edges.some(([f, t]) => {
      const [, fr, fl] = f.split("-").map(Number), [, , tl] = t.split("-").map(Number);
      return fr === row && ((fl < a && tl > b) || (fl > a && tl < b));
    });
  const starts = [0, 1, 2, 3].sort(() => r() - 0.5);
  starts.push(pick(r, [0, 1, 2, 3]));
  const bossId = id(ROWS - 1, 0);
  for (const start of starts) {
    let lane = start;
    for (let row = 0; row < ROWS - 1; row++) {
      if (!nodes.has(id(row, lane))) nodes.set(id(row, lane), { id: id(row, lane), row, lane, kind: "battle", twist: "none", traits: [], seed: 0 });
      if (row === ROWS - 2) {
        if (!edges.some(([f]) => f === id(row, lane))) edges.push([id(row, lane), bossId]);
        break;
      }
      // Prefer squares nobody has used yet on the next row, so routes branch instead of merging.
      const used = (l: number) => (nodes.has(id(row + 1, l)) ? 1 : 0);
      const options = [lane - 1, lane, lane + 1]
        .filter((l) => l >= 0 && l < LANES && !crosses(row, lane, l))
        .map((l) => ({ l, k: used(l) + r() * 0.8 }))
        .sort((a, b) => a.k - b.k)
        .map((x) => x.l);
      const next = options[0] ?? lane;
      if (!edges.some(([f, t]) => f === id(row, lane) && t === id(row + 1, next))) edges.push([id(row, lane), id(row + 1, next)]);
      lane = next;
    }
  }
  nodes.set(bossId, { id: bossId, row: ROWS - 1, lane: 1.5, kind: "boss", twist: "none", traits: [], seed: 0 });
  // Fill in what each node is.
  for (const n of nodes.values()) {
    n.seed = Math.floor(r() * 1e9);
    if (n.kind === "boss") {
      n.twist = (["ducks", "none", "none"] as Twist[])[act];
      n.traits = ([["armored"], ["frost", "tough"], ["smart", "swift", "frost"]] as Trait[][])[act];
      continue;
    }
    n.kind = kindFor(n.row, act, r);
    if (n.kind === "battle" && n.row > 0 && r() < 0.45 + act * 0.15) n.twist = pick(r, TWISTS_BY_ACT[act]);
    if (n.kind === "elite") {
      n.twist = r() < 0.6 ? pick(r, TWISTS_BY_ACT[act]) : "none";
      n.traits = [pick(r, TRAITS)];
      if (act > 0 && r() < 0.5) n.traits.push(pick(r, TRAITS.filter((t) => !n.traits.includes(t))));
    }
    if (n.kind === "battle" && act === 2 && r() < 0.35) n.traits = [pick(r, TRAITS)];
  }
  // No two elites back-to-back on a path: soften the second one.
  for (const [f, t] of edges) {
    const a = nodes.get(f)!, b = nodes.get(t)!;
    if (a.kind === "elite" && b.kind === "elite") { b.kind = "battle"; b.traits = []; }
  }
  return { nodes: [...nodes.values()], edges };
}

export function reachable(run: Run): string[] {
  if (!run.at) return run.map.nodes.filter((n) => n.row === 0).map((n) => n.id);
  return run.map.edges.filter(([f]) => f === run.at).map(([, t]) => t);
}

export function nodeById(run: Run, id: string) {
  return run.map.nodes.find((n) => n.id === id)!;
}

export function newRun(seed = Math.floor(Math.random() * 1e9)): Run {
  return {
    v: 2,
    act: 0,
    map: makeMap(0, seed),
    at: null,
    path: [],
    hearts: 3,
    maxHearts: 3,
    gold: 20,
    army: START_ARMY,
    cards: { shield: 1, freeze: 0, swap: 0, rocket: 1 },
    relics: [],
    phoenixUsed: false,
    wins: 0,
    seed,
  };
}

export function nextAct(run: Run): Run {
  const act = run.act + 1;
  return { ...run, act, map: makeMap(act, run.seed + act * 101), at: null, path: [], hearts: Math.min(run.maxHearts, run.hearts + 1) };
}

// ---------- Battles ----------
export interface Battle {
  fen: string;
  name: string;
  rating: number; // bot strength for this fight
  hints: number;
  undos: number;
  twist: Twist;
  traits: Trait[];
  goal: Goal;
  fog: boolean;
  double: boolean;
  shieldW: number[]; // squares shielded at the start (white)
  shieldB: number[];
  frozenB: number[]; // enemy pieces frozen at the start
  extraCard: Card | null;
  gold: number; // base gold for winning
  weight: number; // how much this fight moves your rating
}

const BOT_NAMES = ["Pip the Pawnbot", "Rusty", "Clank", "Sir Bolts-a-lot", "Gizmo", "Widget", "Captain Cog", "Duchess Dynamo", "Sprocket", "Professor Ping", "Baron Byte", "Lady Lugnut"];
const VAL: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };

export function armyValue(cells: string) {
  return [...cells].reduce((a, c) => a + (VAL[c.toLowerCase()] ?? 0), 0);
}

function enemyArmy(budget: number, r: () => number, opts: { pawnRow?: boolean; queen?: boolean }): [string, string] {
  const back = Array(8).fill(".");
  const pawns = Array(8).fill(".");
  back[4] = "k";
  let left = budget;
  if (opts.queen) { back[3] = "q"; left -= 9; }
  if (opts.pawnRow) { pawns.fill("p"); left -= 8; }
  const freePawn = () => pawns.map((p, i) => (p === "." ? i : -1)).filter((i) => i >= 0);
  const minPawns = Math.min(8, 3 + Math.floor(budget / 8));
  while (pawns.filter((p) => p === "p").length < minPawns && left > 0) { pawns[pick(r, freePawn())] = "p"; left -= 1; }
  const homes: Record<string, number[]> = { q: [3], r: [0, 7], b: [2, 5], n: [1, 6] };
  const cost: Record<string, number> = { q: 9, r: 5, b: 3, n: 3, p: 1 };
  for (let guard = 0; guard < 60 && left > 0; guard++) {
    const options = (["q", "r", "b", "n", "p"] as const).filter((t) => cost[t] <= left && (t === "p" ? freePawn().length > 0 : back.includes(".")) && !(t === "q" && back.includes("q") && budget < 30));
    if (!options.length) break;
    const t = weighted<(typeof options)[number]>(r, Object.fromEntries(options.map((o) => [o, o === "p" ? 2 : o === "q" ? (budget > 22 ? 1.2 : 0.3) : 1.6])));
    if (t === "p") pawns[pick(r, freePawn())] = "p";
    else back[homes[t].find((i) => back[i] === ".") ?? back.findIndex((c) => c === ".")] = t;
    left -= cost[t];
  }
  return [back.join(""), pawns.join("")];
}

/** Bot rating for a node, relative to the player's current rating. */
export function botRating(player: number, node: MapNode, act: number) {
  let off = -140 + act * 70 + node.row * 15;
  if (node.kind === "elite") off += 110;
  if (node.kind === "boss") off += 160 + act * 40;
  if (node.traits.includes("smart")) off += 140;
  return Math.max(350, Math.round(player + off));
}

export function battleFor(run: Run, node: MapNode, playerRating: number): Battle {
  const r = rng(node.seed);
  const act = run.act;
  const t = node.twist;
  let budget = 8 + act * 8 + node.row * 2.5 + (node.kind === "elite" ? 6 : 0);
  if (node.traits.includes("tough")) budget *= 1.35;
  if (t === "survive") budget = budget * 1.7 + 6;
  let b8: string, b7: string;
  if (node.kind === "boss") {
    [b8, b7] = ([["r.bqkb.r", "pppppppp"], ["rr..k.rr", "pppppppp"], ["rnbqkbnr", "pppppppp"]] as [string, string][])[act];
  } else if (t === "mirror") {
    b7 = run.army.slice(0, 8).toLowerCase();
    b8 = run.army.slice(8).toLowerCase();
  } else {
    [b8, b7] = enemyArmy(Math.round(budget), r, { pawnRow: t === "pawnstorm", queen: t === "queenhunt" });
  }
  if (run.relics.includes("pickpocket") && t !== "queenhunt") {
    const cells = (b8 + b7).split("");
    const victims = cells.map((c, i) => (c !== "." && c !== "k" && c !== "q" ? i : -1)).filter((i) => i >= 0);
    if (victims.length) cells[pick(r, victims)] = ".";
    b8 = cells.slice(0, 8).join("");
    b7 = cells.slice(8).join("");
  }
  let r2 = run.army.slice(0, 8);
  const r1 = run.army.slice(8);
  let r3 = "........";
  if (run.relics.includes("march")) { r3 = r2.replace(/[^P]/g, "."); r2 = r2.replace(/P/g, "."); }
  // Rubber ducks on the middle ranks (5 and 4).
  const mid = [Array(8).fill("."), Array(8).fill(".")];
  if (t === "ducks") {
    const n = 4 + Math.floor(r() * 3);
    for (let k = 0; k < n; k++) mid[Math.floor(r() * 2)][Math.floor(r() * 8)] = "*";
  }
  const rank = (s: string) => s.replace(/\.+/g, (m) => String(m.length));
  const fen = `${rank(b8)}/${rank(b7)}/8/${rank(mid[0].join(""))}/${rank(mid[1].join(""))}/${rank(r3)}/${rank(r2)}/${rank(r1)} w - - 0 1`;

  // Board indexes: rank 8 = 0..7, rank 7 = 8..15, rank 3 = 40..47, rank 2 = 48..55, rank 1 = 56..63.
  const strongest = (cells: string, from: number, n: number) =>
    cells.split("").map((c, i) => ({ c, i: i + from })).filter((x) => x.c !== "." && x.c.toLowerCase() !== "k")
      .sort((a, b) => VAL[b.c.toLowerCase()] - VAL[a.c.toLowerCase()]).slice(0, n).map((x) => x.i);
  const count = (id: RelicId) => run.relics.filter((x) => x === id).length;
  const goal: Goal =
    t === "hill" ? { kind: "hill" } : t === "threecheck" ? { kind: "threecheck" } : t === "queenhunt" ? { kind: "queenhunt" } : t === "survive" ? { kind: "survive", ply: 30 } : t === "fog" ? { kind: "kingcapture" } : { kind: "none" };
  return {
    fen,
    name: node.kind === "boss" ? ACTS[act].boss : pick(r, BOT_NAMES),
    rating: botRating(playerRating, node, act),
    hints: 1 + count("eyes"),
    undos: 1 + count("turner"),
    twist: t,
    traits: node.traits,
    goal,
    fog: t === "fog",
    double: run.relics.includes("double"),
    shieldW: run.relics.includes("bastion") ? strongest(r3 + r2 + r1, 40, 2) : [],
    shieldB: node.traits.includes("armored") ? strongest(b8 + b7, 0, 2) : [],
    frozenB: run.relics.includes("smoke") ? (b8 + b7).split("").map((c, i) => ("nbrq".includes(c) ? i : -1)).filter((i) => i >= 0) : [],
    extraCard: run.relics.includes("cardshark") ? pick(r, CARD_KEYS) : null,
    gold: node.kind === "boss" ? 60 : node.kind === "elite" ? 35 : 18 + act * 4,
    weight: node.kind === "boss" ? 1.4 : node.kind === "elite" ? 1.2 : 1,
  };
}

// ---------- Rewards ----------
export function relicChoices(run: Run, n: number, r: () => number, rareFirst = false): Reward[] {
  const free = RELIC_POOL.filter((id) => !run.relics.includes(id) || STACKABLE.includes(id)).sort(() => r() - 0.5);
  if (rareFirst) free.sort((a, b) => Number(!!RELICS[b].rare) - Number(!!RELICS[a].rare));
  return free.slice(0, n).map((id) => ({ t: "relic" as const, id }));
}

export function rewardsFor(run: Run, kind: NodeKind, r: () => number = Math.random): Reward[] {
  const n = run.relics.includes("clover") ? 4 : 3;
  if (kind === "treasure") return relicChoices(run, n, r);
  if (kind === "elite") return [...relicChoices(run, n - 1, r, true), { t: "recruit", piece: r() < 0.5 ? "q" : "r" }];
  const pool: Reward[] = [
    { t: "recruit", piece: "n" },
    { t: "recruit", piece: "b" },
    { t: "recruit", piece: r() < 0.3 ? "r" : "b" },
    { t: "pawns", n: 2 },
    { t: "upgrade" },
    { t: "card", card: pick(r, CARD_KEYS) },
    { t: "card", card: pick(r, CARD_KEYS) },
    { t: "gold", n: 30 },
  ];
  if (run.hearts < run.maxHearts) pool.push({ t: "heal", n: 1 });
  if (r() < 0.3) pool.push(...relicChoices(run, 1, r));
  const out: Reward[] = [];
  const key = (x: Reward) => JSON.stringify(x);
  for (let g = 0; g < 60 && out.length < n && pool.length; g++) {
    const c = pick(r, pool);
    if (!out.some((o) => key(o) === key(c)) && canTake(run, c)) out.push(c);
  }
  return out;
}

export function canTake(run: Run, r: Reward) {
  const a = run.army;
  if (r.t === "recruit") return r.piece === "p" ? a.slice(0, 8).includes(".") : a.slice(8).includes(".") || a.slice(0, 8).includes("P");
  if (r.t === "pawns") return a.slice(0, 8).includes(".");
  if (r.t === "upgrade") return /[PNB]/.test(a);
  if (r.t === "heal") return run.hearts < run.maxHearts;
  return true;
}

export const PIECE_NAMES = { n: "Knight", b: "Bishop", r: "Rook", q: "Queen", p: "Pawn" } as const;

export function rewardLabel(r: Reward): { title: string; text: string } {
  switch (r.t) {
    case "recruit": return { title: `Recruit a ${PIECE_NAMES[r.piece]}`, text: "Joins your army for the rest of the run." };
    case "pawns": return { title: `+${r.n} pawns`, text: "Fill gaps in your front line." };
    case "upgrade": return { title: "Training", text: "Your weakest piece levels up (pawn → knight → rook)." };
    case "card": return { title: `${CARD_INFO[r.card].name} card`, text: `+1 use every battle. ${CARD_INFO[r.card].help}` };
    case "relic": return { title: RELICS[r.id].name, text: RELICS[r.id].text };
    case "heal": return { title: r.n > 1 ? `Heal ${r.n}` : "Heal", text: `Get ${r.n} heart${r.n > 1 ? "s" : ""} back.` };
    case "maxheart": return { title: "+1 max heart", text: "A bigger heart for the road ahead." };
    case "gold": return { title: `+${r.n} gold`, text: "Spend it at a shop." };
  }
}

/** Put a piece into the army: home squares first, else replace a pawn. */
function place(army: string, piece: string): string {
  const a = army.split("");
  if (piece === "P") {
    const i = [3, 4, 2, 5, 1, 6, 0, 7].find((k) => a[k] === ".");
    if (i !== undefined) a[i] = "P";
    return a.join("");
  }
  const homes: Record<string, number[]> = { Q: [11], R: [8, 15], B: [10, 13], N: [9, 14] };
  let spot = (homes[piece] ?? []).find((i) => a[i] === ".");
  if (spot === undefined) spot = [11, 10, 13, 9, 14, 8, 15].find((i) => a[i] === ".");
  if (spot === undefined) spot = [0, 7, 1, 6, 2, 5, 3, 4].find((i) => a[i] === "P");
  if (spot === undefined) return army;
  a[spot] = piece;
  return a.join("");
}

export function applyReward(run: Run, r: Reward): Run {
  const next: Run = { ...run, cards: { ...run.cards }, relics: [...run.relics] };
  switch (r.t) {
    case "recruit": next.army = place(run.army, r.piece.toUpperCase()); break;
    case "pawns": {
      let a = run.army;
      for (let k = 0; k < r.n; k++) a = place(a, "P");
      next.army = a;
      break;
    }
    case "upgrade": {
      const a = run.army.split("");
      const ladder: Record<string, string> = { P: "N", N: "R", B: "R" };
      for (const t of ["P", "N", "B"]) {
        const i = a.findIndex((c) => c === t);
        if (i < 0) continue;
        a[i] = ".";
        next.army = place(a.join(""), ladder[t]);
        break;
      }
      break;
    }
    case "card": next.cards[r.card] += 1; break;
    case "relic":
      next.relics.push(r.id);
      if (r.id === "locket") { next.maxHearts += 1; next.hearts = next.maxHearts; }
      break;
    case "heal": next.hearts = Math.min(run.maxHearts, run.hearts + r.n); break;
    case "maxheart": next.maxHearts += 1; next.hearts += 1; break;
    case "gold": next.gold += r.n; break;
  }
  return next;
}

// ---------- Shop ----------
export interface ShopItem { reward: Reward; price: number }

export function shopFor(run: Run, seed: number): ShopItem[] {
  const r = rng(seed);
  const items: ShopItem[] = [
    { reward: { t: "recruit", piece: "p" }, price: 12 },
    { reward: { t: "recruit", piece: pick(r, ["n", "b"] as const) }, price: 38 },
    { reward: { t: "recruit", piece: "r" }, price: 60 },
    { reward: { t: "card", card: pick(r, CARD_KEYS) }, price: 30 },
    { reward: { t: "upgrade" }, price: 45 },
    { reward: { t: "heal", n: 1 }, price: 30 },
  ];
  if (r() < 0.6) items.push({ reward: { t: "recruit", piece: "q" }, price: 110 });
  for (const rel of relicChoices(run, 2, r)) items.push({ reward: rel, price: rel.t === "relic" && RELICS[rel.id].rare ? 95 : 70 });
  return items;
}

// ---------- Mystery events ----------
export interface EventChoice { label: string; hint: string; ok?: (run: Run) => boolean; go: (run: Run, r: () => number) => { run: Run; text: string; fight?: boolean } }
export interface GameEvent { title: string; text: string; choices: EventChoice[] }

const leave: EventChoice = { label: "Walk away", hint: "Nothing happens.", go: (run) => ({ run, text: "You keep walking." }) };

export const EVENTS: GameEvent[] = [
  {
    title: "The Gambler Bot",
    text: "A bot in a top hat shuffles cards. \"Feeling lucky?\"",
    choices: [
      { label: "Bet 1 heart", hint: "50%: a Queen joins you. 50%: lose the heart.", ok: (x) => x.hearts > 1, go: (run, r) => (r() < 0.5 ? { run: applyReward(run, { t: "recruit", piece: "q" }), text: "Jackpot! A Queen joins your army." } : { run: { ...run, hearts: run.hearts - 1 }, text: "The bot grins. You lose a heart." }) },
      { label: "Bet 20 gold", hint: "50%: win 50 gold. 50%: lose it.", ok: (x) => x.gold >= 20, go: (run, r) => (r() < 0.5 ? { run: { ...run, gold: run.gold + 30 }, text: "You win! You now have 30 more gold." } : { run: { ...run, gold: run.gold - 20 }, text: "Bad luck. -20 gold." }) },
      leave,
    ],
  },
  {
    title: "Cursed Altar",
    text: "An altar hums. It wants something small in return for power.",
    choices: [
      { label: "Sacrifice a pawn", hint: "Lose a pawn, gain a random relic.", ok: (x) => x.army.includes("P"), go: (run, r) => {
        const a = run.army.split(""); a[a.indexOf("P")] = ".";
        const rel = relicChoices(run, 1, r)[0];
        return rel ? { run: applyReward({ ...run, army: a.join("") }, rel), text: `The altar glows. You got ${rewardLabel(rel).title}!` } : { run, text: "The altar stays quiet." };
      } },
      { label: "Pray", hint: "Heal 1 heart.", go: (run) => ({ run: applyReward(run, { t: "heal", n: 1 }), text: "You feel better." }) },
      leave,
    ],
  },
  {
    title: "Training Grounds",
    text: "An old coach offers lessons. Hard ones.",
    choices: [
      { label: "Pay 30 gold", hint: "Train your weakest piece.", ok: (x) => x.gold >= 30 && canTake(x, { t: "upgrade" }), go: (run) => ({ run: applyReward({ ...run, gold: run.gold - 30 }, { t: "upgrade" }), text: "Your piece levels up!" }) },
      { label: "Train hard", hint: "Lose 1 heart, train twice.", ok: (x) => x.hearts > 1, go: (run) => ({ run: applyReward(applyReward({ ...run, hearts: run.hearts - 1 }, { t: "upgrade" }), { t: "upgrade" }), text: "Ouch. But two pieces level up!" }) },
      leave,
    ],
  },
  {
    title: "Ambush!",
    text: "Bots jump out of the bushes! Fight them, or drop some gold and run.",
    choices: [
      { label: "Fight", hint: "A battle with a big gold reward.", go: (run) => ({ run, text: "To battle!", fight: true }) },
      { label: "Throw 15 gold and run", hint: "Lose 15 gold.", ok: (x) => x.gold >= 15, go: (run) => ({ run: { ...run, gold: run.gold - 15 }, text: "They chase the coins. You escape." }) },
    ],
  },
  {
    title: "Lost Card Pack",
    text: "A shiny pack lies in the grass, guarded by thorns.",
    choices: [
      { label: "Reach through the thorns", hint: "Lose 1 heart, gain 2 random cards.", ok: (x) => x.hearts > 1, go: (run, r) => ({ run: applyReward(applyReward({ ...run, hearts: run.hearts - 1 }, { t: "card", card: pick(r, CARD_KEYS) }), { t: "card", card: pick(r, CARD_KEYS) }), text: "Scratched, but two new cards!" }) },
      { label: "Grab one carefully", hint: "Gain 1 random card.", go: (run, r) => { const c = pick(r, CARD_KEYS); return { run: applyReward(run, { t: "card", card: c }), text: `You got a ${CARD_INFO[c].name} card.` }; } },
    ],
  },
  {
    title: "Healing Spring",
    text: "The water sparkles. It could make you stronger, or just better.",
    choices: [
      { label: "Drink deeply", hint: "Heal 2 hearts.", go: (run) => ({ run: applyReward(run, { t: "heal", n: 2 }), text: "Refreshed!" }) },
      { label: "Fill a flask", hint: "Pay 25 gold: +1 max heart.", ok: (x) => x.gold >= 25, go: (run) => ({ run: applyReward({ ...run, gold: run.gold - 25 }, { t: "maxheart" }), text: "Your heart grows stronger." }) },
    ],
  },
  {
    title: "Mirror Shrine",
    text: "A mirror shows your army. One piece steps out of the glass.",
    choices: [
      { label: "Accept the copy", hint: "Copy your best non-queen piece. Lose 1 heart.", ok: (x) => x.hearts > 1 && /[RBN]/.test(x.army), go: (run) => {
        const best = ["R", "B", "N"].find((p) => run.army.includes(p))!.toLowerCase() as "r" | "b" | "n";
        return { run: applyReward({ ...run, hearts: run.hearts - 1 }, { t: "recruit", piece: best }), text: `A second ${PIECE_NAMES[best]} joins you.` };
      } },
      leave,
    ],
  },
  {
    title: "Pawn Parade",
    text: "A marching band of pawns needs a new leader.",
    choices: [
      { label: "Lead them", hint: "+3 pawns.", ok: (x) => x.army.slice(0, 8).includes("."), go: (run) => ({ run: applyReward(run, { t: "pawns", n: 3 }), text: "Pawns fall in line." }) },
      { label: "Trade 2 pawns for a knight", hint: "Lose 2 pawns, gain a knight.", ok: (x) => (x.army.match(/P/g)?.length ?? 0) >= 2, go: (run) => ({ run: applyReward({ ...run, army: run.army.replace("P", ".").replace("P", ".") }, { t: "recruit", piece: "n" }), text: "A knight trots over." }) },
    ],
  },
];

export function eventFor(seed: number): GameEvent {
  return EVENTS[Math.floor(rng(seed)() * EVENTS.length)];
}

// ---------- Saving ----------
export function loadRun<T extends Run>(): T | null {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "null");
    if (v && v.v === 2 && v.map) return v as T;
  } catch {}
  return null;
}
export function saveRun(run: Run | null) {
  try {
    if (run) localStorage.setItem(KEY, JSON.stringify(run));
    else localStorage.removeItem(KEY);
  } catch {}
}
export function loadBest(): Best {
  try {
    const v = JSON.parse(localStorage.getItem(BEST_KEY) ?? "null");
    if (v && typeof v.runs === "number") return { act: v.act ?? 0, clears: v.clears ?? 0, runs: v.runs, wins: v.wins ?? 0 };
  } catch {}
  return { act: 0, clears: 0, runs: 0, wins: 0 };
}
export function saveBest(b: Best) {
  try { localStorage.setItem(BEST_KEY, JSON.stringify(b)); } catch {}
}
