// Scribble Chain: drawing telephone. Everyone starts a chain by picking a silly secret phrase and
// drawing it. Phones then pass the chains around: the next player guesses the drawing, the next
// draws that guess, and so on. Nobody sees the earlier steps. At the end the chains are replayed
// one step at a time to see how far they drifted.
//
// Chain c at step s belongs to players[(c + s) % n]. Even steps are drawings (step 0 also holds the
// secret phrase), odd steps are guesses. With two players the chain's starter always draws and the
// other always guesses, so a guesser never knows the phrase. Pure rules, shared by server and client.

import { rng } from "../party/rules";

export const CHAIN_MIN = 2;
export const CHAIN_MAX = 8;
export const DRAWING_CHOICES = [2, 3, 4] as const; // drawings per chain; each one is followed by a guess
export const START_MS = 100_000; // pick a phrase and draw it
export const DRAW_MS = 80_000;
export const GUESS_MS = 35_000;
export const GRACE_MS = 3000; // slack for phones still sending when time runs out
export const TEXT_LEN = 60;
export const BLANK_GUESS = "🤷";

// Drawings are strokes of [colour, x0, y0, x1, y1, …] on a 0–1000 canvas.
export const CANVAS = 1000;
export const PALETTE = ["#2B2140", "#FF4B4B", "#1899D6", "#58CC02", "#FFB020", "#A560E8", "#8B5A2B", "#FF86C8"];
export const MAX_STROKES = 300;
export const MAX_POINTS = 5000;

export const PROMPTS = [
  "a cat doing yoga", "a shark at the dentist", "grandma on a skateboard", "a haunted toaster", "a snowman on the beach",
  "a dragon eating noodles", "a banana in jail", "a robot walking a dog", "a cow on the moon", "a ghost doing laundry",
  "a pineapple wearing sunglasses", "a penguin at a job interview", "a giraffe stuck in a car", "a wizard ordering pizza",
  "an octopus playing drums", "a dinosaur birthday party", "a chicken crossing a rainbow", "a vampire at the beach",
  "a cactus giving a hug", "a whale in a bathtub", "a superhero doing taxes", "a frog proposing marriage", "an alien at the gym",
  "a burger with legs running away", "a mermaid on a bicycle", "a sloth winning a race", "a pirate afraid of water",
  "a pig flying a plane", "a sandwich with feelings", "a bear stealing honey", "a crying onion", "a lion getting a haircut",
  "a snail with a jetpack", "a volcano sneezing", "a tiny elephant on a phone", "a mummy on vacation", "a duck in a business suit",
  "a cloud raining tacos", "a cowboy riding a chicken", "a broccoli superhero", "a monkey taking a selfie", "a ninja grandma",
  "a sleepy sun", "a sock monster under the bed", "a hamster driving a bus", "a carrot at a concert", "a king who lost his crown",
  "a dog who is a chef", "a horse on roller skates", "a dancing tree", "a coffee cup that is very tired", "a fish riding a scooter",
  "an egg hatching a robot", "a rocket made of cheese", "a witch on a vacuum cleaner", "a bee at a disco", "a turtle in a hurry",
  "a strawberry getting married", "a skeleton playing guitar", "a sheep counting people", "a unicorn stuck in traffic",
  "a lazy dragon on a couch", "a kangaroo with a backpack", "a fridge full of secrets", "a mouse lifting weights",
  "an ice cream melting in panic", "a hippo ballet dancer", "a pizza delivered by bird", "a moon eating a cookie",
  "a sad clown at the bank", "a parrot telling a joke", "a giant spider knitting", "a baby running a meeting",
  "a cat stuck in a tree", "a zombie at a picnic", "a squirrel planning a heist", "an owl reading the news", "a nervous lightbulb",
];

export type ChainGame = {
  seq: number;
  players: string[]; // seat order; chains are numbered by their starter's seat
  gone: string[]; // players who left; their turns fill in blank
  drawings: number; // drawings per chain
  seed: number; // deals the phrase choices
  step: number; // 0 … steps-1 while playing
  submitted: string[]; // who has handed in this step
  phase: "play" | "album" | "done";
  album: { chain: number; shown: number }; // replay position: entries shown of the current chain
  nailed: Record<string, boolean>; // `${chain}:${step}` → the guess matched what was drawn
  survived: Record<string, boolean>; // chain → the final guess matched the phrase
  likes: Record<string, string[]>; // `${chain}:${step}` → who loved it
  deadline?: number;
  sched?: number;
  done?: { reason: "end" | "left"; awards: Award[] };
};

export type Award = { kind: "artist" | "guesser" | "team"; who: string[]; n: number };

export const steps = (g: Pick<ChainGame, "drawings">) => g.drawings * 2;
export const isDraw = (step: number) => step % 2 === 0;
export const ownerOf = (g: Pick<ChainGame, "players">, chain: number, step: number) => g.players[(chain + step) % g.players.length];
/** Which chain you're working on at this step. */
export const chainOf = (g: Pick<ChainGame, "players">, who: string, step: number) => {
  const n = g.players.length;
  return (((g.players.indexOf(who) - step) % n) + n) % n;
};
export const stepMs = (step: number) => (step === 0 ? START_MS : isDraw(step) ? DRAW_MS : GUESS_MS);
export const key = (chain: number, step: number) => `${chain}:${step}`;
export const active = (g: ChainGame) => g.players.filter((p) => !g.gone.includes(p));

