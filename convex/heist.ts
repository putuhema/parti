import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { addXp, befriend, findPlayer, freeCode, requirePlayer } from "./lib/helpers";
import { LEVELS } from "./lib/heist/levels";
import { ROLES, TICKS, parseLevel, playRound, stars, startSim, type Action, type Role, type Sim, type Tick } from "./lib/heist/rules";

type Room = Doc<"heistRooms">;
const MAX = 2;
const MAX_PINGS = 12;

/** A heist in progress. Plans stay hidden from nobody: seeing your partner's plan as they draw it is the point. */
export type HeistGame = {
  seq: number;
  level: string;
  roles: Record<Role, string>; // player ids (the same id twice when playing alone)
  sim: Sim;
  round: number; // rounds played since the last bust
  rounds: number; // rounds played in total
  plans: Record<Role, Action[]>;
  locked: Record<Role, boolean>;
  last: { n: number; start: Sim; plans: Record<Role, Action[]>; ticks: Tick[] } | null;
  busts: number;
  pings: { by: string; x: number; y: number; n: number }[];
  done?: { stars: { escaped: boolean; coins: boolean; par: boolean }; rounds: number; busts: number } | { left: true };
};

const actionV = v.union(v.literal("n"), v.literal("e"), v.literal("s"), v.literal("w"), v.literal("wait"), v.literal("hack"));
const roleV = v.union(v.literal("cat"), v.literal("hacker"));

const levelDef = (id: string) => LEVELS.find((l) => l.id === id) ?? LEVELS[0];

async function roomByCode(ctx: QueryCtx, code: string) {
  return await ctx.db
    .query("heistRooms")
    .withIndex("by_code", (q) => q.eq("code", code.trim().toUpperCase()))
    .order("desc")
    .first();
}
async function requireRoom(ctx: QueryCtx, code: string) {
  const r = await roomByCode(ctx, code);
  if (!r) throw new ConvexError("Room not found");
  return r;
}

async function commit(ctx: MutationCtx, room: Room, g: HeistGame) {
  g.seq += 1;
  const patch: Partial<Room> = { game: g };
  if (g.done && room.status !== "finished") {
    patch.status = "finished";
    patch.endedAt = Date.now();
  }
  await ctx.db.patch(room._id, patch);
}

async function saveWin(ctx: MutationCtx, g: HeistGame, earned: number) {
  for (const id of new Set(Object.values(g.roles))) {
    const playerId = id as Id<"players">;
    await addXp(ctx, playerId, 10 + earned * 5, { win: true });
    const row = await ctx.db.query("heistStars").withIndex("by_playerId_and_levelId", (q) => q.eq("playerId", playerId).eq("levelId", g.level)).unique();
    if (!row) await ctx.db.insert("heistStars", { playerId, levelId: g.level, stars: earned, bestRounds: g.round });
    else await ctx.db.patch(row._id, { stars: Math.max(row.stars, earned), bestRounds: Math.min(row.bestRounds, g.round) });
  }
}

function newGame(room: Room, level: string): HeistGame {
  const seats = [...room.members].sort((a, b) => a.seat - b.seat).map((m) => m.playerId as string);
  const lv = parseLevel(levelDef(level));
  return {
    seq: 0, level, roles: { cat: seats[0], hacker: seats[1] ?? seats[0] }, sim: startSim(lv), round: 0, rounds: 0,
    plans: { cat: [], hacker: [] }, locked: { cat: false, hacker: false }, last: null, busts: 0, pings: [],
  };
}

// ---------- Lobby ----------
export const create = mutation({
  args: {},
  handler: async (ctx) => {
    const me = await requirePlayer(ctx);
    const code = await freeCode(ctx);
    await ctx.db.insert("heistRooms", { code, hostId: me._id, level: LEVELS[0].id, status: "lobby", gameNo: 0, members: [{ playerId: me._id, seat: 0, lastSeen: Date.now() }] });
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
    if (room.members.length >= MAX) throw new ConvexError("This crew is full");
    const taken = new Set(room.members.map((m) => m.seat));
    let seat = 0;
    while (taken.has(seat)) seat++;
    await ctx.db.patch(room._id, { members: [...room.members, { playerId: me._id, seat, lastSeen: Date.now() }] });
    return room.code;
  },
});

export const pickLevel = mutation({
  args: { code: v.string(), level: v.string() },
  handler: async (ctx, { code, level }) => {
    const me = await requirePlayer(ctx);
    const room = await requireRoom(ctx, code);
    if (room.hostId !== me._id) throw new ConvexError("Only the host picks the heist");
    if (room.status === "playing") return;
    if (!LEVELS.some((l) => l.id === level)) throw new ConvexError("No such heist");
    await ctx.db.patch(room._id, { level });
  },
});

/** Swap who plays the Cat and who plays the Hacker. */
export const swap = mutation({
  args: { code: v.string() },
  handler: async (ctx, { code }) => {
    const me = await requirePlayer(ctx);
    const room = await requireRoom(ctx, code);
    if (!room.members.some((m) => m.playerId === me._id)) throw new ConvexError("You're not in this crew");
    if (room.status === "playing" || room.members.length !== 2) return;
    await ctx.db.patch(room._id, { members: room.members.map((m) => ({ ...m, seat: 1 - m.seat })) });
  },
});

