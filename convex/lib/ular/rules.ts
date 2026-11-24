/**
 * Ular Tangga Nusantara: dynamic snakes and ladders built from mystery question boxes.
 * Pure rules, no database: the server runs them, the tests replay them, and the phone reads the tables.
 *
 * The board starts empty of snakes and ladders, with Mystery Boxes (?) of Easy, Medium, and Hard difficulty
 * scattered across random squares:
 *  • Land on a plain square: stay put, next player rolls.
 *  • Land on a Mystery Box (?): answer a trivia question matching its difficulty.
 *      - Right answer: the box turns into a permanent tangga (ladder) and you climb it!
 *      - Wrong answer / timeout: the box turns into a permanent ular (snake) and you slide down!
 *      - Harder questions create much longer ladders and faster drops.
 *  • Land on an already-spawned tangga: climb straight up!
 *  • Land on an already-spawned ular: slide straight down!
 * First to square 100 wins (overshoot and you bounce back). If the rounds run out, whoever got furthest wins.
 */
import { QUESTIONS } from "../trivia/questions";
import {
  ASK_MS,
  BOT_MS,
  DIFFICULTY_INFO,
  GOAL,
  ROLL_MS,
  catOf,
  generateBoxes,
  isBot,
  type Difficulty,
  type Seat,
} from "./board";
import { difficultyOf } from "./difficulty";

export * from "./board";

// ---------- The game ----------
export type Ask = {
  q: number;
  order: [number, number, number, number];
  at: number;
  diff: Difficulty;
  upTo: number;
  downTo: number;
  opened: number;
};

export type UlarEvent = {
  n: number;
  kind: "roll" | "ask" | "answer" | "climb" | "bite" | "win" | "left";
  by: Seat;
  dice?: number;
  from?: number;
  to?: number;
  bounced?: boolean;
  // Question / Mystery Box details
  q?: number;
  cat?: number;
  at?: number;
  diff?: Difficulty;
  upTo?: number;
  downTo?: number;
  spawned?: boolean; // true when a Mystery Box just turned into this ladder or snake
  pick?: number;
  right?: number;
  ok?: boolean;
  choices?: string[];
  text?: string;
};

export interface UlarGame {
  seq: number;
  evn: number;
  players: Seat[];
  out: Seat[];
  pos: Record<string, number>;
  boxes: Record<number, Difficulty>; // unrevealed mystery boxes on the board
  ladders: Record<number, number>; // spawned ladders: foot -> top
  snakes: Record<number, number>; // spawned snakes: head -> tail
  turn: Seat;
  phase: "roll" | "ask";
  ask?: Ask;
  used: number[]; // questions already asked this game
  round: number;
  maxRounds: number;
  log: UlarEvent[];
  busy: number;
  deadline?: number;
  sched?: number;
  done?: { winners: Seat[]; reason: "finish" | "rounds" | "last" | "left" };
}

export type Rng = () => number;

/** How long phones spend showing one event; the server waits this long before the next deadline starts. */
export function eventMs(e: UlarEvent): number {
  if (e.kind === "roll") return 750 + Math.abs((e.to ?? 0) - (e.from ?? 0)) * 230;
  if (e.kind === "ask") return 300;
  if (e.kind === "answer") return 1700;
  if (e.kind === "climb") return e.spawned ? 1550 : 1300;
  if (e.kind === "bite") return e.spawned ? 1650 : 1500;
  if (e.kind === "win") return 1500;
  return 600;
}

export const active = (g: UlarGame) => g.players.filter((p) => !g.out.includes(p));

function note(g: UlarGame, e: Omit<UlarEvent, "n">) {
  const full: UlarEvent = { ...e, n: ++g.evn };
  g.busy += eventMs(full);
  g.log = [...g.log, full].slice(-40);
  return full;
}

export function newGame(players: Seat[], maxRounds: number, now: number, lead = 0, rng: Rng = Math.random): UlarGame {
  return {
    seq: 0,
    evn: 0,
    players,
    out: [],
    pos: Object.fromEntries(players.map((p) => [p, 0])),
    boxes: generateBoxes(rng),
    ladders: {},
    snakes: {},
    turn: players[0],
    phase: "roll",
    used: [],
    round: 1,
    maxRounds,
    log: [],
    busy: 0,
    deadline: now + lead + (isBot(players[0]) ? BOT_MS : ROLL_MS),
  };
}

