import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { addXp, befriend, findPlayer, freeCode, requirePlayer } from "./lib/helpers";
import { BOOM_MAX, BOTS, ROUND_CHOICES, choose, isBot, leaveGame, newGame, onDeadline, rentOf, roll, worthOf, type BoomGame, type Seat } from "./lib/boom/rules";

type Room = Doc<"boomRooms">;

const COUNTDOWN_MS = 3000;

// ---------- Room helpers ----------
async function roomByCode(ctx: QueryCtx, code: string) {
  return await ctx.db
    .query("boomRooms")
    .withIndex("by_code", (q) => q.eq("code", code.trim().toUpperCase()))
    .order("desc")
    .first();
}
async function requireRoom(ctx: QueryCtx, code: string) {
  const r = await roomByCode(ctx, code);
  if (!r) throw new ConvexError("Room not found");
  return r;
}

/** Save the game. If the deadline changed, schedule a wake-up for it. */
async function commit(ctx: MutationCtx, room: Room, g: BoomGame) {
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
    await ctx.scheduler.runAfter(Math.max(0, g.deadline! - Date.now()) + 80, internal.boom.tick, { roomId: room._id, gameNo: room.gameNo, deadline: g.deadline! });
  }
}

async function award(ctx: MutationCtx, g: BoomGame) {
  const vsBots = g.players.some(isBot);
  for (const p of g.players) {
    if (isBot(p) || (g.out.includes(p) && !g.log.some((e) => e.kind === "bankrupt" && e.by === p))) continue; // leavers get nothing
    const id = p as Id<"players">;
    const won = g.done?.winners.includes(p);
    if (vsBots) await addXp(ctx, id, won ? 20 : 5);
    else if (won) await addXp(ctx, id, 30, { win: true });
    else await addXp(ctx, id, 10);
  }
}

// ---------- Lobby ----------
export const create = mutation({
  args: {},
  handler: async (ctx) => {
    const me = await requirePlayer(ctx);
    const code = await freeCode(ctx);
    await ctx.db.insert("boomRooms", { code, hostId: me._id, rounds: ROUND_CHOICES[1], status: "lobby", gameNo: 0, members: [{ playerId: me._id, seat: 0, lastSeen: Date.now() }] });
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
    if (room.members.length >= BOOM_MAX) throw new ConvexError("This room is full");
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
    if (!(ROUND_CHOICES as readonly number[]).includes(rounds)) throw new ConvexError("Pick one of the game lengths");
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
    // Playing alone? Two bots take the other seats.
    const seated: Seat[] = humans.length === 1 ? [...humans, ...BOTS] : humans;
    for (let i = 0; i < humans.length; i++) for (let j = i + 1; j < humans.length; j++) await befriend(ctx, humans[i], humans[j]);
    // Take turns going first, game to game.
    const k = room.gameNo % seated.length;
    const players = [...seated.slice(k), ...seated.slice(0, k)];
    const now = Date.now();
    const fresh = { ...room, gameNo: room.gameNo + 1, status: "playing" as const, startAt: now + COUNTDOWN_MS, endedAt: undefined };
    await ctx.db.patch(room._id, { gameNo: fresh.gameNo, status: "playing", startAt: fresh.startAt, endedAt: undefined });
    await commit(ctx, fresh, newGame(players, room.rounds, now, COUNTDOWN_MS));
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
    if (rest.length === 0) { patch.status = "finished"; patch.endedAt = Date.now(); }
    else if (room.hostId === me._id) patch.hostId = rest[0].playerId;
    await ctx.db.patch(room._id, patch);
    const g = room.game as BoomGame | undefined;
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
    await ctx.db.patch(room._id, { members: room.members.map((m) => (m.playerId === me._id ? { ...m, lastSeen: Date.now() } : m)) });
  },
});

// ---------- Playing ----------
export const act = mutation({
  args: {
    code: v.string(),
    move: v.union(v.object({ kind: v.literal("roll") }), v.object({ kind: v.literal("choose"), yes: v.boolean() })),
  },
  handler: async (ctx, { code, move }) => {
    const me = await requirePlayer(ctx);
    const room = await requireRoom(ctx, code);
    if (room.status !== "playing" || !room.game) throw new ConvexError("The game isn't running");
    const g = room.game as BoomGame;
    if (g.done) throw new ConvexError("The game is over");
    if (!g.players.includes(me._id) || g.out.includes(me._id)) throw new ConvexError("You're watching this game");
    const now = Date.now();
    if (room.startAt && now < room.startAt - 200) throw new ConvexError("Wait for the countdown");
    if (g.turn !== me._id) throw new ConvexError("It's not your turn");
    if (move.kind === "roll") {
      if (g.phase !== "roll") throw new ConvexError("Decide on this space first");
      roll(g, Math.random, now);
    } else {
      if (g.phase === "roll") throw new ConvexError("Roll the dice first");
      choose(g, move.yes, now);
    }
    await commit(ctx, room, g);
  },
});

export const tick = internalMutation({
  args: { roomId: v.id("boomRooms"), gameNo: v.number(), deadline: v.number() },
  handler: async (ctx, { roomId, gameNo, deadline }) => {
    const room = await ctx.db.get(roomId);
    if (!room || room.status !== "playing" || room.gameNo !== gameNo || !room.game) return;
    const g = room.game as BoomGame;
    if (g.done || g.deadline !== deadline) return;
    onDeadline(g, Math.random, Date.now());
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
      startAt: room.startAt ?? null,
      isHost: room.hostId === me._id,
      isMember: room.members.some((m) => m.playerId === me._id),
      meId: me._id as string,
      members,
    };
    if (room.status === "lobby" || !room.game) return { ...base, game: null };
    const g = room.game as BoomGame;
    // Players who left the room still need a name on the board.
    const names: Record<string, string> = {};
    for (const p of g.players) {
      if (isBot(p)) continue;
      const m = members.find((x) => x.id === p);
      names[p] = m?.name ?? (await ctx.db.get(p as Id<"players">))?.name ?? "Player";
    }
    return {
      ...base,
      game: {
        seq: g.seq,
        players: g.players,
        names,
        out: g.out,
        isPlayer: g.players.includes(me._id) && !g.out.includes(me._id),
        cash: g.cash,
        pos: g.pos,
        jail: g.jail,
        owner: g.owner,
        level: g.level,
        rents: g.owner.map((_, i) => rentOf(g, i)),
        worth: Object.fromEntries(g.players.map((p) => [p, g.out.includes(p) ? 0 : worthOf(g, p)])),
        pot: g.pot,
        turn: g.turn,
        phase: g.phase,
        round: g.round,
        maxRounds: g.maxRounds,
        log: g.log,
        deadline: g.deadline ?? null,
        done: g.done ?? null,
      },
    };
  },
});
