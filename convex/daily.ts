import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { addDays, addXp, dateKey, findPlayer, friendIds, requirePlayer, weekKey } from "./lib/helpers";
import { completedGroups, generatePuzzle, mulberry32, seedFromString, setAt, type Difficulty } from "./lib/sudoku";

export const MISTAKE_PENALTY_MS = 5000;
const EPOCH = Date.UTC(2026, 0, 1);
// Monday is gentle, the weekend is spicy.
const BY_WEEKDAY: Difficulty[] = ["hard", "easy", "medium", "medium", "hard", "hard", "expert"]; // Sun..Sat

function info(now: number) {
  const date = dateKey(now);
  const d = new Date(date + "T00:00:00Z");
  return {
    date,
    number: Math.floor((d.getTime() - EPOCH) / 86_400_000) + 1,
    difficulty: BY_WEEKDAY[d.getUTCDay()],
    nextAt: d.getTime() + 86_400_000,
  };
}

export function duelPoints(timeMs: number) {
  return 100 + Math.max(0, 900 - Math.floor(timeMs / 2000));
}

async function runFor(ctx: QueryCtx, playerId: Id<"players">, date: string) {
  return await ctx.db
    .query("dailyRuns")
    .withIndex("by_player_date", (q) => q.eq("playerId", playerId).eq("date", date))
    .unique();
}

async function puzzleFor(ctx: QueryCtx, date: string) {
  return await ctx.db
    .query("dailyPuzzles")
    .withIndex("by_date", (q) => q.eq("date", date))
    .unique();
}

async function ensurePuzzle(ctx: MutationCtx, now: number) {
  const i = info(now);
  const existing = await puzzleFor(ctx, i.date);
  if (existing) return existing;
  const { puzzle, solution } = generatePuzzle(i.difficulty, mulberry32(seedFromString("sudoku-party:" + i.date)));
  const id = await ctx.db.insert("dailyPuzzles", { date: i.date, number: i.number, difficulty: i.difficulty, puzzle, solution });
  return (await ctx.db.get(id))!;
}

async function worldRank(ctx: QueryCtx, date: string, timeMs: number) {
  const ahead = await ctx.db
    .query("dailyRuns")
    .withIndex("by_date_time", (q) => q.eq("date", date).gte("timeMs", 0).lt("timeMs", timeMs))
    .collect();
  return ahead.length + 1;
}

async function finishedCount(ctx: QueryCtx, date: string) {
  const all = await ctx.db
    .query("dailyRuns")
    .withIndex("by_date_time", (q) => q.eq("date", date).gte("timeMs", 0))
    .collect();
  return all.length;
}

function publicRun(run: Doc<"dailyRuns"> | null) {
  if (!run) return null;
  return {
    values: run.values,
    mistakes: run.mistakes,
    startedAt: run.startedAt,
    finishedAt: run.finishedAt,
    timeMs: run.timeMs,
    boxOrder: run.boxOrder ?? [],
  };
}

export const today = query({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const me = await findPlayer(ctx, token);
    if (!me) return null;
    const now = Date.now();
    const i = info(now);
    const mine = await runFor(ctx, me._id, i.date);
    const puzzle = mine ? await puzzleFor(ctx, i.date) : null;

    const fids = await friendIds(ctx, me._id);
    const friends = await Promise.all(
      fids.map(async (id) => {
        const p = await ctx.db.get(id);
        const run = await runFor(ctx, id, i.date);
        return { id, name: p?.name ?? "Friend", timeMs: run?.timeMs, playing: !!run && !run.timeMs };
      }),
    );
    friends.sort((a, b) => (a.timeMs ?? 1e15) - (b.timeMs ?? 1e15));

    const monday = weekKey(now);
    const week = await Promise.all(
      Array.from({ length: 7 }, async (_, k) => {
        const date = addDays(monday, k);
        const run = await runFor(ctx, me._id, date);
        return { date, done: !!run?.timeMs, today: date === i.date, future: date > i.date };
      }),
    );

    let rank = null as null | { friends: number; friendsTotal: number; world: number; worldTotal: number };
    if (mine?.timeMs) {
      const played = friends.filter((f) => f.timeMs !== undefined);
      rank = {
        friends: played.filter((f) => f.timeMs! < mine.timeMs!).length + 1,
        friendsTotal: played.length + 1,
        world: await worldRank(ctx, i.date, mine.timeMs),
        worldTotal: await finishedCount(ctx, i.date),
      };
    }
    const alive = me.lastDailyDate === i.date || me.lastDailyDate === addDays(i.date, -1);

    return {
      ...i,
      puzzle: puzzle?.puzzle,
      run: publicRun(mine),
      friends,
      week,
      rank,
      streak: alive ? me.streak : 0,
      penaltyMs: MISTAKE_PENALTY_MS,
    };
  },
});

export const start = mutation({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const me = await requirePlayer(ctx, token);
    const now = Date.now();
    const p = await ensurePuzzle(ctx, now);
    const existing = await runFor(ctx, me._id, p.date);
    if (existing) return;
    await ctx.db.insert("dailyRuns", {
      date: p.date, playerId: me._id, values: p.puzzle, mistakes: 0, startedAt: now, boxOrder: [],
    });
  },
});

export const place = mutation({
  args: { token: v.string(), cell: v.number(), digit: v.number() },
  handler: async (ctx, { token, cell, digit }) => {
    const me = await requirePlayer(ctx, token);
    const now = Date.now();
    const date = info(now).date;
    // A run started just before midnight belongs to yesterday's puzzle.
    const run = (await runFor(ctx, me._id, date)) ?? (await runFor(ctx, me._id, addDays(date, -1)));
    if (!run || run.timeMs !== undefined) throw new ConvexError("No duel in progress");
    const p = await puzzleFor(ctx, run.date);
    if (!p) throw new ConvexError("Puzzle missing");
    if (cell < 0 || cell > 80 || digit < 1 || digit > 9) throw new ConvexError("Bad move");
    if (p.puzzle[cell] !== "0" || run.values[cell] === p.solution[cell]) {
      return { correct: true, row: false, col: false, box: false, finished: false };
    }
    if (p.solution[cell] !== String(digit)) {
      await ctx.db.patch(run._id, { mistakes: run.mistakes + 1 });
      return { correct: false, row: false, col: false, box: false, finished: false };
    }
    const values = setAt(run.values, cell, String(digit));
    const groups = completedGroups(values, p.solution, cell);
    const boxIndex = Math.floor(Math.floor(cell / 9) / 3) * 3 + Math.floor((cell % 9) / 3);
    const boxOrder = groups.box ? [...(run.boxOrder ?? []), boxIndex] : run.boxOrder;
    const finished = values === p.solution;
    if (!finished) {
      await ctx.db.patch(run._id, { values, boxOrder });
      return { correct: true, ...groups, finished };
    }
    const timeMs = now - run.startedAt + run.mistakes * MISTAKE_PENALTY_MS;
    await ctx.db.patch(run._id, { values, boxOrder, finishedAt: now, timeMs });
    const fresh = (await ctx.db.get(me._id))!;
    const streak =
      fresh.lastDailyDate === run.date ? fresh.streak
        : fresh.lastDailyDate === addDays(run.date, -1) ? fresh.streak + 1
          : 1;
    await ctx.db.patch(me._id, { streak, lastDailyDate: run.date });
    await addXp(ctx, me._id, 20, { pts: duelPoints(timeMs) });
    return { correct: true, ...groups, finished };
  },
});
