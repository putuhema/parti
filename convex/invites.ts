import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import { internalMutation, mutation, query } from "./_generated/server";
import { findPlayer, friendIds, requirePlayer } from "./lib/helpers";

/** Every game with rooms, its name, and where its rooms live. */
export const GAMES = {
  sudoku: { name: "Sudoku", path: "/room/" },
  chess: { name: "Chess", path: "/chess/room/" },
  words: { name: "Words", path: "/words/room/" },
  trivia: { name: "Quiz Loop", path: "/trivia/room/" },
  buzz: { name: "Buzz Board", path: "/buzz/room/" },
  faceoff: { name: "Face Off", path: "/faceoff/room/" },
  scramble: { name: "Scramble", path: "/scramble/room/" },
} as const;

export const gameKind = v.union(...(Object.keys(GAMES) as (keyof typeof GAMES)[]).map((k) => v.literal(k)));

/** Invites fade out after this long; the room has usually started by then. */
const TTL_MS = 30 * 60_000;

/** Your friends, and whether you've already invited each one to this room. */
export const friendsFor = query({
  args: { code: v.string() },
  handler: async (ctx, { code }) => {
    const me = await findPlayer(ctx);
    if (!me) return [];
    const ids = await friendIds(ctx, me._id);
    const rows = await Promise.all(
      ids.map(async (id) => {
        const p = await ctx.db.get(id);
        if (!p) return null;
        const sent = await ctx.db.query("invites").withIndex("by_from_to_code", (q) => q.eq("from", me._id).eq("to", id).eq("code", code)).first();
        return { id: id as string, name: p.name, invited: !!sent };
      }),
    );
    return rows.filter((r) => r !== null).sort((a, b) => a.name.localeCompare(b.name));
  },
});

export const send = mutation({
  args: { to: v.id("players"), kind: gameKind, code: v.string() },
  handler: async (ctx, { to, kind, code }) => {
    const me = await requirePlayer(ctx);
    const c = code.trim().toUpperCase();
    if (!/^[A-Z0-9]{4}$/.test(c)) throw new ConvexError("Bad room code");
    // Only friends can invite each other.
    const friend = await ctx.db.query("friendships").withIndex("by_pair", (q) => q.eq("a", me._id).eq("b", to)).unique();
    if (!friend) throw new ConvexError("You can only invite friends");
    // One live invite per friend per room: sending again just refreshes it.
    const old = await ctx.db.query("invites").withIndex("by_from_to_code", (q) => q.eq("from", me._id).eq("to", to).eq("code", c)).first();
    if (old) await ctx.db.delete(old._id);
    const g = GAMES[kind];
    const id = await ctx.db.insert("invites", { from: me._id, to, game: g.name, path: g.path + c, code: c });
    await ctx.scheduler.runAfter(TTL_MS, internal.invites.expire, { id });
  },
});

/** Invites waiting for you, newest first. */
export const mine = query({
  args: {},
  handler: async (ctx) => {
    const me = await findPlayer(ctx);
    if (!me) return [];
    const rows = await ctx.db.query("invites").withIndex("by_to", (q) => q.eq("to", me._id)).order("desc").take(20);
    return await Promise.all(
      rows.map(async (r) => ({ id: r._id, from: (await ctx.db.get(r.from))?.name ?? "A friend", fromId: r.from as string, game: r.game, path: r.path, code: r.code })),
    );
  },
});

export const dismiss = mutation({
  args: { id: v.id("invites") },
  handler: async (ctx, { id }) => {
    const me = await requirePlayer(ctx);
    const inv = await ctx.db.get(id);
    if (inv && inv.to === me._id) await ctx.db.delete(id);
  },
});

export const expire = internalMutation({
  args: { id: v.id("invites") },
  handler: async (ctx, { id }) => {
    if (await ctx.db.get(id)) await ctx.db.delete(id);
  },
});
