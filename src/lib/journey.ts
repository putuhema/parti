// Chess Journey: a roguelike run of bot battles with rewards in between.
// Pure data + rules here; the screens live in app/chess/journey.
import type { Card } from "../../convex/lib/chess";

export const FLOORS = 8;
export const KEY = "parti:journey";
export const BEST_KEY = "parti:journey-best";

export type NodeKind = "battle" | "elite" | "treasure" | "rest" | "mystery" | "boss";
export type Twist = "none" | "threecheck" | "pawnstorm" | "blitz";
export interface MapNode { kind: NodeKind; twist: Twist }

export type RelicId = "locket" | "eyes" | "turner" | "pickpocket" | "double" | "march" | "clover" | "vampire";
export interface Relic { id: RelicId; name: string; text: string; color: string }

export const RELICS: Record<RelicId, Relic> = {
  locket: { id: "locket", name: "Heart Locket", text: "+1 max heart, and heal fully.", color: "#FF4B4B" },
  eyes: { id: "eyes", name: "Owl Eyes", text: "+1 hint every battle.", color: "#FFC800" },
  turner: { id: "turner", name: "Time Turner", text: "+1 take-back every battle.", color: "#CE82FF" },
  pickpocket: { id: "pickpocket", name: "Pickpocket", text: "Enemies start each battle missing a piece.", color: "#6F6F6F" },
  double: { id: "double", name: "Battle Cry", text: "Your first turn each battle, you move twice.", color: "#FF9600" },
  march: { id: "march", name: "Forward March", text: "Your pawns start one square ahead.", color: "#58CC02" },
  clover: { id: "clover", name: "Lucky Clover", text: "Rewards offer 4 choices instead of 3.", color: "#2BB673" },
  vampire: { id: "vampire", name: "Vampire Fang", text: "Win a battle in under 25 moves to heal 1 heart.", color: "#B81F1F" },
};

export type Reward =
  | { t: "recruit"; piece: "n" | "b" | "r" | "q" }
  | { t: "pawns"; n: number }
  | { t: "upgrade" }
  | { t: "card"; card: Card }
  | { t: "relic"; id: RelicId }
  | { t: "heal" };

export interface Run {
  floor: number; // 0-based index of the next floor to play
  hearts: number;
  maxHearts: number;
  army: string; // 16 chars: rank 2 (a..h) then rank 1 (a..h), uppercase pieces or "."
  cards: Record<Card, number>;
  relics: RelicId[];
  map: MapNode[][]; // choices per floor
  picked: number[]; // which choice was taken on each floor so far
  wins: number;
  log: string[];
  seed: number;
}

export interface Best { floor: number; clears: number; runs: number }

export const START_ARMY = "PPPPPPPP.N..K.N.";

const CARD_KEYS: Card[] = ["shield", "freeze", "swap", "rocket"];
export const CARD_INFO: Record<Card, { name: string; face: string; edge: string; icon: string; help: string }> = {
  shield: { name: "Shield", face: "#FFC800", edge: "#E5A800", icon: "M12 3 L20 6 V12 C20 17 16 20 12 21 C8 20 4 17 4 12 V6z", help: "Tap one of your pieces to protect it until your next turn." },
  freeze: { name: "Freeze", face: "#1CB0F6", edge: "#1899D6", icon: "M12 2 v20 M3.3 7 l17.4 10 M3.3 17 L20.7 7", help: "Tap an enemy piece. It can't move for 2 turns." },
  swap: { name: "Swap", face: "#CE82FF", edge: "#A568CC", icon: "M7 4 L3 8 L7 12 M3 8 H17 M17 12 L21 16 L17 20 M21 16 H7", help: "Tap two of your pieces to trade places. Uses your move." },
  rocket: { name: "Rocket", face: "#FF9600", edge: "#E08600", icon: "M6 13 L12 7 L18 13 M6 19 L12 13 L18 19", help: "Tap a pawn to jump it two squares. Uses your move." },
};

