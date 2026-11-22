// Sneaky Story: write a story together, one line each in turn. On your turn you pick one of three
// odd secret words and sneak it into your line. Your partner taps the word they think was the
// secret: spot it and they score, slip it past them and you score. Sometimes a twist drops in.
// Pure rules, shared by server and client.

import { STARTERS, TWISTS, WORDS } from "./content";

export const LENGTHS = [6, 8, 12] as const;
export const LINE_MIN = 8;
export const LINE_MAX = 160;
export const OFFERS = 3;

export type Line = { by: string; text: string; secret: string; guess: number | null; spotted: boolean | null; twist?: string };

export type StoryGame = {
  seq: number;
  players: [string, string];
  starter: number;
  total: number; // lines in the story
  lines: Line[];
  phase: "write" | "spot" | "reveal";
  offers: string[]; // the writer's secret word choices this turn
  used: string[];
  twists: Record<string, string>; // line number → twist that line must deal with
  scores: Record<string, { sneaks: number; spots: number }>;
  ready: string[];
  done?: { reason: "end" | "left" };
};

type Rng = () => number;
const pickN = <T,>(xs: T[], n: number, rng: Rng) => {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a.slice(0, n);
};

// ---------- Words in a line ----------
const WORD_RE = /[\p{L}\p{N}']+/gu;

/** The words of a line, in order. Tapping word k is guessing `words(line)[k]`. */
export const words = (text: string) => text.match(WORD_RE) ?? [];

/** The line split into words and the bits between them, for drawing tappable words. */
export function pieces(text: string): { text: string; word: number | null }[] {
  const out: { text: string; word: number | null }[] = [];
  let last = 0, k = 0;
  for (const m of text.matchAll(WORD_RE)) {
    if (m.index! > last) out.push({ text: text.slice(last, m.index), word: null });
    out.push({ text: m[0], word: k++ });
    last = m.index! + m[0].length;
  }
  if (last < text.length) out.push({ text: text.slice(last), word: null });
  return out;
}

const norm = (w: string) => w.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");

/** Does this word count as the secret? Plurals and possessives count too. */
export function isSecret(word: string, secret: string) {
  const n = norm(word), s = norm(secret);
  if (!s) return false;
  if (n === s || n === `${s}s` || n === `${s}es`) return true;
  if (s.endsWith("y") && n === `${s.slice(0, -1)}ies`) return true;
  return false;
}

export const uses = (text: string, secret: string) => words(text).some((w) => isSecret(w, secret));

// ---------- Flow ----------
/** Whose line is in play: the one being written, or the one just written while it's spotted and revealed. */
const turnOf = (g: StoryGame) => (g.phase === "write" ? g.lines.length : g.lines.length - 1);
export const writerOf = (g: StoryGame) => g.players[turnOf(g) % 2];
export const readerOf = (g: StoryGame) => g.players[(turnOf(g) + 1) % 2];

function deal(g: StoryGame, rng: Rng) {
  g.offers = pickN(WORDS.filter((w) => !g.used.includes(w)), OFFERS, rng);
}

export function newGame(players: [string, string], total: number, starter: number | null, rng: Rng): StoryGame {
  // A couple of twists land in the second half, never on the first or last line.
  const twistAt = pickN(Array.from({ length: Math.max(0, total - 3) }, (_, i) => i + 2), total >= 8 ? 2 : 1, rng);
  const twistText = pickN(TWISTS, twistAt.length, rng);
  const g: StoryGame = {
    seq: 0, players, starter: starter ?? Math.floor(rng() * STARTERS.length), total, lines: [], phase: "write",
    offers: [], used: [], twists: Object.fromEntries(twistAt.map((at, i) => [String(at), twistText[i]])),
    scores: Object.fromEntries(players.map((p) => [p, { sneaks: 0, spots: 0 }])), ready: [],
  };
  deal(g, rng);
  return g;
}

/** The writer adds their line, with the secret word they chose. */
export function writeLine(g: StoryGame, p: string, text: string, secret: string): string | null {
  if (g.done || g.phase !== "write") return "Not now";
  if (writerOf(g) !== p) return "It's not your turn to write";
  if (!g.offers.includes(secret)) return "Pick one of your secret words";
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length < LINE_MIN) return "Write a bit more";
  if (clean.length > LINE_MAX) return "That line is too long";
  if (!uses(clean, secret)) return `Your line needs the word “${secret}”`;
  const twist = g.twists[String(g.lines.length)];
  g.lines.push({ by: p, text: clean, secret, guess: null, spotted: null, ...(twist ? { twist } : {}) });
  g.used.push(secret);
  g.phase = "spot";
  return null;
}

/** The reader taps the word they think was the secret. */
export function spot(g: StoryGame, p: string, word: number): string | null {
  if (g.done || g.phase !== "spot") return "Not now";
  const line = g.lines.at(-1)!;
  if (line.by === p || !g.players.includes(p)) return "It's your own line!";
  const ws = words(line.text);
  if (!Number.isInteger(word) || word < 0 || word >= ws.length) return "Tap a word in the line";
  line.guess = word;
  line.spotted = isSecret(ws[word], line.secret);
  if (line.spotted) g.scores[p].spots += 1;
  else g.scores[line.by].sneaks += 1;
  g.phase = "reveal";
  g.ready = [];
  return null;
}

/** Both ready after the reveal: the next writer's turn, or the end of the story. */
export function carryOn(g: StoryGame, p: string, rng: Rng) {
  if (g.done || g.phase !== "reveal" || g.ready.includes(p)) return;
  g.ready.push(p);
  if (!g.players.every((x) => g.ready.includes(x))) return;
  g.ready = [];
  if (g.lines.length >= g.total) {
    g.done = { reason: "end" };
    return;
  }
  g.phase = "write";
  deal(g, rng);
}

export const pointsOf = (g: StoryGame, p: string) => g.scores[p].sneaks + g.scores[p].spots;
