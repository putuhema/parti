import { EXPRESSIONS } from "./expressions";

export const FACE_MAX = 6;
export const FACE_ROUNDS = [5, 7, 10] as const;
export const FACE_TIMERS = [10, 15, 20] as const;
export type FaceRatingKind = "nailed" | "close" | "chaotic";

export const FACE_RATING: Record<FaceRatingKind, { score: number; label: string; emoji: string }> = {
  nailed: { score: 100, label: "Nailed it!", emoji: "💯" },
  close: { score: 75, label: "Cute try!", emoji: "😄" },
  chaotic: { score: 50, label: "Unhinged 😂", emoji: "😂" },
};

export const FACE_HYPE = ["😂", "😍", "🔥", "💀", "🫶", "👏"] as const;

export type FaceGame = {
  seq: number;
  rounds: number;
  turnSec: number;
  players: string[];
  out: string[];
  exprIds: string[];
  round: number;
  turnIndex: number;
  phase: "posing" | "reveal" | "roundSummary";
  scores: Record<string, number>;
  currentTurn: {
    playerId: string;
    exprId: string;
    snapped: boolean;
    skipped: boolean;
    aiScore?: number;
    ratings: Record<string, { kind: FaceRatingKind; score: number }>;
    reactions: { by: string; emoji: string; at: number }[];
  };
  roundResults: { playerId: string; aiScore?: number; partnerScore?: number; totalScore: number; skipped: boolean }[];
  history: {
    round: number;
    exprId: string;
    results: { playerId: string; aiScore?: number; partnerScore?: number; totalScore: number; skipped: boolean }[];
  }[];
  hype: { by: string; emoji: string; at: number }[];
  deadline?: number;
  sched?: number;
  done?: { winners: string[]; syncPct: number };
};

const SNAP_GRACE_MS = 4500;

function shuffle<T>(arr: readonly T[], rng: () => number): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function activePlayers(g: FaceGame): string[] {
  return g.players.filter((p) => !g.out.includes(p));
}

export function roundOrder(g: FaceGame): string[] {
  const a = activePlayers(g);
  if (!a.length) return [];
  const shift = g.round % a.length;
  return [...a.slice(shift), ...a.slice(0, shift)];
}

export function newFaceGame(
  players: string[],
  rounds: number,
  turnSec: number,
  now: number,
  countdownMs: number,
  rng: () => number,
): FaceGame {
  const pool = shuffle(EXPRESSIONS, rng);
  const exprIds = Array.from({ length: rounds }, (_, i) => pool[i % pool.length].id);
  const scores: Record<string, number> = {};
  for (const p of players) scores[p] = 0;
  return {
    seq: 0,
    rounds,
    turnSec,
    players: [...players],
    out: [],
    exprIds,
    round: 0,
    turnIndex: 0,
    phase: "posing",
    scores,
    currentTurn: {
      playerId: players[0],
      exprId: exprIds[0],
      snapped: false,
      skipped: false,
      ratings: {},
      reactions: [],
    },
    roundResults: [],
    history: [],
    hype: [],
    deadline: now + countdownMs + turnSec * 1000 + SNAP_GRACE_MS,
  };
}

export function computeFaceTurnScore(turn: FaceGame["currentTurn"]) {
  if (turn.skipped) return { partnerScore: undefined, totalScore: 0 };
  const vals = Object.values(turn.ratings).map((r) => r.score);
  const partnerScore = vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : undefined;
  const ai = turn.aiScore;
  if (ai !== undefined && partnerScore !== undefined) {
    return { partnerScore, totalScore: Math.round(ai * 0.55 + partnerScore * 0.45) };
  }
  if (partnerScore !== undefined) return { partnerScore, totalScore: partnerScore };
  if (ai !== undefined) return { partnerScore: undefined, totalScore: ai };
  return { partnerScore: undefined, totalScore: 75 };
}

export function submitFaceSnap(g: FaceGame, playerId: string, aiScore: number | undefined, now: number) {
  if (g.done) throw new Error("The game is over");
  if (g.phase !== "posing") throw new Error("Not snapping right now");
  if (g.currentTurn.playerId !== playerId) throw new Error("It's not your turn");
  g.currentTurn.snapped = true;
  g.currentTurn.skipped = false;
  g.currentTurn.aiScore =
    aiScore !== undefined && Number.isFinite(aiScore) ? Math.max(0, Math.min(100, Math.round(aiScore))) : undefined;
  g.phase = "reveal";
  g.deadline = now + 45_000;
}

