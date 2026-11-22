// Lucky Island: a party board game. Up to four players (bots fill empty seats) roll a die and hop
// around a 24-space island. Blue spaces give coins, red ones take them, ❓ spaces trigger events,
// 🛍️ shops sell items. Pass the 💎 Gem Shrine with 20 coins to buy a gem; then it moves.
// After everyone has moved, all players play the same quick minigame for coins.
// Most gems after the last round wins. Pure rules, shared by server and client.

import { MICROS, microOf, placePoints, type MicroId } from "../party/rules";

export type Space = "blue" | "red" | "event" | "shop";
// The loop, clockwise from the top-left corner. Index 0 is the start.
export const BOARD: Space[] = [
  "blue", "blue", "event", "blue", "red", "blue",
  "shop", "blue", "blue", "event", "blue", "red",
  "blue", "blue", "event", "blue", "shop", "blue",
  "red", "blue", "event", "blue", "blue", "red",
];
export const N = BOARD.length;
export const COLS = 7, ROWS = 7;

/** Where space i sits on a 7×7 grid (the board runs around the edge). */
export function cellOf(i: number) {
  if (i < 6) return { col: i, row: 0 };
  if (i < 12) return { col: 6, row: i - 6 };
  if (i < 18) return { col: 6 - (i - 12), row: 6 };
  return { col: 0, row: 6 - (i - 18) };
}

export const BOTS = ["bot1", "bot2", "bot3"];
export const BOT_NAMES: Record<string, string> = { bot1: "Koko", bot2: "Pip", bot3: "Momo" };
export const isBot = (id: string) => id.startsWith("bot");
export const SEATS = 4;

export const START_COINS = 10;
export const BLUE_COINS = 3;
export const RED_COINS = 3;
export const GEM_COST = 20;
export const MAX_ITEMS = 2;
export const ROUND_CHOICES = [5, 8, 12] as const;
export const MINI_COINS = [10, 6, 3, 1]; // by minigame place

export type ItemId = "double" | "warp";
export const ITEMS: Record<ItemId, { name: string; icon: string; cost: number; about: string }> = {
  double: { name: "Double Dice", icon: "🎲🎲", cost: 8, about: "Roll two dice next turn" },
  warp: { name: "Shrine Warp", icon: "🌀", cost: 15, about: "Warp right next to the Gem Shrine" },
};

// Timers
export const ROLL_MS = 25_000;
export const CHOICE_MS = 12_000;
export const BOT_MS = 1400;
export const MOVE_MS_PER_STEP = 260; // how long the hop animation takes per space
export const MINI_INTRO_MS = 4000;
export const MINI_GRACE_MS = 2500;
export const MINI_REVEAL_MS = 7000;

/** `text` may contain "{other}", which is drawn as the other player's name. */
export type LogEntry = { n: number; who: string; text: string; tone: "good" | "bad" | "info" | "gem"; other?: string };
export type Move = { n: number; who: string; path: number[]; dice: number[] };

export type IslandGame = {
  seq: number;
  players: string[]; // turn order; bots included
  coins: Record<string, number>;
  gems: Record<string, number>;
  pos: Record<string, number>;
  items: Record<string, ItemId[]>;
  armed: Record<string, ItemId | null>; // item a player chose to use for this roll
  shrine: number;
  turn: number; // index into players
  round: number; // 1-based
  maxRounds: number;
  phase: "roll" | "shrine" | "shop" | "mini" | "miniReveal";
  pending: { who: string; left: number; path: number[]; dice: number[] } | null; // a move paused at the shrine
  lastMove: Move | null;
  log: LogEntry[];
  mini: { micro: MicroId; seed: number; startAt: number; scores: Record<string, number> } | null;
  miniWins: Record<string, number>;
  minis: { round: number; micro: MicroId; scores: Record<string, number>; coins: Record<string, number> }[];
  deadline?: number;
  sched?: number;
  done?: { winners: string[]; bonus: string[]; reason: "end" | "left" };
};

type Rng = () => number;
const die = (r: Rng) => 1 + Math.floor(r() * 6);

function say(g: IslandGame, who: string, text: string, tone: LogEntry["tone"], other?: string) {
  const n = (g.log.at(-1)?.n ?? 0) + 1;
  g.log = [...g.log, { n, who, text, tone, ...(other ? { other } : {}) }].slice(-30);
}

export const current = (g: IslandGame) => g.players[g.turn];

