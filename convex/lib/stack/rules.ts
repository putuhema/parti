// Sky Stack: build one tower together, taking turns. A block slides across the top; tap to drop it.
// Whatever hangs over the edge is sliced off, so the tower gets narrower and the block faster.
// A perfect drop keeps the full width, and three perfects in a row grow it back. Miss completely
// and the tower crashes: you lose a heart and a fresh tower starts. Last builder with hearts wins.
// Playing alone, you get one tower: build it as high as you can.
// Pure rules, shared by server and client.

export const SEATS = 6;
export const BOTS = ["bot1", "bot2", "bot3", "bot4", "bot5"];
export const BOT_NAMES: Record<string, string> = { bot1: "Bolt", bot2: "Crane-y", bot3: "Brick", bot4: "Rivet", bot5: "Girder" };
export const isBot = (id: string) => BOTS.includes(id);

export const W = 100; // tower area width
export const BASE_W = 64; // starting block width
export const PERFECT = 2; // within this, a drop snaps into place
export const GROW = 6; // width back after three perfects in a row
export const LIVES = 2;
export const TURN_MS = 12_000;
export const BOT_MS = 1700;
export const FALL_MS = 2800;

export type Floor = { left: number; width: number; by: string; perfect: boolean };
export type Crash = { who: string; x: number; width: number; height: number };

export type StackGame = {
  seq: number;
  players: string[];
  lives: Record<string, number>;
  floors: Floor[]; // the tower standing now; floors[0] is the ground slab
  turn: string;
  turnNo: number; // counts every drop, so each turn has its own key
  phase: "drop" | "fall";
  streak: number; // perfects in a row on this tower
  crash: Crash | null;
  placed: Record<string, number>; // floors each player built this game
  perfects: Record<string, number>;
  best: { height: number; crashedBy: string | null }; // the tallest tower this game
  out: string[];
  solo: boolean;
  deadline?: number;
  sched?: number;
  done?: { winner: string | null; height: number; reason: "end" | "left" };
};

type Rng = () => number;

export const alive = (g: StackGame) => g.players.filter((p) => g.lives[p] > 0);
export const height = (g: StackGame) => g.floors.length - 1;
export const top = (g: StackGame) => g.floors[g.floors.length - 1];
export const speedAt = (floor: number) => Math.min(150, 42 + floor * 4); // units per second
const timeFor = (who: string) => (isBot(who) ? BOT_MS : TURN_MS);

/** Where the sliding block's left edge is, `ms` into the turn. It bounces between half-hanging off each side. */
export function slide(turnNo: number, floor: number, width: number, ms: number) {
  const min = -width / 2, max = W - width / 2, span = max - min;
  const d = (Math.max(0, ms) / 1000) * speedAt(floor);
  const p = d % (2 * span);
  const off = p <= span ? p : 2 * span - p;
  return turnNo % 2 ? max - off : min + off;
}

function freshTower(): Floor[] {
  return [{ left: (W - BASE_W) / 2, width: BASE_W, by: "", perfect: false }];
}

export function newGame(humans: string[], bots: number, r: Rng, now: number): StackGame {
  const seats = [...humans, ...BOTS.slice(0, Math.max(0, Math.min(SEATS - humans.length, bots)))];
  for (let i = seats.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [seats[i], seats[j]] = [seats[j], seats[i]];
  }
  const solo = seats.length === 1;
  return {
    seq: 0,
    players: seats,
    lives: Object.fromEntries(seats.map((p) => [p, solo ? 1 : LIVES])),
    floors: freshTower(),
    turn: seats[0],
    turnNo: 0,
    phase: "drop",
    streak: 0,
    crash: null,
    placed: Object.fromEntries(seats.map((p) => [p, 0])),
    perfects: Object.fromEntries(seats.map((p) => [p, 0])),
    best: { height: 0, crashedBy: null },
    out: [],
    solo,
    deadline: now + timeFor(seats[0]),
  };
}

function nextAlive(g: StackGame, who: string) {
  const n = g.players.length;
  const i = g.players.indexOf(who);
  for (let k = 1; k <= n; k++) {
    const p = g.players[(i + k) % n];
    if (g.lives[p] > 0) return p;
  }
  return who;
}

