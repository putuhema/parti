import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { addXp, befriend, findPlayer, freeCode, requirePlayer } from "./lib/helpers";
import { CATEGORIES, type CategoryId } from "./lib/emoji/content";
import { ROUND_CHOICES, choose, editClue, finishRound, giverOf, guesserOf, letterHint, makeGuess, maxScore, newGame, nextRound, type EmojiGame } from "./lib/emoji/rules";

type Room = Doc<"emojiRooms">;
const MAX = 2;

async function roomByCode(ctx: QueryCtx, code: string) {
  return await ctx.db
    .query("emojiRooms")
    .withIndex("by_code", (q) => q.eq("code", code.trim().toUpperCase()))
    .order("desc")
    .first();
}
async function requireRoom(ctx: QueryCtx, code: string) {
  const r = await roomByCode(ctx, code);
  if (!r) throw new ConvexError("Room not found");
  return r;
}
const bestKey = (a: string, b: string, rounds: number) => `${[a, b].sort().join("|")}|${rounds}`;
async function bestOf(ctx: QueryCtx, key: string) {
  return await ctx.db.query("emojiBests").withIndex("by_key", (q) => q.eq("key", key)).unique();
}

/** Save the game; schedule the round timer; at the end, update the pair's best. */
async function commit(ctx: MutationCtx, room: Room, g: EmojiGame) {
  g.seq += 1;
  const needs = g.deadline && g.deadline !== g.sched && !g.done;
  if (needs) g.sched = g.deadline;
  const patch: Partial<Room> = { game: g };
  if (g.done && room.status !== "finished") {
    patch.status = "finished";
    patch.endedAt = Date.now();
    if (g.done.reason === "end") {
      const key = bestKey(g.players[0], g.players[1], g.rounds);
      const row = await bestOf(ctx, key);
      if (row) await ctx.db.patch(row._id, { best: Math.max(row.best, g.score), games: row.games + 1 });
      else await ctx.db.insert("emojiBests", { key, best: g.score, games: 1 });
      const xp = 10 + Math.round((20 * g.score) / Math.max(1, maxScore(g)));
      for (const p of g.players) await addXp(ctx, p as Id<"players">, xp);
    }
  }
  await ctx.db.patch(room._id, patch);
  if (needs) await ctx.scheduler.runAfter(Math.max(0, g.deadline! - Date.now()) + 80, internal.emoji.tick, { roomId: room._id, gameNo: room.gameNo, deadline: g.deadline! });
}

