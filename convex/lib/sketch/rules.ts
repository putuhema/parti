// Sketch Match: one player sees a secret picture of a real thing (a banana, a dinosaur…)
// and describes it without saying what it is. Everyone else draws from the description,
// then each drawing is scored by how closely its lines match the picture.
// In "draw your own" games the describer sketches the secret picture first.
// Pure rules, shared by server and client.

import { ART, artById, artLines } from "./art";

export const SKETCH_MAX = 8;
export const BOT = "bot";
export const isBot = (id: string) => id === BOT;

export const SKETCH_MS = 45_000; // describer drawing their own picture
export const DRAW_MS = 90_000;
export const REVEAL_MS = 10_000;
export const SOLO_ROUNDS = 4;
export const MAX_CLUES = 40;
export const CLUE_LEN = 90;
export const WORD_LEN = 24;
export const ASKS = ["Bigger?", "Smaller?", "Where?", "Say again?", "Got it 👍"] as const;

export type Source = "book" | "own";
export const SOURCES: { id: Source; name: string; sub: string }[] = [
  { id: "book", name: "Picture book", sub: `${ART.length} real things` },
  { id: "own", name: "Draw your own", sub: "Describer sketches it" },
];

// Drawings are strokes of flat [x0, y0, x1, y1, …] integers on a 0–1000 canvas.
export const CANVAS = 1000;
export const MAX_STROKES = 200;
export const MAX_POINTS = 4000;
const MIN_OWN_POINTS = 8; // less than this and a "draw your own" picture is replaced by one from the book

/** The secret picture: what it is (may be blank for a drawn-your-own one) and its lines. */
export type Picture = { word: string; lines: number[][]; art?: string };
export type Clue = { by: string; text: string; at: number; ask?: boolean };
export type RoundResult = { round: number; describer: string; picture: Picture; scores: Record<string, number>; describerScore: number | null };

export type SketchGame = {
  seq: number;
  source: Source;
  players: string[]; // humans still in the game
  everyone: string[]; // everyone who started, for names and totals
  order: string[]; // who describes each round (BOT when playing solo)
  round: number; // index into order
  phase: "sketch" | "draw" | "reveal";
  picture: Picture;
  used: string[]; // book pictures already shown this game
  clues: Clue[];
  finished: string[]; // drawers who tapped Done this round
  history: RoundResult[];
  totals: Record<string, number>;
  deadline?: number;
  sched?: number;
  done?: { winners: string[]; reason: "rounds" | "left" };
};

type Rng = () => number;

// ---------- Pictures ----------
export function bookPicture(rng: Rng, used: string[]): Picture {
  const fresh = ART.filter((a) => !used.includes(a.id));
  const pool = fresh.length ? fresh : ART;
  const art = pool[Math.floor(rng() * pool.length)];
  return { word: art.word, lines: artLines(art), art: art.id };
}

/** The bot reads the picture's clues out one at a time. */
export function botClues(pic: Picture, from: number): Clue[] {
  const art = artById(pic.art);
  if (!art) return [];
  return art.clues.map((text, i) => ({ by: BOT, text, at: from + i * 9000 }));
}

/** The words a describer may not say for this picture. */
export function forbidden(pic: Picture): string[] {
  const art = artById(pic.art);
  const words = [pic.word, ...(art?.taboo ?? [])];
  return [...new Set(words.map((w) => w.toLowerCase().trim()).filter((w) => w.length >= 2))];
}

/** If the clue gives the answer away, the word it used; otherwise null. */
export function givesAway(pic: Picture, clue: string): string | null {
  const text = ` ${clue.toLowerCase().replace(/[^a-z0-9]+/g, " ")} `;
  const squashed = text.replace(/ /g, "");
  for (const w of forbidden(pic)) {
    const plain = w.replace(/[^a-z0-9]+/g, " ").trim();
    if (!plain) continue;
    // The word on its own or as a plural…
    if (text.includes(` ${plain} `) || text.includes(` ${plain}s `) || text.includes(` ${plain}es `)) return w;
    // …or spelled out with gaps ("b a n a n a").
    const joined = plain.replace(/ /g, "");
    if (joined.length >= 4 && squashed.includes(joined)) return w;
  }
  return null;
}

