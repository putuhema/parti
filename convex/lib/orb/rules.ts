// Orbwick: an original domino duel for 2–4 wizards (humans and bots), built on a plain double-six set.
// Everyone starts with five tiles; the rest lie face down in the bog. On your turn, cast one tile onto
// either open end of the shared chain, matching pips. Casting a double claims an orb from the pool.
// Casting a "lucky seven" (halves that add to 7) hexes the next wizard: they draw a tile from the bog.
// No match, or want to wait? Draw from the bog instead, which ends your turn.
// You win by holding 3 orbs or by casting your last tile. If the bog is empty and nobody can cast,
// the most orbs wins (ties go to the fewest pips left in hand).
// Pure rules, shared by server and client.

export const SEATS = 4;
export const HAND = 5;
export const ORBS_TO_WIN = 3;
export const POOL = 5;
export const TURN_MS = 30_000;
export const BOT_MS = 1600;
export const LOG_MAX = 6;
export const BOTS = ["bot1", "bot2", "bot3"];
export const BOT_NAMES: Record<string, string> = { bot1: "Brinewhisk", bot2: "Fernwhistle", bot3: "Gloomberry" };
export const isBot = (id: string) => BOTS.includes(id);

export type Tile = [number, number];
export type Placed = { a: number; b: number; by: string }; // a faces left, b faces right
export type Side = "L" | "R";
export type LogItem = {
  n: number;
  who: string;
  kind: "cast" | "draw" | "pass" | "hexed";
  tile?: Tile;
  orb?: boolean;
  hex?: string; // who got hexed
};

export type OrbGame = {
  seq: number;
  players: string[];
  hands: Record<string, Tile[]>;
  bog: Tile[];
  chain: Placed[];
  orbs: Record<string, number>;
  pool: number;
  turn: string;
  turnNo: number;
  passes: number; // blocked passes in a row
  log: LogItem[];
  deadline?: number;
  sched?: number;
  done?: { winner: string | null; reason: "orbs" | "empty" | "blocked" | "left" };
};

type Rng = () => number;

export const fullSet = (): Tile[] => {
  const s: Tile[] = [];
  for (let a = 0; a <= 6; a++) for (let b = a; b <= 6; b++) s.push([a, b]);
  return s;
};
export const isDouble = (t: Tile) => t[0] === t[1];
export const isSeven = (t: Tile) => t[0] + t[1] === 7;
export const pips = (h: Tile[]) => h.reduce((s, t) => s + t[0] + t[1], 0);
export const ends = (g: OrbGame) => ({ L: g.chain[0].a, R: g.chain[g.chain.length - 1].b });
const timeFor = (who: string) => (isBot(who) ? BOT_MS : TURN_MS);

/** Which sides this tile can go on. */
export function fits(g: OrbGame, t: Tile): Side[] {
  const e = ends(g);
  const out: Side[] = [];
  if (t[0] === e.L || t[1] === e.L) out.push("L");
  if (t[0] === e.R || t[1] === e.R) out.push("R");
  return out;
}
export const canCast = (g: OrbGame, who: string) => (g.hands[who] ?? []).some((t) => fits(g, t).length > 0);

function shuffle<T>(a: T[], r: Rng) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function newGame(humans: string[], bots: number, r: Rng, now: number): OrbGame {
  const seats = shuffle([...humans, ...BOTS.slice(0, Math.max(0, Math.min(SEATS - humans.length, bots)))], r);
  const bog = shuffle(fullSet(), r);
  const hands: Record<string, Tile[]> = {};
  for (const p of seats) hands[p] = bog.splice(0, HAND);
  // The opening tile: the first non-double off the top, so the chain starts with two different ends.
  const k = bog.findIndex((t) => !isDouble(t));
  const [start] = bog.splice(k, 1);
  return {
    seq: 0,
    players: seats,
    hands,
    bog,
    chain: [{ a: start[0], b: start[1], by: "" }],
    orbs: Object.fromEntries(seats.map((p) => [p, 0])),
    pool: POOL,
    turn: seats[0],
    turnNo: 0,
    passes: 0,
    log: [],
    deadline: now + timeFor(seats[0]),
  };
}

const next = (g: OrbGame, who: string) => g.players[(g.players.indexOf(who) + 1) % g.players.length];

function push(g: OrbGame, item: Omit<LogItem, "n">) {
  g.log = [...g.log, { ...item, n: g.turnNo }].slice(-LOG_MAX);
}

