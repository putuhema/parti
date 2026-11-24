import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { addXp, befriend, findPlayer, freeCode, requirePlayer } from "./lib/helpers";
import {
  FACE_MAX,
  FACE_ROUNDS,
  FACE_TIMERS,
  advanceFace,
  newFaceGame,
  onFaceDeadline,
  rateFaceSnap,
  reactFace,
  skipFaceTurn,
  submitFaceSnap,
  type FaceGame,
  type FaceRatingKind,
} from "./lib/face/rules";

type Room = Doc<"emfaceRooms">;
const COUNTDOWN_MS = 2800;

async function roomByCode(ctx: QueryCtx, code: string) {
  return await ctx.db
    .query("emfaceRooms")
    .withIndex("by_code", (q) => q.eq("code", code.trim().toUpperCase()))
    .order("desc")
    .first();
}

async function requireRoom(ctx: QueryCtx, code: string) {
  const r = await roomByCode(ctx, code);
  if (!r) throw new ConvexError("Room not found");
  return r;
}

async function commit(ctx: MutationCtx, room: Room, g: FaceGame) {
  g.seq += 1;
  const needs = g.deadline && g.deadline !== g.sched && !g.done;
  if (needs) g.sched = g.deadline;
  const patch: Partial<Room> = { game: g };
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
    await ctx.scheduler.runAfter(Math.max(0, g.deadline! - Date.now()) + 120, internal.emface.tick, {
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
    await ctx.db.insert("emfaceRooms", {
      code,
      hostId: me._id,
      rounds: 5,
      turnSec: 15,
      status: "lobby",
      gameNo: 0,
      members: [{ playerId: me._id, seat: 0, lastSeen: Date.now() }],
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
    if (room.members.length >= FACE_MAX) throw new ConvexError("This room is full");
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
    if (room.hostId !== me._id) throw new ConvexError("Only the host can change this");
    if (room.status === "playing") return;
    const patch: Partial<Room> = {};
    if (rounds !== undefined && (FACE_ROUNDS as readonly number[]).includes(rounds)) patch.rounds = rounds;
    if (turnSec !== undefined && (FACE_TIMERS as readonly number[]).includes(turnSec)) patch.turnSec = turnSec;
    if (Object.keys(patch).length) await ctx.db.patch(room._id, patch);
  },
});

export const start = mutation({
  args: { code: v.string() },
  handler: async (ctx, { code }) => {
    const me = await requirePlayer(ctx);
    const room = await requireRoom(ctx, code);
    if (room.hostId !== me._id) throw new ConvexError("Only the host can start");
    if (room.status === "playing") return;
    const humans = [...room.members].sort((a, b) => a.seat - b.seat).map((m) => m.playerId);
    for (let i = 0; i < humans.length; i++) {
      for (let j = i + 1; j < humans.length; j++) await befriend(ctx, humans[i], humans[j]);
    }
    const k = room.gameNo % humans.length;
    const players = [...humans.slice(k), ...humans.slice(0, k)];
    const now = Date.now();
    const fresh: Room = { ...room, gameNo: room.gameNo + 1, status: "playing", startAt: now + COUNTDOWN_MS, endedAt: undefined };
    await ctx.db.patch(room._id, { gameNo: fresh.gameNo, status: "playing", startAt: fresh.startAt, endedAt: undefined });
    await commit(ctx, fresh, newFaceGame(players, room.rounds, room.turnSec, now, COUNTDOWN_MS, Math.random));
  },
});

export const rematch = mutation({
  args: { code: v.string() },
  handler: async (ctx, { code }) => {
    const me = await requirePlayer(ctx);
    const room = await requireRoom(ctx, code);
    if (room.hostId !== me._id || room.status === "playing") return;
    await ctx.db.patch(room._id, { status: "lobby", game: undefined, startAt: undefined, endedAt: undefined });
  },
});

export const leave = mutation({
  args: { code: v.string() },
  handler: async (ctx, { code }) => {
    const me = await requirePlayer(ctx);
    const room = await roomByCode(ctx, code);
    if (!room || !room.members.some((m) => m.playerId === me._id)) return;
    const rest = room.members.filter((m) => m.playerId !== me._id);
    const patch: Partial<Room> = { members: rest };
    if (rest.length === 0) {
      patch.status = "finished";
      patch.endedAt = Date.now();
    } else if (room.hostId === me._id) {
      patch.hostId = rest[0].playerId;
    }
    await ctx.db.patch(room._id, patch);
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

export const generateUploadUrl = mutation({
  args: { code: v.string() },
  handler: async (ctx, { code }) => {
    const me = await requirePlayer(ctx);
    const room = await requireRoom(ctx, code);
    if (!room.members.some((m) => m.playerId === me._id)) throw new ConvexError("Not in this room");
    return await ctx.storage.generateUploadUrl();
  },
});

export const snap = mutation({
  args: { code: v.string(), storageId: v.id("_storage"), aiScore: v.optional(v.number()) },
  handler: async (ctx, { code, storageId, aiScore }) => {
    const me = await requirePlayer(ctx);
    const room = await requireRoom(ctx, code);
    if (room.status !== "playing" || !room.game) throw new ConvexError("Game not running");
    const g = room.game as FaceGame;
    const now = Date.now();
    try {
      submitFaceSnap(g, me._id, aiScore, now);
    } catch (e) {
      throw new ConvexError(e instanceof Error ? e.message : "Failed");
    }
    await ctx.db.insert("emfaceSnaps", {
      roomId: room._id,
      gameNo: room.gameNo,
      round: g.round,
      playerId: me._id,
      exprId: g.currentTurn.exprId,
      storageId,
      aiScore: g.currentTurn.aiScore,
      takenAt: now,
    });
    await commit(ctx, room, g);
  },
});

export const skip = mutation({
  args: { code: v.string() },
  handler: async (ctx, { code }) => {
    const me = await requirePlayer(ctx);
    const room = await requireRoom(ctx, code);
    if (room.status !== "playing" || !room.game) return;
    const g = room.game as FaceGame;
    skipFaceTurn(g, me._id, Date.now());
    await commit(ctx, room, g);
  },
});

export const rate = mutation({
  args: { code: v.string(), kind: v.union(v.literal("nailed"), v.literal("close"), v.literal("chaotic")) },
  handler: async (ctx, { code, kind }) => {
    const me = await requirePlayer(ctx);
    const room = await requireRoom(ctx, code);
    if (room.status !== "playing" || !room.game) return;
    const g = room.game as FaceGame;
    try {
      rateFaceSnap(g, me._id, kind as FaceRatingKind, Date.now());
    } catch (e) {
      throw new ConvexError(e instanceof Error ? e.message : "Failed");
    }
    await commit(ctx, room, g);
  },
});

export const react = mutation({
  args: { code: v.string(), emoji: v.string() },
  handler: async (ctx, { code, emoji }) => {
    const me = await requirePlayer(ctx);
    const room = await requireRoom(ctx, code);
    if (room.status !== "playing" || !room.game) return;
    const g = room.game as FaceGame;
    reactFace(g, me._id, emoji, Date.now());
    await commit(ctx, room, g);
  },
});

export const next = mutation({
  args: { code: v.string() },
  handler: async (ctx, { code }) => {
    const me = await requirePlayer(ctx);
    const room = await requireRoom(ctx, code);
    if (room.status !== "playing" || !room.game || !room.members.some((m) => m.playerId === me._id)) return;
    const g = room.game as FaceGame;
    advanceFace(g, Date.now());
    await commit(ctx, room, g);
  },
});

export const tick = internalMutation({
  args: { roomId: v.id("emfaceRooms"), gameNo: v.number(), deadline: v.number() },
  handler: async (ctx, { roomId, gameNo, deadline }) => {
    const room = await ctx.db.get(roomId);
    if (!room || room.status !== "playing" || room.gameNo !== gameNo || !room.game) return;
    const g = room.game as FaceGame;
    if (g.done || g.deadline !== deadline) return;
    onFaceDeadline(g, Date.now());
    await commit(ctx, room, g);
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

    const g = room.game as FaceGame;
    const names: Record<string, string> = {};
    for (const p of g.players) {
      names[p] = members.find((m) => m.id === p)?.name ?? (await ctx.db.get(p as Id<"players">))?.name ?? "Player";
    }
    const rows = await ctx.db
      .query("emfaceSnaps")
      .withIndex("by_roomId_and_gameNo", (q) => q.eq("roomId", room._id).eq("gameNo", room.gameNo))
      .take(100);
    const snaps: Record<string, { url: string | null; aiScore?: number }> = {};
    await Promise.all(
      rows.map(async (s) => {
        snaps[`${s.round}:${s.playerId}`] = { url: await ctx.storage.getUrl(s.storageId), aiScore: s.aiScore };
      }),
    );

    return { ...base, game: { ...g, names, snaps, isPlayer: g.players.includes(me._id) } };
  },
});