// ---------- Scoring ----------
const G = 40; // the canvas is compared on a G×G grid
const FAR = 6;
type Fit = (x: number, y: number) => [number, number];
// Missing details (a car's windows) costs less than drawing the wrong thing, so lines landing
// on the picture count for more than covering all of it.
const BETA = 0.5;
// Any two pictures that fill the page overlap a bit by chance; only what's better than that scores.
const CHANCE = 0.3;

// Each cell remembers which way the lines through it run, in 8 directions (22.5° apart),
// so a line only counts when it's in the right place *and* runs the right way.
const BINS = 8;
const binOf = (dx: number, dy: number) => {
  const a = Math.atan2(dy, dx);
  return Math.round(((a < 0 ? a + Math.PI : a) / Math.PI) * BINS) % BINS;
};

function stamp(grid: Uint8Array, s: number[], fit?: Fit) {
  const mark = (x: number, y: number, bits: number) => {
    const cx = Math.floor((x / CANVAS) * G), cy = Math.floor((y / CANVAS) * G);
    if (cx >= 0 && cy >= 0 && cx < G && cy < G) grid[cy * G + cx] |= bits;
  };
  const at = (i: number): [number, number] => (fit ? fit(s[i], s[i + 1]) : [s[i], s[i + 1]]);
  if (s.length === 2) mark(...at(0), 0xff); // a dot runs every way
  for (let i = 2; i + 1 < s.length; i += 2) {
    const [x0, y0] = at(i - 2), [x1, y1] = at(i);
    const len = Math.hypot(x1 - x0, y1 - y0);
    const bits = len < 1 ? 0xff : 1 << binOf(x1 - x0, y1 - y0);
    const steps = Math.max(1, Math.ceil(((len / CANVAS) * G) / 0.4));
    for (let k = 0; k <= steps; k++) mark(x0 + ((x1 - x0) * k) / steps, y0 + ((y1 - y0) * k) / steps, bits);
  }
}

function gridOf(lines: number[][], fit?: Fit) {
  const g = new Uint8Array(G * G);
  for (const s of lines) stamp(g, s, fit);
  return g;
}

/** For every cell, how many steps (8-way) to the nearest cell with any of `mask`'s directions, capped at FAR. */
function distances(grid: Uint8Array, mask: number) {
  const d = new Uint8Array(G * G).fill(FAR);
  const queue: number[] = [];
  for (let i = 0; i < grid.length; i++) if (grid[i] & mask) { d[i] = 0; queue.push(i); }
  for (let q = 0; q < queue.length; q++) {
    const i = queue[q];
    if (d[i] >= FAR - 1) continue;
    const x = i % G, y = (i - x) / G;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= G || ny >= G) continue;
      const j = ny * G + nx;
      if (d[j] > d[i] + 1) { d[j] = d[i] + 1; queue.push(j); }
    }
  }
  return d;
}

/** One distance map per direction, counting lines within one direction-step as running the same way. */
function directionMaps(grid: Uint8Array) {
  return Array.from({ length: BINS }, (_, b) => distances(grid, (1 << b) | (1 << ((b + 1) % BINS)) | (1 << ((b + BINS - 1) % BINS))));
}

// Within a cell is perfect, two cells away is half right, further is wrong.
const credit = (dist: number) => (dist <= 1 ? 1 : dist === 2 ? 0.5 : 0);

/** Average credit over every marked cell of `from`, measured against `maps` of the other drawing. */
function hits(from: Uint8Array, maps: Uint8Array[]) {
  let cells = 0, sum = 0;
  for (let i = 0; i < from.length; i++) {
    if (!from[i]) continue;
    cells++;
    let best = 0;
    for (let b = 0; b < BINS && best < 1; b++) if (from[i] & (1 << b)) best = Math.max(best, credit(maps[b][i]));
    sum += best;
  }
  return cells ? sum / cells : 0;
}

