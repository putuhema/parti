import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { addXp, befriend, dateKey, findPlayer, freeCode, requirePlayer } from "./lib/helpers";
import { MIN_LEN, ROUND_MS, SCRAMBLE_MAX, points, spell, type GridLang } from "./lib/scramble/board";
import { makeGrid } from "./lib/scramble/solve";
import { mulberry32, seedFromString } from "./lib/sudoku";
import { isWord } from "./lib/words/dict";

type PId = Id<"players">;
type Room = Doc<"gridRooms">;

/** Everything about one round of Scramble. Stored on the room. */
export interface GridGame {
  seq: number;
  lang: GridLang;
  grid: string[];
  words: string[]; // every word in the grid; only sent once the round is over
  players: PId[];
  found: Record<string, string[]>;
  scores: Record<string, number>;
  endsAt: number;
  deadline?: number;
  sched?: number;
  done?: { winners: PId[] };
}

const COUNTDOWN_MS = 3000;
const GRACE_MS = 1500; // a word sent right at the buzzer still counts
const lang = v.union(v.literal("en"), v.literal("id"));

// ---------- Shared rules ----------
/** Check a traced word. Returns it with its points, or throws a friendly reason. */
function judge(grid: string[], path: number[], gridLang: GridLang, known: string[], already: string[]) {
  const word = spell(grid, path);
  if (!word) throw new ConvexError("Letters must touch");
  if (word.length < MIN_LEN) throw new ConvexError(`At least ${MIN_LEN} letters`);
  const W = word.toUpperCase();
  if (already.includes(word)) throw new ConvexError(`You already have ${W}`);
  if (!known.includes(word) && !isWord(word, gridLang)) throw new ConvexError(`${W} isn't in our word list`);
  return { word, pts: points(word) };
}

const total = (found: string[]) => found.reduce((s, w) => s + points(w), 0);

// ---------- Room helpers ----------
async function roomByCode(ctx: QueryCtx, code: string) {
  return await ctx.db
    .query("gridRooms")
    .withIndex("by_code", (q) => q.eq("code", code.trim().toUpperCase()))
    .order("desc")
    .first();
}
async function requireRoom(ctx: QueryCtx, code: string) {
  const r = await roomByCode(ctx, code);
  if (!r) throw new ConvexError("Room not found");
  return r;
}

async function commit(ctx: MutationCtx, room: Room, g: GridGame) {
  g.seq += 1;
  const needs = g.deadline && g.deadline !== g.sched && !g.done;
  if (needs) g.sched = g.deadline;
  const patch: Partial<Room> = { game: g };
  if (g.done && room.status !== "finished") {
    patch.status = "finished";
    patch.endedAt = Date.now();
    const solo = g.players.length === 1;
    for (const p of g.players) {
      if (solo) await addXp(ctx, p, 10 + Math.min(30, Math.floor(g.scores[p] / 2)));
      else if (g.done.winners.includes(p)) await addXp(ctx, p, 30, { win: true });
      else await addXp(ctx, p, 10);
    }
  }
  await ctx.db.patch(room._id, patch);
  if (needs) {
    await ctx.scheduler.runAfter(Math.max(0, g.deadline! - Date.now()) + 80, internal.scramble.tick, { roomId: room._id, gameNo: room.gameNo, deadline: g.deadline! });
  }
}

function finish(g: GridGame) {
  const top = Math.max(...g.players.map((p) => g.scores[p] ?? 0));
  g.deadline = undefined;
  g.done = { winners: top > 0 ? g.players.filter((p) => g.scores[p] === top) : [] };
}

// ---------- Lobby ----------
export const create = mutation({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const me = await requirePlayer(ctx, token);
    const code = await freeCode(ctx);
    await ctx.db.insert("gridRooms", { code, hostId: me._id, lang: "en", status: "lobby", gameNo: 0, members: [{ playerId: me._id, seat: 0, lastSeen: Date.now() }] });
    return code;
  },
});

export const join = mutation({
  args: { token: v.string(), code: v.string() },
  handler: async (ctx, { token, code }) => {
    const me = await requirePlayer(ctx, token);
    const room = await roomByCode(ctx, code);
    if (!room) throw new ConvexError("No room with that code");
    if (room.members.some((m) => m.playerId === me._id)) return room.code;
    if (room.members.length >= SCRAMBLE_MAX) throw new ConvexError("This room is full");
    const taken = new Set(room.members.map((m) => m.seat));
    let seat = 0;
    while (taken.has(seat)) seat++;
    await ctx.db.patch(room._id, { members: [...room.members, { playerId: me._id, seat, lastSeen: Date.now() }] });
    return room.code;
  },
});

export const settings = mutation({
  args: { token: v.string(), code: v.string(), lang },
  handler: async (ctx, { token, code, lang }) => {
    const me = await requirePlayer(ctx, token);
    const room = await requireRoom(ctx, code);
    if (room.hostId !== me._id) throw new ConvexError("Only the host can change this");
    if (room.status === "playing") return;
    await ctx.db.patch(room._id, { lang });
  },
});