/** Start (or move on to) a heist. Works from the lobby and from the end screen. */
export const start = mutation({
  args: { code: v.string(), level: v.optional(v.string()) },
  handler: async (ctx, { code, level }) => {
    const me = await requirePlayer(ctx);
    const room = await requireRoom(ctx, code);
    if (room.hostId !== me._id) throw new ConvexError("Only the host can start");
    if (room.status === "playing") return;
    const id = level && LEVELS.some((l) => l.id === level) ? level : room.level;
    const ids = room.members.map((m) => m.playerId);
    if (ids.length === 2) await befriend(ctx, ids[0], ids[1]);
    const fresh = { ...room, level: id, gameNo: room.gameNo + 1, status: "playing" as const, endedAt: undefined };
    await ctx.db.patch(room._id, { level: id, gameNo: fresh.gameNo, status: "playing", endedAt: undefined });
    await commit(ctx, fresh, newGame(fresh, id));
  },
});

export const toLobby = mutation({
  args: { code: v.string() },
  handler: async (ctx, { code }) => {
    const me = await requirePlayer(ctx);
    const room = await requireRoom(ctx, code);
    if (!room.members.some((m) => m.playerId === me._id)) throw new ConvexError("You're not in this crew");
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
    const rest = room.members.filter((m) => m.playerId !== me._id).map((m) => ({ ...m, seat: 0 }));
    const patch: Partial<Room> = { members: rest };
    if (rest.length === 0) { patch.status = "finished"; patch.endedAt = Date.now(); }
    else if (room.hostId === me._id) patch.hostId = rest[0].playerId;
    await ctx.db.patch(room._id, patch);
    const g = room.game as HeistGame | undefined;
    if (room.status !== "playing" || !g || g.done || !Object.values(g.roles).includes(me._id)) return;
    g.done = { left: true };
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
async function liveGame(ctx: MutationCtx, code: string) {
  const me = await requirePlayer(ctx);
  const room = await requireRoom(ctx, code);
  if (room.status !== "playing" || !room.game) throw new ConvexError("No heist running");
  const g = room.game as HeistGame;
  if (g.done) throw new ConvexError("This heist is over");
  if (!Object.values(g.roles).includes(me._id)) throw new ConvexError("You're not on this crew");
  return { me, room, g };
}

/** Draft or lock in a plan. When both thieves are locked in, the round plays out. */
export const plan = mutation({
  args: { code: v.string(), rounds: v.number(), role: roleV, actions: v.array(actionV), lock: v.boolean() },
  handler: async (ctx, { code, rounds, role, actions, lock }) => {
    const { me, room, g } = await liveGame(ctx, code);
    if (g.roles[role] !== me._id) throw new ConvexError("That's your partner's thief");
    if (rounds !== g.rounds) return; // a plan for a round that already played
    if (actions.length > TICKS) throw new ConvexError(`Up to ${TICKS} moves a round`);
    g.plans[role] = actions;
    g.locked[role] = lock;
    if (ROLES.every((r) => g.locked[r])) {
      const lv = parseLevel(levelDef(g.level));
      const ticks = playRound(lv, g.sim, g.plans);
      const end = ticks.at(-1)!;
      g.last = { n: (g.last?.n ?? 0) + 1, start: g.sim, plans: g.plans, ticks };
      g.rounds += 1;
      g.round += 1;
      g.plans = { cat: [], hacker: [] };
      g.locked = { cat: false, hacker: false };
      g.pings = [];
      if (end.bust) {
        // Busted: back to the start, the clock for par starts over.
        g.busts += 1;
        g.round = 0;
        g.sim = startSim(lv);
      } else {
        g.sim = end.sim;
        if (end.won) {
          const s = stars(lv, end.sim, g.round);
          g.done = { stars: s, rounds: g.round, busts: g.busts };
          await saveWin(ctx, g, [s.escaped, s.coins, s.par].filter(Boolean).length);
        }
      }
    }
    await commit(ctx, room, g);
  },
});

/** Point at a tile for your partner. */
export const ping = mutation({
  args: { code: v.string(), x: v.number(), y: v.number() },
  handler: async (ctx, { code, x, y }) => {
    const { me, room, g } = await liveGame(ctx, code);
    const n = (g.pings.at(-1)?.n ?? 0) + 1;
    g.pings = [...g.pings, { by: me._id, x: Math.round(x), y: Math.round(y), n }].slice(-MAX_PINGS);
    await commit(ctx, room, g);
  },
});

/** Start the heist over from the beginning. */
export const restart = mutation({
  args: { code: v.string() },
  handler: async (ctx, { code }) => {
    const { room, g } = await liveGame(ctx, code);
    const fresh = newGame(room, g.level);
    fresh.roles = g.roles;
    fresh.busts = g.busts;
    fresh.rounds = g.rounds;
    fresh.last = g.last ? { ...g.last, ticks: [] } : null;
    await commit(ctx, room, { ...fresh, seq: g.seq });
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
    const best: Record<string, number> = {};
    for (const l of LEVELS) {
      const row = await ctx.db.query("heistStars").withIndex("by_playerId_and_levelId", (q) => q.eq("playerId", me._id).eq("levelId", l.id)).unique();
      if (row) best[l.id] = row.stars;
    }
    const g = room.game as HeistGame | undefined;
    const names: Record<string, string> = {};
    if (g) for (const id of new Set(Object.values(g.roles))) names[id] = members.find((m) => m.id === id)?.name ?? (await ctx.db.get(id as Id<"players">))?.name ?? "Thief";
    return {
      code: room.code,
      level: room.level,
      status: room.status,
      gameNo: room.gameNo,
      isHost: room.hostId === me._id,
      isMember: room.members.some((m) => m.playerId === me._id),
      meId: me._id as string,
      members,
      best,
      game: room.status === "lobby" || !g ? null : { ...g, names },
    };
  },
});
