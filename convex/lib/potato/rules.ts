// Hot Potato: a bomb with a secret fuse lands on someone's phone. To get rid of it they must beat
// a quick challenge, then throw it at anyone they like. When it explodes, whoever is holding it
// loses a life. Last one standing wins. Pure rules, shared by server and client.

export type ChallengeKind = "find" | "sum" | "taps" | "odd" | "ink" | "hold" | "bigger";
export const CHALLENGES: { kind: ChallengeKind; prompt: string }[] = [
  { kind: "find", prompt: "Tap the target!" },
  { kind: "sum", prompt: "Solve it!" },
  { kind: "taps", prompt: "Tap 8 times!" },
  { kind: "odd", prompt: "Find the odd one!" },
  { kind: "ink", prompt: "Tap the INK colour!" },
  { kind: "hold", prompt: "Hold for 1.5 seconds!" },
  { kind: "bigger", prompt: "Tap the bigger number!" },
];

export const MAX_PLAYERS = 6;
export const LIFE_CHOICES = [1, 2, 3] as const;
export const FUSE_MIN = 12_000;
export const FUSE_MAX = 35_000;
export const MIN_HOLD_MS = 500; // nobody can pass faster than this, however quick they are
export const BOOM_MS = 4500; // the explosion screen before the next bomb

export type PotatoGame = {
  seq: number;
  players: string[]; // seat order
  lives: Record<string, number>;
  holder: string;
  challenge: { kind: ChallengeKind; seed: number };
  givenAt: number; // when the holder got the bomb
  bombAt: number; // when this bomb was lit
  explodeAt: number; // secret: never sent to phones
  phase: "play" | "boom";
  bomb: number; // how many bombs so far
  passes: number; // passes this bomb
  lastBoom: { who: string; passes: number; ms: number } | null;
  out: string[]; // in the order they were knocked out
  deadline?: number;
  sched?: number;
  done?: { winner: string | null; reason: "end" | "left" };
};

type Rng = () => number;

export const alive = (g: PotatoGame) => g.players.filter((p) => g.lives[p] > 0);

function newChallenge(r: Rng): PotatoGame["challenge"] {
  return { kind: CHALLENGES[Math.floor(r() * CHALLENGES.length)].kind, seed: Math.floor(r() * 2 ** 31) };
}

function lightBomb(g: PotatoGame, holder: string, r: Rng, now: number) {
  g.phase = "play";
  g.holder = holder;
  g.bomb += 1;
  g.passes = 0;
  g.bombAt = now;
  g.givenAt = now;
  g.explodeAt = now + FUSE_MIN + Math.floor(r() * (FUSE_MAX - FUSE_MIN));
  g.challenge = newChallenge(r);
  g.deadline = g.explodeAt;
}

export function newGame(players: string[], lives: number, r: Rng, now: number): PotatoGame {
  const g: PotatoGame = {
    seq: 0, players: [...players], lives: Object.fromEntries(players.map((p) => [p, lives])), holder: players[0],
    challenge: { kind: "find", seed: 0 }, givenAt: now, bombAt: now, explodeAt: now, phase: "play", bomb: 0, passes: 0, lastBoom: null, out: [],
  };
  lightBomb(g, players[Math.floor(r() * players.length)], r, now);
  return g;
}

/** The holder beat their challenge and throws the bomb at `target`. */
export function pass(g: PotatoGame, p: string, target: string, r: Rng, now: number): string | null {
  if (g.done || g.phase !== "play") return "No bomb right now";
  if (g.holder !== p) return "You're not holding the bomb!";
  if (now >= g.explodeAt) return "Too late! 💥";
  if (now - g.givenAt < MIN_HOLD_MS) return "Not so fast!";
  if (target === p || !alive(g).includes(target)) return "Throw it at someone else";
  g.holder = target;
  g.givenAt = now;
  g.passes += 1;
  g.challenge = newChallenge(r);
  return null;
}

/** The fuse ran out: the holder loses a life. */
export function explode(g: PotatoGame, now: number) {
  if (g.done || g.phase !== "play") return;
  const who = g.holder;
  g.lives[who] = Math.max(0, g.lives[who] - 1);
  if (g.lives[who] === 0) g.out.push(who);
  g.lastBoom = { who, passes: g.passes, ms: now - g.bombAt };
  g.phase = "boom";
  const left = alive(g);
  if (left.length <= 1) {
    g.done = { winner: left[0] ?? null, reason: "end" };
    g.deadline = undefined;
    return;
  }
  g.deadline = now + BOOM_MS;
}

/** After the explosion: a new bomb. Whoever got blown up starts with it, if they're still in. */
export function nextBomb(g: PotatoGame, r: Rng, now: number) {
  if (g.done || g.phase !== "boom") return;
  const left = alive(g);
  const start = g.lastBoom && left.includes(g.lastBoom.who) ? g.lastBoom.who : left[Math.floor(r() * left.length)];
  lightBomb(g, start, r, now);
}

/** Someone left: they're out. If they had the bomb, it jumps to someone else. */
export function leaveGame(g: PotatoGame, p: string, r: Rng, now: number) {
  if (g.done || !g.players.includes(p)) return;
  if (g.lives[p] > 0) { g.lives[p] = 0; g.out.push(p); }
  const left = alive(g);
  if (left.length <= 1) {
    g.done = { winner: left[0] ?? null, reason: "left" };
    g.deadline = undefined;
    return;
  }
  if (g.phase === "play" && g.holder === p) {
    g.holder = left[Math.floor(r() * left.length)];
    g.givenAt = now;
    g.challenge = newChallenge(r);
  }
}

/** How hot the bomb looks, 0–1, from how long it's been lit (phones never learn the real fuse). */
export const heat = (bombAt: number, now: number) => Math.min(1, Math.max(0, (now - bombAt) / FUSE_MAX));
