import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { addXp, befriend, findPlayer, freeCode, requirePlayer } from "./lib/helpers";
import { CARDS, TOPICS, type TopicId } from "./lib/brain/cards";
import { ROUND_CHOICES, agreeLock, agreePick, learnedBy, markReady, maxScore, newGame, nextRound, quizAnswer, quizCardFor, type BrainGame } from "./lib/brain/rules";

type Room = Doc<"brainRooms">;
const MAX = 2;

const topicV = v.union(v.literal("space"), v.literal("body"), v.literal("animals"), v.literal("indonesia"), v.literal("history"), v.literal("life"));
const modeV = v.union(v.literal("teach"), v.literal("agree"));

async function roomByCode(ctx: QueryCtx, code: string) {
  return await ctx.db
    .query("brainRooms")
    .withIndex("by_code", (q) => q.eq("code", code.trim().toUpperCase()))
    .order("desc")
    .first();
}
async function requireRoom(ctx: QueryCtx, code: string) {
  const r = await roomByCode(ctx, code);
  if (!r) throw new ConvexError("Room not found");
  return r;
}
async function bookOf(ctx: QueryCtx, playerId: Id<"players">) {
  return await ctx.db.query("brainBooks").withIndex("by_playerId", (q) => q.eq("playerId", playerId)).unique();
}

/** Save the game. Every finished round adds its cards to each player's Brain Book. */
async function commit(ctx: MutationCtx, room: Room, g: BrainGame) {
  g.seq += 1;
  const patch: Partial<Room> = { game: g };
  if (g.phase === "reveal" || g.done) await remember(ctx, g);
  if (g.done && room.status !== "finished") {
    patch.status = "finished";
    patch.endedAt = Date.now();
    if (g.done.reason === "end") {
      const pct = g.score / Math.max(1, maxScore(g));
      for (const p of g.players) await addXp(ctx, p as Id<"players">, 10 + Math.round(pct * 20));
    }
  }
  await ctx.db.patch(room._id, patch);
}

async function remember(ctx: MutationCtx, g: BrainGame) {
  for (const p of g.players) {
    const ids = learnedBy(g, p);
    if (!ids.length) continue;
    const id = p as Id<"players">;
    const book = await bookOf(ctx, id);
    const all = [...new Set([...(book?.learned ?? []), ...ids])];
    if (!book) await ctx.db.insert("brainBooks", { playerId: id, learned: all });
    else if (all.length !== book.learned.length) await ctx.db.patch(book._id, { learned: all });
  }
}

// ---------- Lobby ----------
export const create = mutation({
  args: {},
  handler: async (ctx) => {
    const me = await requirePlayer(ctx);
    const code = await freeCode(ctx);
    await ctx.db.insert("brainRooms", { code, hostId: me._id, mode: "teach", topics: TOPICS.map((t) => t.id), rounds: ROUND_CHOICES[1], status: "lobby", gameNo: 0, members: [{ playerId: me._id, seat: 0, lastSeen: Date.now() }] });
    return code;
  },
});

export const join = mutation({
  args: { code: v.string() },
  handler: async (ctx, { code }) => {
    const me = await requirePlayer(ctx);
    const room = await roomByCode(ctx, code);
    if (!room) throw new ConvexError("No room with that code");
    if (room.members.some((m) => m.playerId === me._id)) return room.code;
    if (room.members.length >= MAX) throw new ConvexError("This room is for two, and it's full");
    const taken = new Set(room.members.map((m) => m.seat));
    let seat = 0;
    while (taken.has(seat)) seat++;
    await ctx.db.patch(room._id, { members: [...room.members, { playerId: me._id, seat, lastSeen: Date.now() }] });
    return room.code;
  },
});