function endTurn(g: OrbGame, who: string, now: number) {
  g.turnNo += 1;
  g.turn = next(g, who);
  g.deadline = now + timeFor(g.turn);
}

function finish(g: OrbGame, winner: string | null, reason: NonNullable<OrbGame["done"]>["reason"]) {
  g.done = { winner, reason };
  g.deadline = undefined;
}

/** Standings: most orbs, then fewest pips in hand. */
export function standings(g: OrbGame) {
  return [...g.players].sort((a, b) => g.orbs[b] - g.orbs[a] || pips(g.hands[a]) - pips(g.hands[b]));
}

/** Cast the tile at `index` from `who`'s hand onto side `side`. Returns an error message or null. */
export function cast(g: OrbGame, who: string, index: number, side: Side, now: number) {
  if (g.done) return "The duel is over";
  if (g.turn !== who) return "It's not your turn";
  const hand = g.hands[who];
  const t = hand?.[index];
  if (!t) return "That tile isn't in your hand";
  if (!fits(g, t).includes(side)) return "That tile doesn't match that end";
  const e = ends(g);
  if (side === "L") {
    const [a, b] = t[1] === e.L ? [t[0], t[1]] : [t[1], t[0]];
    g.chain = [{ a, b, by: who }, ...g.chain];
  } else {
    const [a, b] = t[0] === e.R ? [t[0], t[1]] : [t[1], t[0]];
    g.chain = [...g.chain, { a, b, by: who }];
  }
  g.hands[who] = hand.filter((_, i) => i !== index);
  g.passes = 0;
  const orb = isDouble(t) && g.pool > 0;
  if (orb) { g.pool -= 1; g.orbs[who] += 1; }
  const victim = next(g, who);
  const hex = isSeven(t) && victim !== who && g.bog.length > 0 ? victim : undefined;
  if (hex) g.hands[hex] = [...g.hands[hex], g.bog.pop()!];
  push(g, { who, kind: "cast", tile: [t[0], t[1]], orb, hex });
  if (g.orbs[who] >= ORBS_TO_WIN) return finish(g, who, "orbs"), null;
  if (g.hands[who].length === 0) return finish(g, who, "empty"), null;
  endTurn(g, who, now);
  return null;
}

/** Draw one tile from the bog (ends your turn). With an empty bog this is a pass. */
export function draw(g: OrbGame, who: string, now: number) {
  if (g.done) return "The duel is over";
  if (g.turn !== who) return "It's not your turn";
  if (g.bog.length > 0) {
    g.hands[who] = [...g.hands[who], g.bog.pop()!];
    g.passes = 0;
    push(g, { who, kind: "draw" });
  } else {
    if (canCast(g, who)) return "The bog is empty: you have a tile that fits";
    g.passes += 1;
    push(g, { who, kind: "pass" });
    if (g.passes >= g.players.length) {
      finish(g, standings(g)[0], "blocked");
      return null;
    }
  }
  endTurn(g, who, now);
  return null;
}

/** Bots (and wizards whose clock ran out): double first, then a hex, then the heaviest tile; else draw. */
export function bestMove(g: OrbGame, who: string): { index: number; side: Side } | null {
  const hand = g.hands[who] ?? [];
  let best: { index: number; side: Side; score: number } | null = null;
  hand.forEach((t, index) => {
    for (const side of fits(g, t)) {
      const score = (isDouble(t) && g.pool > 0 ? 100 : 0) + (isSeven(t) ? 40 : 0) + t[0] + t[1];
      if (!best || score > best.score) best = { index, side, score };
    }
  });
  return best;
}

export function autoAct(g: OrbGame, now: number) {
  if (g.done) return;
  const m = bestMove(g, g.turn);
  if (m) cast(g, g.turn, m.index, m.side, now);
  else draw(g, g.turn, now);
}

/** Someone left mid-duel: a bot takes their seat and hand. */
export function replaceWithBot(g: OrbGame, who: string) {
  const bot = BOTS.find((b) => !g.players.includes(b));
  if (!bot) return;
  const swap = (p: string) => (p === who ? bot : p);
  g.players = g.players.map(swap);
  g.hands[bot] = g.hands[who];
  g.orbs[bot] = g.orbs[who];
  delete g.hands[who];
  delete g.orbs[who];
  g.turn = swap(g.turn);
  g.chain = g.chain.map((c) => ({ ...c, by: swap(c.by) }));
  g.log = g.log.map((l) => ({ ...l, who: swap(l.who), hex: l.hex ? swap(l.hex) : undefined }));
}
