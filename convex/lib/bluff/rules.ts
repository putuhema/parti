// Bluff Bay: pirate dice bluffing. Everyone rolls dice in secret. On your turn, raise the bid
// ("four 5s on the table") or call LIAR on the last bid. All dice are revealed: 1s are wild and count
// as any face. If there are at least that many, the caller loses a die; if not, the bidder does.
// Lose all your dice and you're out. Last pirate with dice wins. Bots fill empty seats.
// Pure rules, shared by server and client.

export const SEATS = 6;
export const MIN_SEATS = 2;
export const START_DICE = 5;
export const BOTS = ["bot1", "bot2", "bot3", "bot4", "bot5"];
export const BOT_NAMES: Record<string, string> = { bot1: "Cap'n Koko", bot2: "Salty Pip", bot3: "One-Eyed Momo", bot4: "Barnacle Bea", bot5: "Squawk" };
export const isBot = (id: string) => BOTS.includes(id);

export const TURN_MS = 30_000;
export const BOT_MS = 1900;
export const REVEAL_MS = 7500;
export const REACTS = ["😏", "🤥", "😱", "🤔", "😂", "🫣"] as const;

export type Bid = { qty: number; face: number; by: string };
export type Reveal = { caller: string; bidder: string; bid: Bid; count: number; loser: string; liar: boolean };
export type Peek = { target: string; index: number; value: number; round: number };

export type BluffGame = {
  seq: number;
  players: string[]; // seat order
  dice: Record<string, number[]>;
  round: number;
  turn: string; // whose move it is
  bid: Bid | null;
  bids: Bid[]; // this round, oldest first
  phase: "bid" | "reveal";
  reveal: Reveal | null;
  peeks: Record<string, Peek>; // one per player per game
  out: string[]; // in the order they went out
  reacts: { who: string; e: string; at: number }[];
  deadline?: number;
  sched?: number;
  done?: { winner: string | null; reason: "end" | "left" };
};

type Rng = () => number;
const die = (r: Rng) => 1 + Math.floor(r() * 6);

export const alive = (g: BluffGame) => g.players.filter((p) => g.dice[p].length > 0);
export const totalDice = (g: BluffGame) => alive(g).reduce((n, p) => n + g.dice[p].length, 0);
/** The next player still in, after `who` in seat order. */
export function nextAlive(g: BluffGame, who: string) {
  const n = g.players.length;
  const i = g.players.indexOf(who);
  for (let k = 1; k <= n; k++) {
    const p = g.players[(i + k) % n];
    if (g.dice[p].length > 0) return p;
  }
  return who;
}
const timeFor = (g: BluffGame, who: string) => (isBot(who) ? BOT_MS : TURN_MS);

export function newGame(humans: string[], bots: number, r: Rng, now: number): BluffGame {
  const seats = [...humans, ...BOTS.slice(0, Math.max(0, Math.min(SEATS - humans.length, bots)))];
  for (let i = seats.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [seats[i], seats[j]] = [seats[j], seats[i]];
  }
  const g: BluffGame = {
    seq: 0,
    players: seats,
    dice: Object.fromEntries(seats.map((p) => [p, [] as number[]])),
    round: 1,
    turn: seats[0],
    bid: null,
    bids: [],
    phase: "bid",
    reveal: null,
    peeks: {},
    out: [],
    reacts: [],
  };
  for (const p of seats) g.dice[p] = Array.from({ length: START_DICE }, () => die(r)).sort();
  g.deadline = now + timeFor(g, g.turn);
  return g;
}

/** Is this bid higher than the last one? More dice, or the same number of a higher face. 1s are wild, so you can't bid them. */
export function legal(g: BluffGame, qty: number, face: number) {
  if (!Number.isInteger(qty) || !Number.isInteger(face) || face < 2 || face > 6 || qty < 1 || qty > totalDice(g)) return false;
  const b = g.bid;
  return !b || qty > b.qty || (qty === b.qty && face > b.face);
}
/** The smallest legal bid on a face, or null if none fits on the table. */
export function minQty(g: BluffGame, face: number) {
  const b = g.bid;
  const q = !b ? 1 : face > b.face ? b.qty : b.qty + 1;
  return q <= totalDice(g) ? q : null;
}

export function bid(g: BluffGame, who: string, qty: number, face: number, now: number) {
  if (g.done || g.phase !== "bid") return "Hold on…";
  if (g.turn !== who) return "It's not your turn";
  if (!legal(g, qty, face)) return g.bid ? "You have to bid higher" : "That's not a bid";
  g.bid = { qty, face, by: who };
  g.bids.push(g.bid);
  g.turn = nextAlive(g, who);
  g.deadline = now + timeFor(g, g.turn);
  return null;
}

/** How many dice show this face, counting wild 1s. */
export const countFace = (g: BluffGame, face: number) => alive(g).reduce((n, p) => n + g.dice[p].filter((d) => d === face || d === 1).length, 0);