export const settings = mutation({
  args: { code: v.string(), mode: modeV, topics: v.array(topicV), rounds: v.number() },
  handler: async (ctx, { code, mode, topics, rounds }) => {
    const me = await requirePlayer(ctx);
    const room = await requireRoom(ctx, code);
    if (room.hostId !== me._id) throw new ConvexError("Only the host can change this");
    if (room.status === "playing") return;
    const clean = TOPICS.map((t) => t.id).filter((id) => topics.includes(id));
    if (!clean.length) throw new ConvexError("Pick at least one topic");
    if (!(ROUND_CHOICES as readonly number[]).includes(rounds)) throw new ConvexError("Pick one of the lengths");
    await ctx.db.patch(room._id, { mode, topics: clean, rounds });
  },
});

export const start = mutation({
  args: { code: v.string() },
  handler: async (ctx, { code }) => {
    const me = await requirePlayer(ctx);
    const room = await requireRoom(ctx, code);
    if (room.hostId !== me._id) throw new ConvexError("Only the host can start");
    if (room.status === "playing") return;
    const players = [...room.members].sort((a, b) => a.seat - b.seat).map((m) => m.playerId);
    if (players.length === 2) await befriend(ctx, players[0], players[1]);
    const learned = new Set<string>();
    for (const p of players) for (const id of (await bookOf(ctx, p))?.learned ?? []) learned.add(id);
    const g = newGame(players, room.mode, room.topics as TopicId[], room.rounds, [...learned], Math.random);
    if (!g.rounds.length) throw new ConvexError("Not enough cards in those topics");
    const fresh = { ...room, gameNo: room.gameNo + 1, status: "playing" as const, endedAt: undefined };
    await ctx.db.patch(room._id, { gameNo: fresh.gameNo, status: "playing", endedAt: undefined });
    await commit(ctx, fresh, g);
  },
});

export const rematch = mutation({
  args: { code: v.string() },
  handler: async (ctx, { code }) => {
    const me = await requirePlayer(ctx);
    const room = await requireRoom(ctx, code);
    if (!room.members.some((m) => m.playerId === me._id)) throw new ConvexError("You're not in this room");
    if (room.status === "playing") return;
    await ctx.db.patch(room._id, { status: "lobby", game: undefined, endedAt: undefined });
  },
});

export const leave = mutation({
  args: { code: v.string() },
  handler: async (ctx, { code }) => {
    const me = await requirePlayer(ctx);
    const room = await roomByCode(ctx, code);
    if (!room || !room.members.some((m) => m.playerId === me._id)) return;
    const rest = room.members.filter((m) => m.playerId !== me._id).map((m) => ({ ...m, seat: 0 }));
    const patch: Partial<Room> = { members: rest };
    if (rest.length === 0) { patch.status = "finished"; patch.endedAt = Date.now(); }
    else if (room.hostId === me._id) patch.hostId = rest[0].playerId;
    await ctx.db.patch(room._id, patch);
    const g = room.game as BrainGame | undefined;
    if (room.status !== "playing" || !g || g.done || !g.players.includes(me._id)) return;
    g.done = { reason: "left" };
    await commit(ctx, (await ctx.db.get(room._id))!, g);
  },
});

export const presence = mutation({
  args: { code: v.string() },
  handler: async (ctx, { code }) => {
    const me = await findPlayer(ctx);
    const room = await roomByCode(ctx, code);
    if (!me || !room || !room.members.some((m) => m.playerId === me._id)) return;
    await ctx.db.patch(room._id, { members: room.members.map((m) => (m.playerId === me._id ? { ...m, lastSeen: Date.now() } : m)) });
  },
});

// ---------- Playing ----------
async function liveGame(ctx: MutationCtx, code: string, round: number) {
  const me = await requirePlayer(ctx);
  const room = await requireRoom(ctx, code);
  if (room.status !== "playing" || !room.game) throw new ConvexError("The game isn't running");
  const g = room.game as BrainGame;
  if (g.done) throw new ConvexError("The game is over");
  if (!g.players.includes(me._id)) throw new ConvexError("You're watching this game");
  return { me, room, g, stale: g.round !== round };
}