/** 0–1: how much of the drawing lands on the picture, balanced with how much of the picture it covers. */
function overlap(want: Uint8Array, got: Uint8Array) {
  const precision = hits(got, directionMaps(want)), recall = hits(want, directionMaps(got));
  if (!precision || !recall) return 0;
  const b2 = BETA * BETA;
  return ((1 + b2) * precision * recall) / (b2 * precision + recall);
}

function bounds(lines: number[][]) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const s of lines) for (let i = 0; i + 1 < s.length; i += 2) {
    x0 = Math.min(x0, s[i]); x1 = Math.max(x1, s[i]);
    y0 = Math.min(y0, s[i + 1]); y1 = Math.max(y1, s[i + 1]);
  }
  return { x0, y0, x1, y1 };
}

/**
 * 0–100: how well a drawing matches the picture. Mostly judged on shape (the drawing is
 * stretched over the picture first), partly on getting its size and place on the page right.
 */
export function matchScore(picture: number[][], strokes: number[][]) {
  if (!strokes.some((s) => s.length >= 2) || !picture.length) return 0;
  const want = gridOf(picture);
  const asDrawn = overlap(want, gridOf(strokes));
  const p = bounds(picture), d = bounds(strokes);
  const dw = d.x1 - d.x0, dh = d.y1 - d.y0;
  let shaped = asDrawn;
  if (dw > 20 || dh > 20) {
    // Stretch the drawing's box onto the picture's box (a flat line stays flat).
    const fit: Fit = (x, y) => [
      dw > 20 ? p.x0 + ((x - d.x0) * (p.x1 - p.x0)) / dw : (p.x0 + p.x1) / 2,
      dh > 20 ? p.y0 + ((y - d.y0) * (p.y1 - p.y0)) / dh : (p.y0 + p.y1) / 2,
    ];
    shaped = Math.max(asDrawn, overlap(want, gridOf(strokes, fit)));
  }
  const raw = 0.3 * asDrawn + 0.7 * shaped;
  return Math.round(100 * Math.max(0, Math.min(1, (raw - CHANCE) / (1 - CHANCE))));
}

/** Clean up a drawing sent from a phone: right shape, in bounds, and not too big. */
export function cleanStrokes(raw: number[][]): number[][] {
  const out: number[][] = [];
  let points = 0;
  for (const s of raw.slice(0, MAX_STROKES)) {
    const clean: number[] = [];
    for (let i = 0; i + 1 < s.length && points < MAX_POINTS; i += 2, points++) {
      const x = Math.round(s[i]), y = Math.round(s[i + 1]);
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      clean.push(Math.max(0, Math.min(CANVAS, x)), Math.max(0, Math.min(CANVAS, y)));
    }
    if (clean.length) out.push(clean);
  }
  return out;
}

export const cleanWord = (w: string) => w.replace(/\s+/g, " ").trim().slice(0, WORD_LEN);

// ---------- Flow ----------
export const describerOf = (g: SketchGame) => g.order[g.round];
export const drawersOf = (g: SketchGame) => g.players.filter((p) => p !== describerOf(g));
export const resultOf = (g: { history: RoundResult[] }, round: number) => g.history.find((h) => h.round === round);

export function newGame(players: string[], source: Source, gameNo: number, rng: Rng, now: number, countdown: number): SketchGame {
  let order: string[];
  if (players.length === 1) order = Array.from({ length: SOLO_ROUNDS }, () => BOT);
  else {
    // Everyone describes twice in a small group, once in a big one. Rotate who starts, game to game.
    const laps = players.length <= 3 ? 2 : 1;
    const k = gameNo % players.length;
    const turn = [...players.slice(k), ...players.slice(0, k)];
    order = Array.from({ length: laps }, () => turn).flat();
  }
  const g: SketchGame = {
    seq: 0, source, players: [...players], everyone: [...players], order, round: 0, phase: "draw",
    picture: { word: "", lines: [] }, used: [], clues: [], finished: [], history: [], totals: Object.fromEntries(players.map((p) => [p, 0])),
  };
  startRound(g, rng, now + countdown);
  return g;
}

