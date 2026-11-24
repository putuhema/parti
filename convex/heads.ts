import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { addXp, befriend, findPlayer, freeCode, requirePlayer } from "./lib/helpers";
import {
  HEADS_DECKS,
  HEADS_MAX,
  HEADS_ROUNDS,
  HEADS_TIMERS,
  endHeadsRound,
  markHeadsCard,
  newHeadsGame,
  nextHeadsRound,
  startHeadsRound,
  type HeadsDeck,
  type HeadsGame,
} from "./lib/heads/rules";

type Room = Doc<"headsRooms">;

async function roomByCode(ctx: QueryCtx, code: string) {
  return await ctx.db
    .query("headsRooms")
    .withIndex("by_code", (q) => q.eq("code", code.trim().toUpperCase()))
    .order("desc")
    .first();
}

async function requireRoom(ctx: QueryCtx, code: string) {
  const r = await roomByCode(ctx, code);
  if (!r) throw new ConvexError("Room not found");
  return r;
}

async function commit(ctx: MutationCtx, room: Room, g: HeadsGame) {
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
    await ctx.scheduler.runAfter(Math.max(0, g.deadline! - Date.now()) + 150, internal.heads.tick, {
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
    await ctx.db.insert("headsRooms", {
      code,
      hostId: me._id,
      deck: "couple",
      rounds: 2,
      roundSec: 60,
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
    if (room.members.length >= HEADS_MAX) throw new ConvexError("This room is full");
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
    deck: v.optional(
      v.union(v.literal("mix"), v.literal("couple"), v.literal("actions"), v.literal("movies"), v.literal("animals")),
    ),
    rounds: v.optional(v.number()),
    roundSec: v.optional(v.number()),
  },
  handler: async (ctx, { code, deck, rounds, roundSec }) => {
    const me = await requirePlayer(ctx);
    const room = await requireRoom(ctx, code);
    if (room.hostId !== me._id || room.status === "playing") return;
    const patch: Partial<Room> = {};
    if (deck !== undefined && (HEADS_DECKS as readonly string[]).includes(deck)) patch.deck = deck;
    if (rounds !== undefined && (HEADS_ROUNDS as readonly number[]).includes(rounds)) patch.rounds = rounds;
    if (roundSec !== undefined && (HEADS_TIMERS as readonly number[]).includes(roundSec)) patch.roundSec = roundSec;
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
    const fresh: Room = { ...room, gameNo: room.gameNo + 1, status: "playing", endedAt: undefined };
    await ctx.db.patch(room._id, { gameNo: fresh.gameNo, status: "playing", endedAt: undefined });
    await commit(ctx, fresh, newHeadsGame(players, room.deck as HeadsDeck, room.rounds, room.roundSec, Math.random));
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

export const beginRound = mutation({
  args: { code: v.string() },
  handler: async (ctx, { code }) => {
    const me = await requirePlayer(ctx);
    const room = await requireRoom(ctx, code);
    if (room.status !== "playing" || !room.game || !room.members.some((m) => m.playerId === me._id)) return;
    const g = room.game as HeadsGame;
    startHeadsRound(g, Date.now());
    await commit(ctx, room, g);
  },
});

export const mark = mutation({
  args: { code: v.string(), outcome: v.union(v.literal("got"), v.literal("pass")) },
  handler: async (ctx, { code, outcome }) => {
    const me = await requirePlayer(ctx);
    const room = await requireRoom(ctx, code);
    if (room.status !== "playing" || !room.game || !room.members.some((m) => m.playerId === me._id)) return;
    const g = room.game as HeadsGame;
    markHeadsCard(g, outcome, Date.now());
    await commit(ctx, room, g);
  },
});

export const finishRound = mutation({
  args: { code: v.string() },
  handler: async (ctx, { code }) => {
    const me = await requirePlayer(ctx);
    const room = await requireRoom(ctx, code);
    if (room.status !== "playing" || !room.game || !room.members.some((m) => m.playerId === me._id)) return;
    const g = room.game as HeadsGame;
    endHeadsRound(g);
    await commit(ctx, room, g);
  },
});

export const next = mutation({
  args: { code: v.string() },
  handler: async (ctx, { code }) => {
    const me = await requirePlayer(ctx);
    const room = await requireRoom(ctx, code);
    if (room.status !== "playing" || !room.game || !room.members.some((m) => m.playerId === me._id)) return;
    const g = room.game as HeadsGame;
    nextHeadsRound(g);
    await commit(ctx, room, g);
  },
});

export const tick = internalMutation({
  args: { roomId: v.id("headsRooms"), gameNo: v.number(), deadline: v.number() },
  handler: async (ctx, { roomId, gameNo, deadline }) => {
    const room = await ctx.db.get(roomId);
    if (!room || room.status !== "playing" || room.gameNo !== gameNo || !room.game) return;
    const g = room.game as HeadsGame;
    if (g.done || g.deadline !== deadline) return;
    endHeadsRound(g);
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
      deck: room.deck,
      rounds: room.rounds,
      roundSec: room.roundSec,
      status: room.status,
      gameNo: room.gameNo,
      isHost: room.hostId === me._id,
      isMember: room.members.some((m) => m.playerId === me._id),
      meId: me._id as string,
      members,
    };
    if (room.status === "lobby" || !room.game) return { ...base, game: null };

    const g = room.game as HeadsGame;
    const names: Record<string, string> = {};
    for (const p of g.players) {
      names[p] = members.find((m) => m.id === p)?.name ?? (await ctx.db.get(p as Id<"players">))?.name ?? "Player";
    }
    const currentCard = g.cards[g.cardIdx % g.cards.length];
    return {
      ...base,
      game: {
        seq: g.seq,
        deck: g.deck,
        rounds: g.rounds,
        roundSec: g.roundSec,
        players: g.players,
        names,
        round: g.round,
        guesserId: g.guesserId,
        phase: g.phase,
        currentCard,
        roundLog: g.roundLog,
        scores: g.scores,
        history: g.history,
        deadline: g.deadline ?? null,
        done: g.done ?? null,
      },
    };
  },
});
