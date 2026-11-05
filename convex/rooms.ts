import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { addXp, befriend, findPlayer, freeCode, requirePlayer } from "./lib/helpers";
import { completedGroups, countEmpty, generatePuzzle, setAt } from "./lib/sudoku";
import { difficulty, mode } from "./schema";

export const MAX_PLAYERS = 4;
export const RACE_HEARTS = 3;
export const COOP_LIVES = 5;
const COUNTDOWN_MS = 3500;

async function roomByCode(ctx: QueryCtx, code: string) {
  return await ctx.db
    .query("rooms")
    .withIndex("by_code", (q) => q.eq("code", code.toUpperCase()))
    .first();
}

async function requireRoom(ctx: QueryCtx, code: string) {
  const room = await roomByCode(ctx, code);
  if (!room) throw new ConvexError("Room not found");
  return room;
}

async function members(ctx: QueryCtx, roomId: Id<"rooms">) {
  const rows = await ctx.db
    .query("roomPlayers")
    .withIndex("by_room", (q) => q.eq("roomId", roomId))
    .collect();
  return rows.sort((a, b) => a.seat - b.seat);
}

async function membership(ctx: QueryCtx, roomId: Id<"rooms">, playerId: Id<"players">) {
  return await ctx.db
    .query("roomPlayers")
    .withIndex("by_room_player", (q) => q.eq("roomId", roomId).eq("playerId", playerId))
    .unique();
}

async function boardsFor(ctx: QueryCtx, room: Doc<"rooms">) {
  return await ctx.db
    .query("boards")
    .withIndex("by_room_game", (q) => q.eq("roomId", room._id).eq("gameNo", room.gameNo))
    .collect();
}

async function addMember(ctx: MutationCtx, roomId: Id<"rooms">, playerId: Id<"players">) {
  const all = await members(ctx, roomId);
  const taken = new Set(all.map((m) => m.seat));
  let seat = 0;
  while (taken.has(seat)) seat++;
  await ctx.db.insert("roomPlayers", { roomId, playerId, seat, lastSeen: Date.now() });
}

export const create = mutation({
  args: { token: v.string(), mode, difficulty },
  handler: async (ctx, args) => {
    const me = await requirePlayer(ctx, args.token);
    const code = await freeCode(ctx);
    const roomId = await ctx.db.insert("rooms", {
      code,
      hostId: me._id,
      mode: args.mode,
      difficulty: args.difficulty,
      status: "lobby",
      gameNo: 0,
      lives: COOP_LIVES,
    });
    await addMember(ctx, roomId, me._id);
    return code;
  },
});

export const join = mutation({
  args: { token: v.string(), code: v.string() },
  handler: async (ctx, { token, code }) => {
    const me = await requirePlayer(ctx, token);
    const room = await roomByCode(ctx, code.trim());
    if (!room) throw new ConvexError("No room with that code");
    if (await membership(ctx, room._id, me._id)) return room.code;
    const all = await members(ctx, room._id);
    if (all.length >= MAX_PLAYERS) throw new ConvexError("This room is full");
    if (room.status === "playing") throw new ConvexError("That game already started");
    await addMember(ctx, room._id, me._id);
    return room.code;
  },
});

export const view = query({
  args: { token: v.string(), code: v.string() },
  handler: async (ctx, { token, code }) => {
    const me = await findPlayer(ctx, token);
    const room = await roomByCode(ctx, code);
    if (!me || !room) return null;
    const all = await members(ctx, room._id);
    const mine = all.find((m) => m.playerId === me._id);
    const boards = room.status === "lobby" ? [] : await boardsFor(ctx, room);
    const empties = room.puzzle ? countEmpty(room.puzzle) : 81;
    const shared = boards.find((b) => !b.playerId);
    const now = Date.now();

    const players = await Promise.all(
      all.map(async (m) => {
        const p = await ctx.db.get(m.playerId);
        const board = boards.find((b) => b.playerId === m.playerId);
        let filled = board?.filled ?? 0;
        if (shared?.owners) {
          filled = [...shared.owners].filter((o) => o === String(m.seat)).length;
        }
        return {
          id: m.playerId,
          name: p?.name ?? "Player",
          seat: m.seat,
          isHost: room.hostId === m.playerId,
          isMe: m.playerId === me._id,
          online: now - m.lastSeen < 30_000,
          cell: m.cell,
          filled,
          progress: Math.round((filled / empties) * 100),
          mistakes: board?.mistakes ?? 0,
          finishedAt: board?.finishedAt,
          gaveUp: board?.gaveUp ?? false,
        };
      }),
    );

    const myBoard = boards.find((b) => b.playerId === me._id);
    const recent = await ctx.db
      .query("reactions")
      .withIndex("by_room", (q) => q.eq("roomId", room._id))
      .order("desc")
      .take(6);

    return {
      code: room.code,
      mode: room.mode,
      difficulty: room.difficulty,
      status: room.status,
      gameNo: room.gameNo,
      startAt: room.startAt,
      endedAt: room.endedAt,
      winnerId: room.winnerId,
      outcome: room.outcome,
      lives: room.lives,
      maxLives: room.mode === "coop" ? COOP_LIVES : RACE_HEARTS,
      isMember: !!mine,
      isHost: room.hostId === me._id,
      meId: me._id,
      puzzle: room.status === "lobby" ? undefined : room.puzzle,
      empties,
      values: room.mode === "coop" ? shared?.values : myBoard?.values,
      owners: shared?.owners,
      myMistakes: room.mode === "coop" ? COOP_LIVES - room.lives : (myBoard?.mistakes ?? 0),
      myFinishedAt: room.mode === "coop" ? shared?.finishedAt : myBoard?.finishedAt,
      myGaveUp: myBoard?.gaveUp ?? false,
      hintsLeft: HINTS - ((room.mode === "coop" ? shared?.hints : myBoard?.hints) ?? 0),
      lastMove: room.lastMove,
      players,
      reactions: recent.map((r) => ({ id: r._id, playerId: r.playerId, text: r.text, at: r._creationTime })),
    };
  },
});