function finish(g: UlarGame, reason: NonNullable<UlarGame["done"]>["reason"], winners?: Seat[]) {
  const left = active(g);
  const best = Math.max(...left.map((p) => g.pos[p]));
  g.deadline = undefined;
  g.ask = undefined;
  g.done = { winners: winners ?? left.filter((p) => g.pos[p] === best), reason };
}

function checkEnd(g: UlarGame) {
  const left = active(g);
  if (left.length < 2) finish(g, "last");
  else if (!left.some((p) => !isBot(p))) finish(g, "left");
  return !!g.done;
}

/** Pass the die to the next player (or stay, for a question), and start their clock. */
function settle(g: UlarGame, now: number, pass: boolean) {
  if (g.done || checkEnd(g)) return;
  if (pass || g.out.includes(g.turn)) {
    let k = g.players.indexOf(g.turn);
    do {
      k = (k + 1) % g.players.length;
      if (k === 0) g.round += 1;
    } while (g.out.includes(g.players[k]));
    g.turn = g.players[k];
    g.phase = "roll";
    if (g.round > g.maxRounds) return finish(g, "rounds");
  }
  const wait = isBot(g.turn) ? BOT_MS + (g.phase === "ask" ? 1400 : 0) : g.phase === "roll" ? ROLL_MS : ASK_MS;
  g.deadline = now + g.busy + wait;
}

/** Pick an unused question matching the box's difficulty (preferring the square's category). */
function pickQuestion(g: UlarGame, cat: number, diff: Difficulty, rng: Rng) {
  const byCatDiff = QUESTIONS.filter((q) => q.cat === cat && difficultyOf(q.id) === diff);
  let fresh = byCatDiff.filter((q) => !g.used.includes(q.id));
  if (!fresh.length) {
    // Try any category at this exact difficulty so hardness always matches the box's distance stakes
    const byDiff = QUESTIONS.filter((q) => difficultyOf(q.id) === diff);
    fresh = byDiff.filter((q) => !g.used.includes(q.id));
    if (!fresh.length) {
      g.used = g.used.filter((id) => difficultyOf(id) !== diff);
      fresh = byCatDiff.length ? byCatDiff : byDiff;
    }
  }
  const q = fresh[Math.floor(rng() * fresh.length)];
  g.used = [...g.used, q.id];
  return q.id;
}

function shuffled(rng: Rng): [number, number, number, number] {
  const a = [0, 1, 2, 3];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a as [number, number, number, number];
}

/** Find a clean landing square near `ideal` inside [lo, hi] that doesn't collide with another special square. */
function cleanTarget(g: UlarGame, ideal: number, lo: number, hi: number): number {
  const clamped = Math.max(lo, Math.min(hi, ideal));
  const isBusy = (sq: number) => Boolean(g.boxes[sq] || g.ladders[sq] || g.snakes[sq]);
  if (!isBusy(clamped)) return clamped;
  for (let d = 1; d <= 6; d++) {
    if (clamped + d <= hi && !isBusy(clamped + d)) return clamped + d;
    if (clamped - d >= lo && !isBusy(clamped - d)) return clamped - d;
  }
  return clamped;
}

function rollSpan(min: number, max: number, rng: Rng): number {
  return min + Math.floor(rng() * (max - min + 1));
}

function win(g: UlarGame, p: Seat) {
  note(g, { kind: "win", by: p });
  finish(g, "finish", [p]);
}

