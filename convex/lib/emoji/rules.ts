// Emoji Charades: a co-op game for two. Each round one of you picks a secret phrase and describes
// it using only emoji, built tap by tap while your partner watches live and types guesses.
// Guess it fast for more points. Roles swap every round. Pure rules, shared by server and client.

import { PROMPTS, type CategoryId } from "./content";

export const ROUND_CHOICES = [4, 6, 8] as const;
export const ROUND_MS = 90_000;
export const HINT_MS = 45_000; // after this long, the guesser sees the letter hint
export const MAX_CLUE = 24; // emoji in a clue
export const MAX_GUESSES = 60;
export const GUESS_LEN = 60;
export const CHOICES = 3;
export const GAP = "␣"; // a word break in the clue

export type Guess = { text: string; at: number; close: boolean };
export type Result = { round: number; giver: string; answer: string; category: CategoryId; clue: string[]; solved: boolean; ms: number | null; points: number };

export type EmojiGame = {
  seq: number;
  players: [string, string];
  categories: CategoryId[];
  round: number;
  rounds: number;
  phase: "pick" | "clue" | "reveal";
  choices: { category: CategoryId; text: string }[];
  answer: { category: CategoryId; text: string } | null;
  clue: string[];
  guesses: Guess[];
  startedAt: number | null;
  deadline?: number;
  sched?: number;
  used: string[];
  ready: string[];
  score: number;
  results: Result[];
  done?: { reason: "end" | "left" };
};

type Rng = () => number;
const shuffle = <T,>(xs: T[], rng: Rng) => {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

// ---------- Checking guesses ----------
/** Lowercase, letters and digits only, single spaces, no leading "the". */
export function normalise(s: string) {
  return s.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim().replace(/^the /, "");
}

function distance(a: string, b: string) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) {
    d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  }
  return d[a.length][b.length];
}

/** "right": counts as solved (small typos allowed). "close": nearly there. */
export function judge(guess: string, answer: string): "right" | "close" | "wrong" {
  const g = normalise(guess), a = normalise(answer);
  if (!g) return "wrong";
  const squash = (s: string) => s.replace(/ /g, "");
  const d = distance(squash(g), squash(a));
  if (d <= Math.max(1, Math.floor(a.length / 8))) return "right";
  const gw = new Set(g.split(" ")), aw = a.split(" ");
  const shared = aw.filter((w) => w.length > 2 && gw.has(w)).length;
  if (d <= Math.ceil(a.length / 4) || (aw.length > 1 && shared >= Math.ceil(aw.length / 2))) return "close";
  return "wrong";
}

/** "Nasi goreng" → "N _ _ _   G _ _ _ _ _" */
export function letterHint(answer: string) {
  return answer.split(/\s+/).map((w) => [...w].map((c, i) => (i === 0 ? c.toUpperCase() : /[a-z0-9]/i.test(c) ? "_" : c)).join(" ")).join("   ");
}

// ---------- Flow ----------
export const giverOf = (g: EmojiGame) => g.players[g.round % 2];
export const guesserOf = (g: EmojiGame) => g.players[(g.round + 1) % 2];

function deal(g: EmojiGame, rng: Rng) {
  const pool = g.categories.flatMap((c) => PROMPTS[c].map((text) => ({ category: c, text }))).filter((p) => !g.used.includes(p.text));
  const all = pool.length >= CHOICES ? pool : g.categories.flatMap((c) => PROMPTS[c].map((text) => ({ category: c, text })));
  g.choices = shuffle(all, rng).slice(0, CHOICES);
}

export function newGame(players: [string, string], categories: CategoryId[], rounds: number, rng: Rng): EmojiGame {
  const g: EmojiGame = {
    seq: 0, players, categories: categories.length ? categories : (Object.keys(PROMPTS) as CategoryId[]), round: 0, rounds, phase: "pick",
    choices: [], answer: null, clue: [], guesses: [], startedAt: null, used: [], ready: [], score: 0, results: [],
  };
  deal(g, rng);
  return g;
}

