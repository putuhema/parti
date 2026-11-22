import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { addXp, befriend, findPlayer, freeCode, requirePlayer } from "./lib/helpers";
import {
  ASKS, CLUE_LEN, MAX_CLUES, SKETCH_MAX, allFinished, cleanStrokes, describerOf, drawersOf, finishOwnPicture, givesAway, isBot, leaveGame, newGame, nextRound, reveal,
  type SketchGame,
} from "./lib/sketch/rules";

type Room = Doc<"sketchRooms">;

const COUNTDOWN_MS = 3000;

// ---------- Room helpers ----------
async function roomByCode(ctx: QueryCtx, code: string) {
  return await ctx.db
    .query("sketchRooms")
    .withIndex("by_code", (q) => q.eq("code", code.trim().toUpperCase()))
    .order("desc")
    .first();
}
async function requireRoom(ctx: QueryCtx, code: string) {
  const r = await roomByCode(ctx, code);
  if (!r) throw new ConvexError("Room not found");
  return r;
}

async function drawingsFor(ctx: QueryCtx, room: Room, round: number, players: string[]) {
  const out: Record<string, number[][]> = {};
  for (const p of players) {
    if (isBot(p)) continue;
    const row = await ctx.db
      .query("sketchDrawings")
      .withIndex("by_roomId_and_gameNo_and_round_and_playerId", (q) => q.eq("roomId", room._id).eq("gameNo", room.gameNo).eq("round", round).eq("playerId", p as Id<"players">))
      .unique();
    out[p] = row?.strokes ?? [];
  }
  return out;
}

/** The describer's own secret picture is done (or time's up): everyone else starts drawing. */
async function lockOwnPicture(ctx: MutationCtx, room: Room, g: SketchGame, word: string) {
  const mine = await drawingsFor(ctx, room, g.round, [describerOf(g)]);
  finishOwnPicture(g, mine[describerOf(g)] ?? [], word, Math.random, Date.now());
}

/** End the drawing for this round: score every drawing and show the picture. */
async function endRound(ctx: MutationCtx, room: Room, g: SketchGame) {
  const drawings = await drawingsFor(ctx, room, g.round, drawersOf(g));
  reveal(g, drawings, Date.now());
}

/** Save the game. If the deadline changed, schedule a wake-up for it. */
async function commit(ctx: MutationCtx, room: Room, g: SketchGame) {
  g.seq += 1;
  const needs = g.deadline && g.deadline !== g.sched && !g.done;
  if (needs) g.sched = g.deadline;
  const patch: Partial<Room> = { game: g };
  if (g.done && room.status !== "finished") {
    patch.status = "finished";
    patch.endedAt = Date.now();
    await award(ctx, g);
  }
  await ctx.db.patch(room._id, patch);
  if (needs) {
    await ctx.scheduler.runAfter(Math.max(0, g.deadline! - Date.now()) + 80, internal.sketch.tick, { roomId: room._id, gameNo: room.gameNo, deadline: g.deadline! });
  }
}

async function award(ctx: MutationCtx, g: SketchGame) {
  const solo = g.order.every(isBot);
  for (const p of g.players) {
    const id = p as Id<"players">;
    if (solo) {
      const avg = (g.totals[p] ?? 0) / Math.max(1, g.history.length);
      await addXp(ctx, id, 5 + Math.round(avg / 6));
    } else if (g.done?.winners.includes(p)) await addXp(ctx, id, 30, { win: true });
    else await addXp(ctx, id, 10);
  }
}

// ---------- Lobby ----------
export const create = mutation({
  args: {},
  handler: async (ctx) => {
    const me = await requirePlayer(ctx);
    const code = await freeCode(ctx);
    await ctx.db.insert("sketchRooms", { code, hostId: me._id, source: "book", status: "lobby", gameNo: 0, members: [{ playerId: me._id, seat: 0, lastSeen: Date.now() }] });
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
    if (room.members.length >= SKETCH_MAX) throw new ConvexError("This room is full");
    const taken = new Set(room.members.map((m) => m.seat));
    let seat = 0;
    while (taken.has(seat)) seat++;
    await ctx.db.patch(room._id, { members: [...room.members, { playerId: me._id, seat, lastSeen: Date.now() }] });
    return room.code;
  },
});

export const settings = mutation({
  args: { code: v.string(), source: v.union(v.literal("book"), v.literal("own")) },
  handler: async (ctx, { code, source }) => {
    const me = await requirePlayer(ctx);
    const room = await requireRoom(ctx, code);
    if (room.hostId !== me._id) throw new ConvexError("Only the host can change this");
    if (room.status === "playing") return;
    await ctx.db.patch(room._id, { source });
  },
});