export const settings = mutation({
  args: { token: v.string(), code: v.string(), mode: v.optional(mode), difficulty: v.optional(difficulty) },
  handler: async (ctx, args) => {
    const me = await requirePlayer(ctx, args.token);
    const room = await requireRoom(ctx, args.code);
    if (room.hostId !== me._id) throw new ConvexError("Only the host can change this");
    if (room.status === "playing") return;
    await ctx.db.patch(room._id, {
      ...(args.mode ? { mode: args.mode } : {}),
      ...(args.difficulty ? { difficulty: args.difficulty } : {}),
    });
  },
});

export const start = mutation({
  args: { token: v.string(), code: v.string() },
  handler: async (ctx, { token, code }) => {
    const me = await requirePlayer(ctx, token);
    const room = await requireRoom(ctx, code);
    if (room.hostId !== me._id) throw new ConvexError("Only the host can start");
    if (room.status === "playing") return;
    const all = await members(ctx, room._id);
    const { puzzle, solution } = generatePuzzle(room.difficulty);
    const gameNo = room.gameNo + 1;
    const empties = countEmpty(puzzle);
    if (room.mode === "race") {
      for (const m of all) {
        await ctx.db.insert("boards", {
          roomId: room._id, gameNo, playerId: m.playerId, values: puzzle, filled: 0, mistakes: 0,
        });
      }
    } else {
      await ctx.db.insert("boards", {
        roomId: room._id, gameNo, values: puzzle, owners: "-".repeat(81), filled: 0, mistakes: 0,
      });
    }
    for (let i = 0; i < all.length; i++)
      for (let j = i + 1; j < all.length; j++) await befriend(ctx, all[i].playerId, all[j].playerId);
    await ctx.db.patch(room._id, {
      status: "playing",
      gameNo,
      puzzle,
      solution,
      startAt: Date.now() + COUNTDOWN_MS,
      endedAt: undefined,
      winnerId: undefined,
      outcome: undefined,
      lives: COOP_LIVES,
      lastMove: undefined,
    });
    return empties;
  },
});

async function maybeFinishRace(ctx: MutationCtx, room: Doc<"rooms">) {
  const all = await members(ctx, room._id);
  const boards = await boardsFor(ctx, room);
  const active = new Set(all.map((m) => m.playerId));
  const open = boards.filter((b) => b.playerId && active.has(b.playerId) && !b.finishedAt && !b.gaveUp);
  if (open.length === 0) await ctx.db.patch(room._id, { status: "finished", endedAt: Date.now() });
}

export const HINTS = 3;

