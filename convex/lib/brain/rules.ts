// Brain Swap: learn together.
//  - Teach Swap (two players): you each read a different fact card, teach it to the other out loud,
//    then answer a question about the card you were taught. Both right = a perfect swap.
//  - Agree to Answer (one or two players): one shared question. You see each other's pick live and
//    can only lock in once you agree. Then the card explains the answer.
// Every card you finish lands in your Brain Book. Pure rules, shared by server and client.

import { CARDS, cardById, type TopicId } from "./cards";

export type Mode = "teach" | "agree";
export const ROUND_CHOICES = [3, 5, 8] as const;
export const POINTS = 100;
export const SWAP_BONUS = 50;
export const STREAK_BONUS = 20;

export type Round = {
  /** teach: the card each player reads. agree: everyone shares `shared`. */
  cards: Record<string, string>;
  shared?: string;
  /** Option order per card, so the right answer isn't always in the same place. */
  order: Record<string, number[]>;
};

export type Result = {
  round: number;
  /** For each answered card: who answered, what they picked, and whether it was right. */
  answers: { card: string; by: string[]; pick: number; right: boolean; teacher?: string }[];
  points: number;
};

export type BrainGame = {
  seq: number;
  mode: Mode;
  players: string[];
  topics: TopicId[];
  rounds: Round[];
  round: number;
  phase: "read" | "teach" | "quiz" | "agree" | "reveal";
  ready: string[];
  picks: Record<string, number>; // quiz answers, or live agree picks
  locked: string[];
  disagree: boolean; // agree mode: both locked on different answers
  results: Result[];
  score: number;
  streak: number;
  best: number; // best streak
  done?: { reason: "end" | "left" };
};

type Rng = () => number;