export const NODE_INFO: Record<NodeKind, { name: string; sub: string; face: string; edge: string; icon: string }> = {
  battle: { name: "Battle", sub: "Beat a bot, pick a reward", face: "#1CB0F6", edge: "#1899D6", icon: "M4 20 L20 4 M14 4 h6 v6 M20 20 L4 4 M4 10 V4 h6" },
  elite: { name: "Elite", sub: "Tougher bot, rare reward", face: "#FF4B4B", edge: "#EA2B2B", icon: "M12 2 L15 9 L22 9.5 L16.5 14 L18.5 21 L12 17 L5.5 21 L7.5 14 L2 9.5 L9 9z" },
  treasure: { name: "Treasure", sub: "Free relic, no fight", face: "#FFC800", edge: "#E5A800", icon: "M3 10 h18 v10 H3z M3 10 l2-5 h14 l2 5 M12 10 v10 M10 14 h4" },
  rest: { name: "Campfire", sub: "Heal or train a pawn", face: "#58CC02", edge: "#46A302", icon: "M12 3 c3 4 5 6 5 9 a5 5 0 0 1 -10 0 c0-2 1-3 2-4 c0 2 1 3 2 3 c0-3 -1-5 1-8z M5 21 L19 17 M5 17 L19 21" },
  mystery: { name: "Mystery", sub: "Something strange…", face: "#CE82FF", edge: "#A568CC", icon: "M9 9 a3 3 0 1 1 4 2.8 c-.8 .4 -1 1 -1 2 M12 17 h.01" },
  boss: { name: "King Bolt", sub: "The final boss", face: "#4B4B4B", edge: "#262626", icon: "M3 18 h18 l-2-11 -4.5 4.5 L12 4 9.5 11.5 5 7z" },
};

export const TWIST_INFO: Record<Twist, { name: string; text: string } | null> = {
  none: null,
  threecheck: { name: "Three-Check", text: "Give 3 checks to win (so can they!)" },
  pawnstorm: { name: "Pawn Storm", text: "The enemy brings a full row of pawns" },
  blitz: { name: "Blitz", text: "Win within 30 of your moves or it's a loss" },
};

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
const pick = <T,>(r: () => number, list: T[]) => list[Math.floor(r() * list.length)];

// ---------- New run ----------
function makeMap(r: () => number): MapNode[][] {
  const out: MapNode[][] = [];
  for (let f = 0; f < FLOORS; f++) {
    if (f === 0) { out.push([{ kind: "battle", twist: "none" }]); continue; }
    if (f === FLOORS - 1) { out.push([{ kind: "boss", twist: "none" }]); continue; }
    const twist = (): Twist => (r() < 0.35 ? pick(r, ["threecheck", "pawnstorm", "blitz"] as Twist[]) : "none");
    const pool: NodeKind[] = f === FLOORS - 2 ? ["rest", "treasure", "elite"] : ["battle", "battle", "elite", "treasure", "rest", "mystery"];
    const n = f % 2 === 0 ? 3 : 2;
    const kinds = new Set<NodeKind>();
    kinds.add(f === FLOORS - 2 ? pick(r, ["rest", "treasure"] as NodeKind[]) : "battle"); // always one safe-ish path
    while (kinds.size < n) kinds.add(pick(r, pool));
    out.push([...kinds].map((kind) => ({ kind, twist: kind === "battle" || kind === "elite" ? twist() : "none" })));
  }
  return out;
}

export function newRun(seed = Math.floor(Math.random() * 1e9)): Run {
  const r = rng(seed);
  return {
    floor: 0,
    hearts: 3,
    maxHearts: 3,
    army: START_ARMY,
    cards: { shield: 1, freeze: 0, swap: 0, rocket: 1 },
    relics: [],
    map: makeMap(r),
    picked: [],
    wins: 0,
    log: [],
    seed,
  };
}

// ---------- Battles ----------
export interface Battle {
  fen: string;
  level: number;
  name: string;
  hints: number;
  takebacks: number;
  twist: Twist;
  double: boolean;
}

const BOT_NAMES = ["Pip the Pawnbot", "Rusty", "Clank", "Sir Bolts-a-lot", "Gizmo", "Widget", "Captain Cog", "Duchess Dynamo"];

function enemyArmy(budget: number, r: () => number, pawnRow: boolean): string[] {
  // Returns [rank 8, rank 7] as 8-char strings, lowercase.
  const back = Array(8).fill(".");
  const pawns = Array(8).fill(".");
  back[4] = "k";
  let left = budget;
  if (pawnRow) { pawns.fill("p"); left -= 8; }
  const minPawns = Math.min(8, 2 + Math.floor(budget / 12));
  const freePawn = () => pawns.map((p, i) => (p === "." ? i : -1)).filter((i) => i >= 0);
  while (pawns.filter((p) => p === "p").length < minPawns && left > 0) { pawns[pick(r, freePawn())] = "p"; left -= 1; }
  const homes: Record<string, number[]> = { q: [3], r: [0, 7], b: [2, 5], n: [1, 6] };
  const cost: Record<string, number> = { q: 9, r: 5, b: 3, n: 3, p: 1 };
  for (let guard = 0; guard < 40 && left > 0; guard++) {
    const options = (["q", "r", "b", "n", "p"] as const).filter((t) => cost[t] <= left && (t === "p" ? freePawn().length > 0 : back.includes(".")));
    if (!options.length) break;
    const weights = options.map((t) => (t === "p" ? 2 : t === "q" ? (budget > 24 ? 1.2 : 0.3) : 1.5));
    let x = r() * weights.reduce((a, b) => a + b, 0), t = options[0];
    for (let k = 0; k < options.length; k++) { x -= weights[k]; if (x <= 0) { t = options[k]; break; } }
    if (t === "p") pawns[pick(r, freePawn())] = "p";
    else {
      const spot = homes[t].find((i) => back[i] === ".") ?? back.findIndex((c) => c === ".");
      back[spot] = t;
    }
    left -= cost[t];
  }
  return [back.join(""), pawns.join("")];
}

