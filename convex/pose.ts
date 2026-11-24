import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { addXp, befriend, findPlayer, freeCode, requirePlayer } from "./lib/helpers";
import type { PosePack } from "./lib/pose/poses";
import {
  PACK_CHOICES,
  POSE_MAX,
  ROUND_CHOICES,
  TIMER_CHOICES,
  addReaction,
  advance,
  leaveGame,
  newGame,
  onDeadline,
  rateSnap,
  skipTurn,
  submitSnap,
  type PoseGame,
  type RatingKind,
} from "./lib/pose/rules";

type Room = Doc<"poseRooms">;

const COUNTDOWN_MS = 2800;

async function roomByCode(ctx: QueryCtx, code: string) {
  return await ctx.db
    .query("poseRooms")
    .withIndex("by_code", (q) => q.eq("code", code.trim().toUpperCase()))
    .order("desc")
    .first();
}

async function requireRoom(ctx: QueryCtx, code: string) {
  const r = await roomByCode(ctx, code);
  if (!r) throw new ConvexError("Room not found");
  return r;
}

async function commit(ctx: MutationCtx, room: Room, g: PoseGame) {
  g.seq += 1;
  const needs = g.deadline && g.deadline !== g.sched && !g.done;
  if (needs) g.sched = g.deadline;
  const patch: Partial<Room> = { game: g };
  if (g.done && room.status !== "finished") {
    patch.status = "finished";
    patch.endedAt = Date.now();
    await award(ctx, g);
  }
  await ctx.db.patch(room._id, patch);
  if (needs) {
    await ctx.scheduler.runAfter(Math.max(0, g.deadline! - Date.now()) + 120, internal.pose.tick, {
      roomId: room._id,
      gameNo: room.gameNo,
      deadline: g.deadline!,
    });
  }
}

async function award(ctx: MutationCtx, g: PoseGame) {
  const multi = g.players.length >= 2;
  for (const p of g.players) {
    const id = p as Id<"players">;
    const won = g.done?.winners.includes(p);
    if (!multi) await addXp(ctx, id, 15);
    else if (won) await addXp(ctx, id, 30, { win: true });
    else await addXp(ctx, id, 18);
  }
}