/** Put the block down with its left edge at x. */
export function placeAt(g: StackGame, who: string, x: number, now: number) {
  if (g.done || g.phase !== "drop") return "Hold on…";
  if (g.turn !== who) return "It's not your turn";
  const t = top(g);
  const w = t.width;
  const perfect = Math.abs(x - t.left) <= PERFECT;
  const left = perfect ? t.left : Math.max(x, t.left);
  const right = perfect ? t.left + w : Math.min(x + w, t.left + w);
  g.turnNo += 1;
  if (right - left <= 0.5) {
    // Missed: the tower comes down.
    g.phase = "fall";
    g.crash = { who, x, width: w, height: height(g) };
    if (height(g) > g.best.height) g.best = { height: height(g), crashedBy: who };
    g.lives[who] = Math.max(0, g.lives[who] - 1);
    if (g.lives[who] === 0 && !g.out.includes(who)) g.out.push(who);
    g.deadline = now + FALL_MS;
    return null;
  }
  g.streak = perfect ? g.streak + 1 : 0;
  let width = right - left;
  let l = left;
  if (perfect && g.streak >= 3) {
    // Three perfects in a row: the block grows back a little, centred.
    const grown = Math.min(BASE_W, width + GROW);
    l = Math.max(0, Math.min(W - grown, l - (grown - width) / 2));
    width = grown;
    g.streak = 0;
  }
  g.floors.push({ left: round(l), width: round(width), by: who, perfect });
  g.placed[who] = (g.placed[who] ?? 0) + 1;
  if (perfect) g.perfects[who] = (g.perfects[who] ?? 0) + 1;
  if (height(g) > g.best.height) g.best = { height: height(g), crashedBy: null };
  g.turn = g.solo ? who : nextAlive(g, who);
  g.deadline = now + timeFor(g.turn);
  return null;
}
const round = (n: number) => Math.round(n * 100) / 100;

/** A human taps `ms` into their turn. */
export function drop(g: StackGame, who: string, ms: number, now: number) {
  if (g.done || g.phase !== "drop" || g.turn !== who) return g.turn !== who ? "It's not your turn" : "Hold on…";
  const t = top(g);
  return placeAt(g, who, slide(g.turnNo, height(g), t.width, Math.min(Math.max(0, ms), TURN_MS)), now);
}

/** After a crash: a fresh tower, the next builder starts; or the game ends. */
export function afterFall(g: StackGame, now: number) {
  const who = g.crash?.who ?? g.turn;
  const left = alive(g);
  if (g.solo || left.length <= 1) {
    g.done = { winner: g.solo ? null : left[0] ?? null, height: g.best.height, reason: "end" };
    g.deadline = undefined;
    return;
  }
  g.floors = freshTower();
  g.streak = 0;
  g.phase = "drop";
  g.turn = nextAlive(g, who);
  g.crash = null;
  g.deadline = now + timeFor(g.turn);
}

/** Bots aim for the edge and wobble more as the block speeds up. */
export function botX(g: StackGame, r: Rng) {
  const t = top(g);
  const sd = 1.2 + speedAt(height(g)) / 22;
  const noise = (r() + r() + r() - 1.5) * 2 * sd; // roughly bell-shaped
  return t.left + noise;
}

/** The clock ran out: bots drop, idle players drop wherever the block is, crashes clear. */
export function autoAct(g: StackGame, r: Rng, now: number) {
  if (g.done) return;
  if (g.phase === "fall") return afterFall(g, now);
  if (isBot(g.turn)) placeAt(g, g.turn, botX(g, r), now);
  else drop(g, g.turn, TURN_MS, now);
}

/** Someone left mid-game: a bot takes their seat. */
export function replaceWithBot(g: StackGame, who: string) {
  const bot = BOTS.find((b) => !g.players.includes(b));
  if (!bot) return;
  const swap = (p: string) => (p === who ? bot : p);
  g.players = g.players.map(swap);
  g.lives[bot] = g.lives[who];
  g.placed[bot] = g.placed[who] ?? 0;
  g.perfects[bot] = g.perfects[who] ?? 0;
  delete g.lives[who];
  g.turn = swap(g.turn);
  g.out = g.out.map(swap);
  g.floors = g.floors.map((f) => ({ ...f, by: swap(f.by) }));
  if (g.crash) g.crash = { ...g.crash, who: swap(g.crash.who) };
  g.solo = false;
}
