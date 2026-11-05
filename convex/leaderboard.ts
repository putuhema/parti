import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { internalMutation, query } from "./_generated/server";
import { addDays, dateKey, findPlayer, friendIds, TIERS, weekKey, weekly } from "./lib/helpers";

type Row = { id: string; name: string; value: number; isMe: boolean };

export const get = query({
  args: {
    token: v.string(),
    period: v.union(v.literal("today"), v.literal("week"), v.literal("league")),
    scope: v.union(v.literal("friends"), v.literal("world")),
  },
  handler: async (ctx, { token, period, scope }) => {
    const me = await findPlayer(ctx, token);
    if (!me) return null;
    const now = Date.now();
    const date = dateKey(now);
    const wk = weekKey(now);
    let rows: Row[] = [];
    let myRank: number | null = null;
    let myValue: number | null = null;

    if (period === "league") {
      const list = await ctx.db
        .query("players")
        .withIndex("by_tier_week_xp", (q) => q.eq("tier", me.tier).eq("weekKey", wk))
        .order("desc")
        .take(30);
      rows = list.map((p) => ({ id: p._id, name: p.name, value: p.weekXp, isMe: p._id === me._id }));
      if (!rows.some((r) => r.isMe)) rows.push({ id: me._id, name: me.name, value: 0, isMe: true });
      return { kind: "xp" as const, rows, myRank: null, myValue: null, tierName: TIERS[me.tier], tier: me.tier, canPromote: me.tier < TIERS.length - 1, nextResetAt: new Date(addDays(wk, 7) + "T00:00:00Z").getTime() };
    }

    if (scope === "friends") {
      const ids = [me._id, ...(await friendIds(ctx, me._id))];
      for (const id of ids) {
        const p = id === me._id ? me : await ctx.db.get(id);
        if (!p) continue;
        if (period === "today") {
          const run = await ctx.db
            .query("dailyRuns")
            .withIndex("by_player_date", (q) => q.eq("playerId", id).eq("date", date))
            .unique();
          rows.push({ id, name: p.name, value: run?.timeMs ?? -1, isMe: id === me._id });
        } else {
          rows.push({ id, name: p.name, value: weekly(p, now).pts, isMe: id === me._id });
        }
      }
      if (period === "today") rows.sort((a, b) => (a.value < 0 ? 1e15 : a.value) - (b.value < 0 ? 1e15 : b.value));
      else rows.sort((a, b) => b.value - a.value);
      return { kind: period === "today" ? ("time" as const) : ("pts" as const), rows, myRank: null, myValue: null };
    }

    if (period === "today") {
      const runs = await ctx.db
        .query("dailyRuns")
        .withIndex("by_date_time", (q) => q.eq("date", date).gte("timeMs", 0))
        .take(50);
      rows = await Promise.all(
        runs.map(async (r) => ({ id: r.playerId, name: (await ctx.db.get(r.playerId))?.name ?? "Player", value: r.timeMs!, isMe: r.playerId === me._id })),
      );
      if (!rows.some((r) => r.isMe)) {
        const mine = await ctx.db
          .query("dailyRuns")
          .withIndex("by_player_date", (q) => q.eq("playerId", me._id).eq("date", date))
          .unique();
        if (mine?.timeMs !== undefined) {
          const ahead = await ctx.db
            .query("dailyRuns")
            .withIndex("by_date_time", (q) => q.eq("date", date).gte("timeMs", 0).lt("timeMs", mine.timeMs!))
            .collect();
          myRank = ahead.length + 1;
          myValue = mine.timeMs;
        }
      }
      return { kind: "time" as const, rows, myRank, myValue };
    }

    const top = await ctx.db
      .query("players")
      .withIndex("by_week_pts", (q) => q.eq("weekKey", wk).gt("weekPts", 0))
      .order("desc")
      .take(50);
    rows = top.map((p) => ({ id: p._id, name: p.name, value: p.weekPts, isMe: p._id === me._id }));
    const mine = weekly(me, now).pts;
    if (!rows.some((r) => r.isMe) && mine > 0) {
      const ahead = await ctx.db
        .query("players")
        .withIndex("by_week_pts", (q) => q.eq("weekKey", wk).gt("weekPts", mine))
        .collect();
      myRank = ahead.length + 1;
      myValue = mine;
    }
    return { kind: "pts" as const, rows, myRank, myValue };
  },
});

/** Runs every Monday: top 3 of each league move up, bottom 3 move down. */
export const rollLeagues = internalMutation({
  args: {},
  handler: async (ctx) => {
    const lastWeek = weekKey(Date.now() - 2 * 86_400_000);
    // Decide every move first so nobody gets promoted twice in one run.
    const moves: { id: Id<"players">; tier: number }[] = [];
    for (let tier = 0; tier < TIERS.length; tier++) {
      const ranked = await ctx.db
        .query("players")
        .withIndex("by_tier_week_xp", (q) => q.eq("tier", tier).eq("weekKey", lastWeek))
        .order("desc")
        .take(500);
      const active = ranked.filter((p) => p.weekXp > 0);
      if (tier < TIERS.length - 1) for (const p of active.slice(0, 3)) moves.push({ id: p._id, tier: tier + 1 });
      if (tier > 0 && active.length >= 6) for (const p of active.slice(-3)) moves.push({ id: p._id, tier: tier - 1 });
    }
    for (const m of moves) await ctx.db.patch(m.id, { tier: m.tier });
  },
});
