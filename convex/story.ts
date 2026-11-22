import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { addXp, befriend, findPlayer, freeCode, requirePlayer } from "./lib/helpers";
import { STARTERS } from "./lib/story/content";
import { LENGTHS, carryOn, newGame, pointsOf, readerOf, spot as spotWord, writeLine, writerOf, type StoryGame } from "./lib/story/rules";

type Room = Doc<"storyRooms">;
const MAX = 2;
const SHELF = 12;

async function roomByCode(ctx: QueryCtx, code: string) {
  return await ctx.db
    .query("storyRooms")
    .withIndex("by_code", (q) => q.eq("code", code.trim().toUpperCase()))
    .order("desc")
    .first();
}
async function requireRoom(ctx: QueryCtx, code: string) {
  const r = await roomByCode(ctx, code);
  if (!r) throw new ConvexError("Room not found");
  return r;
}
const pairKey = (a: string, b: string) => [a, b].sort().join("|");

async function commit(ctx: MutationCtx, room: Room, g: StoryGame) {
  g.seq += 1;
  const patch: Partial<Room> = { game: g };
  if (g.done && room.status !== "finished") {
    patch.status = "finished";
    patch.endedAt = Date.now();
    if (g.done.reason === "end") await finish(ctx, g);
  }
  await ctx.db.patch(room._id, patch);
}

/** Put the finished story on the pair's shelf and hand out XP. */
async function finish(ctx: MutationCtx, g: StoryGame) {
  const names: Record<string, string> = {};
  for (const p of g.players) names[p] = (await ctx.db.get(p as Id<"players">))?.name ?? "Writer";
  await ctx.db.insert("storyBooks", {
    key: pairKey(g.players[0], g.players[1]),
    starter: g.starter,
    names,
    lines: g.lines.map((l) => ({ by: l.by, text: l.text, secret: l.secret, spotted: l.spotted, ...(l.twist ? { twist: l.twist } : {}) })),
  });
  const best = Math.max(...g.players.map((p) => pointsOf(g, p)));
  for (const p of g.players) {
    const won = pointsOf(g, p) === best;
    await addXp(ctx, p as Id<"players">, won ? 25 : 15, { win: won });
  }
}

// ---------- Lobby ----------
export const create = mutation({
  args: {},
  handler: async (ctx) => {
    const me = await requirePlayer(ctx);
    const code = await freeCode(ctx);
    await ctx.db.insert("storyRooms", { code, hostId: me._id, length: LENGTHS[1], status: "lobby", gameNo: 0, members: [{ playerId: me._id, seat: 0, lastSeen: Date.now() }] });
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
    if (room.members.length >= MAX) throw new ConvexError("This room is for two, and it's full");
    const taken = new Set(room.members.map((m) => m.seat));
    let seat = 0;
    while (taken.has(seat)) seat++;
    await ctx.db.patch(room._id, { members: [...room.members, { playerId: me._id, seat, lastSeen: Date.now() }] });
    return room.code;
  },
});

export const settings = mutation({
  args: { code: v.string(), length: v.number(), starter: v.union(v.number(), v.null()) },
  handler: async (ctx, { code, length, starter }) => {
    const me = await requirePlayer(ctx);
    const room = await requireRoom(ctx, code);
    if (room.hostId !== me._id) throw new ConvexError("Only the host can change this");
    if (room.status === "playing") return;
    if (!(LENGTHS as readonly number[]).includes(length)) throw new ConvexError("Pick one of the lengths");
    if (starter !== null && !(Number.isInteger(starter) && starter >= 0 && starter < STARTERS.length)) throw new ConvexError("No such story starter");
    await ctx.db.patch(room._id, { length, starter: starter ?? undefined });
  },
});