/** Three phrase choices for a seat. One shuffle per game, so no two seats share a phrase. */
export function dealt(seed: number, seat: number) {
  const r = rng(seed);
  const pool = [...PROMPTS];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(seat * 3, seat * 3 + 3);
}

export function newGame(players: string[], drawings: number, seed: number, now: number): ChainGame {
  return {
    seq: 0,
    players,
    gone: [],
    drawings,
    seed,
    step: 0,
    submitted: [],
    phase: "play",
    album: { chain: 0, shown: 1 },
    nailed: {},
    survived: {},
    likes: {},
    deadline: now + stepMs(0),
  };
}

/** Everyone still here has handed in. */
export const allIn = (g: ChainGame) => active(g).every((p) => g.submitted.includes(p));

/** Move to the next step, or to the replay after the last one. */
export function advance(g: ChainGame, now: number) {
  g.submitted = [];
  g.step += 1;
  if (g.step >= steps(g)) {
    g.phase = "album";
    g.album = { chain: 0, shown: 1 };
    g.deadline = undefined;
    return;
  }
  g.deadline = now + stepMs(g.step);
}

/** Show the next entry of the replay; after the last chain the game ends. Returns false if `at` is stale. */
export function nextInAlbum(g: ChainGame, at: { chain: number; shown: number }) {
  if (g.phase !== "album" || at.chain !== g.album.chain || at.shown !== g.album.shown) return false;
  if (g.album.shown < steps(g)) g.album.shown += 1;
  else if (g.album.chain < g.players.length - 1) g.album = { chain: g.album.chain + 1, shown: 1 };
  else finish(g, "end");
  return true;
}

export function toggleLike(g: ChainGame, who: string, chain: number, step: number) {
  if (g.phase !== "album") return "The replay hasn't started";
  if (chain > g.album.chain || (chain === g.album.chain && step >= g.album.shown)) return "Not shown yet";
  if (ownerOf(g, chain, step) === who) return "You can't love your own";
  const k = key(chain, step);
  const list = g.likes[k] ?? [];
  g.likes[k] = list.includes(who) ? list.filter((p) => p !== who) : [...list, who];
  return null;
}

export function finish(g: ChainGame, reason: "end" | "left") {
  g.phase = "done";
  g.deadline = undefined;
  g.done = { reason, awards: reason === "end" ? awards(g) : [] };
}

/** Best artist (most ❤️ on drawings), best guesser (most ❤️ on guesses), and the team score. */
export function awards(g: ChainGame): Award[] {
  const tally = (draw: boolean) => {
    const n: Record<string, number> = {};
    for (const [k, who] of Object.entries(g.likes)) {
      const [c, s] = k.split(":").map(Number);
      if (isDraw(s) !== draw || !who.length) continue;
      const p = ownerOf(g, c, s);
      n[p] = (n[p] ?? 0) + who.length;
    }
    const best = Math.max(0, ...Object.values(n));
    return { who: best ? Object.keys(n).filter((p) => n[p] === best) : [], n: best };
  };
  const out: Award[] = [];
  const art = tally(true), guess = tally(false);
  if (art.n) out.push({ kind: "artist", ...art });
  if (guess.n) out.push({ kind: "guesser", ...guess });
  out.push({ kind: "team", who: [], n: Object.values(g.nailed).filter(Boolean).length });
  return out;
}

// ---------- Did the guess match? ----------
const STOP = new Set(["a", "an", "the", "of", "on", "in", "at", "with", "and", "is", "are", "to", "his", "her", "its", "my", "your", "their", "some", "for", "from", "by", "who", "that", "very", "into", "it", "this"]);
export function keywords(t: string) {
  return t
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 1 && !STOP.has(w))
    .map((w) => (w.endsWith("ies") && w.length > 4 ? `${w.slice(0, -3)}y` : w.length > 3 && w.endsWith("s") && !w.endsWith("ss") ? w.slice(0, -1) : w));
}
/** A guess "nails it" when it has at least half the key words of what was drawn. */
export function matches(guess: string, answer: string) {
  const want = new Set(keywords(answer));
  if (!want.size) return false;
  const got = new Set(keywords(guess));
  let hit = 0;
  for (const w of want) if (got.has(w)) hit++;
  return hit / want.size >= 0.5;
}

// ---------- Cleaning what phones send ----------
export function cleanText(t: string) {
  return t.replace(/\s+/g, " ").trim().slice(0, TEXT_LEN);
}
export function cleanStrokes(strokes: number[][]) {
  const out: number[][] = [];
  let points = 0;
  for (const s of strokes.slice(0, MAX_STROKES)) {
    if (s.length < 3) continue;
    const color = Math.max(0, Math.min(PALETTE.length - 1, Math.round(s[0]) || 0));
    const pts: number[] = [color];
    for (let i = 1; i + 1 < s.length && points < MAX_POINTS; i += 2, points++) {
      pts.push(Math.max(0, Math.min(CANVAS, Math.round(s[i]))), Math.max(0, Math.min(CANVAS, Math.round(s[i + 1]))));
    }
    if (pts.length >= 3) out.push(pts);
  }
  return out;
}
