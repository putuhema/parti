import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { addXp, befriend, findPlayer, freeCode, requirePlayer } from "./lib/helpers";
import { CHARACTERS, QUESTIONS, TURN_MS, questionById } from "./lib/faceoff/roster";

type Room = Doc<"faceRooms">;
/** A player id, or "bot" for the computer opponent. */
type Seat = Id<"players"> | "bot";

export const BOT = "bot";

export type FaceEvent =
  | { kind: "ask"; by: Seat; q: string; yes: boolean; at: number }
  | { kind: "guess"; by: Seat; char: number; right: boolean; at: number }
  | { kind: "timeout" | "left"; by: Seat; at: number };

/** Everything about one game of Face Off. Stored on the room. */
export interface FaceGame {
  seq: number;
  players: Seat[]; // always two
  secret: Record<string, number>; // character index each player is hiding; never sent to the other side
  down: Record<string, number[]>; // characters flipped down on each player's board
  asked: Record<string, string[]>; // question ids each player has used
  turn: Seat;
  log: FaceEvent[];
  deadline?: number;
  sched?: number;
  done?: { winner: Seat | null; reason: "guess" | "wrong" | "left" };
}

const COUNTDOWN_MS = 3000;
const BOT_MS = 1800; // how long the bot "thinks"

// ---------- Room helpers ----------
async function roomByCode(ctx: QueryCtx, code: string) {
  return await ctx.db
    .query("faceRooms")
    .withIndex("by_code", (q) => q.eq("code", code.trim().toUpperCase()))
    .order("desc")
    .first();
}
async function requireRoom(ctx: QueryCtx, code: string) {
  const r = await roomByCode(ctx, code);
  if (!r) throw new ConvexError("Room not found");
  return r;
}

/** Save the game. If the deadline changed, schedule a wake-up for it. */
async function commit(ctx: MutationCtx, room: Room, g: FaceGame) {
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
    await ctx.scheduler.runAfter(Math.max(0, g.deadline! - Date.now()) + 80, internal.faceoff.tick, { roomId: room._id, gameNo: room.gameNo, deadline: g.deadline! });
  }
}

async function award(ctx: MutationCtx, g: FaceGame) {
  const vsBot = g.players.includes(BOT);
  for (const p of g.players) {
    if (p === BOT) continue;
    const won = g.done?.winner === p;
    if (vsBot) await addXp(ctx, p, won ? 20 : 5);
    else if (won) await addXp(ctx, p, 30, { win: true });
    else await addXp(ctx, p, 10);
  }
}

// ---------- Game rules ----------
const other = (g: FaceGame, p: Seat) => g.players.find((x) => x !== p)!;
const upOn = (g: FaceGame, p: Seat) => CHARACTERS.map((_, i) => i).filter((i) => !g.down[p].includes(i));

function setup(players: Seat[], now: number): FaceGame {
  const a = Math.floor(Math.random() * CHARACTERS.length);
  let b = Math.floor(Math.random() * (CHARACTERS.length - 1));
  if (b >= a) b += 1; // never the same face on both sides
  const g: FaceGame = {
    seq: 0,
    players,
    secret: { [players[0]]: a, [players[1]]: b },
    down: { [players[0]]: [], [players[1]]: [] },
    asked: { [players[0]]: [], [players[1]]: [] },
    turn: players[0],
    log: [],
  };
  startTurn(g, now + COUNTDOWN_MS);
  return g;
}

function note(g: FaceGame, e: FaceEvent) {
  g.log = [...g.log, e].slice(-30);
}

function startTurn(g: FaceGame, from: number) {
  g.deadline = from + (g.turn === BOT ? BOT_MS : TURN_MS);
}

function pass(g: FaceGame, now: number) {
  g.turn = other(g, g.turn);
  startTurn(g, now);
}

function ask(g: FaceGame, p: Seat, qid: string, now: number) {
  const q = questionById(qid)!;
  const theirs = CHARACTERS[g.secret[other(g, p)]];
  const yes = q.test(theirs);
  // Flip down everyone who doesn't match the answer.
  const flip = CHARACTERS.map((c, i) => (q.test(c) !== yes ? i : -1)).filter((i) => i >= 0);
  g.down[p] = [...new Set([...g.down[p], ...flip])].sort((x, y) => x - y);
  g.asked[p] = [...g.asked[p], qid];
  note(g, { kind: "ask", by: p, q: qid, yes, at: now });
  pass(g, now);
}

function guess(g: FaceGame, p: Seat, char: number, now: number) {
  const right = g.secret[other(g, p)] === char;
  note(g, { kind: "guess", by: p, char, right, at: now });
  g.deadline = undefined;
  // A wrong guess loses on the spot.
  g.done = right ? { winner: p, reason: "guess" } : { winner: other(g, p), reason: "wrong" };
}

/** The bot guesses when it's sure; otherwise asks the question that splits what's left most evenly. */
function botMove(g: FaceGame, now: number) {
  const left = upOn(g, BOT);
  if (left.length === 1) return guess(g, BOT, left[0], now);
  let best: string[] = [];
  let bestScore = Infinity;
  for (const q of QUESTIONS) {
    if (g.asked[BOT].includes(q.id)) continue;
    const yes = left.filter((i) => q.test(CHARACTERS[i])).length;
    if (yes === 0 || yes === left.length) continue;
    const score = Math.abs(left.length - 2 * yes);
    if (score < bestScore) { bestScore = score; best = [q.id]; }
    else if (score === bestScore) best.push(q.id);
  }
  if (!best.length) return guess(g, BOT, left[Math.floor(Math.random() * left.length)], now);
  ask(g, BOT, best[Math.floor(Math.random() * best.length)], now);
}

