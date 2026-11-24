import { POSES, posesForPack, type PosePack } from "./poses";

export const POSE_MAX = 6;
export const PACK_CHOICES: readonly PosePack[] = ["mix", "cute", "silly", "active"];
export const ROUND_CHOICES = [5, 7, 10] as const;
export const TIMER_CHOICES = [10, 15, 20] as const;

export type RatingKind = "nailed" | "close" | "chaotic";

export const RATING_SCORE: Record<RatingKind, { score: number; label: string; emoji: string }> = {
  nailed: { score: 100, label: "Nailed it!", emoji: "💯" },
  close: { score: 75, label: "So close!", emoji: "😄" },
  chaotic: { score: 50, label: "Pure chaos", emoji: "😂" },
};

export const HYPE_EMOJIS = ["🔥", "😍", "😂", "👏", "🫶", "💀"] as const;

export type PosePhase = "posing" | "reveal" | "roundSummary";

export type TurnReaction = {
  by: string;
  emoji: string;
  at: number;
};

export type TurnRating = {
  kind: RatingKind;
  score: number;
};

export type ActiveTurn = {
  playerId: string;
  poseId: string;
  snapped: boolean;
  skipped: boolean;
  aiScore?: number;
  ratings: Record<string, TurnRating>;
  reactions: TurnReaction[];
};

export type TurnResult = {
  playerId: string;
  aiScore?: number;
  partnerScore?: number;
  totalScore: number;
  skipped: boolean;
};

export type RoundHistory = {
  round: number;
  poseId: string;
  results: TurnResult[];
};

export type PoseGame = {
  seq: number;
  pack: PosePack;
  rounds: number;
  turnSec: number;
  players: string[];
  out: string[];
  poseIds: string[];
  round: number; // 0-indexed
  turnIndex: number; // index into activePlayers()
  phase: PosePhase;
  scores: Record<string, number>;
  currentTurn: ActiveTurn;
  roundResults: TurnResult[];
  history: RoundHistory[];
  hype: TurnReaction[];
  deadline?: number;
  sched?: number;
  done?: {
    winners: string[];
    coupleSync: number;
    totalPoses: number;
  };
};

// Give client 4 seconds of grace past the visible timer so auto-snap + upload completes cleanly.
const SNAP_GRACE_MS = 4500;
const REVEAL_MAX_MS = 45_000;
const SUMMARY_MAX_MS = 60_000;

export function activePlayers(g: PoseGame): string[] {
  return g.players.filter((p) => !g.out.includes(p));
}

function shuffle<T>(arr: readonly T[], rng: () => number): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function pickPoses(pack: PosePack, rounds: number, rng: () => number): string[] {
  const pool = shuffle(posesForPack(pack), rng);
  const chosen: string[] = [];
  for (let i = 0; i < rounds; i++) {
    if (i < pool.length) {
      chosen.push(pool[i].id);
    } else {
      const extra = shuffle(POSES, rng).find((p) => !chosen.includes(p.id)) ?? POSES[i % POSES.length];
      chosen.push(extra.id);
    }
  }
  return chosen;
}

