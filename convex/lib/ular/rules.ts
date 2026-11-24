/**
 * Ular Tangga Nusantara: snakes and ladders with a trivia question on every landing.
 * Pure rules, no database: the server runs them, the tests replay them, and the phone reads the tables.
 *
 * Roll one die and move. Wherever you land, answer a question in that square's category:
 *  • at the foot of a tangga (ladder), a right answer climbs it;
 *  • on an ular's (snake's) head, a right answer dodges the bite, a wrong one slides you down;
 *  • anywhere else, a right answer earns a bonus step.
 * First to square 100 wins (overshoot and you bounce back). If the rounds run out, whoever got furthest wins.
 */
import { QUESTIONS } from "../trivia/questions";

import { BOT_MS, BOT_RIGHT, BONUS_STEPS, GOAL, LADDERS, ROLL_MS, ASK_MS, SNAKES, catOf, isBot, kindOf, type Seat, type SquareKind } from "./board";
export * from "./board";

// ---------- The game ----------
export type Ask = { q: number; order: [number, number, number, number]; at: number; kind: SquareKind; opened: number };

export type UlarEvent = {
  n: number;
  kind: "roll" | "ask" | "answer" | "climb" | "bite" | "bonus" | "win" | "left";
  by: Seat;
  dice?: number;
  from?: number;
  to?: number;
  bounced?: boolean;
  // A question: which one, where, and (on the answer) what was picked and which choice was right.
  q?: number;
  cat?: number;
  at?: number;
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
  if (e.kind === "ask") return 250;
  if (e.kind === "answer") return 1700;
  if (e.kind === "climb") return 1300;
  if (e.kind === "bite") return 1500;
  if (e.kind === "bonus") return 500;
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

export function newGame(players: Seat[], maxRounds: number, now: number, lead = 0): UlarGame {
  return {
    seq: 0,
    evn: 0,
    players,
    out: [],
    pos: Object.fromEntries(players.map((p) => [p, 0])),
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

/** Pick a question from the square's category that hasn't come up yet (and reshuffle the category when it runs dry). */
function pickQuestion(g: UlarGame, cat: number, rng: Rng) {
  const pool = QUESTIONS.filter((q) => q.cat === cat);
  let fresh = pool.filter((q) => !g.used.includes(q.id));
  if (!fresh.length) {
    g.used = g.used.filter((id) => QUESTIONS[id].cat !== cat);
    fresh = pool;
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
  // A question for this square.
  const cat = catOf(to);
  const q = pickQuestion(g, cat, rng);
  g.ask = { q, order: shuffled(rng), at: to, kind: kindOf(to), opened: now };
  g.phase = "ask";
  note(g, { kind: "ask", by: p, q, cat, at: to });
  settle(g, now, false);
}

/** Answer the question: `pick` is the index of the choice as shown (or -1 for no answer). */
export function answer(g: UlarGame, pick: number, now: number) {
  if (g.done || g.phase !== "ask" || !g.ask) return;
  g.busy = 0;
  const p = g.turn;
  const a = g.ask;
  const q = QUESTIONS[a.q];
  const right = a.order.indexOf(0);
  const ok = pick === right;
  note(g, { kind: "answer", by: p, q: a.q, cat: q.cat, at: a.at, pick, right, ok, text: q.text, choices: a.order.map((k) => q.choices[k]) });
  g.ask = undefined;
  g.phase = "roll";
  if (a.kind === "ladder" && ok) {
    g.pos[p] = LADDERS[a.at];
    note(g, { kind: "climb", by: p, from: a.at, to: g.pos[p] });
  } else if (a.kind === "snake" && !ok) {
    g.pos[p] = SNAKES[a.at];
    note(g, { kind: "bite", by: p, from: a.at, to: g.pos[p] });
  } else if (a.kind === "plain" && ok) {
    // A bonus step; a ladder at the end of it is a free climb, and a snake there lets you be.
    let to = Math.min(GOAL, a.at + BONUS_STEPS);
    note(g, { kind: "bonus", by: p, from: a.at, to });
    if (LADDERS[to]) {
      const top = LADDERS[to];
      note(g, { kind: "climb", by: p, from: to, to: top });
      to = top;
    }
    g.pos[p] = to;
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
    const knows = rng() < BOT_RIGHT;
    return answer(g, knows ? right : (right + 1 + Math.floor(rng() * 3)) % 4, now);
  }
  answer(g, -1, now); // no answer counts as wrong
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
