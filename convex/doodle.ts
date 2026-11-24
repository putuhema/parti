import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { addXp, befriend, findPlayer, freeCode, requirePlayer } from "./lib/helpers";
import {
  DOODLE_MAX,
  DOODLE_ROUNDS,
  DOODLE_TIMERS,
  acceptDoodleGuess,
  advanceDoodle,
  finishDoodleRound,
  guessDoodle,
  newDoodleGame,
  type DoodleGame,
} from "./lib/doodle/rules";

type Room = Doc<"doodleRooms">;
const COUNTDOWN_MS = 2400;

async function roomByCode(ctx: QueryCtx, code: string) {
  return await ctx.db
    .query("doodleRooms")
    .withIndex("by_code", (q) => q.eq("code", code.trim().toUpperCase()))
    .order("desc")
    .first();
}

async function requireRoom(ctx: QueryCtx, code: string) {
  const r = await roomByCode(ctx, code);
  if (!r) throw new ConvexError("Room not found");
  return r;
}

async function commit(ctx: MutationCtx, room: Room, g: DoodleGame, clearStrokes = false) {
  g.seq += 1;
  const needs = g.deadline && g.deadline !== g.sched && !g.done;
  if (needs) g.sched = g.deadline;
  const patch: Partial<Room> = { game: g };
  if (clearStrokes) patch.strokes = [];
  if (g.done && room.status !== "finished") {
    patch.status = "finished";
    patch.endedAt = Date.now();
    const multi = g.players.length >= 2;
    for (const p of g.players) {
      const won = g.done.winners.includes(p);
      await addXp(ctx, p as Id<"players">, !multi ? 15 : won ? 30 : 18, multi && won ? { win: true } : {});
    }
  }
  await ctx.db.patch(room._id, patch);
  if (needs) {
    await ctx.scheduler.runAfter(Math.max(0, g.deadline! - Date.now()) + 150, internal.doodle.tick, {
      roomId: room._id,
      gameNo: room.gameNo,
      deadline: g.deadline!,
    });
  }
}

export const create = mutation({
  args: {},
  handler: async (ctx) => {
    const me = await requirePlayer(ctx);
    const code = await freeCode(ctx);
    await ctx.db.insert("doodleRooms", {
      code,
      hostId: me._id,
      rounds: 4,
      turnSec: 45,
      status: "lobby",
      gameNo: 0,
      members: [{ playerId: me._id, seat: 0, lastSeen: Date.now() }],
      strokes: [],
    });
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
    if (room.members.length >= DOODLE_MAX) throw new ConvexError("This room is full");
    const taken = new Set(room.members.map((m) => m.seat));
    let seat = 0;
    while (taken.has(seat)) seat++;
    await ctx.db.patch(room._id, {
      members: [...room.members, { playerId: me._id, seat, lastSeen: Date.now() }],
    });
    return room.code;
  },
});

export const settings = mutation({
  args: { code: v.string(), rounds: v.optional(v.number()), turnSec: v.optional(v.number()) },
  handler: async (ctx, { code, rounds, turnSec }) => {
    const me = await requirePlayer(ctx);
    const room = await requireRoom(ctx, code);
    if (room.hostId !== me._id || room.status === "playing") return;
    const patch: Partial<Room> = {};
    if (rounds !== undefined && (DOODLE_ROUNDS as readonly number[]).includes(rounds)) patch.rounds = rounds;
    if (turnSec !== undefined && (DOODLE_TIMERS as readonly number[]).includes(turnSec)) patch.turnSec = turnSec;
    if (Object.keys(patch).length) await ctx.db.patch(room._id, patch);
  },
});

export const start = mutation({
  args: { code: v.string() },
  handler: async (ctx, { code }) => {
    const me = await requirePlayer(ctx);
    const room = await requireRoom(ctx, code);
    if (room.hostId !== me._id || room.status === "playing") return;
    const humans = [...room.members].sort((a, b) => a.seat - b.seat).map((m) => m.playerId);
    for (let i = 0; i < humans.length; i++) {
      for (let j = i + 1; j < humans.length; j++) await befriend(ctx, humans[i], humans[j]);
    }
    const k = room.gameNo % humans.length;
    const players = [...humans.slice(k), ...humans.slice(0, k)];
    const now = Date.now();
    const fresh: Room = { ...room, gameNo: room.gameNo + 1, status: "playing", startAt: now + COUNTDOWN_MS, endedAt: undefined };
    await ctx.db.patch(room._id, { gameNo: fresh.gameNo, status: "playing", startAt: fresh.startAt, endedAt: undefined, strokes: [] });
    await commit(ctx, fresh, newDoodleGame(players, room.rounds, room.turnSec, now, COUNTDOWN_MS, Math.random), true);
  },
});

export const rematch = mutation({
  args: { code: v.string() },
  handler: async (ctx, { code }) => {
    const me = await requirePlayer(ctx);
    const room = await requireRoom(ctx, code);
    if (room.hostId !== me._id || room.status === "playing") return;
    await ctx.db.patch(room._id, { status: "lobby", game: undefined, strokes: [], startAt: undefined, endedAt: undefined });
  },
});

export const leave = mutation({
  args: { code: v.string() },
  handler: async (ctx, { code }) => {
    const me = await requirePlayer(ctx);
    const room = await roomByCode(ctx, code);
    if (!room || !room.members.some((m) => m.playerId === me._id)) return;
    const rest = room.members.filter((m) => m.playerId !== me._id);
    await ctx.db.patch(room._id, {
      members: rest,
      ...(rest.length === 0 ? { status: "finished" as const, endedAt: Date.now() } : room.hostId === me._id ? { hostId: rest[0].playerId } : {}),
    });
  },
});