export function newGame(
  players: string[],
  pack: PosePack,
  rounds: number,
  turnSec: number,
  now: number,
  countdownMs: number,
  rng: () => number,
): PoseGame {
  if (players.length < 1) throw new Error("Need at least 1 player");
  const poseIds = pickPoses(pack, rounds, rng);
  const scores: Record<string, number> = {};
  for (const p of players) scores[p] = 0;
  return {
    seq: 0,
    pack,
    rounds,
    turnSec,
    players: [...players],
    out: [],
    poseIds,
    round: 0,
    turnIndex: 0,
    phase: "posing",
    scores,
    currentTurn: {
      playerId: players[0],
      poseId: poseIds[0],
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

export function computeTurnScore(turn: ActiveTurn): { partnerScore?: number; totalScore: number } {
  if (turn.skipped) return { totalScore: 0 };
  const ratingValues = Object.values(turn.ratings).map((r) => r.score);
  const partnerScore = ratingValues.length
    ? Math.round(ratingValues.reduce((a, b) => a + b, 0) / ratingValues.length)
    : undefined;
  const ai = turn.aiScore;

  if (ai !== undefined && partnerScore !== undefined) {
    // 55% live pose AI match + 45% partner vibe rating!
    return { partnerScore, totalScore: Math.round(ai * 0.55 + partnerScore * 0.45) };
  }
  if (partnerScore !== undefined) return { partnerScore, totalScore: partnerScore };
  if (ai !== undefined) return { totalScore: ai };
  return { totalScore: 75 };
}

export function submitSnap(g: PoseGame, playerId: string, aiScore: number | undefined, now: number) {
  if (g.done) throw new Error("The game is over");
  if (g.phase !== "posing") throw new Error("Not accepting a snap right now");
  if (g.currentTurn.playerId !== playerId) throw new Error("It's not your turn to pose");

  const clampedAi =
    aiScore !== undefined && Number.isFinite(aiScore) ? Math.max(0, Math.min(100, Math.round(aiScore))) : undefined;
  g.currentTurn.snapped = true;
  g.currentTurn.skipped = false;
  g.currentTurn.aiScore = clampedAi;
  g.phase = "reveal";
  g.deadline = now + REVEAL_MAX_MS;
}

export function skipTurn(g: PoseGame, playerId: string, now: number) {
  if (g.done) throw new Error("The game is over");
  if (g.phase !== "posing") throw new Error("Not posing right now");
  if (g.currentTurn.playerId !== playerId) throw new Error("It's not your turn");

  g.currentTurn.snapped = false;
  g.currentTurn.skipped = true;
  g.phase = "reveal";
  g.deadline = now + 15_000;
}

export function rateSnap(g: PoseGame, raterId: string, kind: RatingKind, now: number) {
  if (g.done) throw new Error("The game is over");
  if (g.phase !== "reveal") throw new Error("Nothing to rate right now");
  if (g.currentTurn.skipped) throw new Error("This turn was skipped");
  if (g.currentTurn.playerId === raterId) throw new Error("You can't rate your own pose");
  if (!g.players.includes(raterId) || g.out.includes(raterId)) throw new Error("You're watching this game");

  g.currentTurn.ratings[raterId] = { kind, score: RATING_SCORE[kind].score };
  // Give a moment to admire reactions before auto-advancing if needed
  const others = activePlayers(g).filter((p) => p !== g.currentTurn.playerId);
  const allRated = others.every((p) => !!g.currentTurn.ratings[p]);
  if (allRated) {
    g.deadline = Math.min(g.deadline ?? now + 12_000, now + 12_000);
  }
}

export function addReaction(g: PoseGame, playerId: string, emoji: string, now: number) {
  if (g.done) return;
  if (!(HYPE_EMOJIS as readonly string[]).includes(emoji)) throw new Error("Unknown reaction");
  if (g.phase === "posing") {
    g.hype = [...g.hype.slice(-7), { by: playerId, emoji, at: now }];
  } else if (g.phase === "reveal") {
    g.currentTurn.reactions = [...g.currentTurn.reactions.slice(-11), { by: playerId, emoji, at: now }];
  }
}

function finalizeCurrentTurn(g: PoseGame) {
  const { partnerScore, totalScore } = computeTurnScore(g.currentTurn);
  const p = g.currentTurn.playerId;
  g.scores[p] = (g.scores[p] ?? 0) + totalScore;
  g.roundResults.push({
    playerId: p,
    aiScore: g.currentTurn.aiScore,
    partnerScore,
    totalScore,
    skipped: g.currentTurn.skipped,
  });
}

function finishGame(g: PoseGame) {
  const active = activePlayers(g);
  const pool = active.length ? active : g.players;
  const best = Math.max(...pool.map((p) => g.scores[p] ?? 0));
  const winners = pool.filter((p) => (g.scores[p] ?? 0) === best);

  // Couple Sync = average of all non-skipped turn scores across the game (0..100)
  const allScores = g.history.flatMap((h) => h.results.map((r) => r.totalScore));
  const coupleSync = allScores.length
    ? Math.round(allScores.reduce((a, b) => a + b, 0) / allScores.length)
    : 0;

  g.done = {
    winners,
    coupleSync,
    totalPoses: g.history.length,
  };
  g.deadline = undefined;
}

function startTurn(g: PoseGame, playerId: string, now: number) {
  g.phase = "posing";
  g.hype = [];
  g.currentTurn = {
    playerId,
    poseId: g.poseIds[g.round],
    snapped: false,
    skipped: false,
    ratings: {},
    reactions: [],
  };
  g.deadline = now + g.turnSec * 1000 + SNAP_GRACE_MS;
}

export function advance(g: PoseGame, now: number) {
  if (g.done) return;
  const active = activePlayers(g);
  if (active.length === 0) {
    finishGame(g);
    return;
  }

  if (g.phase === "reveal") {
    finalizeCurrentTurn(g);
    const nextIdx = g.turnIndex + 1;
    if (nextIdx < active.length) {
      g.turnIndex = nextIdx;
      startTurn(g, active[nextIdx], now);
      return;
    }
    // Everyone has gone this round
    g.history.push({
      round: g.round,
      poseId: g.poseIds[g.round],
      results: [...g.roundResults],
    });
    g.roundResults = [];

    // Show side-by-side collage when 2+ players are playing
    if (active.length >= 2) {
      g.phase = "roundSummary";
      g.deadline = now + SUMMARY_MAX_MS;
      return;
    }

    // Solo mode: jump straight to next pose or finish
    if (g.round + 1 >= g.rounds) {
      finishGame(g);
    } else {
      g.round += 1;
      g.turnIndex = 0;
      startTurn(g, active[0], now);
    }
    return;
  }

  if (g.phase === "roundSummary") {
    if (g.round + 1 >= g.rounds) {
      finishGame(g);
    } else {
      g.round += 1;
      g.turnIndex = 0;
      startTurn(g, active[0], now);
    }
  }
}

export function onDeadline(g: PoseGame, now: number) {
  if (g.done) return;
  if (g.phase === "posing") {
    g.currentTurn.snapped = false;
    g.currentTurn.skipped = true;
    g.phase = "reveal";
    g.deadline = now + 10_000;
    return;
  }
  advance(g, now);
}

export function leaveGame(g: PoseGame, playerId: string, now: number) {
  if (g.done || g.out.includes(playerId)) return;
  g.out.push(playerId);
  const active = activePlayers(g);
  if (active.length === 0) {
    finishGame(g);
    return;
  }
  if (g.phase === "posing" && g.currentTurn.playerId === playerId) {
    g.currentTurn.skipped = true;
    g.phase = "reveal";
    advance(g, now);
  } else if (g.turnIndex >= active.length) {
    g.turnIndex = Math.max(0, active.length - 1);
  }
}
