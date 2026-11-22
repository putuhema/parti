import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { addXp, befriend, findPlayer, freeCode, requirePlayer } from "./lib/helpers";
import { ROUND_CHOICES, THEMES, ask as askStory, guess as guessLie, newGame, next as nextRound, partnerOf, stats, truthsOf, write as writeItems, type ThemeId, type TruthGame } from "./lib/truth/rules";

type Room = Doc<"truthRooms">;
const MAX = 2;
const VAULT_SHOWN = 200;

async function roomByCode(ctx: QueryCtx, code: string) {
  return await ctx.db
    .query("truthRooms")
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

async function commit(ctx: MutationCtx, room: Room, g: TruthGame) {
  g.seq += 1;
  const patch: Partial<Room> = { game: g };
  if (g.done && room.status !== "finished") {
    patch.status = "finished";
    patch.endedAt = Date.now();
    if (g.done.reason === "end") {
      const best = Math.max(...g.players.map((p) => g.scores[p]));
      for (const p of g.players) await addXp(ctx, p as Id<"players">, g.scores[p] === best ? 25 : 15, { win: g.scores[p] === best });
    }
  }
  await ctx.db.patch(room._id, patch);
}

// ---------- Lobby ----------
export const create = mutation({
  args: {},
  handler: async (ctx) => {
    const me = await requirePlayer(ctx);
    const code = await freeCode(ctx);
    await ctx.db.insert("truthRooms", { code, hostId: me._id, themes: [], rounds: ROUND_CHOICES[1], status: "lobby", gameNo: 0, members: [{ playerId: me._id, seat: 0, lastSeen: Date.now() }] });
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
  args: { code: v.string(), themes: v.array(v.string()), rounds: v.number() },
  handler: async (ctx, { code, themes, rounds }) => {
    const me = await requirePlayer(ctx);
    const room = await requireRoom(ctx, code);
    if (room.hostId !== me._id) throw new ConvexError("Only the host can change this");
    if (room.status === "playing") return;
    if (!(ROUND_CHOICES as readonly number[]).includes(rounds)) throw new ConvexError("Pick one of the lengths");
    await ctx.db.patch(room._id, { themes: THEMES.map((t) => t.id).filter((id) => themes.includes(id)), rounds });
  },
});

export const start = mutation({
  args: { code: v.string() },
  handler: async (ctx, { code }) => {
    const me = await requirePlayer(ctx);
    const room = await requireRoom(ctx, code);
    if (room.hostId !== me._id) throw new ConvexError("Only the host can start");
    if (room.status === "playing") return;
    if (room.members.length !== 2) throw new ConvexError("Truth or Tale is for two. Invite someone first!");
    const [a, b] = [...room.members].sort((x, y) => x.seat - y.seat).map((m) => m.playerId);
    await befriend(ctx, a, b);
    const g = newGame([a, b], room.themes as ThemeId[], room.rounds, Math.random);
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
    const g = room.game as TruthGame | undefined;
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
export const act = mutation({
  args: {
    code: v.string(),
    round: v.number(),
    move: v.union(
      v.object({ kind: v.literal("write"), items: v.array(v.string()), lie: v.number() }),
      v.object({ kind: v.literal("guess"), pick: v.number(), bet: v.number() }),
      v.object({ kind: v.literal("ask"), item: v.number() }),
      v.object({ kind: v.literal("next") }),
    ),
  },
  handler: async (ctx, { code, round, move }) => {
    const me = await requirePlayer(ctx);
    const room = await requireRoom(ctx, code);
    if (room.status !== "playing" || !room.game) throw new ConvexError("The game isn't running");
    const g = room.game as TruthGame;
    if (g.done) throw new ConvexError("The game is over");
    if (!g.players.includes(me._id)) throw new ConvexError("You're watching this game");
    if (g.round !== round) return; // a tap from an earlier round
    let err: string | null = null;
    if (move.kind === "write") err = writeItems(g, me._id, move.items, move.lie, Math.random);
    else if (move.kind === "guess") {
      // The guess arrives as a position in the shuffled list the guesser saw.
      const shown = g.entries[partnerOf(g, me._id)]?.order;
      err = guessLie(g, me._id, shown ? shown[move.pick] ?? -1 : -1, move.bet);
      if (!err && g.phase === "reveal") {
        // Both guessed: the truths are out. Keep them in the pair's Vault.
        const key = pairKey(g.players[0], g.players[1]);
        for (const t of truthsOf(g.results.at(-1)!)) await ctx.db.insert("truthVault", { key, owner: t.owner as Id<"players">, text: t.text, theme: t.theme });
      }
    } else if (move.kind === "ask") err = askStory(g, me._id, move.item);
    else nextRound(g, me._id);
    if (err) throw new ConvexError(err);
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
    const vault = members.length === 2
      ? (await ctx.db.query("truthVault").withIndex("by_key", (q) => q.eq("key", pairKey(members[0].id, members[1].id))).order("desc").take(VAULT_SHOWN)).map((t) => ({ id: t._id as string, owner: t.owner as string, text: t.text, theme: t.theme, at: t._creationTime }))
      : [];
    const base = {
      code: room.code,
      themes: room.themes,
      rounds: room.rounds,
      status: room.status,
      gameNo: room.gameNo,
      isHost: room.hostId === me._id,
      isMember: room.members.some((m) => m.playerId === me._id),
      meId: me._id as string,
      members,
      vault,
    };
    if (room.status === "lobby" || !room.game) return { ...base, game: null };
    const g = room.game as TruthGame;
    const names: Record<string, string> = {};
    for (const p of g.players) names[p] = members.find((m) => m.id === p)?.name ?? (await ctx.db.get(p as Id<"players">))?.name ?? "Player";
    const isPlayer = g.players.includes(me._id);
    const partner = isPlayer ? partnerOf(g, me._id) : g.players[1];
    const theirs = g.entries[partner];
    return {
      ...base,
      game: {
        seq: g.seq,
        players: g.players,
        names,
        isPlayer,
        partner,
        round: g.round,
        rounds: g.themes.length,
        theme: g.themes[g.round] ?? null,
        phase: g.phase,
        mine: g.entries[me._id] ?? null,
        partnerWrote: !!theirs,
        // While guessing you see your partner's three in a shuffled order, never which one is the lie.
        theirs: g.phase === "guess" && theirs ? theirs.order.map((i) => theirs.items[i]) : null,
        myGuess: g.guesses[me._id] ? { ...g.guesses[me._id], shown: theirs ? theirs.order.indexOf(g.guesses[me._id].pick) : -1 } : null,
        partnerGuessed: !!g.guesses[partner],
        asks: g.phase === "reveal" ? g.asks : {},
        ready: g.ready,
        scores: g.scores,
        results: g.phase === "reveal" || g.done ? g.results : g.results.filter((r) => r.round < g.round),
        stats: stats(g),
        done: g.done ?? null,
      },
    };
  },
});