export const start = mutation({
  args: { code: v.string() },
  handler: async (ctx, { code }) => {
    const me = await requirePlayer(ctx);
    const room = await requireRoom(ctx, code);
    if (room.hostId !== me._id) throw new ConvexError("Only the host can start");
    if (room.status === "playing") return;
    const humans = [...room.members].sort((a, b) => a.seat - b.seat).map((m) => m.playerId);
    for (let i = 0; i < humans.length; i++) for (let j = i + 1; j < humans.length; j++) await befriend(ctx, humans[i], humans[j]);
    const now = Date.now();
    const fresh = { ...room, gameNo: room.gameNo + 1, status: "playing" as const, startAt: now + COUNTDOWN_MS, endedAt: undefined };
    await ctx.db.patch(room._id, { gameNo: fresh.gameNo, status: "playing", startAt: fresh.startAt, endedAt: undefined });
    await commit(ctx, fresh, newGame(humans, room.source, room.gameNo, Math.random, now, COUNTDOWN_MS));
  },
});

export const rematch = mutation({
  args: { code: v.string() },
  handler: async (ctx, { code }) => {
    const me = await requirePlayer(ctx);
    const room = await requireRoom(ctx, code);
    if (room.hostId !== me._id) throw new ConvexError("Only the host can start a rematch");
    if (room.status === "playing") return;
    await ctx.db.patch(room._id, { status: "lobby", game: undefined, startAt: undefined, endedAt: undefined });
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
    const g = room.game as SketchGame | undefined;
    if (room.status !== "playing" || !g || g.done || !g.players.includes(me._id)) return;
    const fresh = (await ctx.db.get(room._id))!;
    const then = leaveGame(g, me._id);
    if (then === "reveal") await endRound(ctx, fresh, g);
    if (then === "skip") nextRound(g, Math.random, Date.now());
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
async function liveGame(ctx: MutationCtx, code: string) {
  const me = await requirePlayer(ctx);
  const room = await requireRoom(ctx, code);
  if (room.status !== "playing" || !room.game) throw new ConvexError("The game isn't running");
  const g = room.game as SketchGame;
  if (g.done) throw new ConvexError("The game is over");
  if (!g.players.includes(me._id)) throw new ConvexError("You're watching this game");
  return { me, room, g };
}

/** The describer sends a clue, or a drawer asks a quick question. */
export const say = mutation({
  args: { code: v.string(), text: v.string() },
  handler: async (ctx, { code, text }) => {
    const { me, room, g } = await liveGame(ctx, code);
    if (g.phase !== "draw") throw new ConvexError("This round is over");
    const clean = text.replace(/\s+/g, " ").trim().slice(0, CLUE_LEN);
    if (!clean) return;
    const describer = describerOf(g) === me._id;
    if (!describer && !(ASKS as readonly string[]).includes(clean)) throw new ConvexError("Only the describer can type clues");
    const said = describer ? givesAway(g.picture, clean) : null;
    if (said) throw new ConvexError(`Don’t say “${said}”!`);
    if (g.clues.length >= MAX_CLUES) throw new ConvexError("That's a lot of clues! Let them draw.");
    g.clues.push({ by: me._id, text: clean, at: Date.now(), ...(describer ? {} : { ask: true }) });
    await commit(ctx, room, g);
  },
});

/** A drawer saves their drawing so far. Kept in its own row so drawers don't clash. */
export const draw = mutation({
  args: { code: v.string(), round: v.number(), strokes: v.array(v.array(v.number())) },
  handler: async (ctx, { code, round, strokes }) => {
    const { me, room, g } = await liveGame(ctx, code);
    if (g.round !== round) return; // late save from the last round: drop it
    const describing = describerOf(g) === me._id;
    // The describer draws during "sketch" (their secret picture); everyone else during "draw".
    if (g.phase !== (describing ? "sketch" : "draw")) return;
    const clean = cleanStrokes(strokes);
    const row = await ctx.db
      .query("sketchDrawings")
      .withIndex("by_roomId_and_gameNo_and_round_and_playerId", (q) => q.eq("roomId", room._id).eq("gameNo", room.gameNo).eq("round", round).eq("playerId", me._id))
      .unique();
    if (row) await ctx.db.patch(row._id, { strokes: clean });
    else await ctx.db.insert("sketchDrawings", { roomId: room._id, gameNo: room.gameNo, round, playerId: me._id, strokes: clean });
  },
});

/** A drawer is happy with their drawing (or wants to keep going). When everyone's done, show the answer. */
export const finishDrawing = mutation({
  args: { code: v.string(), round: v.number(), done: v.boolean() },
  handler: async (ctx, { code, round, done }) => {
    const { me, room, g } = await liveGame(ctx, code);
    if (g.phase !== "draw" || g.round !== round || describerOf(g) === me._id) return;
    g.finished = done ? [...new Set([...g.finished, me._id])] : g.finished.filter((p) => p !== me._id);
    if (allFinished(g)) await endRound(ctx, room, g);
    await commit(ctx, room, g);
  },
});

/** The describer has finished drawing their own secret picture. */
export const pictureReady = mutation({
  args: { code: v.string(), round: v.number(), word: v.string() },
  handler: async (ctx, { code, round, word }) => {
    const { me, room, g } = await liveGame(ctx, code);
    if (g.phase !== "sketch" || g.round !== round || describerOf(g) !== me._id) return;
    await lockOwnPicture(ctx, room, g, word);
    await commit(ctx, room, g);
  },
});

/** Host skips ahead from the answer to the next round. */
export const next = mutation({
  args: { code: v.string(), round: v.number() },
  handler: async (ctx, { code, round }) => {
    const { me, room, g } = await liveGame(ctx, code);
    if (room.hostId !== me._id) throw new ConvexError("Only the host can skip ahead");
    if (g.phase !== "reveal" || g.round !== round) return;
    nextRound(g, Math.random, Date.now());
    await commit(ctx, room, g);
  },
});

export const tick = internalMutation({
  args: { roomId: v.id("sketchRooms"), gameNo: v.number(), deadline: v.number() },
  handler: async (ctx, { roomId, gameNo, deadline }) => {
    const room = await ctx.db.get(roomId);
    if (!room || room.status !== "playing" || room.gameNo !== gameNo || !room.game) return;
    const g = room.game as SketchGame;
    if (g.done || g.deadline !== deadline) return;
    if (g.phase === "sketch") await lockOwnPicture(ctx, room, g, "");
    else if (g.phase === "draw") await endRound(ctx, room, g);
    else nextRound(g, Math.random, Date.now());
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
      source: room.source,
      status: room.status,
      gameNo: room.gameNo,
      startAt: room.startAt ?? null,
      isHost: room.hostId === me._id,
      isMember: room.members.some((m) => m.playerId === me._id),
      meId: me._id as string,
      members,
    };
    if (room.status === "lobby" || !room.game) return { ...base, game: null };
    const g = room.game as SketchGame;
    const names: Record<string, string> = {};
    for (const p of g.everyone) {
      const m = members.find((x) => x.id === p);
      names[p] = m?.name ?? (await ctx.db.get(p as Id<"players">))?.name ?? "Player";
    }
    const describer = describerOf(g) ?? null;
    // Drawers must not see the picture until the round ends.
    const canSee = g.phase === "reveal" || !!g.done || describer === me._id || !g.players.includes(me._id);
    return {
      ...base,
      game: {
        seq: g.seq,
        players: g.players,
        everyone: g.everyone,
        names,
        isPlayer: g.players.includes(me._id),
        round: g.round,
        rounds: g.order.length,
        solo: g.order.every(isBot),
        source: g.source,
        describer,
        drawers: g.done ? [] : drawersOf(g),
        phase: g.phase,
        picture: canSee ? g.picture : null,

        clues: g.clues,
        finished: g.finished,
        history: g.history,
        totals: g.totals,
        deadline: g.deadline ?? null,
        done: g.done ?? null,
      },
    };
  },
});

/** The drawings for this round: the describer watches everyone live, drawers only get their own until the answer. */
export const drawings = query({
  args: { code: v.string(), round: v.number() },
  handler: async (ctx, { code, round }) => {
    const me = await findPlayer(ctx);
    const room = await roomByCode(ctx, code);
    if (!me || !room || !room.game) return null;
    const g = room.game as SketchGame;
    if (round > g.round) return null;
    // While the describer draws their secret picture, only they see it.
    if (round === g.round && g.phase === "sketch") return describerOf(g) === me._id ? await drawingsFor(ctx, room, round, [me._id]) : {};
    const past = round < g.round || g.phase === "reveal" || !!g.done;
    const watching = describerOf(g) === me._id || !g.players.includes(me._id);
    const who = past || watching ? g.everyone : [me._id as string];
    const drawers = who.filter((p) => g.order[round] !== p);
    return await drawingsFor(ctx, room, round, drawers);
  },
});
