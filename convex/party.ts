import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { addXp, befriend, findPlayer, freeCode, requirePlayer } from "./lib/helpers";
import { MAX_PLAYERS, MICROS, ROUND_CHOICES, everyoneIn, leaveGame, newGame, nextRound, reveal, submit as submitScore, winners, type PartyGame } from "./lib/party/rules";

type Room = Doc<"partyRooms">;

async function roomByCode(ctx: QueryCtx, code: string) {
  return await ctx.db
    .query("partyRooms")
    .withIndex("by_code", (q) => q.eq("code", code.trim().toUpperCase()))
    .order("desc")
    .first();
}
async function requireRoom(ctx: QueryCtx, code: string) {
  const r = await roomByCode(ctx, code);
  if (!r) throw new ConvexError("Room not found");
  return r;
}
async function bestOf(ctx: QueryCtx, playerId: Id<"players">, micro: string) {
  return await ctx.db.query("partyBests").withIndex("by_playerId_and_micro", (q) => q.eq("playerId", playerId).eq("micro", micro)).unique();
}

/** Close the round, noting who beat their personal best. */
async function closeRound(ctx: MutationCtx, g: PartyGame) {
  const micro = g.order[g.round];
  const records: string[] = [];
  for (const p of g.players) {
    const s = g.scores[p] ?? 0;
    if (s <= 0) continue;
    const row = await bestOf(ctx, p as Id<"players">, micro);
    if (!row) { await ctx.db.insert("partyBests", { playerId: p as Id<"players">, micro, best: s }); records.push(p); }
    else if (s > row.best) { await ctx.db.patch(row._id, { best: s }); records.push(p); }
  }
  reveal(g, Date.now(), records);
}

/** Save; keep the round clock ticking; hand out XP at the end. */
async function commit(ctx: MutationCtx, room: Room, g: PartyGame) {
  g.seq += 1;
  const needs = g.deadline && g.deadline !== g.sched && !g.done;
  if (needs) g.sched = g.deadline;
  const patch: Partial<Room> = { game: g };
  if (g.done && room.status !== "finished") {
    patch.status = "finished";
    patch.endedAt = Date.now();
    if (g.done.reason === "end") {
      const won = new Set(winners(g));
      for (const p of g.players) await addXp(ctx, p as Id<"players">, won.has(p) ? 25 : 12, { win: won.has(p) && g.players.length > 1 });
    }
  }
  await ctx.db.patch(room._id, patch);
  if (needs) await ctx.scheduler.runAfter(Math.max(0, g.deadline! - Date.now()) + 60, internal.party.tick, { roomId: room._id, gameNo: room.gameNo, deadline: g.deadline! });
}

// ---------- Lobby ----------
export const create = mutation({
  args: {},
  handler: async (ctx) => {
    const me = await requirePlayer(ctx);
    const code = await freeCode(ctx);
    await ctx.db.insert("partyRooms", { code, hostId: me._id, rounds: ROUND_CHOICES[1], status: "lobby", gameNo: 0, members: [{ playerId: me._id, seat: 0, lastSeen: Date.now() }] });
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
    const players = [...room.members].sort((a, b) => a.seat - b.seat).map((m) => m.playerId);
    for (let i = 0; i < players.length; i++) for (let j = i + 1; j < players.length; j++) await befriend(ctx, players[i], players[j]);
    const g = newGame(players, room.rounds, Math.random, Date.now());
    const fresh = { ...room, gameNo: room.gameNo + 1, status: "playing" as const, endedAt: undefined };
    await ctx.db.patch(room._id, { gameNo: fresh.gameNo, status: "playing", endedAt: undefined });
    await commit(ctx, fresh, g);
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
    const g = room.game as PartyGame | undefined;
    if (room.status !== "playing" || !g || g.done || !g.players.includes(me._id)) return;
    leaveGame(g, me._id, Date.now());
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
/** Your score for this round's minigame. When everyone's in, the round closes straight away. */
export const submit = mutation({
  args: { code: v.string(), round: v.number(), score: v.number() },
  handler: async (ctx, { code, round, score }) => {
    const me = await requirePlayer(ctx);
    const room = await requireRoom(ctx, code);
    if (room.status !== "playing" || !room.game) return;
    const g = room.game as PartyGame;
    const err = submitScore(g, me._id, round, score, Date.now());
    if (err) throw new ConvexError(err);
    if (g.phase === "play" && everyoneIn(g)) await closeRound(ctx, g);
    await commit(ctx, room, g);
  },
});

/** The round clock: close a round that ran out of time, or move on from the results. */
export const tick = internalMutation({
  args: { roomId: v.id("partyRooms"), gameNo: v.number(), deadline: v.number() },
  handler: async (ctx, { roomId, gameNo, deadline }) => {
    const room = await ctx.db.get(roomId);
    if (!room || room.status !== "playing" || room.gameNo !== gameNo || !room.game) return;
    const g = room.game as PartyGame;
    if (g.done || g.deadline !== deadline) return;
    if (g.phase === "play") await closeRound(ctx, g);
    else nextRound(g, Date.now());
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
    const bests: Record<string, number> = {};
    for (const m of MICROS) {
      const row = await bestOf(ctx, me._id, m.id);
      if (row) bests[m.id] = row.best;
    }
    const base = {
      code: room.code,
      rounds: room.rounds,
      status: room.status,
      gameNo: room.gameNo,
      isHost: room.hostId === me._id,
      isMember: room.members.some((m) => m.playerId === me._id),
      meId: me._id as string,
      members,
      bests,
    };
    if (room.status === "lobby" || !room.game) return { ...base, game: null };
    const g = room.game as PartyGame;
    const names: Record<string, string> = {};
    for (const p of new Set([...g.players, ...Object.keys(g.totals)])) names[p] = members.find((m) => m.id === p)?.name ?? (await ctx.db.get(p as Id<"players">))?.name ?? "Player";
    return {
      ...base,
      game: {
        seq: g.seq,
        players: g.players,
        names,
        isPlayer: g.players.includes(me._id),
        round: g.round,
        rounds: g.order.length,
        micro: g.order[g.round] ?? null,
        next: g.order[g.round + 1] ?? null,
        seed: g.seeds[g.round] ?? 0,
        phase: g.phase,
        startAt: g.startAt,
        deadline: g.deadline ?? null,
        // While playing, you only learn who has finished, not their scores.
        submitted: Object.keys(g.scores),
        totals: g.totals,
        results: g.results,
        done: g.done ?? null,
      },
    };
  },
});
