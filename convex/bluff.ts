import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { addXp, befriend, findPlayer, freeCode, requirePlayer } from "./lib/helpers";
import { BOT_NAMES, MIN_SEATS, SEATS, autoAct, bid, callLiar, isBot, newGame, peek, react, replaceWithBot, type BluffGame } from "./lib/bluff/rules";

type Room = Doc<"bluffRooms">;

async function roomByCode(ctx: QueryCtx, code: string) {
  return await ctx.db
    .query("bluffRooms")
    .withIndex("by_code", (q) => q.eq("code", code.trim().toUpperCase()))
    .order("desc")
    .first();
}
async function requireRoom(ctx: QueryCtx, code: string) {
  const r = await roomByCode(ctx, code);
  if (!r) throw new ConvexError("Room not found");
  return r;
}

/** Save; keep the turn clock running (bots, idle players, reveals); XP at the end. */
async function commit(ctx: MutationCtx, room: Room, g: BluffGame) {
  g.seq += 1;
  const needs = g.deadline && g.deadline !== g.sched && !g.done;
  if (needs) g.sched = g.deadline;
  const patch: Partial<Room> = { game: g };
  if (g.done && room.status !== "finished") {
    patch.status = "finished";
    patch.endedAt = Date.now();
    if (g.done.reason === "end") {
      for (const p of g.players) {
        if (isBot(p)) continue;
        const won = g.done.winner === p;
        await addXp(ctx, p as Id<"players">, won ? 30 : 12, { win: won });
      }
    }
  }
  await ctx.db.patch(room._id, patch);
  if (needs) await ctx.scheduler.runAfter(Math.max(0, g.deadline! - Date.now()), internal.bluff.tick, { roomId: room._id, gameNo: room.gameNo, deadline: g.deadline! });
}

// ---------- Lobby ----------
export const create = mutation({
  args: {},
  handler: async (ctx) => {
    const me = await requirePlayer(ctx);
    const code = await freeCode(ctx);
    await ctx.db.insert("bluffRooms", { code, hostId: me._id, bots: 2, status: "lobby", gameNo: 0, members: [{ playerId: me._id, seat: 0, lastSeen: Date.now() }] });
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
    if (room.members.length >= SEATS) throw new ConvexError("This table is full");
    const taken = new Set(room.members.map((m) => m.seat));
    let seat = 0;
    while (taken.has(seat)) seat++;
    await ctx.db.patch(room._id, { members: [...room.members, { playerId: me._id, seat, lastSeen: Date.now() }] });
    return room.code;
  },
});

export const settings = mutation({
  args: { code: v.string(), bots: v.number() },
  handler: async (ctx, { code, bots }) => {
    const me = await requirePlayer(ctx);
    const room = await requireRoom(ctx, code);
    if (room.hostId !== me._id) throw new ConvexError("Only the host can change this");
    if (room.status === "playing") return;
    if (!Number.isInteger(bots) || bots < 0 || bots > 4) throw new ConvexError("0 to 4 bots");
    await ctx.db.patch(room._id, { bots });
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
    const bots = Math.min(room.bots, SEATS - humans.length);
    if (humans.length + bots < MIN_SEATS) throw new ConvexError("Add a bot or invite a friend first");
    for (let i = 0; i < humans.length; i++) for (let j = i + 1; j < humans.length; j++) await befriend(ctx, humans[i], humans[j]);
    const fresh = { ...room, gameNo: room.gameNo + 1, status: "playing" as const, endedAt: undefined };
    await ctx.db.patch(room._id, { gameNo: fresh.gameNo, status: "playing", endedAt: undefined });
    await commit(ctx, fresh, newGame(humans, bots, Math.random, Date.now()));
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
    const g = room.game as BluffGame | undefined;
    if (room.status !== "playing" || !g || g.done || !g.players.includes(me._id)) return;
    if (rest.length === 0) { g.done = { winner: null, reason: "left" }; g.deadline = undefined; }
    else replaceWithBot(g, me._id);
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
export const act = mutation({
  args: {
    code: v.string(),
    move: v.union(
      v.object({ kind: v.literal("bid"), qty: v.number(), face: v.number() }),
      v.object({ kind: v.literal("liar") }),
      v.object({ kind: v.literal("peek") }),
      v.object({ kind: v.literal("react"), e: v.string() }),
    ),
  },
  handler: async (ctx, { code, move }) => {
    const me = await requirePlayer(ctx);
    const room = await requireRoom(ctx, code);
    if (room.status !== "playing" || !room.game) throw new ConvexError("No game running");
    const g = room.game as BluffGame;
    if (g.done) return;
    const now = Date.now();
    if (move.kind !== "react" && !g.players.includes(me._id)) throw new ConvexError("You're not at this table");
    const err =
      move.kind === "bid" ? bid(g, me._id, move.qty, move.face, now)
      : move.kind === "liar" ? callLiar(g, me._id, now)
      : move.kind === "peek" ? peek(g, me._id, Math.random)
      : react(g, me._id, move.e, now);
    if (err) throw new ConvexError(err);
    await commit(ctx, room, g);
  },
});

/** The turn clock: bots move, idle players are moved for, reveals end. */
export const tick = internalMutation({
  args: { roomId: v.id("bluffRooms"), gameNo: v.number(), deadline: v.number() },
  handler: async (ctx, { roomId, gameNo, deadline }) => {
    const room = await ctx.db.get(roomId);
    if (!room || room.status !== "playing" || room.gameNo !== gameNo || !room.game) return;
    const g = room.game as BluffGame;
    if (g.done || g.deadline !== deadline) return;
    autoAct(g, Math.random, Date.now());
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
      bots: room.bots,
      status: room.status,
      gameNo: room.gameNo,
      isHost: room.hostId === me._id,
      isMember: room.members.some((m) => m.playerId === me._id),
      meId: me._id as string,
      members,
    };
    if (room.status === "lobby" || !room.game) return { ...base, game: null };
    const g = room.game as BluffGame;
    const names: Record<string, string> = {};
    for (const p of g.players) names[p] = isBot(p) ? BOT_NAMES[p] ?? "Pirate" : members.find((m) => m.id === p)?.name ?? (await ctx.db.get(p as Id<"players">))?.name ?? "Player";
    // Your own dice always; everyone's once LIAR is called or the game is over.
    const open = g.phase === "reveal" || !!g.done;
    const dice: Record<string, number[] | null> = {};
    const counts: Record<string, number> = {};
    for (const p of g.players) {
      counts[p] = g.dice[p].length;
      dice[p] = open || p === me._id ? g.dice[p] : null;
    }
    const myPeek = g.peeks[me._id];
    return {
      ...base,
      game: {
        seq: g.seq,
        players: g.players,
        names,
        isPlayer: g.players.includes(me._id),
        dice,
        counts,
        round: g.round,
        turn: g.turn,
        bid: g.bid,
        bids: g.bids.slice(-6),
        phase: g.phase,
        reveal: g.reveal,
        out: g.out,
        reacts: g.reacts,
        peekUsed: !!myPeek,
        // Your peek only counts for the round you took it in: dice are rerolled after.
        peek: myPeek && myPeek.round === g.round ? myPeek : null,
        deadline: g.deadline ?? null,
        done: g.done ?? null,
      },
    };
  },
});