export const start = mutation({
  args: { token: v.string(), code: v.string() },
  handler: async (ctx, { token, code }) => {
    const me = await requirePlayer(ctx, token);
    const room = await requireRoom(ctx, code);
    if (room.hostId !== me._id) throw new ConvexError("Only the host can start");
    if (room.status === "playing") return;
    const players = [...room.members].sort((a, b) => a.seat - b.seat).map((m) => m.playerId);
    for (let i = 0; i < players.length; i++) for (let j = i + 1; j < players.length; j++) await befriend(ctx, players[i], players[j]);
    const now = Date.now();
    const { grid, words } = makeGrid(room.lang, Math.random);
    const endsAt = now + COUNTDOWN_MS + ROUND_MS;
    const g: GridGame = {
      seq: 0,
      lang: room.lang,
      grid,
      words,
      players,
      found: Object.fromEntries(players.map((p) => [p, []])),
      scores: Object.fromEntries(players.map((p) => [p, 0])),
      endsAt,
      deadline: endsAt + GRACE_MS,
    };
    const fresh = { ...room, gameNo: room.gameNo + 1, status: "playing" as const, startAt: now + COUNTDOWN_MS, endedAt: undefined };
    await ctx.db.patch(room._id, { gameNo: fresh.gameNo, status: "playing", startAt: fresh.startAt, endedAt: undefined });
    await commit(ctx, fresh, g);
  },
});

export const rematch = mutation({
  args: { token: v.string(), code: v.string() },
  handler: async (ctx, { token, code }) => {
    const me = await requirePlayer(ctx, token);
    const room = await requireRoom(ctx, code);
    if (room.hostId !== me._id) throw new ConvexError("Only the host can start a rematch");
    await ctx.db.patch(room._id, { status: "lobby", game: undefined, startAt: undefined, endedAt: undefined });
  },
});

export const leave = mutation({
  args: { token: v.string(), code: v.string() },
  handler: async (ctx, { token, code }) => {
    const me = await requirePlayer(ctx, token);
    const room = await roomByCode(ctx, code);
    if (!room || !room.members.some((m) => m.playerId === me._id)) return;
    const rest = room.members.filter((m) => m.playerId !== me._id);
    const patch: Partial<Room> = { members: rest };
    if (rest.length === 0) { patch.status = "finished"; patch.endedAt = Date.now(); }
    else if (room.hostId === me._id) patch.hostId = rest[0].playerId;
    await ctx.db.patch(room._id, patch);
    // Everyone plays their own words, so the round carries on; your words stay on the scoreboard.
  },
});

export const presence = mutation({
  args: { token: v.string(), code: v.string() },
  handler: async (ctx, { token, code }) => {
    const me = await findPlayer(ctx, token);
    const room = await roomByCode(ctx, code);
    if (!me || !room || !room.members.some((m) => m.playerId === me._id)) return;
    await ctx.db.patch(room._id, { members: room.members.map((m) => (m.playerId === me._id ? { ...m, lastSeen: Date.now() } : m)) });
  },
});

// ---------- Playing ----------
export const submit = mutation({
  args: { token: v.string(), code: v.string(), path: v.array(v.number()) },
  handler: async (ctx, { token, code, path }) => {
    const me = await requirePlayer(ctx, token);
    const room = await requireRoom(ctx, code);
    if (room.status !== "playing" || !room.game) throw new ConvexError("The round isn't running");
    const g = room.game as GridGame;
    if (g.done) throw new ConvexError("Time's up");
    if (!g.players.includes(me._id)) throw new ConvexError("You're watching this round");
    const now = Date.now();
    if (room.startAt && now < room.startAt - 200) throw new ConvexError("Wait for the countdown");
    if (now > g.endsAt + GRACE_MS) throw new ConvexError("Time's up");
    const r = judge(g.grid, path, g.lang, g.words, g.found[me._id]);
    g.found[me._id] = [...g.found[me._id], r.word];
    g.scores[me._id] += r.pts;
    await commit(ctx, room, g);
    return r;
  },
});

export const tick = internalMutation({
  args: { roomId: v.id("gridRooms"), gameNo: v.number(), deadline: v.number() },
  handler: async (ctx, { roomId, gameNo, deadline }) => {
    const room = await ctx.db.get(roomId);
    if (!room || room.status !== "playing" || room.gameNo !== gameNo || !room.game) return;
    const g = room.game as GridGame;
    if (g.done || g.deadline !== deadline) return;
    finish(g);
    await commit(ctx, room, g);
  },
});

