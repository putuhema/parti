import { ConvexError, v } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";
import { authComponent } from "./auth";
import { addDays, dateKey, findPlayer, requirePlayer, TIERS, weekKey, weekly } from "./lib/helpers";

function cleanName(name: string) {
  const n = name.trim().replace(/\s+/g, " ").slice(0, 16);
  if (n.length < 1) throw new ConvexError("Pick a name");
  return n;
}

async function userId(ctx: { auth: { getUserIdentity: () => Promise<{ subject: string } | null> } }) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new ConvexError("Not signed in");
  return identity.subject;
}

export const create = mutation({
  args: { name: v.string() },
  handler: async (ctx, { name }) => {
    const uid = await userId(ctx);
    const existing = await findPlayer(ctx);
    if (existing) return existing._id;
    return await ctx.db.insert("players", {
      name: cleanName(name),
      userId: uid,
      tier: 0,
      weekKey: weekKey(Date.now()),
      weekXp: 0,
      weekPts: 0,
      streak: 0,
      wins: 0,
    });
  },
});

/**
 * Bring over a player from before accounts existed. Their phone still holds the
 * old secret token; the first time they open the app signed in, it attaches to them.
 */
export const claim = mutation({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const uid = await userId(ctx);
    if (await findPlayer(ctx)) return false;
    if (token.length < 20) return false;
    const old = await ctx.db.query("players").withIndex("by_token", (q) => q.eq("token", token)).unique();
    if (!old || old.userId) return false;
    await ctx.db.patch(old._id, { userId: uid, token: undefined });
    return true;
  },
});

/**
 * A guest just signed up or signed in. A new account takes the guest's player;
 * an account that already has one keeps its own, and the guest player is retired.
 */
export const relink = internalMutation({
  args: { from: v.string(), to: v.string() },
  handler: async (ctx, { from, to }) => {
    const byUser = (u: string) => ctx.db.query("players").withIndex("by_user", (q) => q.eq("userId", u)).unique();
    const guest = await byUser(from);
    const account = await byUser(to);
    if (!guest) return;
    if (!account) await ctx.db.patch(guest._id, { userId: to });
    else await ctx.db.patch(guest._id, { userId: undefined });
  },
});

/** The Sudoku coach's tricks, so a bad name can't fill the record. */
const TRICKS = new Set([
  "fullHouse", "hiddenSingle", "nakedSingle", "pointing", "boxLine", "nakedPair", "hiddenPair", "nakedTriple", "hiddenTriple",
  "xWing", "skyscraper", "kite", "emptyRectangle", "finnedXWing", "yWing", "xyzWing", "wWing", "swordfish", "coloring",
  "uniqueRectangle", "xChain", "xyChain", "bug",
]);

/** Record a coach lesson: tricks you found yourself after a nudge, or that Kubo had to show. */
export const recordTricks = mutation({
  args: { found: v.array(v.string()), shown: v.array(v.string()) },
  handler: async (ctx, { found, shown }) => {
    const p = await requirePlayer(ctx);
    const tricks = { ...(p.tricks ?? {}) };
    if (found.length + shown.length > 400) throw new ConvexError("Too many at once");
    for (const [list, key] of [[found, "found"], [shown, "shown"]] as const) {
      for (const t of list) {
        if (!TRICKS.has(t)) continue;
        const cur = tricks[t] ?? { found: 0, shown: 0 };
        tricks[t] = { ...cur, [key]: cur[key] + 1 };
      }
    }
    await ctx.db.patch(p._id, { tricks });
  },
});

export const rename = mutation({
  args: { name: v.string() },
  handler: async (ctx, { name }) => {
    const p = await requirePlayer(ctx);
    await ctx.db.patch(p._id, { name: cleanName(name) });
  },
});

export const me = query({
  args: {},
  handler: async (ctx) => {
    const p = await findPlayer(ctx);
    if (!p) return null;
    // If the account can't be read (e.g. an odd token), still show the player, as a guest.
    const user = await authComponent.safeGetAuthUser(ctx).catch(() => undefined);
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
      tricks: p.tricks ?? {},
      // A guest has no email to show; a saved account does.
      account: user && !user.isAnonymous ? { email: user.email } : null,
    };
  },
});
