import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { addDays, dateKey, findPlayer, TIERS, weekKey, weekly } from "./lib/helpers";

function cleanName(name: string) {
  const n = name.trim().replace(/\s+/g, " ").slice(0, 16);
  if (n.length < 1) throw new ConvexError("Pick a name");
  return n;
}

export const create = mutation({
  args: { token: v.string(), name: v.string() },
  handler: async (ctx, { token, name }) => {
    if (token.length < 20) throw new ConvexError("Bad token");
    const existing = await findPlayer(ctx, token);
    if (existing) return existing._id;
    return await ctx.db.insert("players", {
      name: cleanName(name),
      token,
      tier: 0,
      weekKey: weekKey(Date.now()),
      weekXp: 0,
      weekPts: 0,
      streak: 0,
      wins: 0,
    });
  },
});

export const rename = mutation({
  args: { token: v.string(), name: v.string() },
  handler: async (ctx, { token, name }) => {
    const p = await findPlayer(ctx, token);
    if (!p) throw new ConvexError("Player not found");
    await ctx.db.patch(p._id, { name: cleanName(name) });
  },
});

export const me = query({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const p = await findPlayer(ctx, token);
    if (!p) return null;
    const now = Date.now();
    const w = weekly(p, now);
    const today = dateKey(now);
    const alive = p.lastDailyDate === today || p.lastDailyDate === addDays(today, -1);
    return {
      _id: p._id,
      name: p.name,
      streak: alive ? p.streak : 0,
      lastDailyDate: p.lastDailyDate,
      wins: p.wins,
      tier: p.tier,
      tierName: TIERS[p.tier],
      weekXp: w.xp,
      chessLessons: p.chessLessons ?? {},
    };
  },
});