export function skipFaceTurn(g: FaceGame, playerId: string, now: number) {
  if (g.done || g.phase !== "posing" || g.currentTurn.playerId !== playerId) return;
  g.currentTurn.skipped = true;
  g.phase = "reveal";
  g.deadline = now + 12_000;
}

export function rateFaceSnap(g: FaceGame, raterId: string, kind: FaceRatingKind, now: number) {
  if (g.done || g.phase !== "reveal" || g.currentTurn.skipped) throw new Error("Nothing to rate");
  if (g.currentTurn.playerId === raterId) throw new Error("Can't rate your own face");
  g.currentTurn.ratings[raterId] = { kind, score: FACE_RATING[kind].score };
  const others = activePlayers(g).filter((p) => p !== g.currentTurn.playerId);
  if (others.every((p) => !!g.currentTurn.ratings[p])) {
    g.deadline = Math.min(g.deadline ?? now + 12_000, now + 12_000);
  }
}

export function reactFace(g: FaceGame, by: string, emoji: string, now: number) {
  if (g.done || !(FACE_HYPE as readonly string[]).includes(emoji)) return;
  if (g.phase === "posing") g.hype = [...g.hype.slice(-7), { by, emoji, at: now }];
  else if (g.phase === "reveal") g.currentTurn.reactions = [...g.currentTurn.reactions.slice(-11), { by, emoji, at: now }];
}

function finishFace(g: FaceGame) {
  const pool = activePlayers(g).length ? activePlayers(g) : g.players;
  const best = Math.max(...pool.map((p) => g.scores[p] ?? 0));
  const winners = pool.filter((p) => (g.scores[p] ?? 0) === best);
  const all = g.history.flatMap((h) => h.results.map((r) => r.totalScore));
  const syncPct = all.length ? Math.round(all.reduce((a, b) => a + b, 0) / all.length) : 0;
  g.done = { winners, syncPct };
  g.deadline = undefined;
}

export function advanceFace(g: FaceGame, now: number) {
  if (g.done) return;
  const order = roundOrder(g);
  if (!order.length) {
    finishFace(g);
    return;
  }

  if (g.phase === "reveal") {
    const { partnerScore, totalScore } = computeFaceTurnScore(g.currentTurn);
    const p = g.currentTurn.playerId;
    g.scores[p] = (g.scores[p] ?? 0) + totalScore;
    g.roundResults.push({
      playerId: p,
      aiScore: g.currentTurn.aiScore,
      partnerScore,
      totalScore,
      skipped: g.currentTurn.skipped,
    });
    const nextIdx = g.turnIndex + 1;
    if (nextIdx < order.length) {
      g.turnIndex = nextIdx;
      g.phase = "posing";
      g.hype = [];
      g.currentTurn = {
        playerId: order[nextIdx],
        exprId: g.exprIds[g.round],
        snapped: false,
        skipped: false,
        ratings: {},
        reactions: [],
      };
      g.deadline = now + g.turnSec * 1000 + SNAP_GRACE_MS;
      return;
    }

    g.history.push({ round: g.round, exprId: g.exprIds[g.round], results: [...g.roundResults] });
    g.roundResults = [];
    if (order.length >= 2) {
      g.phase = "roundSummary";
      g.deadline = now + 60_000;
      return;
    }
    if (g.round + 1 >= g.rounds) finishFace(g);
    else {
      g.round += 1;
      g.turnIndex = 0;
      const nextOrder = roundOrder(g);
      g.phase = "posing";
      g.hype = [];
      g.currentTurn = {
        playerId: nextOrder[0],
        exprId: g.exprIds[g.round],
        snapped: false,
        skipped: false,
        ratings: {},
        reactions: [],
      };
      g.deadline = now + g.turnSec * 1000 + SNAP_GRACE_MS;
    }
    return;
  }

  if (g.phase === "roundSummary") {
    if (g.round + 1 >= g.rounds) finishFace(g);
    else {
      g.round += 1;
      g.turnIndex = 0;
      const nextOrder = roundOrder(g);
      g.phase = "posing";
      g.hype = [];
      g.currentTurn = {
        playerId: nextOrder[0],
        exprId: g.exprIds[g.round],
        snapped: false,
        skipped: false,
        ratings: {},
        reactions: [],
      };
      g.deadline = now + g.turnSec * 1000 + SNAP_GRACE_MS;
    }
  }
}

export function onFaceDeadline(g: FaceGame, now: number) {
  if (g.done) return;
  if (g.phase === "posing") {
    skipFaceTurn(g, g.currentTurn.playerId, now);
    return;
  }
  advanceFace(g, now);
}