export const view = query({
  args: { token: v.string(), code: v.string() },
  handler: async (ctx, { token, code }) => {
    const me = await findPlayer(ctx, token);
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
      lang: room.lang,
      status: room.status,
      gameNo: room.gameNo,
      startAt: room.startAt ?? null,
      isHost: room.hostId === me._id,
      isMember: room.members.some((m) => m.playerId === me._id),
      meId: me._id as string,
      members,
    };
    if (room.status === "lobby" || !room.game) return { ...base, game: null };
    const g = room.game as GridGame;
    const over = !!g.done;
    // During the round you only see your own words; everyone's show at the end.
    const found = Object.fromEntries(g.players.map((p) => [p, over || p === me._id ? g.found[p] : []]));
    const counts = Object.fromEntries(g.players.map((p) => [p, g.found[p].length]));
    const all = new Set(g.players.flatMap((p) => g.found[p]));
    return {
      ...base,
      game: {
        seq: g.seq,
        lang: g.lang,
        grid: g.grid,
        players: g.players as string[],
        isPlayer: g.players.includes(me._id),
        found,
        counts,
        scores: g.scores,
        endsAt: g.endsAt,
        total: g.words.length,
        missed: over ? g.words.filter((w) => !all.has(w)).slice(0, 40) : [],
        done: g.done ? { winners: g.done.winners as string[] } : null,
      },
    };
  },
});

// ---------- Daily grid ----------
const EPOCH = Date.UTC(2026, 0, 1);
const dayNumber = (date: string) => Math.floor((new Date(date + "T00:00:00Z").getTime() - EPOCH) / 86_400_000) + 1;

async function dailyFor(ctx: QueryCtx, date: string) {
  return await ctx.db.query("gridDailies").withIndex("by_date", (q) => q.eq("date", date)).unique();
}
async function runFor(ctx: QueryCtx, playerId: PId, date: string) {
  return await ctx.db.query("gridDailyRuns").withIndex("by_player_date", (q) => q.eq("playerId", playerId).eq("date", date)).unique();
}

/** Today's grid and your run. The grid stays hidden until you start; the word list until you finish. */
export const daily = query({
  args: { token: v.string(), date: v.string() },
  handler: async (ctx, { token, date }) => {
    const me = await findPlayer(ctx, token);
    if (!me) return null;
    const run = await runFor(ctx, me._id, date);
    const day = run ? await dailyFor(ctx, date) : null;
    const done = !!run?.awarded;
    const top = await ctx.db.query("gridDailyRuns").withIndex("by_date_score", (q) => q.eq("date", date)).order("desc").take(20);
    const board = await Promise.all(
      top.filter((r) => r.awarded).map(async (r) => ({ id: r.playerId as string, name: (await ctx.db.get(r.playerId))?.name ?? "Player", score: r.score, words: r.found.length, isMe: r.playerId === me._id })),
    );
    return {
      date,
      number: dayNumber(date),
      run: run ? { found: run.found, score: run.score, endsAt: run.endsAt, done } : null,
      grid: day?.grid ?? null,
      total: day?.words.length ?? null,
      missed: done && day ? day.words.filter((w) => !run!.found.includes(w)).slice(0, 40) : [],
      board,
    };
  },
});

export const dailyStart = mutation({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const me = await requirePlayer(ctx, token);
    const now = Date.now();
    const date = dateKey(now);
    if (!(await dailyFor(ctx, date))) {
      const { grid, words } = makeGrid("en", mulberry32(seedFromString("scramble:" + date)));
      await ctx.db.insert("gridDailies", { date, number: dayNumber(date), grid, words });
    }
    if (!(await runFor(ctx, me._id, date))) {
      await ctx.db.insert("gridDailyRuns", { date, playerId: me._id, found: [], score: 0, startedAt: now, endsAt: now + COUNTDOWN_MS + ROUND_MS });
    }
    return date;
  },
});

export const dailySubmit = mutation({
  args: { token: v.string(), date: v.string(), path: v.array(v.number()) },
  handler: async (ctx, { token, date, path }) => {
    const me = await requirePlayer(ctx, token);
    const run = await runFor(ctx, me._id, date);
    const day = await dailyFor(ctx, date);
    if (!run || !day) throw new ConvexError("Start today's grid first");
    const now = Date.now();
    if (run.awarded || now > run.endsAt + GRACE_MS) throw new ConvexError("Time's up");
    if (now < run.startedAt + COUNTDOWN_MS - 200) throw new ConvexError("Wait for the countdown");
    const r = judge(day.grid, path, "en", day.words, run.found);
    const found = [...run.found, r.word];
    await ctx.db.patch(run._id, { found, score: total(found) });
    return r;
  },
});

/** Close today's run once its time is up, and pay out XP. Safe to call more than once. */
export const dailyFinish = mutation({
  args: { token: v.string(), date: v.string() },
  handler: async (ctx, { token, date }) => {
    const me = await requirePlayer(ctx, token);
    const run = await runFor(ctx, me._id, date);
    if (!run || run.awarded) return;
    if (Date.now() < run.endsAt - 500) throw new ConvexError("Keep going, there's still time");
    await ctx.db.patch(run._id, { awarded: true });
    await addXp(ctx, me._id, 10 + Math.min(40, Math.floor(run.score / 2)));
  },
});