function pickShrine(g: IslandGame, r: Rng) {
  const options = BOARD.map((s, i) => i).filter((i) => BOARD[i] === "blue" && i !== g.shrine && !Object.values(g.pos).includes(i));
  g.shrine = options[Math.floor(r() * options.length)] ?? g.shrine;
}

export function newGame(humans: string[], maxRounds: number, r: Rng, now: number): IslandGame {
  const players = [...humans, ...BOTS].slice(0, Math.max(SEATS, humans.length));
  const order = players.sort(() => r() - 0.5);
  const g: IslandGame = {
    seq: 0, players: order,
    coins: Object.fromEntries(order.map((p) => [p, START_COINS])),
    gems: Object.fromEntries(order.map((p) => [p, 0])),
    pos: Object.fromEntries(order.map((p) => [p, 0])),
    items: Object.fromEntries(order.map((p) => [p, []])),
    armed: Object.fromEntries(order.map((p) => [p, null])),
    shrine: 0, turn: 0, round: 1, maxRounds, phase: "roll", pending: null, lastMove: null, log: [], mini: null,
    miniWins: Object.fromEntries(order.map((p) => [p, 0])), minis: [],
  };
  g.shrine = 12;
  pickShrine(g, r);
  startTurn(g, now);
  return g;
}

function startTurn(g: IslandGame, now: number) {
  g.phase = "roll";
  g.deadline = now + (isBot(current(g)) ? BOT_MS : ROLL_MS);
}

/** Arm an item before rolling (or disarm with null). */
export function arm(g: IslandGame, p: string, item: ItemId | null): string | null {
  if (g.done || g.phase !== "roll" || current(g) !== p) return "Not your turn";
  if (item && !g.items[p].includes(item)) return "You don't have that";
  g.armed[p] = item;
  return null;
}

/** Roll and move. Stops at the Gem Shrine if you can afford a gem. */
export function roll(g: IslandGame, p: string, r: Rng, now: number): string | null {
  if (g.done || g.phase !== "roll" || current(g) !== p) return "Not your turn";
  const item = g.armed[p];
  if (item) {
    g.items[p] = g.items[p].filter((x, i) => i !== g.items[p].indexOf(item));
    g.armed[p] = null;
  }
  if (item === "warp") {
    const to = (g.shrine - 1 + N) % N;
    g.pos[p] = to;
    say(g, p, `warped next to the Gem Shrine! 🌀`, "info");
    g.lastMove = { n: (g.lastMove?.n ?? 0) + 1, who: p, path: [to], dice: [] };
    // Then a normal roll from there.
  }
  const dice = item === "double" ? [die(r), die(r)] : [die(r)];
  const steps = dice.reduce((a, b) => a + b, 0);
  say(g, p, `rolled ${dice.join(" + ")}${dice.length > 1 ? ` = ${steps}` : ""}`, "info");
  walk(g, p, steps, [], dice, r, now);
  return null;
}

function walk(g: IslandGame, p: string, left: number, path: number[], dice: number[], r: Rng, now: number) {
  let at = g.pos[p];
  while (left > 0) {
    at = (at + 1) % N;
    path.push(at);
    left -= 1;
    g.pos[p] = at;
    if (at === g.shrine && g.coins[p] >= GEM_COST) {
      // Pause here: buy a gem?
      g.pending = { who: p, left, path, dice };
      g.lastMove = { n: (g.lastMove?.n ?? 0) + 1, who: p, path: [...path], dice };
      g.phase = "shrine";
      g.deadline = now + path.length * MOVE_MS_PER_STEP + (isBot(p) ? BOT_MS : CHOICE_MS);
      return;
    }
  }
  g.lastMove = { n: (g.lastMove?.n ?? 0) + 1, who: p, path: [...path], dice };
  land(g, p, r, now + path.length * MOVE_MS_PER_STEP);
}

/** Buy (or skip) a gem at the shrine, then finish the move. */
export function shrineChoice(g: IslandGame, p: string, buy: boolean, r: Rng, now: number): string | null {
  if (g.done || g.phase !== "shrine" || !g.pending || g.pending.who !== p) return "Not now";
  if (buy && g.coins[p] >= GEM_COST) {
    g.coins[p] -= GEM_COST;
    g.gems[p] += 1;
    say(g, p, `bought a 💎 gem!`, "gem");
    pickShrine(g, r);
  } else say(g, p, `walked past the Gem Shrine`, "info");
  const { left, dice } = g.pending;
  g.pending = null;
  walk(g, p, left, [], dice, r, now);
  return null;
}

