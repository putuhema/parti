import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { addXp, befriend, findPlayer, freeCode, requirePlayer } from "./lib/helpers";
import { LIFE_CHOICES, MAX_PLAYERS, explode, leaveGame, newGame, nextBomb, pass as passBomb, type PotatoGame } from "./lib/potato/rules";

type Room = Doc<"potatoRooms">;

async function roomByCode(ctx: QueryCtx, code: string) {
  return await ctx.db
    .query("potatoRooms")
    .withIndex("by_code", (q) => q.eq("code", code.trim().toUpperCase()))
    .order("desc")
    .first();
}
async function requireRoom(ctx: QueryCtx, code: string) {
  const r = await roomByCode(ctx, code);
  if (!r) throw new ConvexError("Room not found");
  return r;
}

/** Save; schedule the fuse (or the end of the explosion screen); XP at the end. */
async function commit(ctx: MutationCtx, room: Room, g: PotatoGame) {
  g.seq += 1;
  const needs = g.deadline && g.deadline !== g.sched && !g.done;
  if (needs) g.sched = g.deadline;
  const patch: Partial<Room> = { game: g };
  if (g.done && room.status !== "finished") {
    patch.status = "finished";
    patch.endedAt = Date.now();
    if (g.done.reason === "end") {
      for (const p of g.players) {
        const won = p === g.done.winner;
        await addXp(ctx, p as Id<"players">, won ? 25 : 8 + 4 * g.out.indexOf(p), { win: won });
      }
    }
  }
  await ctx.db.patch(room._id, patch);
  if (needs) await ctx.scheduler.runAfter(Math.max(0, g.deadline! - Date.now()), internal.potato.tick, { roomId: room._id, gameNo: room.gameNo, deadline: g.deadline! });
}

// ---------- Lobby ----------
export const create = mutation({
  args: {},
  handler: async (ctx) => {
    const me = await requirePlayer(ctx);
    const code = await freeCode(ctx);
    await ctx.db.insert("potatoRooms", { code, hostId: me._id, lives: LIFE_CHOICES[1], status: "lobby", gameNo: 0, members: [{ playerId: me._id, seat: 0, lastSeen: Date.now() }] });
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
    if (room.members.length >= MAX_PLAYERS) throw new ConvexError("This room is full");
    const taken = new Set(room.members.map((m) => m.seat));
    let seat = 0;
    while (taken.has(seat)) seat++;
    await ctx.db.patch(room._id, { members: [...room.members, { playerId: me._id, seat, lastSeen: Date.now() }] });
    return room.code;
  },
});

export const settings = mutation({
  args: { code: v.string(), lives: v.number() },
  handler: async (ctx, { code, lives }) => {
    const me = await requirePlayer(ctx);
    const room = await requireRoom(ctx, code);
    if (room.hostId !== me._id) throw new ConvexError("Only the host can change this");
    if (room.status === "playing") return;
    if (!(LIFE_CHOICES as readonly number[]).includes(lives)) throw new ConvexError("Pick 1, 2 or 3 lives");
    await ctx.db.patch(room._id, { lives });
  },
});

export const start = mutation({
  args: { code: v.string() },
  handler: async (ctx, { code }) => {
    const me = await requirePlayer(ctx);
    const room = await requireRoom(ctx, code);
    if (room.hostId !== me._id) throw new ConvexError("Only the host can start");
    if (room.status === "playing") return;
    if (room.members.length < 2) throw new ConvexError("You need at least 2 players to pass a bomb!");
    const players = [...room.members].sort((a, b) => a.seat - b.seat).map((m) => m.playerId);
    for (let i = 0; i < players.length; i++) for (let j = i + 1; j < players.length; j++) await befriend(ctx, players[i], players[j]);
    const fresh = { ...room, gameNo: room.gameNo + 1, status: "playing" as const, endedAt: undefined };
    await ctx.db.patch(room._id, { gameNo: fresh.gameNo, status: "playing", endedAt: undefined });
    await commit(ctx, fresh, newGame(players, room.lives, Math.random, Date.now()));
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
    const rest = room.members.filter((m) => m.playerId !== me._id);
    const patch: Partial<Room> = { members: rest };
    if (rest.length === 0) { patch.status = "finished"; patch.endedAt = Date.now(); }
    else if (room.hostId === me._id) patch.hostId = rest[0].playerId;
    await ctx.db.patch(room._id, patch);
    const g = room.game as PotatoGame | undefined;
    if (room.status !== "playing" || !g || g.done || !g.players.includes(me._id)) return;
    leaveGame(g, me._id, Math.random, Date.now());
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
/** You beat your challenge: throw the bomb at someone. */
export const pass = mutation({
  args: { code: v.string(), bomb: v.number(), target: v.string() },
  handler: async (ctx, { code, bomb, target }) => {
    const me = await requirePlayer(ctx);
    const room = await requireRoom(ctx, code);
    if (room.status !== "playing" || !room.game) throw new ConvexError("No game running");
    const g = room.game as PotatoGame;
    if (g.bomb !== bomb) return;
    const err = passBomb(g, me._id, target, Math.random, Date.now());
    if (err) throw new ConvexError(err);
    await commit(ctx, room, g);
  },
});

/** The secret fuse ran out, or the explosion screen is over. */
export const tick = internalMutation({
  args: { roomId: v.id("potatoRooms"), gameNo: v.number(), deadline: v.number() },
  handler: async (ctx, { roomId, gameNo, deadline }) => {
    const room = await ctx.db.get(roomId);
    if (!room || room.status !== "playing" || room.gameNo !== gameNo || !room.game) return;
    const g = room.game as PotatoGame;
    if (g.done || g.deadline !== deadline) return;
    if (g.phase === "play") explode(g, Date.now());
    else nextBomb(g, Math.random, Date.now());
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
    const base = {
      code: room.code,
      lives: room.lives,
      status: room.status,
      gameNo: room.gameNo,
      isHost: room.hostId === me._id,
      isMember: room.members.some((m) => m.playerId === me._id),
      meId: me._id as string,
      members,
    };
    if (room.status === "lobby" || !room.game) return { ...base, game: null };
    const g = room.game as PotatoGame;
    const names: Record<string, string> = {};
    for (const p of g.players) names[p] = members.find((m) => m.id === p)?.name ?? (await ctx.db.get(p as Id<"players">))?.name ?? "Player";
    const holding = g.holder === me._id;
    return {
      ...base,
      game: {
        seq: g.seq,
        players: g.players,
        names,
        lives: g.lives,
        isPlayer: g.players.includes(me._id),
        holder: g.holder,
        // Only the holder needs their challenge. Nobody ever gets the fuse.
        challenge: holding && g.phase === "play" ? g.challenge : null,
        givenAt: g.givenAt,
        bombAt: g.bombAt,
        phase: g.phase,
        bomb: g.bomb,
        passes: g.passes,
        lastBoom: g.lastBoom,
        out: g.out,
        deadline: g.phase === "boom" ? g.deadline ?? null : null,
        done: g.done ?? null,
      },
    };
  },
});
