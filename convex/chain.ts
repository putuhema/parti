import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { addXp, befriend, findPlayer, freeCode, requirePlayer } from "./lib/helpers";
import {
  BLANK_GUESS, CHAIN_MAX, CHAIN_MIN, DRAWING_CHOICES, GRACE_MS, active, advance, allIn, chainOf, cleanStrokes, cleanText, dealt, finish,
  isDraw, key, matches, newGame, nextInAlbum, ownerOf, steps, toggleLike, type ChainGame,
} from "./lib/chain/rules";

type Room = Doc<"chainRooms">;

async function roomByCode(ctx: QueryCtx, code: string) {
  return await ctx.db
    .query("chainRooms")
    .withIndex("by_code", (q) => q.eq("code", code.trim().toUpperCase()))
    .order("desc")
    .first();
}
async function requireRoom(ctx: QueryCtx, code: string) {
  const r = await roomByCode(ctx, code);
  if (!r) throw new ConvexError("Room not found");
  return r;
}
async function entryAt(ctx: QueryCtx, room: Room, chain: number, step: number) {
  return await ctx.db
    .query("chainEntries")
    .withIndex("by_roomId_and_gameNo_and_chain_and_step", (q) => q.eq("roomId", room._id).eq("gameNo", room.gameNo).eq("chain", chain).eq("step", step))
    .unique();
}

/** Save; keep the step clock running; XP at the end. */
async function commit(ctx: MutationCtx, room: Room, g: ChainGame) {
  g.seq += 1;
  const needs = g.deadline && g.deadline !== g.sched && !g.done;
  if (needs) g.sched = g.deadline;
  const patch: Partial<Room> = { game: g };
  if (g.done && room.status !== "finished") {
    patch.status = "finished";
    patch.endedAt = Date.now();
    if (g.done.reason === "end") for (const p of active(g)) await addXp(ctx, p as Id<"players">, 20, { win: true });
  }
  await ctx.db.patch(room._id, patch);
  if (needs) await ctx.scheduler.runAfter(Math.max(0, g.deadline! + GRACE_MS - Date.now()), internal.chain.tick, { roomId: room._id, gameNo: room.gameNo, deadline: g.deadline! });
}

/** Save one entry and work out whether a guess matched. */
async function hand(ctx: MutationCtx, room: Room, g: ChainGame, who: string, entry: { text?: string; strokes?: number[][] }) {
  const step = g.step;
  const chain = chainOf(g, who, step);
  if (await entryAt(ctx, room, chain, step)) return;
  await ctx.db.insert("chainEntries", { roomId: room._id, gameNo: room.gameNo, chain, step, by: who as Id<"players">, ...entry });
  if (!isDraw(step)) {
    const text = entry.text ?? "";
    const drawn = step === 1 ? (await entryAt(ctx, room, chain, 0))?.text : (await entryAt(ctx, room, chain, step - 2))?.text;
    g.nailed[key(chain, step)] = matches(text, drawn ?? "");
    if (step === steps(g) - 1) g.survived[chain] = matches(text, (await entryAt(ctx, room, chain, 0))?.text ?? "");
  }
  if (!g.submitted.includes(who)) g.submitted.push(who);
}

/** Fill in for anyone who ran out of time or left, then move on. */
async function closeStep(ctx: MutationCtx, room: Room, g: ChainGame, now: number) {
  for (const p of g.players) {
    if (g.submitted.includes(p)) continue;
    if (g.step === 0) await hand(ctx, room, g, p, { text: dealt(g.seed, g.players.indexOf(p))[0], strokes: [] });
    else if (isDraw(g.step)) await hand(ctx, room, g, p, { strokes: [] });
    else await hand(ctx, room, g, p, { text: BLANK_GUESS });
  }
  advance(g, now);
}

// ---------- Lobby ----------
export const create = mutation({
  args: {},
  handler: async (ctx) => {
    const me = await requirePlayer(ctx);
    const code = await freeCode(ctx);
    await ctx.db.insert("chainRooms", { code, hostId: me._id, drawings: 3, status: "lobby", gameNo: 0, members: [{ playerId: me._id, seat: 0, lastSeen: Date.now() }] });
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
    if (room.status === "playing") throw new ConvexError("That game has already started");
    if (room.members.length >= CHAIN_MAX) throw new ConvexError("This room is full");
    const taken = new Set(room.members.map((m) => m.seat));
    let seat = 0;
    while (taken.has(seat)) seat++;
    await ctx.db.patch(room._id, { members: [...room.members, { playerId: me._id, seat, lastSeen: Date.now() }] });
    return room.code;
  },
});