const EVENTS: ((g: IslandGame, p: string, r: Rng) => void)[] = [
  (g, p) => { g.coins[p] += 10; say(g, p, `found buried treasure! +10 🪙`, "good"); },
  (g, p) => { const lost = Math.min(5, g.coins[p]); g.coins[p] -= lost; say(g, p, `dropped coins in the sea… −${lost} 🪙`, "bad"); },
  (g, p, r) => {
    const others = g.players.filter((x) => x !== p);
    const q = others[Math.floor(r() * others.length)];
    [g.coins[p], g.coins[q]] = [g.coins[q], g.coins[p]];
    say(g, p, "swapped coins with {other}! 🔄", "info", q);
  },
  (g, p) => {
    const leader = [...g.players].filter((x) => x !== p).sort((a, b) => g.gems[b] - g.gems[a] || g.coins[b] - g.coins[a])[0];
    const took = Math.min(5, g.coins[leader]);
    g.coins[leader] -= took;
    g.coins[p] += took;
    say(g, p, `sent a raccoon to rob {other}! +${took} 🪙 🦝`, "good", leader);
  },
  (g, p, r) => { pickShrine(g, r); say(g, p, `shook the island: the Gem Shrine moved! ✨`, "info"); },
  (g, p, r) => { const to = Math.floor(r() * N); g.pos[p] = to; say(g, p, `got swept away by a wave! 🌊`, "info"); },
];

function land(g: IslandGame, p: string, r: Rng, at: number) {
  const s = BOARD[g.pos[p]];
  if (s === "blue") { g.coins[p] += BLUE_COINS; say(g, p, `landed on blue: +${BLUE_COINS} 🪙`, "good"); }
  else if (s === "red") { const lost = Math.min(RED_COINS, g.coins[p]); g.coins[p] -= lost; say(g, p, `landed on red: −${lost} 🪙`, "bad"); }
  else if (s === "event") EVENTS[Math.floor(r() * EVENTS.length)](g, p, r);
  else if (s === "shop") {
    const can = (Object.keys(ITEMS) as ItemId[]).some((i) => g.coins[p] >= ITEMS[i].cost) && g.items[p].length < MAX_ITEMS;
    if (can) {
      g.phase = "shop";
      g.deadline = at + (isBot(p) ? BOT_MS : CHOICE_MS);
      return;
    }
    say(g, p, `window-shopped at the shop 🛍️`, "info");
  }
  endTurn(g, at);
}

/** Buy an item at the shop, or leave. */
export function shopChoice(g: IslandGame, p: string, item: ItemId | null, now: number): string | null {
  if (g.done || g.phase !== "shop" || current(g) !== p) return "Not now";
  if (item) {
    if (g.coins[p] < ITEMS[item].cost) return "Not enough coins";
    if (g.items[p].length >= MAX_ITEMS) return "Your bag is full";
    g.coins[p] -= ITEMS[item].cost;
    g.items[p] = [...g.items[p], item];
    say(g, p, `bought ${ITEMS[item].icon} ${ITEMS[item].name}`, "info");
  } else say(g, p, `left the shop`, "info");
  endTurn(g, now);
  return null;
}

function endTurn(g: IslandGame, at: number) {
  g.turn += 1;
  if (g.turn >= g.players.length) {
    g.turn = 0;
    startMini(g, at);
    return;
  }
  g.phase = "roll";
  g.deadline = at + (isBot(current(g)) ? BOT_MS : ROLL_MS);
}

// ---------- Minigames ----------
function startMini(g: IslandGame, at: number) {
  const used = g.minis.slice(-3).map((m) => m.micro);
  const pool = MICROS.filter((m) => !used.includes(m.id));
  // Deterministic from the round so a reload doesn't change it.
  const k = (g.round * 7 + g.seq) % pool.length;
  const micro = pool[k].id;
  const startAt = at + MINI_INTRO_MS;
  g.mini = { micro, seed: (g.round * 104729 + g.seq * 7919) % 2 ** 31, startAt, scores: {} };
  g.phase = "mini";
  g.deadline = startAt + microOf(micro).ms + MINI_GRACE_MS;
}

/** What a bot scores: somewhere between poor and good for that minigame. */
const BOT_TYPICAL: Record<MicroId, number> = { tap: 32, draw: 700, odd: 7, count: 230, bar: 180, math: 10, color: 9, balloons: 12, memory: 6 };
export function botScore(micro: MicroId, r: Rng) {
  return Math.round(BOT_TYPICAL[micro] * (0.35 + r() * 0.7));
}