export const presence = mutation({
  args: { code: v.string() },
  handler: async (ctx, { code }) => {
    const me = await findPlayer(ctx);
    const room = await roomByCode(ctx, code);
    if (!me || !room || !room.members.some((m) => m.playerId === me._id)) return;
    await ctx.db.patch(room._id, {
      members: room.members.map((m) => (m.playerId === me._id ? { ...m, lastSeen: Date.now() } : m)),
    });
  },
});

export const syncStrokes = mutation({
  args: { code: v.string(), strokes: v.array(v.array(v.number())) },
  handler: async (ctx, { code, strokes }) => {
    const me = await requirePlayer(ctx);
    const room = await requireRoom(ctx, code);
    const g = room.game as DoodleGame | undefined;
    if (!g || room.status !== "playing" || g.phase !== "drawing" || g.drawerId !== me._id) return;
    // Cap to 60 strokes of 80 numbers each to stay lightweight
    const bounded = strokes.slice(-60).map((s) => s.slice(0, 81));
    await ctx.db.patch(room._id, { strokes: bounded });
  },
});

export const guess = mutation({
  args: { code: v.string(), text: v.string() },
  handler: async (ctx, { code, text }) => {
    const me = await requirePlayer(ctx);
    const room = await requireRoom(ctx, code);
    if (room.status !== "playing" || !room.game) return;
    const g = room.game as DoodleGame;
    try {
      guessDoodle(g, me._id, text, Date.now());
    } catch (e) {
      throw new ConvexError(e instanceof Error ? e.message : "Bad guess");
    }
    await commit(ctx, room, g);
  },
});

export const acceptGuess = mutation({
  args: { code: v.string(), guesserId: v.string() },
  handler: async (ctx, { code, guesserId }) => {
    const me = await requirePlayer(ctx);
    const room = await requireRoom(ctx, code);
    if (room.status !== "playing" || !room.game) return;
    const g = room.game as DoodleGame;
    acceptDoodleGuess(g, me._id, guesserId, Date.now());
    await commit(ctx, room, g);
  },
});

export const reveal = mutation({
  args: { code: v.string() },
  handler: async (ctx, { code }) => {
    const me = await requirePlayer(ctx);
    const room = await requireRoom(ctx, code);
    if (room.status !== "playing" || !room.game) return;
    const g = room.game as DoodleGame;
    if (g.drawerId !== me._id && room.hostId !== me._id) return;
    finishDoodleRound(g, undefined, Date.now());
    await commit(ctx, room, g);
  },
});

export const next = mutation({
  args: { code: v.string() },
  handler: async (ctx, { code }) => {
    const me = await requirePlayer(ctx);
    const room = await requireRoom(ctx, code);
    if (room.status !== "playing" || !room.game || !room.members.some((m) => m.playerId === me._id)) return;
    const g = room.game as DoodleGame;
    advanceDoodle(g, Date.now());
    await commit(ctx, room, g, true);
  },
});

export const tick = internalMutation({
  args: { roomId: v.id("doodleRooms"), gameNo: v.number(), deadline: v.number() },
  handler: async (ctx, { roomId, gameNo, deadline }) => {
    const room = await ctx.db.get(roomId);
    if (!room || room.status !== "playing" || room.gameNo !== gameNo || !room.game) return;
    const g = room.game as DoodleGame;
    if (g.done || g.deadline !== deadline) return;
    if (g.phase === "drawing") finishDoodleRound(g, undefined, Date.now());
    else advanceDoodle(g, Date.now());
    await commit(ctx, room, g, g.phase === "drawing");
  },
});

export const view = query({
  args: { code: v.string() },
  handler: async (ctx, { code }) => {
    const me = await findPlayer(ctx);
    const room = await roomByCode(ctx, code);
    if (!me || !room) return null;
    const members = await Promise.all(
      [...room.members]
        .sort((a, b) => a.seat - b.seat)
        .map(async (m) => ({
          id: m.playerId as string,
          name: (await ctx.db.get(m.playerId))?.name ?? "Player",
          seat: m.seat,
          isMe: m.playerId === me._id,
          isHost: room.hostId === m.playerId,
          lastSeen: m.lastSeen,
        })),
    );
    const base = {
      code: room.code,
      rounds: room.rounds,
      turnSec: room.turnSec,
      status: room.status,
      gameNo: room.gameNo,
      startAt: room.startAt ?? null,
      isHost: room.hostId === me._id,
      isMember: room.members.some((m) => m.playerId === me._id),
      meId: me._id as string,
      members,
    };
    if (room.status === "lobby" || !room.game) return { ...base, game: null };

    const g = room.game as DoodleGame;
    const names: Record<string, string> = {};
    for (const p of g.players) {
      names[p] = members.find((m) => m.id === p)?.name ?? (await ctx.db.get(p as Id<"players">))?.name ?? "Player";
    }
    const isDrawer = g.drawerId === me._id;
    const visibleWord = isDrawer || g.phase === "reveal" || !!g.done ? g.words[g.round] : null;

    return {
      ...base,
      game: {
        seq: g.seq,
        rounds: g.rounds,
        turnSec: g.turnSec,
        players: g.players,
        names,
        round: g.round,
        drawerId: g.drawerId,
        phase: g.phase,
        visibleWord,
        strokes: room.strokes ?? [],
        scores: g.scores,
        guesses: g.guesses,
        solvedBy: g.solvedBy ?? null,
        history: g.history,
        deadline: g.deadline ?? null,
        done: g.done ?? null,
      },
    };
  },
});
