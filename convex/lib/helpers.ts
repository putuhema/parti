import { ConvexError } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

export const TIERS = ["Bronze", "Silver", "Gold", "Sapphire", "Diamond"];

/** UTC date key, e.g. "2026-11-05". */
export function dateKey(ms: number) {
  return new Date(ms).toISOString().slice(0, 10);
}

export function addDays(key: string, n: number) {
  const d = new Date(key + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return dateKey(d.getTime());
}

/** Monday (UTC) of the week containing `ms`. */
export function weekKey(ms: number) {
  const d = new Date(dateKey(ms) + "T00:00:00Z");
  const day = (d.getUTCDay() + 6) % 7; // Monday = 0
  d.setUTCDate(d.getUTCDate() - day);
  return dateKey(d.getTime());
}

export async function findPlayer(ctx: QueryCtx, token: string) {
  return await ctx.db
    .query("players")
    .withIndex("by_token", (q) => q.eq("token", token))
    .unique();
}

export async function requirePlayer(ctx: QueryCtx, token: string) {
  const p = await findPlayer(ctx, token);
  if (!p) throw new ConvexError("Player not found");
  return p;
}

/** Weekly numbers only count for the current week. */
export function weekly(p: Doc<"players">, now: number) {
  const current = p.weekKey === weekKey(now);
  return { xp: current ? p.weekXp : 0, pts: current ? p.weekPts : 0 };
}

export async function addXp(
  ctx: MutationCtx,
  playerId: Id<"players">,
  xp: number,
  extra: Partial<{ pts: number; win: boolean }> = {},
) {
  const p = await ctx.db.get(playerId);
  if (!p) return;
  const now = Date.now();
  const wk = weekKey(now);
  const fresh = p.weekKey !== wk;
  await ctx.db.patch(playerId, {
    weekKey: wk,
    weekXp: (fresh ? 0 : p.weekXp) + xp,
    weekPts: (fresh ? 0 : p.weekPts) + (extra.pts ?? 0),
    wins: p.wins + (extra.win ? 1 : 0),
  });
}

export async function befriend(ctx: MutationCtx, a: Id<"players">, b: Id<"players">) {
  if (a === b) return;
  for (const [x, y] of [
    [a, b],
    [b, a],
  ] as const) {
    const existing = await ctx.db
      .query("friendships")
      .withIndex("by_pair", (q) => q.eq("a", x).eq("b", y))
      .unique();
    if (!existing) await ctx.db.insert("friendships", { a: x, b: y });
  }
}

export async function friendIds(ctx: QueryCtx, playerId: Id<"players">) {
  const rows = await ctx.db
    .query("friendships")
    .withIndex("by_a", (q) => q.eq("a", playerId))
    .take(200);
  return rows.map((r) => r.b);
}

const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/** A 4-character room code not used by any open Sudoku or chess room. */
export async function freeCode(ctx: QueryCtx) {
  let code = "";
  for (let tries = 0; tries < 30; tries++) {
    code = Array.from({ length: 4 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join("");
    const a = await ctx.db.query("rooms").withIndex("by_code", (q) => q.eq("code", code)).first();
    const b = await ctx.db.query("chessRooms").withIndex("by_code", (q) => q.eq("code", code)).first();
    const c = await ctx.db.query("wordRooms").withIndex("by_code", (q) => q.eq("code", code)).first();
    const d = await ctx.db.query("triviaRooms").withIndex("by_code", (q) => q.eq("code", code)).first();
    const e = await ctx.db.query("buzzRooms").withIndex("by_code", (q) => q.eq("code", code)).first();
    if ([a, b, c, d, e].every((r) => !r || r.status === "finished")) break;
  }
  return code;
}