// ---------- Lobby ----------
export const create = mutation({
  args: {},
  handler: async (ctx) => {
    const me = await requirePlayer(ctx);
    const code = await freeCode(ctx);
    await ctx.db.insert("emojiRooms", { code, hostId: me._id, categories: [], rounds: ROUND_CHOICES[1], status: "lobby", gameNo: 0, members: [{ playerId: me._id, seat: 0, lastSeen: Date.now() }] });
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
  args: { code: v.string(), categories: v.array(v.string()), rounds: v.number() },
  handler: async (ctx, { code, categories, rounds }) => {
    const me = await requirePlayer(ctx);
    const room = await requireRoom(ctx, code);
    if (room.hostId !== me._id) throw new ConvexError("Only the host can change this");
    if (room.status === "playing") return;
    if (!(ROUND_CHOICES as readonly number[]).includes(rounds)) throw new ConvexError("Pick one of the lengths");
    await ctx.db.patch(room._id, { categories: CATEGORIES.map((c) => c.id).filter((id) => categories.includes(id)), rounds });
  },
});

export const start = mutation({
  args: { code: v.string() },
  handler: async (ctx, { code }) => {
    const me = await requirePlayer(ctx);
    const room = await requireRoom(ctx, code);
    if (room.hostId !== me._id) throw new ConvexError("Only the host can start");
    if (room.status === "playing") return;
    if (room.members.length !== 2) throw new ConvexError("Emoji Charades is for two. Invite someone first!");
    const [a, b] = [...room.members].sort((x, y) => x.seat - y.seat).map((m) => m.playerId as string);
    await befriend(ctx, a as Id<"players">, b as Id<"players">);
    // Take turns giving the first clue, game to game.
    const players: [string, string] = room.gameNo % 2 ? [b, a] : [a, b];
    const g = newGame(players, room.categories as CategoryId[], room.rounds, Math.random);
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
    const rest = room.members.filter((m) => m.playerId !== me._id).map((m) => ({ ...m, seat: 0 }));
    const patch: Partial<Room> = { members: rest };
    if (rest.length === 0) { patch.status = "finished"; patch.endedAt = Date.now(); }
    else if (room.hostId === me._id) patch.hostId = rest[0].playerId;
    await ctx.db.patch(room._id, patch);
    const g = room.game as EmojiGame | undefined;
    if (room.status !== "playing" || !g || g.done || !g.players.includes(me._id)) return;
    g.done = { reason: "left" };
    g.deadline = undefined;
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
    round: v.number(),
    move: v.union(
      v.object({ kind: v.literal("choose"), i: v.number() }),
      v.object({ kind: v.literal("add"), emoji: v.string() }),
      v.object({ kind: v.literal("back") }),
      v.object({ kind: v.literal("clear") }),
      v.object({ kind: v.literal("guess"), text: v.string() }),
      v.object({ kind: v.literal("pass") }),
      v.object({ kind: v.literal("next") }),
    ),
  },
  handler: async (ctx, { code, round, move }) => {
    const me = await requirePlayer(ctx);
    const room = await requireRoom(ctx, code);
    if (room.status !== "playing" || !room.game) throw new ConvexError("The game isn't running");
    const g = room.game as EmojiGame;
    if (g.done) throw new ConvexError("The game is over");
    if (!g.players.includes(me._id)) throw new ConvexError("You're watching this game");
    if (g.round !== round) return null; // a tap from an earlier round
    const now = Date.now();
    let err: string | null = null;
    let verdict: string | null = null;
    switch (move.kind) {
      case "choose": err = choose(g, me._id, move.i, now); break;
      case "add": err = editClue(g, me._id, { add: move.emoji }); break;
      case "back": err = editClue(g, me._id, { back: true }); break;
      case "clear": err = editClue(g, me._id, { clear: true }); break;
      case "guess": {
        const r = makeGuess(g, me._id, move.text, now);
        if (r === "right" || r === "close" || r === "wrong") verdict = r; else err = r;
        break;
      }
      case "pass":
        if (g.phase !== "clue") err = "Not now";
        else finishRound(g, false, now);
        break;
      case "next": nextRound(g, me._id, Math.random); break;
    }
    if (err) throw new ConvexError(err);
    await commit(ctx, room, g);
    return verdict;
  },
});

/** Time's up for the round. */
export const tick = internalMutation({
  args: { roomId: v.id("emojiRooms"), gameNo: v.number(), deadline: v.number() },
  handler: async (ctx, { roomId, gameNo, deadline }) => {
    const room = await ctx.db.get(roomId);
    if (!room || room.status !== "playing" || room.gameNo !== gameNo || !room.game) return;
    const g = room.game as EmojiGame;
    if (g.done || g.deadline !== deadline || g.phase !== "clue") return;
    finishRound(g, false, Date.now());
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
    const best = members.length === 2 ? await bestOf(ctx, bestKey(members[0].id, members[1].id, room.rounds)) : null;
    const base = {
      code: room.code,
      categories: room.categories,
      rounds: room.rounds,
      status: room.status,
      gameNo: room.gameNo,
      isHost: room.hostId === me._id,
      isMember: room.members.some((m) => m.playerId === me._id),
      meId: me._id as string,
      members,
      best: best ? { best: best.best, games: best.games } : null,
    };
    if (room.status === "lobby" || !room.game) return { ...base, game: null };
    const g = room.game as EmojiGame;
    const names: Record<string, string> = {};
    for (const p of g.players) names[p] = members.find((m) => m.id === p)?.name ?? (await ctx.db.get(p as Id<"players">))?.name ?? "Player";
    const giver = g.done ? null : giverOf(g);
    const giving = giver === me._id;
    const revealed = g.phase === "reveal" || !!g.done;
    return {
      ...base,
      game: {
        seq: g.seq,
        players: g.players,
        names,
        isPlayer: g.players.includes(me._id),
        round: g.round,
        rounds: g.rounds,
        phase: g.phase,
        giver,
        guesser: g.done ? null : guesserOf(g),
        // Only the clue-giver sees the choices and the answer while the round is on.
        choices: giving && g.phase === "pick" ? g.choices : [],
        answer: g.answer && (giving || revealed) ? g.answer : null,
        category: g.answer?.category ?? null,
        hint: g.answer && !giving && !revealed ? letterHint(g.answer.text) : null,
        words: g.answer ? g.answer.text.split(/\s+/).length : 0,
        clue: g.clue,
        guesses: g.guesses,
        startedAt: g.startedAt,
        deadline: g.deadline ?? null,
        ready: g.ready,
        score: g.score,
        max: maxScore(g),
        results: g.results,
        done: g.done ?? null,
      },
    };
  },
});