export const act = mutation({
  args: {
    code: v.string(),
    round: v.number(),
    move: v.union(
      v.object({ kind: v.literal("ready") }),
      v.object({ kind: v.literal("quiz"), pick: v.number() }),
      v.object({ kind: v.literal("pick"), pick: v.number() }),
      v.object({ kind: v.literal("lock") }),
      v.object({ kind: v.literal("next") }),
    ),
  },
  handler: async (ctx, { code, round, move }) => {
    const { me, room, g, stale } = await liveGame(ctx, code, round);
    if (stale) return;
    let err: string | null = null;
    if (move.kind === "ready") markReady(g, me._id);
    else if (move.kind === "quiz") err = quizAnswer(g, me._id, move.pick);
    else if (move.kind === "pick") err = agreePick(g, me._id, move.pick);
    else if (move.kind === "lock") err = agreeLock(g, me._id);
    else nextRound(g, me._id);
    if (err) throw new ConvexError(err);
    await commit(ctx, room, g);
  },
});

// ---------- What each phone sees ----------
export const view = query({
  args: { code: v.string() },
  handler: async (ctx, { code }) => {
    const me = await findPlayer(ctx);
    const room = await roomByCode(ctx, code);
    if (!me || !room) return null;
    const members = await Promise.all(
      [...room.members]
        .sort((a, b) => a.seat - b.seat)
        .map(async (m) => {
          const p = await ctx.db.get(m.playerId);
          return { id: m.playerId as string, name: p?.name ?? "Player", seat: m.seat, isMe: m.playerId === me._id, isHost: room.hostId === m.playerId, lastSeen: m.lastSeen };
        }),
    );
    const book = await bookOf(ctx, me._id);
    const base = {
      code: room.code,
      mode: room.mode,
      topics: room.topics,
      rounds: room.rounds,
      status: room.status,
      gameNo: room.gameNo,
      isHost: room.hostId === me._id,
      isMember: room.members.some((m) => m.playerId === me._id),
      meId: me._id as string,
      members,
      learned: book?.learned ?? [],
      total: CARDS.length,
    };
    if (room.status === "lobby" || !room.game) return { ...base, game: null };
    const g = room.game as BrainGame;
    const names: Record<string, string> = {};
    for (const p of g.players) names[p] = members.find((m) => m.id === p)?.name ?? (await ctx.db.get(p as Id<"players">))?.name ?? "Player";
    const isPlayer = g.players.includes(me._id);
    const r = g.rounds[g.round];
    const revealed = g.phase === "reveal" || !!g.done;
    // In Teach Swap you only ever see your own card until the reveal. Your partner's arrives by voice.
    const myCard = r ? (g.mode === "teach" ? r.cards[me._id] ?? null : r.shared ?? null) : null;
    const quizCard = r && g.mode === "teach" && isPlayer ? quizCardFor(g, me._id) ?? null : null;
    return {
      ...base,
      game: {
        seq: g.seq,
        mode: g.mode,
        players: g.players,
        names,
        isPlayer,
        round: g.round,
        rounds: g.rounds.length,
        phase: g.phase,
        myCard,
        quizCard,
        order: r?.order ?? {},
        // While answering, in Teach Swap you can't see your partner's pick; in Agree you can, that's the point.
        picks: g.mode === "agree" || revealed ? g.picks : (g.picks[me._id] !== undefined ? { [me._id]: g.picks[me._id] } : {}),
        answered: g.players.filter((p) => g.picks[p] !== undefined),
        ready: g.ready,
        locked: g.locked,
        disagree: g.disagree,
        roundCards: revealed && r ? (r.shared ? [r.shared] : Object.values(r.cards)) : [],
        results: g.results,
        score: g.score,
        max: maxScore(g),
        streak: g.streak,
        best: g.best,
        done: g.done ?? null,
      },
    };
  },
});