function startRound(g: SketchGame, rng: Rng, from: number) {
  g.finished = [];
  g.clues = [];
  if (g.source === "own" && !isBot(describerOf(g))) {
    // The describer draws the secret picture first; everyone else waits.
    g.phase = "sketch";
    g.picture = { word: "", lines: [] };
    g.deadline = from + SKETCH_MS;
    return;
  }
  beginDrawing(g, bookPicture(rng, g.used), from);
}

/** The picture is set: everyone else starts drawing. */
export function beginDrawing(g: SketchGame, picture: Picture, now: number) {
  g.phase = "draw";
  g.picture = picture;
  if (picture.art) g.used.push(picture.art);
  g.clues = isBot(describerOf(g)) ? botClues(picture, now + 800) : [];
  g.deadline = now + DRAW_MS;
}

/** The describer is done drawing their own picture (or ran out of time). */
export function finishOwnPicture(g: SketchGame, strokes: number[][], word: string, rng: Rng, now: number) {
  if (g.phase !== "sketch" || g.done) return;
  const clean = cleanStrokes(strokes);
  const points = clean.reduce((n, s) => n + s.length / 2, 0);
  // Barely drew anything? Use a picture from the book so the round still works.
  const pic = points >= MIN_OWN_POINTS ? { word: cleanWord(word), lines: clean } : bookPicture(rng, g.used);
  beginDrawing(g, pic, now);
}

/** End the drawing: score everyone and show the answer. `drawings` maps drawer → strokes. */
export function reveal(g: SketchGame, drawings: Record<string, number[][]>, now: number) {
  if (g.phase !== "draw" || g.done) return;
  const describer = describerOf(g);
  const scores: Record<string, number> = {};
  for (const p of drawersOf(g)) scores[p] = matchScore(g.picture.lines, drawings[p] ?? []);
  const vals = Object.values(scores);
  // The describer scores as well as their drawers did on average: a good description helps everyone.
  const describerScore = isBot(describer) || !vals.length ? null : Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
  for (const [p, s] of Object.entries(scores)) g.totals[p] = (g.totals[p] ?? 0) + s;
  if (describerScore !== null) g.totals[describer] = (g.totals[describer] ?? 0) + describerScore;
  g.history.push({ round: g.round, describer, picture: g.picture, scores, describerScore });
  g.phase = "reveal";
  g.deadline = now + REVEAL_MS;
}

/** Move on to the next round, skipping anyone who has left. */
export function nextRound(g: SketchGame, rng: Rng, now: number) {
  if (g.done) return;
  g.round += 1;
  while (g.round < g.order.length && !isBot(g.order[g.round]) && !g.players.includes(g.order[g.round])) g.round += 1;
  if (g.round >= g.order.length) return finish(g, "rounds");
  startRound(g, rng, now);
}

export function finish(g: SketchGame, reason: "rounds" | "left") {
  const live = g.players.length ? g.players : g.everyone;
  const best = Math.max(...live.map((p) => g.totals[p] ?? 0));
  g.done = { winners: live.filter((p) => (g.totals[p] ?? 0) === best), reason };
  g.deadline = undefined;
}

/** Whether every drawer is done, so the round can end early. */
export const allFinished = (g: SketchGame) => drawersOf(g).every((p) => g.finished.includes(p));

/**
 * Someone left. Returns what should happen to the round in progress:
 * "reveal" to score it now, "skip" when the describer left before drawing their picture.
 */
export function leaveGame(g: SketchGame, who: string): "reveal" | "skip" | null {
  if (!g.players.includes(who) || g.done) return null;
  const wasDescriber = describerOf(g) === who;
  g.players = g.players.filter((p) => p !== who);
  g.finished = g.finished.filter((p) => p !== who);
  const solo = g.order.every(isBot);
  if (g.players.length === 0 || (!solo && g.players.length < 2)) {
    finish(g, "left");
    return null;
  }
  if (g.phase === "sketch" && wasDescriber) return "skip";
  return g.phase === "draw" && (wasDescriber || allFinished(g)) ? "reveal" : null;
}