export function budgetFor(floor: number, kind: NodeKind) {
  if (kind === "boss") return 40;
  return 9 + floor * 4 + (kind === "elite" ? 7 : 0);
}

export function levelFor(floor: number, kind: NodeKind) {
  if (kind === "boss") return 3;
  const base = floor < 2 ? 1 : floor < 5 ? 2 : 3;
  return Math.min(3, base + (kind === "elite" ? 1 : 0));
}

export function battleFor(run: Run, node: MapNode): Battle {
  const r = rng(run.seed + run.floor * 7919 + run.picked.length * 31);
  const kind = node.kind;
  let [b8, b7] = kind === "boss" ? ["rnbqkbnr", "pp.pp.pp"] : enemyArmy(budgetFor(run.floor, kind), r, node.twist === "pawnstorm");
  if (run.relics.includes("pickpocket")) {
    const cells = (b8 + b7).split("");
    const victims = cells.map((c, i) => (c !== "." && c !== "k" ? i : -1)).filter((i) => i >= 0);
    // The boss loses a minor piece, others a random piece.
    const minor = victims.filter((i) => "nb".includes(cells[i]));
    const v = kind === "boss" && minor.length ? pick(r, minor) : victims.length ? pick(r, victims) : -1;
    if (v >= 0) cells[v] = ".";
    b8 = cells.slice(0, 8).join("");
    b7 = cells.slice(8).join("");
  }
  let r2 = run.army.slice(0, 8);
  const r1 = run.army.slice(8);
  let r3 = "........";
  if (run.relics.includes("march")) { r3 = r2.replace(/[^P]/g, "."); r2 = r2.replace(/P/g, "."); }
  const rank = (s: string) => s.replace(/\.+/g, (m) => String(m.length));
  const fen = `${rank(b8)}/${rank(b7)}/8/8/8/${rank(r3)}/${rank(r2)}/${rank(r1)} w - - 0 1`;
  const count = (id: RelicId) => run.relics.filter((x) => x === id).length;
  return {
    fen,
    level: levelFor(run.floor, kind),
    name: kind === "boss" ? "King Bolt" : pick(r, BOT_NAMES),
    hints: 1 + count("eyes"),
    takebacks: 1 + count("turner"),
    twist: node.twist,
    double: run.relics.includes("double"),
  };
}

// ---------- Rewards ----------
export function rewardsFor(run: Run, kind: NodeKind, r: () => number = Math.random): Reward[] {
  const n = run.relics.includes("clover") ? 4 : 3;
  const free = RELIC_POOL.filter((id) => !run.relics.includes(id) || id === "eyes" || id === "turner");
  const pool: Reward[] = [
    { t: "recruit", piece: "n" },
    { t: "recruit", piece: "b" },
    { t: "recruit", piece: r() < 0.5 ? "r" : "n" },
    { t: "pawns", n: 2 },
    { t: "upgrade" },
    { t: "card", card: pick(r, CARD_KEYS) },
    { t: "card", card: pick(r, CARD_KEYS) },
  ];
  if (run.hearts < run.maxHearts) pool.push({ t: "heal" });
  if (kind === "elite" || kind === "treasure") {
    pool.length = 0;
    pool.push({ t: "recruit", piece: "q" }, { t: "recruit", piece: "r" });
    for (const id of free) pool.push({ t: "relic", id });
  } else if (r() < 0.4 && free.length) pool.push({ t: "relic", id: pick(r, free) });
  const out: Reward[] = [];
  const key = (x: Reward) => JSON.stringify(x);
  for (let g = 0; g < 50 && out.length < n && pool.length; g++) {
    const c = pick(r, pool);
    if (!out.some((o) => key(o) === key(c)) && canTake(run, c)) out.push(c);
  }
  return out;
}

const RELIC_POOL: RelicId[] = ["locket", "eyes", "turner", "pickpocket", "double", "march", "clover", "vampire"];