export const start = mutation({
  args: { code: v.string() },
  handler: async (ctx, { code }) => {
    const me = await requirePlayer(ctx);
    const room = await requireRoom(ctx, code);
    if (room.hostId !== me._id) throw new ConvexError("Only the host can start");
    if (room.status === "playing") return;
    if (room.members.length !== 2) throw new ConvexError("Sneaky Story is for two. Invite someone first!");
    const seated = [...room.members].sort((a, b) => a.seat - b.seat).map((m) => m.playerId as string);
    await befriend(ctx, seated[0] as Id<"players">, seated[1] as Id<"players">);
    // Take turns writing the first line, game to game.
    const players: [string, string] = room.gameNo % 2 ? [seated[1], seated[0]] : [seated[0], seated[1]];
    const g = newGame(players, room.length, room.starter ?? null, Math.random);
    const fresh = { ...room, gameNo: room.gameNo + 1, status: "playing" as const, endedAt: undefined };
    await ctx.db.patch(room._id, { gameNo: fresh.gameNo, status: "playing", endedAt: undefined, starter: undefined });
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
    const rest = room.members.filter((m) => m.playerId !== me._id).map((m) => ({ ...m, seat: 0 }));
    const patch: Partial<Room> = { members: rest };
    if (rest.length === 0) { patch.status = "finished"; patch.endedAt = Date.now(); }
    else if (room.hostId === me._id) patch.hostId = rest[0].playerId;
    await ctx.db.patch(room._id, patch);
    const g = room.game as StoryGame | undefined;
    if (room.status !== "playing" || !g || g.done || !g.players.includes(me._id)) return;
    g.done = { reason: "left" };
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
async function liveGame(ctx: MutationCtx, code: string, line: number) {
  const me = await requirePlayer(ctx);
  const room = await requireRoom(ctx, code);
  if (room.status !== "playing" || !room.game) throw new ConvexError("The story isn't running");
  const g = room.game as StoryGame;
  if (g.done) throw new ConvexError("The story is finished");
  if (!g.players.includes(me._id)) throw new ConvexError("You're reading along");
  // `line` is how many lines the tapper saw; anything else is a stale tap.
  const stale = line !== g.lines.length;
  return { me, room, g, stale };
}

export const write = mutation({
  args: { code: v.string(), line: v.number(), text: v.string(), secret: v.string() },
  handler: async (ctx, { code, line, text, secret }) => {
    const { me, room, g, stale } = await liveGame(ctx, code, line);
    if (stale) return;
    const err = writeLine(g, me._id, text, secret);
    if (err) throw new ConvexError(err);
    await commit(ctx, room, g);
  },
});

export const spot = mutation({
  args: { code: v.string(), line: v.number(), word: v.number() },
  handler: async (ctx, { code, line, word }) => {
    const { me, room, g, stale } = await liveGame(ctx, code, line);
    if (stale) return;
    const err = spotWord(g, me._id, word);
    if (err) throw new ConvexError(err);
    await commit(ctx, room, g);
  },
});

export const next = mutation({
  args: { code: v.string(), line: v.number() },
  handler: async (ctx, { code, line }) => {
    const { me, room, g, stale } = await liveGame(ctx, code, line);
    if (stale) return;
    carryOn(g, me._id, Math.random);
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
    const shelf = members.length === 2
      ? (await ctx.db.query("storyBooks").withIndex("by_key", (q) => q.eq("key", pairKey(members[0].id, members[1].id))).order("desc").take(SHELF)).map((b) => ({ id: b._id as string, at: b._creationTime, starter: b.starter, names: b.names, lines: b.lines }))
      : [];
    const base = {
      code: room.code,
      length: room.length,
      starter: room.starter ?? null,
      status: room.status,
      gameNo: room.gameNo,
      isHost: room.hostId === me._id,
      isMember: room.members.some((m) => m.playerId === me._id),
      meId: me._id as string,
      members,
      shelf,
    };
    if (room.status === "lobby" || !room.game) return { ...base, game: null };
    const g = room.game as StoryGame;
    const names: Record<string, string> = {};
    for (const p of g.players) names[p] = members.find((m) => m.id === p)?.name ?? (await ctx.db.get(p as Id<"players">))?.name ?? "Writer";
    const writer = g.done ? null : writerOf(g);
    const last = g.lines.at(-1);
    // A line's secret stays hidden from the reader until they've guessed.
    const lines = g.lines.map((l) => (l === last && g.phase === "spot" && l.by !== me._id ? { ...l, secret: "" } : l));
    return {
      ...base,
      game: {
        seq: g.seq,
        players: g.players,
        names,
        isPlayer: g.players.includes(me._id),
        starter: g.starter,
        total: g.total,
        lines,
        phase: g.phase,
        writer,
        reader: g.done ? null : readerOf(g),
        offers: writer === me._id && g.phase === "write" ? g.offers : [],
        twist: g.phase === "write" ? g.twists[String(g.lines.length)] ?? null : null,
        scores: g.scores,
        ready: g.ready,
        done: g.done ?? null,
      },
    };
  },
});
