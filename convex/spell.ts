import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { addXp, befriend, findPlayer, freeCode, requirePlayer } from "./lib/helpers";
import {
  BOT_ID,
  SPELL_MAX,
  castSpell,
  isSpellBot,
  newSpellGame,
  stepBot,
  type SpellGame,
} from "./lib/spell/rules";
import type { SpellId } from "./lib/spell/spells";

type Room = Doc<"spellRooms">;
const COUNTDOWN_MS = 2600;

async function roomByCode(ctx: QueryCtx, code: string) {
  return await ctx.db
    .query("spellRooms")
    .withIndex("by_code", (q) => q.eq("code", code.trim().toUpperCase()))
    .order("desc")
    .first();
}

async function requireRoom(ctx: QueryCtx, code: string) {
  const r = await roomByCode(ctx, code);
  if (!r) throw new ConvexError("Room not found");
  return r;
}

async function commit(ctx: MutationCtx, room: Room, g: SpellGame) {
  g.seq += 1;
  const needsBot = g.botNextAt && g.botNextAt !== g.botSched && !g.done;
  if (needsBot) g.botSched = g.botNextAt;
  const patch: Partial<Room> = { game: g };
  if (g.done && room.status !== "finished") {
    patch.status = "finished";
    patch.endedAt = Date.now();
    const vsBot = g.players.some(isSpellBot);
    for (const p of g.players) {
      if (isSpellBot(p)) continue;
      const won = g.done.winner === p;
      await addXp(ctx, p as Id<"players">, vsBot ? (won ? 25 : 10) : won ? 35 : 15, !vsBot && won ? { win: true } : {});
    }
  }
  await ctx.db.patch(room._id, patch);
  if (needsBot) {
    await ctx.scheduler.runAfter(Math.max(0, g.botNextAt! - Date.now()) + 80, internal.spell.botTick, {
      roomId: room._id,
      gameNo: room.gameNo,
      at: g.botNextAt!,
    });
  }
}

export const create = mutation({
  args: {},
  handler: async (ctx) => {
    const me = await requirePlayer(ctx);
    const code = await freeCode(ctx);
    await ctx.db.insert("spellRooms", {
      code,
      hostId: me._id,
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
    if (!room) throw new ConvexError("No duel with that code");
    if (room.members.some((m) => m.playerId === me._id)) return room.code;
    if (room.members.length >= SPELL_MAX) throw new ConvexError("This duel is full");
    const taken = new Set(room.members.map((m) => m.seat));
    let seat = 0;
    while (taken.has(seat)) seat++;
    await ctx.db.patch(room._id, {
      members: [...room.members, { playerId: me._id, seat, lastSeen: Date.now() }],
    });
    return room.code;
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
    const p1 = humans[0];
    const p2 = humans[1] ?? BOT_ID;
    const now = Date.now();
    const fresh: Room = { ...room, gameNo: room.gameNo + 1, status: "playing", startAt: now + COUNTDOWN_MS, endedAt: undefined };
    await ctx.db.patch(room._id, { gameNo: fresh.gameNo, status: "playing", startAt: fresh.startAt, endedAt: undefined });
    await commit(ctx, fresh, newSpellGame(p1, p2, now, COUNTDOWN_MS));
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

export const cast = mutation({
  args: {
    code: v.string(),
    spell: v.union(
      v.literal("fire"),
      v.literal("lightning"),
      v.literal("frost"),
      v.literal("shield"),
      v.literal("heal"),
    ),
  },
  handler: async (ctx, { code, spell }) => {
    const me = await requirePlayer(ctx);
    const room = await requireRoom(ctx, code);
    if (room.status !== "playing" || !room.game) throw new ConvexError("Duel isn't active");
    const g = room.game as SpellGame;
    const now = Date.now();
    if (room.startAt && now < room.startAt - 150) throw new ConvexError("Wait for the countdown!");
    try {
      castSpell(g, me._id, spell as SpellId, now);
    } catch (e) {
      throw new ConvexError(e instanceof Error ? e.message : "Couldn't cast");
    }
    await commit(ctx, room, g);
  },
});

export const botTick = internalMutation({
  args: { roomId: v.id("spellRooms"), gameNo: v.number(), at: v.number() },
  handler: async (ctx, { roomId, gameNo, at }) => {
    const room = await ctx.db.get(roomId);
    if (!room || room.status !== "playing" || room.gameNo !== gameNo || !room.game) return;
    const g = room.game as SpellGame;
    if (g.done || g.botNextAt !== at) return;
    stepBot(g, Date.now(), Math.random);
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
          name: (await ctx.db.get(m.playerId))?.name ?? "Wizard",
          seat: m.seat,
          isMe: m.playerId === me._id,
          isHost: room.hostId === m.playerId,
          lastSeen: m.lastSeen,
        })),
    );
    const base = {
      code: room.code,
      status: room.status,
      gameNo: room.gameNo,
      startAt: room.startAt ?? null,
      isHost: room.hostId === me._id,
      isMember: room.members.some((m) => m.playerId === me._id),
      meId: me._id as string,
      members,
    };
    if (room.status === "lobby" || !room.game) return { ...base, game: null };

    const g = room.game as SpellGame;
    const names: Record<string, string> = {};
    for (const p of g.players) {
      if (isSpellBot(p)) names[p] = "Archmage Bot 🧙";
      else names[p] = members.find((m) => m.id === p)?.name ?? (await ctx.db.get(p as Id<"players">))?.name ?? "Wizard";
    }
    return { ...base, game: { ...g, names } };
  },
});
