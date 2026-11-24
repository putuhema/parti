import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query, type QueryCtx } from "./_generated/server";
import { addXp, befriend, findPlayer, freeCode, requirePlayer } from "./lib/helpers";
import {
  SPLIT_MAX,
  SPLIT_ROUNDS,
  advanceSplit,
  newSplitGame,
  snapSplitSide,
  type SplitGame,
} from "./lib/split/rules";

type Room = Doc<"splitRooms">;

async function roomByCode(ctx: QueryCtx, code: string) {
  return await ctx.db
    .query("splitRooms")
    .withIndex("by_code", (q) => q.eq("code", code.trim().toUpperCase()))
    .order("desc")
    .first();
}

async function requireRoom(ctx: QueryCtx, code: string) {
  const r = await roomByCode(ctx, code);
  if (!r) throw new ConvexError("Room not found");
  return r;
}

export const create = mutation({
  args: {},
  handler: async (ctx) => {
    const me = await requirePlayer(ctx);
    const code = await freeCode(ctx);
    await ctx.db.insert("splitRooms", {
      code,
      hostId: me._id,
      rounds: 4,
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
    if (room.members.length >= SPLIT_MAX) throw new ConvexError("This photobooth is full (2 players max)");
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
  args: { code: v.string(), rounds: v.optional(v.number()) },
  handler: async (ctx, { code, rounds }) => {
    const me = await requirePlayer(ctx);
    const room = await requireRoom(ctx, code);
    if (room.hostId !== me._id || room.status === "playing") return;
    if (rounds !== undefined && (SPLIT_ROUNDS as readonly number[]).includes(rounds)) {
      await ctx.db.patch(room._id, { rounds });
    }
  },
});

export const start = mutation({
  args: { code: v.string() },
  handler: async (ctx, { code }) => {
    const me = await requirePlayer(ctx);
    const room = await requireRoom(ctx, code);
    if (room.hostId !== me._id || room.status === "playing") return;
    const humans = [...room.members].sort((a, b) => a.seat - b.seat).map((m) => m.playerId);
    if (humans.length === 2) await befriend(ctx, humans[0], humans[1]);
    const g = newSplitGame(humans, room.rounds, Math.random);
    await ctx.db.patch(room._id, {
      gameNo: room.gameNo + 1,
      status: "playing",
      endedAt: undefined,
      game: g,
    });
  },
});

export const rematch = mutation({
  args: { code: v.string() },
  handler: async (ctx, { code }) => {
    const me = await requirePlayer(ctx);
    const room = await requireRoom(ctx, code);
    if (room.hostId !== me._id || room.status === "playing") return;
    await ctx.db.patch(room._id, { status: "lobby", game: undefined, endedAt: undefined });
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
  args: { code: v.string(), storageId: v.id("_storage") },
  handler: async (ctx, { code, storageId }) => {
    const me = await requirePlayer(ctx);
    const room = await requireRoom(ctx, code);
    if (room.status !== "playing" || !room.game) throw new ConvexError("Not running");
    const g = room.game as SplitGame;
    const roundBefore = g.round;
    let side: "left" | "right";
    try {
      side = snapSplitSide(g, me._id);
    } catch (e) {
      throw new ConvexError(e instanceof Error ? e.message : "Failed");
    }
    g.seq += 1;
    await ctx.db.insert("splitSnaps", {
      roomId: room._id,
      gameNo: room.gameNo,
      round: roundBefore,
      side,
      playerId: me._id,
      storageId,
      takenAt: Date.now(),
    });
    await ctx.db.patch(room._id, { game: g });
  },
});

export const react = mutation({
  args: { code: v.string(), emoji: v.string() },
  handler: async (ctx, { code, emoji }) => {
    const me = await requirePlayer(ctx);
    const room = await requireRoom(ctx, code);
    if (room.status !== "playing" || !room.game) return;
    const g = room.game as SplitGame;
    g.reactions = [...g.reactions.slice(-9), { by: me._id, emoji, at: Date.now() }];
    g.seq += 1;
    await ctx.db.patch(room._id, { game: g });
  },
});

export const next = mutation({
  args: { code: v.string() },
  handler: async (ctx, { code }) => {
    const me = await requirePlayer(ctx);
    const room = await requireRoom(ctx, code);
    if (room.status !== "playing" || !room.game || !room.members.some((m) => m.playerId === me._id)) return;
    const g = room.game as SplitGame;
    advanceSplit(g);
    g.seq += 1;
    const patch: Partial<Room> = { game: g };
    if (g.done) {
      patch.status = "finished";
      patch.endedAt = Date.now();
      for (const p of g.players) {
        await addXp(ctx, p as Id<"players">, 25, { win: g.players.length === 2 });
      }
    }
    await ctx.db.patch(room._id, patch);
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
      status: room.status,
      gameNo: room.gameNo,
      isHost: room.hostId === me._id,
      isMember: room.members.some((m) => m.playerId === me._id),
      meId: me._id as string,
      members,
    };
    if (room.status === "lobby" || !room.game) return { ...base, game: null };

    const g = room.game as SplitGame;
    const names: Record<string, string> = {};
    for (const p of g.players) {
      names[p] = members.find((m) => m.id === p)?.name ?? (await ctx.db.get(p as Id<"players">))?.name ?? "Player";
    }
    const rows = await ctx.db
      .query("splitSnaps")
      .withIndex("by_roomId_and_gameNo", (q) => q.eq("roomId", room._id).eq("gameNo", room.gameNo))
      .take(60);
    const snaps: Record<string, string | null> = {};
    await Promise.all(
      rows.map(async (s) => {
        snaps[`${s.round}:${s.side}`] = await ctx.storage.getUrl(s.storageId);
      }),
    );

    return { ...base, game: { ...g, names, snaps } };
  },
});