async function doPlace(ctx: MutationCtx, token: string, code: string, cell: number, digitIn: number | "hint") {
    const me = await requirePlayer(ctx, token);
    const room = await requireRoom(ctx, code);
    const seat = await membership(ctx, room._id, me._id);
    if (!seat) throw new ConvexError("You are not in this room");
    if (room.status !== "playing" || !room.puzzle || !room.solution) throw new ConvexError("Game is not running");
    const now = Date.now();
    if (room.startAt && now < room.startAt - 300) throw new ConvexError("Wait for the countdown");
    const digit = digitIn === "hint" ? Number(room.solution[cell]) : digitIn;
    if (cell < 0 || cell > 80 || digit < 1 || digit > 9) throw new ConvexError("Bad move");
    if (room.puzzle[cell] !== "0") return { correct: true, row: false, col: false, box: false, finished: false, lockMs: 0 };

    const boards = await boardsFor(ctx, room);
    const board = room.mode === "coop" ? boards.find((b) => !b.playerId) : boards.find((b) => b.playerId === me._id);
    if (!board || board.finishedAt || board.gaveUp) throw new ConvexError("Board is closed");
    if (board.values[cell] === room.solution[cell]) {
      return { correct: true, row: false, col: false, box: false, finished: false, lockMs: 0 };
    }

    if (digitIn === "hint") {
      if ((board.hints ?? 0) >= HINTS) throw new ConvexError("No hints left");
      await ctx.db.patch(board._id, { hints: (board.hints ?? 0) + 1 });
    }
    const correct = room.solution[cell] === String(digit);
    await ctx.db.patch(room._id, { lastMove: { playerId: me._id, cell, digit, correct, at: now } });
    await ctx.db.patch(seat._id, { lastSeen: now, cell });

    if (!correct) {
      const mistakes = board.mistakes + 1;
      await ctx.db.patch(board._id, { mistakes });
      if (room.mode === "coop") {
        const lives = Math.max(0, room.lives - 1);
        await ctx.db.patch(room._id, lives === 0 ? { lives, status: "finished", outcome: "lost", endedAt: now } : { lives });
        return { correct: false, row: false, col: false, box: false, finished: lives === 0, lockMs: 0 };
      }
      // Out of hearts in a race: no knock-out, but the keypad locks briefly.
      return { correct: false, row: false, col: false, box: false, finished: false, lockMs: mistakes > RACE_HEARTS ? 3000 : 0 };
    }

    const values = setAt(board.values, cell, String(digit));
    const filled = board.filled + 1;
    const finished = values === room.solution;
    const groups = completedGroups(values, room.solution, cell);
    await ctx.db.patch(board._id, {
      values,
      filled,
      ...(board.owners ? { owners: setAt(board.owners, cell, String(seat.seat)) } : {}),
      ...(finished ? { finishedAt: now } : {}),
    });

    if (finished) {
      if (room.mode === "coop") {
        await ctx.db.patch(room._id, { status: "finished", outcome: "won", endedAt: now });
        for (const m of await members(ctx, room._id)) await addXp(ctx, m.playerId, 30);
      } else {
        const first = !room.winnerId;
        if (first) await ctx.db.patch(room._id, { winnerId: me._id });
        await addXp(ctx, me._id, first ? 45 : 20, { win: first });
        await maybeFinishRace(ctx, (await ctx.db.get(room._id))!);
      }
    }
    return { correct: true, ...groups, finished, lockMs: 0 };
}

export const place = mutation({
  args: { token: v.string(), code: v.string(), cell: v.number(), digit: v.number() },
  handler: (ctx, a) => doPlace(ctx, a.token, a.code, a.cell, a.digit),
});

export const hint = mutation({
  args: { token: v.string(), code: v.string(), cell: v.number() },
  handler: (ctx, a) => doPlace(ctx, a.token, a.code, a.cell, "hint"),
});

export const giveUp = mutation({
  args: { token: v.string(), code: v.string() },
  handler: async (ctx, { token, code }) => {
    const me = await requirePlayer(ctx, token);
    const room = await requireRoom(ctx, code);
    if (room.status !== "playing" || room.mode !== "race") return;
    const board = (await boardsFor(ctx, room)).find((b) => b.playerId === me._id);
    if (board && !board.finishedAt) await ctx.db.patch(board._id, { gaveUp: true });
    await maybeFinishRace(ctx, room);
  },
});

export const rematch = mutation({
  args: { token: v.string(), code: v.string() },
  handler: async (ctx, { token, code }) => {
    const me = await requirePlayer(ctx, token);
    const room = await requireRoom(ctx, code);
    if (room.hostId !== me._id) throw new ConvexError("Only the host can start a rematch");
    await ctx.db.patch(room._id, {
      status: "lobby", puzzle: undefined, solution: undefined, startAt: undefined, endedAt: undefined,
      winnerId: undefined, outcome: undefined, lastMove: undefined, lives: COOP_LIVES,
    });
  },
});

export const leave = mutation({
  args: { token: v.string(), code: v.string() },
  handler: async (ctx, { token, code }) => {
    const me = await requirePlayer(ctx, token);
    const room = await roomByCode(ctx, code);
    if (!room) return;
    const seat = await membership(ctx, room._id, me._id);
    if (!seat) return;
    await ctx.db.delete(seat._id);
    const rest = await members(ctx, room._id);
    if (rest.length === 0) {
      await ctx.db.patch(room._id, { status: "finished", endedAt: Date.now() });
      return;
    }
    if (room.hostId === me._id) await ctx.db.patch(room._id, { hostId: rest[0].playerId });
    if (room.status === "playing" && room.mode === "race") await maybeFinishRace(ctx, room);
  },
});

/** Heartbeat + which cell I'm on (friends see it in co-op). */
export const presence = mutation({
  args: { token: v.string(), code: v.string(), cell: v.optional(v.number()) },
  handler: async (ctx, { token, code, cell }) => {
    const me = await findPlayer(ctx, token);
    const room = await roomByCode(ctx, code);
    if (!me || !room) return;
    const seat = await membership(ctx, room._id, me._id);
    if (seat) await ctx.db.patch(seat._id, cell === undefined ? { lastSeen: Date.now() } : { lastSeen: Date.now(), cell });
  },
});

export const react = mutation({
  args: { token: v.string(), code: v.string(), text: v.string() },
  handler: async (ctx, { token, code, text }) => {
    const me = await requirePlayer(ctx, token);
    const room = await requireRoom(ctx, code);
    if (!(await membership(ctx, room._id, me._id))) return;
    await ctx.db.insert("reactions", { roomId: room._id, playerId: me._id, text: text.slice(0, 20) });
  },
});
