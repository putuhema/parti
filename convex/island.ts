import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { addXp, befriend, findPlayer, freeCode, requirePlayer } from "./lib/helpers";
import { BOT_NAMES, ROUND_CHOICES, SEATS, arm, autoAct, current, humansIn, isBot, newGame, replaceWithBot, revealMini, roll as rollDice, shopChoice, shrineChoice, submitMini, type IslandGame, type ItemId } from "./lib/island/rules";

type Room = Doc<"islandRooms">;

async function roomByCode(ctx: QueryCtx, code: string) {
  return await ctx.db
    .query("islandRooms")
    .withIndex("by_code", (q) => q.eq("code", code.trim().toUpperCase()))
    .order("desc")
    .first();
}
async function requireRoom(ctx: QueryCtx, code: string) {
  const r = await roomByCode(ctx, code);
  if (!r) throw new ConvexError("Room not found");
  return r;
}

/** Save; keep the turn clock running (bot turns, idle timeouts, minigames); XP at the end. */
async function commit(ctx: MutationCtx, room: Room, g: IslandGame) {
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
        const won = g.done.winners.includes(p);
        await addXp(ctx, p as Id<"players">, won ? 30 : 12, { win: won });
      }
    }
  }
  await ctx.db.patch(room._id, patch);
  if (needs) await ctx.scheduler.runAfter(Math.max(0, g.deadline! - Date.now()), internal.island.tick, { roomId: room._id, gameNo: room.gameNo, deadline: g.deadline! });
}

// ---------- Lobby ----------
export const create = mutation({
  args: {},
  handler: async (ctx) => {
    const me = await requirePlayer(ctx);
    const code = await freeCode(ctx);
    await ctx.db.insert("islandRooms", { code, hostId: me._id, rounds: ROUND_CHOICES[0], status: "lobby", gameNo: 0, members: [{ playerId: me._id, seat: 0, lastSeen: Date.now() }] });
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
    if (room.members.length >= SEATS) throw new ConvexError("This island is full");
    const taken = new Set(room.members.map((m) => m.seat));
    let seat = 0;
    while (taken.has(seat)) seat++;
    await ctx.db.patch(room._id, { members: [...room.members, { playerId: me._id, seat, lastSeen: Date.now() }] });
    return room.code;
  },
});

export const settings = mutation({
  args: { code: v.string(), rounds: v.number() },
  handler: async (ctx, { code, rounds }) => {
    const me = await requirePlayer(ctx);
    const room = await requireRoom(ctx, code);
    if (room.hostId !== me._id) throw new ConvexError("Only the host can change this");
    if (room.status === "playing") return;
    if (!(ROUND_CHOICES as readonly number[]).includes(rounds)) throw new ConvexError("Pick one of the lengths");
    await ctx.db.patch(room._id, { rounds });
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
    for (let i = 0; i < humans.length; i++) for (let j = i + 1; j < humans.length; j++) await befriend(ctx, humans[i], humans[j]);
    const fresh = { ...room, gameNo: room.gameNo + 1, status: "playing" as const, endedAt: undefined };
    await ctx.db.patch(room._id, { gameNo: fresh.gameNo, status: "playing", endedAt: undefined });
    await commit(ctx, fresh, newGame(humans, room.rounds, Math.random, Date.now()));
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
    const g = room.game as IslandGame | undefined;
    if (room.status !== "playing" || !g || g.done || !g.players.includes(me._id)) return;
    if (rest.length === 0) { g.done = { winners: [], bonus: [], reason: "left" }; g.deadline = undefined; }
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
    seq: v.number(),
    move: v.union(
      v.object({ kind: v.literal("roll"), item: v.union(v.literal("double"), v.literal("warp"), v.null()) }),
      v.object({ kind: v.literal("shrine"), buy: v.boolean() }),
      v.object({ kind: v.literal("shop"), item: v.union(v.literal("double"), v.literal("warp"), v.null()) }),
      v.object({ kind: v.literal("mini"), round: v.number(), score: v.number() }),
    ),
  },
  handler: async (ctx, { code, move }) => {
    const me = await requirePlayer(ctx);
    const room = await requireRoom(ctx, code);
    if (room.status !== "playing" || !room.game) throw new ConvexError("No game running");
    const g = room.game as IslandGame;
    if (g.done) return;
    const now = Date.now();
    let err: string | null = null;
    if (move.kind === "roll") {
      err = arm(g, me._id, move.item as ItemId | null) ?? rollDice(g, me._id, Math.random, now);
    } else if (move.kind === "shrine") err = shrineChoice(g, me._id, move.buy, Math.random, now);
    else if (move.kind === "shop") err = shopChoice(g, me._id, move.item as ItemId | null, now);
    else {
      if (move.round !== g.round || g.phase !== "mini") return;
      err = submitMini(g, me._id, move.score, now);
      if (!err && humansIn(g)) revealMini(g, Math.random, now);
    }
    if (err) throw new ConvexError(err);
    await commit(ctx, room, g);
  },
});

/** The turn clock: bots move, idle players are moved for, minigames open and close. */
export const tick = internalMutation({
  args: { roomId: v.id("islandRooms"), gameNo: v.number(), deadline: v.number() },
  handler: async (ctx, { roomId, gameNo, deadline }) => {
    const room = await ctx.db.get(roomId);
    if (!room || room.status !== "playing" || room.gameNo !== gameNo || !room.game) return;
    const g = room.game as IslandGame;
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
      rounds: room.rounds,
      status: room.status,
      gameNo: room.gameNo,
      isHost: room.hostId === me._id,
      isMember: room.members.some((m) => m.playerId === me._id),
      meId: me._id as string,
      members,
    };
    if (room.status === "lobby" || !room.game) return { ...base, game: null };
    const g = room.game as IslandGame;
    const names: Record<string, string> = {};
    for (const p of g.players) names[p] = isBot(p) ? BOT_NAMES[p] ?? "Bot" : members.find((m) => m.id === p)?.name ?? (await ctx.db.get(p as Id<"players">))?.name ?? "Player";
    return {
      ...base,
      game: {
        seq: g.seq,
        players: g.players,
        names,
        isPlayer: g.players.includes(me._id),
        coins: g.coins,
        gems: g.gems,
        pos: g.pos,
        items: g.items,
        shrine: g.shrine,
        turn: current(g),
        round: g.round,
        maxRounds: g.maxRounds,
        phase: g.phase,
        pending: g.pending ? { who: g.pending.who } : null,
        lastMove: g.lastMove,
        log: g.log.slice(-8),
        // While the minigame runs you only learn who has finished.
        mini: g.mini ? { micro: g.mini.micro, seed: g.mini.seed, startAt: g.mini.startAt, done: Object.keys(g.mini.scores) } : null,
        lastMini: g.minis.at(-1) ?? null,
        miniWins: g.miniWins,
        deadline: g.deadline ?? null,
        done: g.done ?? null,
      },
    };
  },
});