// ---------- Lobby ----------
export const create = mutation({
  args: {},
  handler: async (ctx) => {
    const me = await requirePlayer(ctx);
    const code = await freeCode(ctx);
    await ctx.db.insert("poseRooms", {
      code,
      hostId: me._id,
      pack: "cute",
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
    if (room.members.length >= POSE_MAX) throw new ConvexError("This room is full");
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
  args: {
    code: v.string(),
    pack: v.optional(v.union(v.literal("mix"), v.literal("cute"), v.literal("silly"), v.literal("active"))),
    rounds: v.optional(v.number()),
    turnSec: v.optional(v.number()),
  },
  handler: async (ctx, { code, pack, rounds, turnSec }) => {
    const me = await requirePlayer(ctx);
    const room = await requireRoom(ctx, code);
    if (room.hostId !== me._id) throw new ConvexError("Only the host can change this");
    if (room.status === "playing") return;
    const patch: Partial<Room> = {};
    if (pack !== undefined) {
      if (!(PACK_CHOICES as readonly string[]).includes(pack)) throw new ConvexError("Invalid pack");
      patch.pack = pack;
    }
    if (rounds !== undefined) {
      if (!(ROUND_CHOICES as readonly number[]).includes(rounds)) throw new ConvexError("Invalid rounds");
      patch.rounds = rounds;
    }
    if (turnSec !== undefined) {
      if (!(TIMER_CHOICES as readonly number[]).includes(turnSec)) throw new ConvexError("Invalid timer");
      patch.turnSec = turnSec;
    }
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
    if (humans.length < 1) throw new ConvexError("Need at least 1 player");
    for (let i = 0; i < humans.length; i++) {
      for (let j = i + 1; j < humans.length; j++) await befriend(ctx, humans[i], humans[j]);
    }
    const k = room.gameNo % humans.length;
    const players = [...humans.slice(k), ...humans.slice(0, k)];
    const now = Date.now();
    const fresh: Room = {
      ...room,
      gameNo: room.gameNo + 1,
      status: "playing",
      startAt: now + COUNTDOWN_MS,
      endedAt: undefined,
    };
    await ctx.db.patch(room._id, {
      gameNo: fresh.gameNo,
      status: "playing",
      startAt: fresh.startAt,
      endedAt: undefined,
    });
    await commit(
      ctx,
      fresh,
      newGame(players, room.pack as PosePack, room.rounds, room.turnSec, now, COUNTDOWN_MS, Math.random),
    );
  },
});

export const rematch = mutation({
  args: { code: v.string() },
  handler: async (ctx, { code }) => {
    const me = await requirePlayer(ctx);
    const room = await requireRoom(ctx, code);
    if (room.hostId !== me._id) throw new ConvexError("Only the host can start a rematch");
    if (room.status === "playing") return;
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
    const g = room.game as PoseGame | undefined;
    if (room.status !== "playing" || !g || g.done || !g.players.includes(me._id) || g.out.includes(me._id)) return;
    const fresh = (await ctx.db.get(room._id))!;
    leaveGame(g, me._id, Date.now());
    await commit(ctx, fresh, g);
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

// ---------- Playing ----------
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
  args: {
    code: v.string(),
    storageId: v.id("_storage"),
    aiScore: v.optional(v.number()),
  },
  handler: async (ctx, { code, storageId, aiScore }) => {
    const me = await requirePlayer(ctx);
    const room = await requireRoom(ctx, code);
    if (room.status !== "playing" || !room.game) throw new ConvexError("The game isn't running");
    const g = room.game as PoseGame;
    const now = Date.now();
    try {
      submitSnap(g, me._id, aiScore, now);
    } catch (err) {
      throw new ConvexError(err instanceof Error ? err.message : "Couldn't save snap");
    }
    await ctx.db.insert("poseSnaps", {
      roomId: room._id,
      gameNo: room.gameNo,
      round: g.round,
      playerId: me._id,
      poseId: g.currentTurn.poseId,
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
    if (room.status !== "playing" || !room.game) throw new ConvexError("The game isn't running");
    const g = room.game as PoseGame;
    try {
      skipTurn(g, me._id, Date.now());
    } catch (err) {
      throw new ConvexError(err instanceof Error ? err.message : "Couldn't skip");
    }
    await commit(ctx, room, g);
  },
});

export const rate = mutation({
  args: {
    code: v.string(),
    kind: v.union(v.literal("nailed"), v.literal("close"), v.literal("chaotic")),
  },
  handler: async (ctx, { code, kind }) => {
    const me = await requirePlayer(ctx);
    const room = await requireRoom(ctx, code);
    if (room.status !== "playing" || !room.game) throw new ConvexError("The game isn't running");
    const g = room.game as PoseGame;
    try {
      rateSnap(g, me._id, kind as RatingKind, Date.now());
    } catch (err) {
      throw new ConvexError(err instanceof Error ? err.message : "Couldn't rate");
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
    if (!room.members.some((m) => m.playerId === me._id)) throw new ConvexError("Not in this room");
    const g = room.game as PoseGame;
    try {
      addReaction(g, me._id, emoji, Date.now());
    } catch (err) {
      throw new ConvexError(err instanceof Error ? err.message : "Bad reaction");
    }
    await commit(ctx, room, g);
  },
});

export const next = mutation({
  args: { code: v.string() },
  handler: async (ctx, { code }) => {
    const me = await requirePlayer(ctx);
    const room = await requireRoom(ctx, code);
    if (room.status !== "playing" || !room.game) return;
    if (!room.members.some((m) => m.playerId === me._id)) throw new ConvexError("Not in this room");
    const g = room.game as PoseGame;
    if (g.phase !== "reveal" && g.phase !== "roundSummary") return;
    advance(g, Date.now());
    await commit(ctx, room, g);
  },
});

export const tick = internalMutation({
  args: { roomId: v.id("poseRooms"), gameNo: v.number(), deadline: v.number() },
  handler: async (ctx, { roomId, gameNo, deadline }) => {
    const room = await ctx.db.get(roomId);
    if (!room || room.status !== "playing" || room.gameNo !== gameNo || !room.game) return;
    const g = room.game as PoseGame;
    if (g.done || g.deadline !== deadline) return;
    onDeadline(g, Date.now());
    await commit(ctx, room, g);
  },
});

// ---------- Client View ----------
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
          return {
            id: m.playerId as string,
            name: p?.name ?? "Player",
            seat: m.seat,
            isMe: m.playerId === me._id,
            isHost: room.hostId === m.playerId,
            lastSeen: m.lastSeen,
          };
        }),
    );
    const base = {
      code: room.code,
      pack: room.pack,
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

    const g = room.game as PoseGame;
    const names: Record<string, string> = {};
    for (const p of g.players) {
      const m = members.find((x) => x.id === p);
      names[p] = m?.name ?? (await ctx.db.get(p as Id<"players">))?.name ?? "Player";
    }

    const snapRows = await ctx.db
      .query("poseSnaps")
      .withIndex("by_roomId_and_gameNo", (q) => q.eq("roomId", room._id).eq("gameNo", room.gameNo))
      .take(100);

    const snaps: Record<string, { url: string | null; aiScore?: number; takenAt: number }> = {};
    await Promise.all(
      snapRows.map(async (s) => {
        const url = await ctx.storage.getUrl(s.storageId);
        snaps[`${s.round}:${s.playerId}`] = { url, aiScore: s.aiScore, takenAt: s.takenAt };
      }),
    );

    return {
      ...base,
      game: {
        seq: g.seq,
        pack: g.pack,
        rounds: g.rounds,
        turnSec: g.turnSec,
        players: g.players,
        names,
        out: g.out,
        isPlayer: g.players.includes(me._id) && !g.out.includes(me._id),
        poseIds: g.poseIds,
        round: g.round,
        turnIndex: g.turnIndex,
        phase: g.phase,
        scores: g.scores,
        currentTurn: g.currentTurn,
        roundResults: g.roundResults,
        history: g.history,
        hype: g.hype,
        snaps,
        deadline: g.deadline ?? null,
        done: g.done ?? null,
      },
    };
  },
});