export function roll(g: UlarGame, rng: Rng, now: number) {
  if (g.done || g.phase !== "roll") return;
  g.busy = 0;
  const p = g.turn;
  const dice = 1 + Math.floor(rng() * 6);
  const from = g.pos[p];
  let to = from + dice;
  const bounced = to > GOAL;
  if (bounced) to = GOAL - (to - GOAL); // overshoot and bounce back
  g.pos[p] = to;
  note(g, { kind: "roll", by: p, dice, from, to, bounced });
  if (to === GOAL) return win(g, p);

  // Landed on an already-spawned ladder? Climb straight up!
  if (g.ladders[to]) {
    const top = g.ladders[to];
    g.pos[p] = top;
    note(g, { kind: "climb", by: p, from: to, to: top, spawned: false });
    if (top === GOAL) return win(g, p);
    return settle(g, now, true);
  }

  // Landed on an already-spawned snake? Slide straight down!
  if (g.snakes[to]) {
    const tail = g.snakes[to];
    g.pos[p] = tail;
    note(g, { kind: "bite", by: p, from: to, to: tail, spawned: false });
    return settle(g, now, true);
  }

  // Landed on a Mystery Box? Open a trivia question scaled by its difficulty!
  const diff = g.boxes[to];
  if (diff) {
    const info = DIFFICULTY_INFO[diff];
    const cat = catOf(to);
    const q = pickQuestion(g, cat, diff, rng);
    const upSpan = rollSpan(info.upMin, info.upMax, rng);
    const downSpan = rollSpan(info.downMin, info.downMax, rng);
    const upTo = cleanTarget(g, to + upSpan, Math.min(GOAL, to + 2), GOAL);
    const downTo = cleanTarget(g, to - downSpan, 1, Math.max(1, to - 2));
    g.ask = { q, order: shuffled(rng), at: to, diff, upTo, downTo, opened: now };
    g.phase = "ask";
    note(g, { kind: "ask", by: p, q, cat: QUESTIONS[q].cat, at: to, diff, upTo, downTo });
    return settle(g, now, false);
  }

  // Plain square: pass turn cleanly.
  settle(g, now, true);
}

/** Answer the Mystery Box question: `pick` is the index of the choice as shown (or -1 for no answer). */
export function answer(g: UlarGame, pick: number, now: number) {
  if (g.done || g.phase !== "ask" || !g.ask) return;
  g.busy = 0;
  const p = g.turn;
  const a = g.ask;
  const q = QUESTIONS[a.q];
  const right = a.order.indexOf(0);
  const ok = pick === right;
  note(g, {
    kind: "answer",
    by: p,
    q: a.q,
    cat: q.cat,
    at: a.at,
    diff: a.diff,
    upTo: a.upTo,
    downTo: a.downTo,
    pick,
    right,
    ok,
    text: q.text,
    choices: a.order.map((k) => q.choices[k]),
  });

  // Consume the Mystery Box and permanently spawn a Ladder (if right) or Snake (if wrong).
  delete g.boxes[a.at];
  g.ask = undefined;
  g.phase = "roll";

  if (ok) {
    g.ladders[a.at] = a.upTo;
    g.pos[p] = a.upTo;
    note(g, { kind: "climb", by: p, from: a.at, to: a.upTo, diff: a.diff, spawned: true });
  } else {
    g.snakes[a.at] = a.downTo;
    g.pos[p] = a.downTo;
    note(g, { kind: "bite", by: p, from: a.at, to: a.downTo, diff: a.diff, spawned: true });
  }

  if (g.pos[p] === GOAL) return win(g, p);
  settle(g, now, true);
}

/** The clock ran out (or it's a bot's turn). */
export function onDeadline(g: UlarGame, rng: Rng, now: number) {
  if (g.phase === "roll") return roll(g, rng, now);
  if (!g.ask) return;
  if (isBot(g.turn)) {
    const right = g.ask.order.indexOf(0);
    const knows = rng() < DIFFICULTY_INFO[g.ask.diff].botRight;
    return answer(g, knows ? right : (right + 1 + Math.floor(rng() * 3)) % 4, now);
  }
  answer(g, -1, now); // no answer counts as wrong -> spawns snake
}

/** A player walks away. */
export function leaveGame(g: UlarGame, p: Seat, now: number) {
  if (g.done || !g.players.includes(p) || g.out.includes(p)) return;
  g.busy = 0;
  g.out = [...g.out, p];
  note(g, { kind: "left", by: p });
  if (g.turn !== p) return void checkEnd(g);
  g.ask = undefined;
  settle(g, now, true);
}