/** The clue-giver chooses one of their three secret phrases; the clock starts. */
export function choose(g: EmojiGame, p: string, i: number, now: number): string | null {
  if (g.done || g.phase !== "pick") return "Not now";
  if (giverOf(g) !== p) return "It's your partner's turn to choose";
  const c = g.choices[i];
  if (!c) return "Pick one of the three";
  g.answer = c;
  g.used.push(c.text);
  g.clue = [];
  g.guesses = [];
  g.phase = "clue";
  g.startedAt = now;
  g.deadline = now + ROUND_MS;
  return null;
}

/** The clue-giver adds an emoji (or a word gap), or deletes the last one. */
export function editClue(g: EmojiGame, p: string, edit: { add: string } | { back: true } | { clear: true }): string | null {
  if (g.done || g.phase !== "clue") return "Not now";
  if (giverOf(g) !== p) return "Only the clue-giver can do that";
  if ("back" in edit) g.clue = g.clue.slice(0, -1);
  else if ("clear" in edit) g.clue = [];
  else {
    if (g.clue.length >= MAX_CLUE) return "That's a lot of emoji!";
    if (!isEmoji(edit.add)) return "Only emoji allowed!";
    if (edit.add === GAP && (!g.clue.length || g.clue.at(-1) === GAP)) return null;
    g.clue = [...g.clue, edit.add];
  }
  return null;
}

/** One emoji (with its modifiers), or the word gap. Letters and digits are not allowed. */
export function isEmoji(s: string) {
  if (s === GAP) return true;
  if (!s || s.length > 16 || /[a-zA-Z]/.test(s)) return false;
  if (!/\p{Extended_Pictographic}|\p{Regional_Indicator}|⃣/u.test(s)) return false;
  if (typeof Intl !== "undefined" && "Segmenter" in Intl) return [...new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(s)].length === 1;
  // No grapheme segmenter here: allow one pictograph per ZWJ-joined part (so 👨‍👩‍👧 still counts as one).
  return s.split("‍").every((part) => (part.match(/\p{Extended_Pictographic}/gu) ?? []).length <= 1);
}

/** Points for solving: 50 for getting it, up to 50 more for speed. */
export const pointsFor = (ms: number) => 50 + Math.round(50 * Math.max(0, 1 - ms / ROUND_MS));

/** The guesser tries an answer. */
export function makeGuess(g: EmojiGame, p: string, text: string, now: number): "right" | "close" | "wrong" | string {
  if (g.done || g.phase !== "clue" || !g.answer) return "Not now";
  if (guesserOf(g) !== p) return "You're giving the clue!";
  const t = text.replace(/\s+/g, " ").trim().slice(0, GUESS_LEN);
  if (!t) return "Type a guess";
  if (g.guesses.length >= MAX_GUESSES) return "That's a lot of guesses! Wait for the clock.";
  const v = judge(t, g.answer.text);
  g.guesses.push({ text: t, at: now, close: v === "close" });
  if (v === "right") finishRound(g, true, now);
  return v;
}

/** End the round: solved, out of time, or skipped. */
export function finishRound(g: EmojiGame, solved: boolean, now: number) {
  if (g.phase !== "clue" || !g.answer) return;
  const ms = solved && g.startedAt !== null ? Math.max(0, now - g.startedAt) : null;
  const points = ms !== null ? pointsFor(ms) : 0;
  g.score += points;
  g.results.push({ round: g.round, giver: giverOf(g), answer: g.answer.text, category: g.answer.category, clue: g.clue, solved, ms, points });
  g.phase = "reveal";
  g.deadline = undefined;
  g.ready = [];
}

export function nextRound(g: EmojiGame, p: string, rng: Rng) {
  if (g.done || g.phase !== "reveal" || g.ready.includes(p)) return;
  g.ready.push(p);
  if (!g.players.every((x) => g.ready.includes(x))) return;
  g.round += 1;
  g.ready = [];
  g.answer = null;
  g.clue = [];
  g.guesses = [];
  g.startedAt = null;
  if (g.round >= g.rounds) {
    g.done = { reason: "end" };
    return;
  }
  g.phase = "pick";
  deal(g, rng);
}

export const maxScore = (g: EmojiGame) => g.rounds * 100;
