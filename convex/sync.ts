import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { addXp, befriend, findPlayer, freeCode, requirePlayer } from "./lib/helpers";
import { DECKS, type DeckId } from "./lib/sync/deck";
import {
  LENGTHS, knowsPercent, memoriesFrom, needs, newGame, partnerOf, questionOf, react as addReaction, ready, submit, syncPercent, writeQuestion,
  type Memory, type SyncGame,
} from "./lib/sync/rules";

type Room = Doc<"syncRooms">;
const MAX = 2;
const SEEN_CAP = 300;
const MEMORY_CAP = 60;

const deckV = v.union(v.literal("light"), v.literal("dreams"), v.literal("deep"), v.literal("flirty"));
const valueV = v.union(v.number(), v.array(v.number()), v.string());

// ---------- Helpers ----------
async function roomByCode(ctx: QueryCtx, code: string) {
  return await ctx.db
    .query("syncRooms")
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
async function pairOf(ctx: QueryCtx, a: string, b: string) {
  return await ctx.db.query("syncPairs").withIndex("by_key", (q) => q.eq("key", pairKey(a, b))).unique();
}

/** Save the game; when it ends, award XP and remember it for the pair. */
async function commit(ctx: MutationCtx, room: Room, g: SyncGame) {
  g.seq += 1;
  const patch: Partial<Room> = { game: g };
  if (g.done && room.status !== "finished") {
    patch.status = "finished";
    patch.endedAt = Date.now();
    if (g.done.reason === "end") await finishGame(ctx, g);
  }
  await ctx.db.patch(room._id, patch);
}

async function finishGame(ctx: MutationCtx, g: SyncGame) {
  const sync = syncPercent(g.results);
  for (const p of g.players) await addXp(ctx, p as Id<"players">, 15 + Math.round(sync / 5));
  const [a, b] = g.players;
  const pair = await pairOf(ctx, a, b);
  const now = Date.now();
  const asked = g.results.map((r) => r.card.qid).filter((x): x is string => !!x);
  const fresh = memoriesFrom(g.results, now);
  const old = (pair?.memories ?? []).filter((m) => !fresh.some((f) => f.qid === m.qid));
  const next = {
    games: (pair?.games ?? 0) + 1,
    bestSync: Math.max(pair?.bestSync ?? 0, sync),
    lastSync: sync,
    seen: [...(pair?.seen ?? []).filter((id) => !asked.includes(id)), ...asked].slice(-SEEN_CAP),
    memories: [...fresh, ...old].slice(0, MEMORY_CAP),
  };
  if (pair) await ctx.db.patch(pair._id, next);
  else await ctx.db.insert("syncPairs", { key: pairKey(a, b), ...next });
}

// ---------- Lobby ----------
export const create = mutation({
  args: {},
  handler: async (ctx) => {
    const me = await requirePlayer(ctx);
    const code = await freeCode(ctx);
    await ctx.db.insert("syncRooms", { code, hostId: me._id, decks: ["light", "dreams", "flirty"], length: 12, own: true, status: "lobby", gameNo: 0, members: [{ playerId: me._id, seat: 0, lastSeen: Date.now() }] });
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
  args: { code: v.string(), decks: v.array(deckV), length: v.number(), own: v.boolean() },
  handler: async (ctx, { code, decks, length, own }) => {
    const me = await requirePlayer(ctx);
    const room = await requireRoom(ctx, code);
    if (room.hostId !== me._id) throw new ConvexError("Only the host can change this");
    if (room.status === "playing") return;
    const clean = DECKS.map((d) => d.id).filter((id) => decks.includes(id));
    if (!clean.length) throw new ConvexError("Pick at least one deck");
    if (!(LENGTHS as readonly number[]).includes(length)) throw new ConvexError("Pick one of the game lengths");
    await ctx.db.patch(room._id, { decks: clean, length, own });
  },
});

export const start = mutation({
  args: { code: v.string() },
  handler: async (ctx, { code }) => {
    const me = await requirePlayer(ctx);
    const room = await requireRoom(ctx, code);
    if (room.hostId !== me._id) throw new ConvexError("Only the host can start");
    if (room.status === "playing") return;
    if (room.members.length !== 2) throw new ConvexError("In Sync is for two. Invite your person first!");
    const [a, b] = [...room.members].sort((x, y) => x.seat - y.seat).map((m) => m.playerId);
    await befriend(ctx, a, b);
    const pair = await pairOf(ctx, a, b);
    // Take turns asking the first own question, game to game.
    const players: [string, string] = room.gameNo % 2 ? [b, a] : [a, b];
    const g = newGame(players, room.decks as DeckId[], room.length, room.own, pair?.seen ?? [], (pair?.memories ?? []) as Memory[], Math.random);
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
    const rest = room.members.filter((m) => m.playerId !== me._id);
    const patch: Partial<Room> = { members: rest };
    if (rest.length === 0) { patch.status = "finished"; patch.endedAt = Date.now(); }
    else if (room.hostId === me._id) patch.hostId = rest[0].playerId;
    await ctx.db.patch(room._id, patch);
    const g = room.game as SyncGame | undefined;
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
async function liveGame(ctx: MutationCtx, code: string, card: number) {
  const me = await requirePlayer(ctx);
  const room = await requireRoom(ctx, code);
  if (room.status !== "playing" || !room.game) throw new ConvexError("The game isn't running");
  const g = room.game as SyncGame;
  if (g.done) throw new ConvexError("The game is over");
  if (!g.players.includes(me._id)) throw new ConvexError("You're not playing this game");
  // A tap from a card that's already gone: ignore it.
  const stale = g.i !== card;
  return { me, room, g, stale };
}

export const answer = mutation({
  args: { code: v.string(), card: v.number(), me: v.optional(valueV), guess: v.optional(valueV) },
  handler: async (ctx, { code, card, me: mine, guess }) => {
    const { me, room, g, stale } = await liveGame(ctx, code, card);
    if (stale) return;
    const err = submit(g, me._id, { me: mine, guess });
    if (err) throw new ConvexError(err);
    await commit(ctx, room, g);
  },
});

export const ask = mutation({
  args: { code: v.string(), card: v.number(), q: v.string(), options: v.array(v.string()) },
  handler: async (ctx, { code, card, q, options }) => {
    const { me, room, g, stale } = await liveGame(ctx, code, card);
    if (stale) return;
    const err = writeQuestion(g, me._id, { q, options: options.slice(0, 4) });
    if (err) throw new ConvexError(err);
    await commit(ctx, room, g);
  },
});

export const next = mutation({
  args: { code: v.string(), card: v.number() },
  handler: async (ctx, { code, card }) => {
    const { me, room, g, stale } = await liveGame(ctx, code, card);
    if (stale) return;
    ready(g, me._id);
    await commit(ctx, room, g);
  },
});

export const react = mutation({
  args: { code: v.string(), card: v.number(), e: v.string() },
  handler: async (ctx, { code, card, e }) => {
    const { me, room, g, stale } = await liveGame(ctx, code, card);
    if (stale || g.phase !== "reveal") return;
    addReaction(g, me._id, e);
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
    const pair = members.length === 2 ? await pairOf(ctx, members[0].id, members[1].id) : null;
    const base = {
      code: room.code,
      decks: room.decks,
      length: room.length,
      own: room.own,
      status: room.status,
      gameNo: room.gameNo,
      isHost: room.hostId === me._id,
      isMember: room.members.some((m) => m.playerId === me._id),
      meId: me._id as string,
      members,
      pair: pair ? { games: pair.games, bestSync: pair.bestSync, lastSync: pair.lastSync } : null,
    };
    if (room.status === "lobby" || !room.game) return { ...base, game: null };
    const g = room.game as SyncGame;
    const names: Record<string, string> = {};
    for (const p of g.players) names[p] = members.find((x) => x.id === p)?.name ?? (await ctx.db.get(p as Id<"players">))?.name ?? "Player";
    const isPlayer = g.players.includes(me._id);
    const partner = isPlayer ? partnerOf(g, me._id) : g.players[1];
    const card = g.done ? null : g.cards[g.i];
    const q = card ? questionOf(card) : null;
    const showAll = g.phase === "reveal" || !!g.done;
    return {
      ...base,
      game: {
        seq: g.seq,
        players: g.players,
        names,
        isPlayer,
        partner,
        i: g.i,
        total: g.cards.length,
        phase: g.phase,
        card: card ? { ask: card.ask ?? null, throwback: card.throwback ? { at: card.throwback.at, answers: showAll ? card.throwback.answers : null } : null } : null,
        question: q,
        needs: card ? needs(card, q, me._id) : { me: false, guess: false },
        // Your own answer only, until the reveal.
        mine: g.entries[me._id] ?? null,
        partnerDone: !!g.entries[partner],
        ready: g.ready,
        reactions: g.reactions,
        results: g.results,
        sync: syncPercent(g.results),
        knows: Object.fromEntries(g.players.map((p) => [p, knowsPercent(g.results, p)])),
        done: g.done ?? null,
      },
    };
  },
});