export function submitMini(g: IslandGame, p: string, score: number, now: number): string | null {
  if (g.done || g.phase !== "mini" || !g.mini) return null;
  if (!g.players.includes(p)) return "You're watching";
  if (g.mini.scores[p] !== undefined) return null;
  if (now < g.mini.startAt - 500) return "Wait for the countdown";
  if (!Number.isFinite(score) || score < 0 || score > microOf(g.mini.micro).cap) return "That score isn't possible";
  g.mini.scores[p] = Math.round(score);
  return null;
}

export const humansIn = (g: IslandGame) => g.players.filter((p) => !isBot(p)).every((p) => g.mini?.scores[p] !== undefined);

/** Close the minigame: bots get their scores, coins are paid by place. */
export function revealMini(g: IslandGame, r: Rng, now: number) {
  if (g.done || g.phase !== "mini" || !g.mini) return;
  for (const p of g.players) if (g.mini.scores[p] === undefined) g.mini.scores[p] = isBot(p) ? botScore(g.mini.micro, r) : 0;
  const pts = placePoints(g.mini.scores, g.players); // 3 / 2 / 1 for the top three places, ties share
  const coins: Record<string, number> = {};
  for (const p of g.players) {
    const place = pts[p] === 3 ? 0 : pts[p] === 2 ? 1 : pts[p] === 1 ? 2 : g.mini.scores[p] > 0 ? 3 : -1;
    coins[p] = place >= 0 ? MINI_COINS[place] : 0;
    g.coins[p] += coins[p];
    if (pts[p] === 3) g.miniWins[p] += 1;
  }
  g.minis.push({ round: g.round, micro: g.mini.micro, scores: { ...g.mini.scores }, coins });
  g.phase = "miniReveal";
  g.deadline = now + MINI_REVEAL_MS;
}

/** After the minigame results: the next round, or the end. */
export function afterMini(g: IslandGame, now: number) {
  if (g.done || g.phase !== "miniReveal") return;
  g.mini = null;
  if (g.round >= g.maxRounds) return finish(g, "end");
  g.round += 1;
  startTurn(g, now);
}

export function finish(g: IslandGame, reason: "end" | "left") {
  // Bonus gem for the Minigame Star (most minigame wins; ties all get one).
  const top = Math.max(...g.players.map((p) => g.miniWins[p]));
  const bonus = top > 0 ? g.players.filter((p) => g.miniWins[p] === top) : [];
  for (const p of bonus) g.gems[p] += 1;
  const score = (p: string) => g.gems[p] * 1000 + g.coins[p];
  const best = Math.max(...g.players.map(score));
  g.done = { winners: g.players.filter((p) => score(p) === best), bonus, reason };
  g.phase = "miniReveal";
  g.deadline = undefined;
}

/** A bot (or a sleepy human whose timer ran out) takes their action. */
export function autoAct(g: IslandGame, r: Rng, now: number) {
  if (g.done) return;
  if (g.phase === "roll") {
    const p = current(g);
    if (isBot(p)) {
      const items = g.items[p];
      if (items.includes("warp") && g.coins[p] >= GEM_COST) arm(g, p, "warp");
      else if (items.includes("double")) arm(g, p, "double");
    }
    roll(g, p, r, now);
  } else if (g.phase === "shrine" && g.pending) {
    shrineChoice(g, g.pending.who, isBot(g.pending.who), r, now); // sleepy humans skip; bots always buy
  } else if (g.phase === "shop") {
    const p = current(g);
    const want: ItemId | null = isBot(p) ? (g.coins[p] >= GEM_COST + ITEMS.warp.cost ? "warp" : g.coins[p] >= ITEMS.double.cost + 5 ? "double" : null) : null;
    shopChoice(g, p, want, now);
  } else if (g.phase === "mini") revealMini(g, r, now);
  else if (g.phase === "miniReveal") afterMini(g, now);
}

/** A human left: a bot takes their seat so the game carries on. */
export function replaceWithBot(g: IslandGame, p: string) {
  const free = BOTS.find((b) => !g.players.includes(b));
  if (!free) return;
  const i = g.players.indexOf(p);
  if (i < 0) return;
  g.players[i] = free;
  for (const rec of [g.coins, g.gems, g.pos, g.items, g.armed, g.miniWins] as Record<string, unknown>[]) { rec[free] = rec[p]; delete rec[p]; }
  if (g.pending?.who === p) g.pending.who = free;
  if (g.mini) delete g.mini.scores[p];
}

export const rankOf = (g: IslandGame) => [...g.players].sort((a, b) => g.gems[b] - g.gems[a] || g.coins[b] - g.coins[a]);