function onDeadline(g: FaceGame, now: number) {
  if (g.turn === BOT) return botMove(g, now);
  note(g, { kind: "timeout", by: g.turn, at: now });
  pass(g, now);
}

// ---------- Lobby ----------
export const create = mutation({
  args: {},
  handler: async (ctx) => {
    const me = await requirePlayer(ctx);
    const code = await freeCode(ctx);
    await ctx.db.insert("faceRooms", { code, hostId: me._id, status: "lobby", gameNo: 0, members: [{ playerId: me._id, seat: 0, lastSeen: Date.now() }] });
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
    if (room.members.length >= 2) throw new ConvexError("This room is full");
    const seat = room.members.some((m) => m.seat === 0) ? 1 : 0;
    await ctx.db.patch(room._id, { members: [...room.members, { playerId: me._id, seat, lastSeen: Date.now() }] });
    return room.code;
  },
});

export const start = mutation({
  args: { code: v.string() },
  handler: async (ctx, { code }) => {
    const me = await requirePlayer(ctx);
    const room = await requireRoom(ctx, code);
    if (room.hostId !== me._id) throw new ConvexError("Only the host can start");
    if (room.status === "playing") return;
    const seated: Seat[] = [...room.members].sort((a, b) => a.seat - b.seat).map((m) => m.playerId);
    if (seated.length === 1) seated.push(BOT);
    // Take turns going first, game to game.
    const players = room.gameNo % 2 ? [seated[1], seated[0]] : seated;
    if (!players.includes(BOT)) await befriend(ctx, players[0] as Id<"players">, players[1] as Id<"players">);
    const now = Date.now();
    const fresh = { ...room, gameNo: room.gameNo + 1, status: "playing" as const, startAt: now + COUNTDOWN_MS, endedAt: undefined };
    await ctx.db.patch(room._id, { gameNo: fresh.gameNo, status: "playing", startAt: fresh.startAt, endedAt: undefined });
    await commit(ctx, fresh, setup(players, now));
  },
});

export const rematch = mutation({
  args: { code: v.string() },
  handler: async (ctx, { code }) => {
    const me = await requirePlayer(ctx);
    const room = await requireRoom(ctx, code);
    if (room.hostId !== me._id) throw new ConvexError("Only the host can start a rematch");
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
    const g = room.game as FaceGame | undefined;
    if (room.status !== "playing" || !g || g.done || !g.players.includes(me._id)) return;
    // Walking out hands the win to the other side (unless it's only the bot).
    const fresh = (await ctx.db.get(room._id))!;
    note(g, { kind: "left", by: me._id, at: Date.now() });
    g.deadline = undefined;
    const opp = other(g, me._id);
    g.done = { winner: opp === BOT ? null : opp, reason: "left" };
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
export const act = mutation({
  args: {
    code: v.string(),
    move: v.union(v.object({ kind: v.literal("ask"), q: v.string() }), v.object({ kind: v.literal("guess"), char: v.number() })),
  },
  handler: async (ctx, { code, move }) => {
    const me = await requirePlayer(ctx);
    const room = await requireRoom(ctx, code);
    if (room.status !== "playing" || !room.game) throw new ConvexError("The game isn't running");
    const g = room.game as FaceGame;
    if (g.done) throw new ConvexError("The game is over");
    if (!g.players.includes(me._id)) throw new ConvexError("You're watching this game");
    const now = Date.now();
    if (room.startAt && now < room.startAt - 200) throw new ConvexError("Wait for the countdown");
    if (g.turn !== me._id) throw new ConvexError("It's not your turn");
    if (move.kind === "ask") {
      if (!questionById(move.q)) throw new ConvexError("Unknown question");
      if (g.asked[me._id].includes(move.q)) throw new ConvexError("You already asked that");
      ask(g, me._id, move.q, now);
    } else {
      if (!Number.isInteger(move.char) || move.char < 0 || move.char >= CHARACTERS.length) throw new ConvexError("Pick a face");
      guess(g, me._id, move.char, now);
    }
    await commit(ctx, room, g);
  },
});

export const tick = internalMutation({
  args: { roomId: v.id("faceRooms"), gameNo: v.number(), deadline: v.number() },
  handler: async (ctx, { roomId, gameNo, deadline }) => {
    const room = await ctx.db.get(roomId);
    if (!room || room.status !== "playing" || room.gameNo !== gameNo || !room.game) return;
    const g = room.game as FaceGame;
    if (g.done || g.deadline !== deadline) return;
    onDeadline(g, Date.now());
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
      status: room.status,
      gameNo: room.gameNo,
      startAt: room.startAt ?? null,
      isHost: room.hostId === me._id,
      isMember: room.members.some((m) => m.playerId === me._id),
      meId: me._id as string,
      members,
    };
    if (room.status === "lobby" || !room.game) return { ...base, game: null };
    const g = room.game as FaceGame;
    const isPlayer = g.players.includes(me._id);
    // Your own face is yours to see; theirs only once the game is over.
    const secret = Object.fromEntries(g.players.map((p) => [p, g.done || p === me._id ? g.secret[p] : null]));
    return {
      ...base,
      game: {
        seq: g.seq,
        players: g.players as string[],
        isPlayer,
        vsBot: g.players.includes(BOT),
        secret,
        down: g.down,
        asked: g.asked,
        turn: g.turn as string,
        log: g.log,
        deadline: g.deadline ?? null,
        done: g.done ?? null,
      },
    };
  },
});