export function canTake(run: Run, r: Reward) {
  const a = run.army;
  if (r.t === "recruit") return a.slice(8).includes(".") || a.slice(0, 8).includes("P");
  if (r.t === "pawns") return a.slice(0, 8).includes(".");
  if (r.t === "upgrade") return /[PNB]/.test(a.replace("K", ""));
  return true;
}

export function rewardLabel(r: Reward): { title: string; text: string } {
  const NAMES = { n: "Knight", b: "Bishop", r: "Rook", q: "Queen" } as const;
  switch (r.t) {
    case "recruit": return { title: `Recruit a ${NAMES[r.piece]}`, text: "Joins your army for the rest of the run." };
    case "pawns": return { title: `+${r.n} pawns`, text: "Fill gaps in your front line." };
    case "upgrade": return { title: "Training", text: "Your weakest piece levels up (pawn → knight → rook)." };
    case "card": return { title: `${CARD_INFO[r.card].name} card`, text: `+1 use every battle. ${CARD_INFO[r.card].help}` };
    case "relic": return { title: RELICS[r.id].name, text: RELICS[r.id].text };
    case "heal": return { title: "Heal", text: "Get 1 heart back." };
  }
}

/** Put a piece into the army: back rank first (home squares), else replace a pawn. */
function place(army: string, piece: string): string {
  const a = army.split("");
  const homes: Record<string, number[]> = { Q: [11], R: [8, 15], B: [10, 13], N: [9, 14] };
  let spot = (homes[piece] ?? []).find((i) => a[i] === ".");
  if (spot === undefined) spot = [11, 10, 13, 9, 14, 8, 15, 12].find((i) => a[i] === ".");
  if (spot === undefined) spot = a.findIndex((c, i) => i < 8 && c === "P");
  if (spot === undefined || spot < 0) return army;
  a[spot] = piece;
  return a.join("");
}

export function applyReward(run: Run, r: Reward): Run {
  const next: Run = { ...run, cards: { ...run.cards }, relics: [...run.relics] };
  switch (r.t) {
    case "recruit": next.army = place(run.army, r.piece.toUpperCase()); break;
    case "pawns": {
      const a = run.army.split("");
      let left = r.n;
      for (const i of [3, 4, 2, 5, 1, 6, 0, 7]) if (left > 0 && a[i] === ".") { a[i] = "P"; left--; }
      next.army = a.join("");
      break;
    }
    case "upgrade": {
      const a = run.army.split("");
      const ladder: Record<string, string> = { P: "N", N: "R", B: "R" };
      const order = ["P", "N", "B"];
      for (const t of order) {
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
    case "heal": next.hearts = Math.min(run.maxHearts, run.hearts + 1); break;
  }
  return next;
}

// ---------- Mystery events ----------
export interface Mystery { title: string; text: string; apply: (run: Run) => Run }

export function mysteryFor(run: Run, r: () => number = Math.random): Mystery {
  const events: Mystery[] = [
    { title: "A wandering knight", text: "A knight with no kingdom asks to join you.", apply: (x) => applyReward(x, { t: "recruit", piece: "n" }) },
    { title: "Old card shop", text: "The shopkeeper slides you a dusty card for free.", apply: (x) => applyReward(x, { t: "card", card: pick(r, CARD_KEYS) }) },
    { title: "Healing spring", text: "You drink from a glowing spring. Fully healed!", apply: (x) => ({ ...x, hearts: x.maxHearts }) },
    { title: "Trapdoor!", text: "A pawn falls through the floor… but finds a relic down there.", apply: (x) => {
      const a = x.army.split(""); const i = a.findIndex((c) => c === "P"); if (i >= 0) a[i] = ".";
      const free = RELIC_POOL.filter((id) => !x.relics.includes(id));
      const y = { ...x, army: a.join("") };
      return free.length ? applyReward(y, { t: "relic", id: pick(r, free) }) : y;
    } },
    { title: "Bolt's toolbox", text: "Spare parts everywhere. You build a bishop out of them.", apply: (x) => applyReward(x, { t: "recruit", piece: "b" }) },
  ];
  return pick(r, events);
}

// ---------- Saving ----------
export function loadRun(): Run | null {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "null");
    if (v && typeof v.floor === "number" && Array.isArray(v.map)) return v as Run;
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
    if (v && typeof v.floor === "number") return v as Best;
  } catch {}
  return { floor: 0, clears: 0, runs: 0 };
}
export function saveBest(b: Best) {
  try { localStorage.setItem(BEST_KEY, JSON.stringify(b)); } catch {}
}