function shuffle<T>(xs: T[], rng: Rng) {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Cards from these topics, ones nobody here has learned yet first. */
export function pickCards(rng: Rng, topics: TopicId[], n: number, learned: string[]) {
  const pool = CARDS.filter((c) => topics.includes(c.topic));
  const fresh = shuffle(pool.filter((c) => !learned.includes(c.id)), rng);
  const old = shuffle(pool.filter((c) => learned.includes(c.id)), rng);
  return [...fresh, ...old].slice(0, n).map((c) => c.id);
}

export function newGame(players: string[], mode: Mode, topics: TopicId[], rounds: number, learned: string[], rng: Rng): BrainGame {
  const m: Mode = players.length < 2 ? "agree" : mode;
  const per = m === "teach" ? players.length : 1;
  const ids = pickCards(rng, topics, rounds * per, learned);
  const list: Round[] = [];
  for (let r = 0; r < rounds && (r + 1) * per <= ids.length; r++) {
    const mine = ids.slice(r * per, (r + 1) * per);
    const order = Object.fromEntries(mine.map((id) => [id, shuffle([0, 1, 2, 3], rng)]));
    list.push(m === "teach" ? { cards: Object.fromEntries(players.map((p, k) => [p, mine[k]])), order } : { cards: {}, shared: mine[0], order });
  }
  return {
    seq: 0, mode: m, players: [...players], topics, rounds: list, round: 0, phase: m === "teach" ? "read" : "agree",
    ready: [], picks: {}, locked: [], disagree: false, results: [], score: 0, streak: 0, best: 0,
  };
}

export const partnerOf = (g: BrainGame, p: string) => g.players.find((x) => x !== p) ?? p;

/** In Teach Swap, the card you get quizzed on is the one your partner taught you. */
export const quizCardFor = (g: BrainGame, p: string) => g.rounds[g.round]?.cards[partnerOf(g, p)];

/** Teach Swap: "I've read my card" / "I've been taught, quiz me". Moves on when everyone's ready. */
export function markReady(g: BrainGame, p: string) {
  if (g.done || (g.phase !== "read" && g.phase !== "teach") || g.ready.includes(p)) return;
  g.ready.push(p);
  if (g.players.every((x) => g.ready.includes(x))) {
    g.phase = g.phase === "read" ? "teach" : "quiz";
    g.ready = [];
  }
}

/** Teach Swap: answer the question about your partner's card. */
export function quizAnswer(g: BrainGame, p: string, pick: number): string | null {
  if (g.done || g.phase !== "quiz") return "Not now";
  if (!Number.isInteger(pick) || pick < 0 || pick > 3) return "Pick an answer";
  if (g.picks[p] !== undefined) return "Already answered";
  g.picks[p] = pick;
  if (g.players.every((x) => g.picks[x] !== undefined)) {
    const answers = g.players.map((x) => {
      const c = cardById(quizCardFor(g, x))!;
      return { card: c.id, by: [x], pick: g.picks[x], right: g.picks[x] === c.answer, teacher: partnerOf(g, x) };
    });
    score(g, answers, answers.every((a) => a.right) ? SWAP_BONUS : 0);
  }
  return null;
}

/** Agree to Answer: change your live pick (unlocks you). */
export function agreePick(g: BrainGame, p: string, pick: number): string | null {
  if (g.done || g.phase !== "agree") return "Not now";
  if (!Number.isInteger(pick) || pick < 0 || pick > 3) return "Pick an answer";
  g.picks[p] = pick;
  g.locked = g.locked.filter((x) => x !== p);
  g.disagree = false;
  return null;
}

/** Agree to Answer: lock in. When everyone's locked on the same answer, it's revealed. */
export function agreeLock(g: BrainGame, p: string): string | null {
  if (g.done || g.phase !== "agree") return "Not now";
  if (g.picks[p] === undefined) return "Pick an answer first";
  if (!g.locked.includes(p)) g.locked.push(p);
  if (!g.players.every((x) => g.locked.includes(x))) return null;
  const picks = new Set(g.players.map((x) => g.picks[x]));
  if (picks.size > 1) {
    // Not the same answer: talk it out.
    g.locked = [];
    g.disagree = true;
    return null;
  }
  const c = cardById(g.rounds[g.round].shared)!;
  const pick = g.picks[p];
  score(g, [{ card: c.id, by: [...g.players], pick, right: pick === c.answer }], 0);
  return null;
}

function score(g: BrainGame, answers: Result["answers"], bonus: number) {
  const right = answers.filter((a) => a.right).length;
  g.streak = right === answers.length ? g.streak + 1 : 0;
  g.best = Math.max(g.best, g.streak);
  const points = right * POINTS + bonus + (right === answers.length && g.streak > 1 ? (g.streak - 1) * STREAK_BONUS : 0);
  g.score += points;
  g.results.push({ round: g.round, answers, points });
  g.phase = "reveal";
  g.ready = [];
}

/** After the reveal: ready for the next round. */
export function nextRound(g: BrainGame, p: string) {
  if (g.done || g.phase !== "reveal" || g.ready.includes(p)) return;
  g.ready.push(p);
  if (!g.players.every((x) => g.ready.includes(x))) return;
  g.round += 1;
  g.ready = [];
  g.picks = {};
  g.locked = [];
  g.disagree = false;
  if (g.round >= g.rounds.length) g.done = { reason: "end" };
  else g.phase = g.mode === "teach" ? "read" : "agree";
}

/** Every card each player finished this game, for their Brain Book. */
export function learnedBy(g: BrainGame, p: string) {
  const out = new Set<string>();
  for (const r of g.results) {
    const round = g.rounds[r.round];
    if (round.shared) out.add(round.shared);
    else for (const id of Object.values(round.cards)) out.add(id); // you read one and were taught the other
  }
  return g.players.includes(p) ? [...out] : [];
}

export function maxScore(g: BrainGame) {
  const per = g.mode === "teach" ? g.players.length * POINTS + SWAP_BONUS : POINTS;
  return g.rounds.length * per;
}