export function callLiar(g: BluffGame, who: string, now: number) {
  if (g.done || g.phase !== "bid") return "Hold on…";
  if (g.turn !== who) return "It's not your turn";
  if (!g.bid) return "There's no bid to call yet";
  const count = countFace(g, g.bid.face);
  const liar = count < g.bid.qty;
  g.phase = "reveal";
  g.reveal = { caller: who, bidder: g.bid.by, bid: g.bid, count, loser: liar ? g.bid.by : who, liar };
  g.deadline = now + REVEAL_MS;
  return null;
}

/** After the reveal: the loser drops a die, then everyone rolls again. The loser starts. */
export function nextRound(g: BluffGame, r: Rng, now: number) {
  const rev = g.reveal!;
  g.dice[rev.loser] = g.dice[rev.loser].slice(1);
  if (!g.dice[rev.loser].length && !g.out.includes(rev.loser)) g.out.push(rev.loser);
  const left = alive(g);
  if (left.length <= 1) {
    g.done = { winner: left[0] ?? null, reason: "end" };
    g.deadline = undefined;
    return;
  }
  for (const p of left) g.dice[p] = Array.from({ length: g.dice[p].length }, () => die(r)).sort();
  g.round += 1;
  g.bid = null;
  g.bids = [];
  g.reveal = null;
  g.phase = "bid";
  g.turn = g.dice[rev.loser].length ? rev.loser : nextAlive(g, rev.loser);
  g.deadline = now + timeFor(g, g.turn);
}

/** Once a game: secretly look at one die of the next player. */
export function peek(g: BluffGame, who: string, r: Rng) {
  if (g.done || g.phase !== "bid") return "Not now";
  if (!g.dice[who]?.length) return "You're out";
  if (g.peeks[who]) return "You've used your peek";
  const target = nextAlive(g, who);
  if (target === who) return "Nobody to peek at";
  const index = Math.floor(r() * g.dice[target].length);
  g.peeks[who] = { target, index, value: g.dice[target][index], round: g.round };
  return null;
}

export function react(g: BluffGame, who: string, e: string, now: number) {
  if (!(REACTS as readonly string[]).includes(e)) return "Unknown reaction";
  g.reacts = [...g.reacts.filter((x) => now - x.at < 4000), { who, e, at: now }].slice(-8);
  return null;
}

// ---------- Bots (and players who run out of time) ----------
/** A bot's move: guess how many of each face are out there, call LIAR on wild bids, bluff now and then. */
export function botMove(g: BluffGame, who: string, r: Rng): { call: true } | { qty: number; face: number } {
  const mine = g.dice[who];
  const unknown = totalDice(g) - mine.length;
  const expect = (f: number) => mine.filter((d) => d === f || d === 1).length + unknown / 3;
  if (g.bid && g.bid.qty > expect(g.bid.face) + 0.4 + r() * 0.9) return { call: true };
  const faces = [2, 3, 4, 5, 6].filter((f) => minQty(g, f) !== null);
  if (!faces.length) return { call: true };
  // Usually back your best face; sometimes bluff on a random one.
  const face = r() < 0.2 ? faces[Math.floor(r() * faces.length)] : faces.reduce((a, b) => (expect(b) > expect(a) || (expect(b) === expect(a) && b > a) ? b : a));
  let qty = minQty(g, face)!;
  // Open low and let the table climb.
  if (!g.bid) qty = Math.max(1, Math.min(totalDice(g), Math.floor(expect(face) * 0.55 + r())));
  if (g.bid && qty > expect(face) + 1.5) return { call: true };
  return { qty, face };
}

/** The clock ran out: bots move, idle players are moved for, reveals end. */
export function autoAct(g: BluffGame, r: Rng, now: number) {
  if (g.done) return;
  if (g.phase === "reveal") return nextRound(g, r, now);
  const m = botMove(g, g.turn, r);
  if ("call" in m && g.bid) callLiar(g, g.turn, now);
  else if ("qty" in m) bid(g, g.turn, m.qty, m.face, now);
  else bid(g, g.turn, minQty(g, 2) ?? 1, 2, now);
}

/** Someone left mid-game: a bot takes their seat and dice. */
export function replaceWithBot(g: BluffGame, who: string) {
  const bot = BOTS.find((b) => !g.players.includes(b));
  if (!bot) return;
  g.players = g.players.map((p) => (p === who ? bot : p));
  g.dice[bot] = g.dice[who];
  delete g.dice[who];
  if (g.turn === who) g.turn = bot;
  if (g.bid?.by === who) g.bid = { ...g.bid, by: bot };
  g.bids = g.bids.map((b) => (b.by === who ? { ...b, by: bot } : b));
  g.out = g.out.map((p) => (p === who ? bot : p));
  if (g.reveal) {
    const swap = (p: string) => (p === who ? bot : p);
    g.reveal = { ...g.reveal, caller: swap(g.reveal.caller), bidder: swap(g.reveal.bidder), loser: swap(g.reveal.loser), bid: { ...g.reveal.bid, by: swap(g.reveal.bid.by) } };
  }
}

export const humans = (g: BluffGame) => g.players.filter((p) => !isBot(p));