export const settings = mutation({
  args: { code: v.string(), drawings: v.number() },
  handler: async (ctx, { code, drawings }) => {
    const me = await requirePlayer(ctx);
    const room = await requireRoom(ctx, code);
    if (room.hostId !== me._id) throw new ConvexError("Only the host can change this");
    if (room.status === "playing") return;
    if (!(DRAWING_CHOICES as readonly number[]).includes(drawings)) throw new ConvexError("Pick one of the lengths");
    await ctx.db.patch(room._id, { drawings });
  },
});

export const start = mutation({
  args: { code: v.string() },
  handler: async (ctx, { code }) => {
    const me = await requirePlayer(ctx);
    const room = await requireRoom(ctx, code);
    if (room.hostId !== me._id) throw new ConvexError("Only the host can start");
    if (room.status === "playing") return;
    if (room.members.length < CHAIN_MIN) throw new ConvexError("You need at least 2 players");
    const players = [...room.members].sort((a, b) => a.seat - b.seat).map((m) => m.playerId);
    for (let i = 0; i < players.length; i++) for (let j = i + 1; j < players.length; j++) await befriend(ctx, players[i], players[j]);
    const fresh = { ...room, gameNo: room.gameNo + 1, status: "playing" as const, endedAt: undefined };
    await ctx.db.patch(room._id, { gameNo: fresh.gameNo, status: "playing", endedAt: undefined });
    await commit(ctx, fresh, newGame(players, room.drawings, Math.floor(Math.random() * 2 ** 31), Date.now()));
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
    const g = room.game as ChainGame | undefined;
    if (room.status !== "playing" || !g || g.done || !g.players.includes(me._id) || g.gone.includes(me._id)) return;
    g.gone.push(me._id);
    const fresh = (await ctx.db.get(room._id))!;
    // While drawing, a chain can't go on without its people: two players need each other.
    if (active(g).length < CHAIN_MIN && g.phase === "play") finish(g, "left");
    else if (g.phase === "play" && allIn(g)) await closeStep(ctx, fresh, g, Date.now());
    await commit(ctx, fresh, g);
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
export const submit = mutation({
  args: { code: v.string(), step: v.number(), text: v.optional(v.string()), strokes: v.optional(v.array(v.array(v.number()))) },
  handler: async (ctx, { code, step, text, strokes }) => {
    const me = await requirePlayer(ctx);
    const room = await requireRoom(ctx, code);
    const g = room.game as ChainGame | undefined;
    if (room.status !== "playing" || !g || g.phase !== "play" || g.step !== step) return; // too late: the step moved on
    if (!g.players.includes(me._id) || g.gone.includes(me._id)) throw new ConvexError("You're not in this game");
    if (g.submitted.includes(me._id)) return;
    if (step === 0) {
      const phrase = cleanText(text ?? "");
      if (!phrase) throw new ConvexError("Pick or write a phrase first");
      await hand(ctx, room, g, me._id, { text: phrase, strokes: cleanStrokes(strokes ?? []) });
    } else if (isDraw(step)) await hand(ctx, room, g, me._id, { strokes: cleanStrokes(strokes ?? []) });
    else await hand(ctx, room, g, me._id, { text: cleanText(text ?? "") || BLANK_GUESS });
    if (allIn(g)) await closeStep(ctx, room, g, Date.now());
    await commit(ctx, room, g);
  },
});

/** Replay: show the next entry. Anyone can tap; a stale tap does nothing. */
export const next = mutation({
  args: { code: v.string(), chain: v.number(), shown: v.number() },
  handler: async (ctx, { code, chain, shown }) => {
    const me = await requirePlayer(ctx);
    const room = await requireRoom(ctx, code);
    const g = room.game as ChainGame | undefined;
    if (!g || !room.members.some((m) => m.playerId === me._id)) return;
    if (nextInAlbum(g, { chain, shown })) await commit(ctx, room, g);
  },
});

export const love = mutation({
  args: { code: v.string(), chain: v.number(), step: v.number() },
  handler: async (ctx, { code, chain, step }) => {
    const me = await requirePlayer(ctx);
    const room = await requireRoom(ctx, code);
    const g = room.game as ChainGame | undefined;
    if (!g || !g.players.includes(me._id)) return;
    const err = toggleLike(g, me._id, chain, step);
    if (err) throw new ConvexError(err);
    await commit(ctx, room, g);
  },
});

/** The step clock: when time is up, fill in blanks and move on. */
export const tick = internalMutation({
  args: { roomId: v.id("chainRooms"), gameNo: v.number(), deadline: v.number() },
  handler: async (ctx, { roomId, gameNo, deadline }) => {
    const room = await ctx.db.get(roomId);
    if (!room || room.status !== "playing" || room.gameNo !== gameNo || !room.game) return;
    const g = room.game as ChainGame;
    if (g.done || g.phase !== "play" || g.deadline !== deadline) return;
    await closeStep(ctx, room, g, Date.now());
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
    const base = {
      code: room.code,
      drawings: room.drawings,
      status: room.status,
      gameNo: room.gameNo,
      isHost: room.hostId === me._id,
      isMember: room.members.some((m) => m.playerId === me._id),
      meId: me._id as string,
      members,
    };
    if (room.status === "lobby" || !room.game) return { ...base, game: null };
    const g = room.game as ChainGame;
    const names: Record<string, string> = {};
    for (const p of g.players) names[p] = members.find((m) => m.id === p)?.name ?? (await ctx.db.get(p as Id<"players">))?.name ?? "Player";
    const playing = g.players.includes(me._id) && !g.gone.includes(me._id);
    return {
      ...base,
      game: {
        seq: g.seq,
        players: g.players,
        gone: g.gone,
        names,
        isPlayer: playing,
        drawings: g.drawings,
        steps: steps(g),
        step: g.step,
        phase: g.phase,
        submitted: g.submitted,
        deadline: g.deadline ?? null,
        album: g.album,
        likes: g.likes,
        // Match results only come out in the replay, as each guess is shown.
        nailed: g.phase === "play" ? {} : g.nailed,
        survived: g.phase === "play" ? {} : g.survived,
        done: g.done ?? null,
      },
    };
  },
});

/** Your job this step: the phrase choices, or the one thing the player before you made. */
export const task = query({
  args: { code: v.string() },
  handler: async (ctx, { code }) => {
    const me = await findPlayer(ctx);
    const room = await roomByCode(ctx, code);
    const g = room?.game as ChainGame | undefined;
    if (!me || !room || !g || g.phase !== "play" || !g.players.includes(me._id)) return null;
    const chain = chainOf(g, me._id, g.step);
    if (g.step === 0) return { step: 0, chain, choices: dealt(g.seed, g.players.indexOf(me._id)), text: null, strokes: null, from: null };
    const prev = await entryAt(ctx, room, chain, g.step - 1);
    return { step: g.step, chain, choices: null, text: isDraw(g.step) ? prev?.text ?? BLANK_GUESS : null, strokes: isDraw(g.step) ? null : prev?.strokes ?? [], from: ownerOf(g, chain, g.step - 1) };
  },
});

/** The replay: the entries of the chain on screen, up to the one being shown. */
export const album = query({
  args: { code: v.string() },
  handler: async (ctx, { code }) => {
    const room = await roomByCode(ctx, code);
    const g = room?.game as ChainGame | undefined;
    if (!room || !g || g.phase === "play") return null;
    const chain = g.phase === "done" ? Math.min(g.album.chain, g.players.length - 1) : g.album.chain;
    const shown = g.phase === "done" ? steps(g) : g.album.shown;
    const rows = await ctx.db
      .query("chainEntries")
      .withIndex("by_roomId_and_gameNo_and_chain_and_step", (q) => q.eq("roomId", room._id).eq("gameNo", room.gameNo).eq("chain", chain).lt("step", shown))
      .take(16);
    return { chain, entries: rows.map((r) => ({ step: r.step, by: r.by as string, text: r.text ?? null, strokes: r.strokes ?? null })) };
  },
});
