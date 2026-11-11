import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import {
  applyMove,
  botMove,
  findMove,
  fogCells,
  fromFen,
  inCheck,
  legalMoves,
  other,
  outcome,
  placeDuck,
  playCard,
  rulesFor,
  startState,
  typeOf,
  visibleFor,
  type Card,
  type ChessMode,
  type Color,
  type State,
} from "./lib/chess";
import { MATES } from "./lib/chessPuzzles";
import { addXp, befriend, findPlayer, freeCode, requirePlayer } from "./lib/helpers";
import { chessMode } from "./schema";
import { BUZZ_MAX } from "./lib/buzz/board";
import { SCRAMBLE_MAX } from "./lib/scramble/board";

type PId = Id<"players">;
type Room = Doc<"chessRooms">;

export interface Game {
  seq: number; // bumps on every change; scheduled jobs check it
  state: State;
  white: PId[];
  black: PId[];
  bot?: Color;
  moves: string[];
  last?: [number, number];
  clock?: { w: number; b: number; since: number };
  result?: { winner: Color | "draw"; reason: string };
  note?: string; // last card played, shown to both
  team?: { brain: PId; hand: PId; pick?: string };
  coach?: {
    coachId: PId;
    learnerId: PId;
    arrows: [number, number][];
    marks: { t: string; sq: number }[];
    takebacks: boolean;
    undos: number;
    history: { state: State; moves: number; last?: [number, number] }[];
  };
  puzzles?: {
    list: string[];
    runs: { playerId: PId; index: number; mistakes: number; lockUntil: number; finishedAt?: number; gaveUp?: boolean }[];
    winnerId?: PId;
  };
}

const MAX_MEMBERS = 4;
const COUNTDOWN_MS = 3500;
const PUZZLE_COUNT = 5;
const PUZZLE_LOCK_MS = 10_000;
const COACH_UNDOS = 3;
const TWO_PLAYER: ChessMode[] = ["classic", "powerups", "fog", "duck", "shuffle", "threecheck", "team", "coach"];

// ---------- Helpers ----------
async function roomByCode(ctx: QueryCtx, code: string) {
  return await ctx.db
    .query("chessRooms")
    .withIndex("by_code", (q) => q.eq("code", code.trim().toUpperCase()))
    .order("desc")
    .first();
}

async function requireRoom(ctx: QueryCtx, code: string) {
  const room = await roomByCode(ctx, code);
  if (!room) throw new ConvexError("Room not found");
  return room;
}

function gameOf(room: Room): Game {
  if (room.status === "lobby" || !room.game) throw new ConvexError("Game is not running");
  return room.game as Game;
}

function sideOf(game: Game, id: PId): Color | null {
  if (game.white.includes(id)) return "w";
  if (game.black.includes(id)) return "b";
  return null;
}

function seated(room: Room) {
  return [...room.members].sort((a, b) => a.seat - b.seat);
}

async function save(ctx: MutationCtx, room: Room, game: Game, extra: Partial<Room> = {}) {
  game.seq += 1;
  await ctx.db.patch(room._id, { game, ...extra });
}

/** After any change: end the game if it's over, or hand the turn to the bot / start the clock. */
async function afterChange(ctx: MutationCtx, room: Room, game: Game) {
  const rules = rulesFor(room.mode);
  if (!game.result && room.mode !== "puzzles") {
    const res = outcome(game.state, rules);
    if (res) game.result = res;
  }
  if (game.result) {
    await save(ctx, room, game, { status: "finished", endedAt: Date.now() });
    await award(ctx, room, game);
    return;
  }
  await save(ctx, room, game);
  const seq = game.seq;
  if (game.bot && game.state.turn === game.bot) {
    await ctx.scheduler.runAfter(650, internal.chess.botTurn, { roomId: room._id, gameNo: room.gameNo, seq });
  }
  if (game.clock && !game.state.duckPending) {
    const left = game.clock[game.state.turn];
    await ctx.scheduler.runAfter(left + 250, internal.chess.flag, { roomId: room._id, gameNo: room.gameNo, seq });
  }
}

/** Take time off the mover's clock. Returns false if they ran out. */
function tick(game: Game, mover: Color, now: number) {
  if (!game.clock) return true;
  const used = now - game.clock.since;
  game.clock[mover] = Math.max(0, game.clock[mover] - used);
  game.clock.since = now;
  if (game.clock[mover] <= 0) {
    game.result = { winner: other(mover), reason: "time" };
    return false;
  }
  return true;
}

async function award(ctx: MutationCtx, room: Room, game: Game) {
  const res = game.result;
  if (!res) return;
  if (room.mode === "puzzles") return; // handled per finisher
  if (room.mode === "coach" && game.coach) {
    const won = res.winner === "w";
    await addXp(ctx, game.coach.learnerId, won ? 30 : 15, { win: won });
    await addXp(ctx, game.coach.coachId, 15);
    return;
  }
  for (const id of [...game.white, ...game.black]) {
    const side = sideOf(game, id)!;
    if (res.winner === "draw") await addXp(ctx, id, 20);
    else if (res.winner === side) await addXp(ctx, id, room.mode === "team" ? 35 : 40, { win: true });
    else await addXp(ctx, id, 10);
  }
}

function makeGame(room: Room, now: number): Game {
  const members = seated(room).map((m) => m.playerId);
  const mode = room.mode;
  const state = startState(mode);
  const game: Game = { seq: 0, state, white: [], black: [], moves: [] };
  if (mode === "team") {
    game.white = members.slice(0, 2);
    game.bot = "b";
    const flip = room.gameNo % 2 === 1;
    game.team = { brain: flip ? members[1] : members[0], hand: flip ? members[0] : members[1] };
  } else if (mode === "coach") {
    const coachId = room.coachId && members.includes(room.coachId) ? room.coachId : members[0];
    const learnerId = members.find((m) => m !== coachId)!;
    game.white = [learnerId];
    game.bot = "b";
    game.coach = { coachId, learnerId, arrows: [], marks: [], takebacks: true, undos: COACH_UNDOS, history: [] };
  } else if (mode === "puzzles") {
    const pool = [...MATES].sort(() => Math.random() - 0.5).slice(0, PUZZLE_COUNT);
    game.puzzles = { list: pool, runs: members.map((playerId) => ({ playerId, index: 0, mistakes: 0, lockUntil: 0 })) };
  } else {
    const [a, b] = members;
    const swap = room.gameNo % 2 === 0; // host is white first, colors swap every rematch
    game.white = [swap ? b : a];
    game.black = [swap ? a : b];
    if (room.clockMs > 0) game.clock = { w: room.clockMs, b: room.clockMs, since: now + COUNTDOWN_MS };
  }
  return game;
}

// ---------- Lobby ----------
export const create = mutation({
  args: { mode: v.optional(chessMode) },
  handler: async (ctx, { mode }) => {
    const me = await requirePlayer(ctx);
    const code = await freeCode(ctx);
    await ctx.db.insert("chessRooms", {
      code,
      hostId: me._id,
      mode: mode ?? "classic",
      clockMs: 5 * 60_000,
      botLevel: 1,
      status: "lobby",
      gameNo: 0,
      members: [{ playerId: me._id, seat: 0, lastSeen: Date.now() }],
    });
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
    if (room.members.length >= MAX_MEMBERS) throw new ConvexError("This room is full");
    const taken = new Set(room.members.map((m) => m.seat));
    let seat = 0;
    while (taken.has(seat)) seat++;
    await ctx.db.patch(room._id, { members: [...room.members, { playerId: me._id, seat, lastSeen: Date.now() }] });
    return room.code;
  },
});

/** One join box for both games: tells the phone where to go. */
export const joinAny = mutation({
  args: { code: v.string() },
  handler: async (ctx, { code }) => {
    const me = await requirePlayer(ctx);
    const c = code.trim().toUpperCase();
    const chessRoom = await roomByCode(ctx, c);
    const sudoku = await ctx.db.query("rooms").withIndex("by_code", (q) => q.eq("code", c)).first();
    const words = await ctx.db.query("wordRooms").withIndex("by_code", (q) => q.eq("code", c)).order("desc").first();
    const trivia = await ctx.db.query("triviaRooms").withIndex("by_code", (q) => q.eq("code", c)).order("desc").first();
    const buzz = await ctx.db.query("buzzRooms").withIndex("by_code", (q) => q.eq("code", c)).order("desc").first();
    const face = await ctx.db.query("faceRooms").withIndex("by_code", (q) => q.eq("code", c)).order("desc").first();
    const grid = await ctx.db.query("gridRooms").withIndex("by_code", (q) => q.eq("code", c)).order("desc").first();
    const newest = Math.max(chessRoom?._creationTime ?? 0, sudoku?._creationTime ?? 0, words?._creationTime ?? 0, trivia?._creationTime ?? 0, buzz?._creationTime ?? 0, face?._creationTime ?? 0, grid?._creationTime ?? 0);
    if (grid && grid._creationTime === newest) {
      if (!grid.members.some((m) => m.playerId === me._id)) {
        if (grid.members.length >= SCRAMBLE_MAX) throw new ConvexError("This room is full");
        const taken = new Set(grid.members.map((m) => m.seat));
        let seat = 0;
        while (taken.has(seat)) seat++;
        await ctx.db.patch(grid._id, { members: [...grid.members, { playerId: me._id, seat, lastSeen: Date.now() }] });
      }
      return `/scramble/room/${grid.code}`;
    }
    if (face && face._creationTime === newest) {
      if (!face.members.some((m) => m.playerId === me._id)) {
        if (face.members.length >= 2) throw new ConvexError("This room is full");
        const seat = face.members.some((m) => m.seat === 0) ? 1 : 0;
        await ctx.db.patch(face._id, { members: [...face.members, { playerId: me._id, seat, lastSeen: Date.now() }] });
      }
      return `/faceoff/room/${face.code}`;
    }
    if (buzz && buzz._creationTime === newest) {
      if (!buzz.members.some((m) => m.playerId === me._id)) {
        if (buzz.members.length >= BUZZ_MAX) throw new ConvexError("This room is full");
        const taken = new Set(buzz.members.map((m) => m.seat));
        let seat = 0;
        while (taken.has(seat)) seat++;
        await ctx.db.patch(buzz._id, { members: [...buzz.members, { playerId: me._id, seat, lastSeen: Date.now() }] });
      }
      return `/buzz/room/${buzz.code}`;
    }
    if (trivia && trivia._creationTime === newest) {
      if (!trivia.members.some((m) => m.playerId === me._id)) {
        if (trivia.members.length >= MAX_MEMBERS) throw new ConvexError("This room is full");
        const taken = new Set(trivia.members.map((m) => m.seat));
        let seat = 0;
        while (taken.has(seat)) seat++;
        await ctx.db.patch(trivia._id, { members: [...trivia.members, { playerId: me._id, seat, lastSeen: Date.now() }] });
      }
      return `/trivia/room/${trivia.code}`;
    }
    if (words && words._creationTime === newest) {
      if (!words.members.some((m) => m.playerId === me._id)) {
        if (words.members.length >= MAX_MEMBERS) throw new ConvexError("This room is full");
        const taken = new Set(words.members.map((m) => m.seat));
        let seat = 0;
        while (taken.has(seat)) seat++;
        await ctx.db.patch(words._id, { members: [...words.members, { playerId: me._id, seat, lastSeen: Date.now() }] });
      }
      return `/words/room/${words.code}`;
    }
    const useChess = chessRoom && (!sudoku || chessRoom._creationTime > sudoku._creationTime);
    if (useChess) {
      if (!chessRoom.members.some((m) => m.playerId === me._id)) {
        if (chessRoom.members.length >= MAX_MEMBERS) throw new ConvexError("This room is full");
        const taken = new Set(chessRoom.members.map((m) => m.seat));
        let seat = 0;
        while (taken.has(seat)) seat++;
        await ctx.db.patch(chessRoom._id, { members: [...chessRoom.members, { playerId: me._id, seat, lastSeen: Date.now() }] });
      }
      return `/chess/room/${chessRoom.code}`;
    }
    if (!sudoku) throw new ConvexError("No room with that code");
    return `/room/${sudoku.code}`;
  },
});

export const settings = mutation({
  args: {
    code: v.string(),
    mode: v.optional(chessMode),
    clockMs: v.optional(v.number()),
    botLevel: v.optional(v.number()),
    coachId: v.optional(v.id("players")),
  },
  handler: async (ctx, a) => {
    const me = await requirePlayer(ctx);
    const room = await requireRoom(ctx, a.code);
    if (room.hostId !== me._id) throw new ConvexError("Only the host can change this");
    if (room.status === "playing") return;
    await ctx.db.patch(room._id, {
      ...(a.mode ? { mode: a.mode } : {}),
      ...(a.clockMs !== undefined ? { clockMs: Math.max(0, Math.min(30 * 60_000, a.clockMs)) } : {}),
      ...(a.botLevel !== undefined ? { botLevel: Math.max(1, Math.min(3, Math.round(a.botLevel))) } : {}),
      ...(a.coachId ? { coachId: a.coachId } : {}),
    });
  },
});

export const start = mutation({
  args: { code: v.string() },
  handler: async (ctx, { code }) => {
    const me = await requirePlayer(ctx);
    const room = await requireRoom(ctx, code);
    if (room.hostId !== me._id) throw new ConvexError("Only the host can start");
    if (room.status === "playing") return;
    if (TWO_PLAYER.includes(room.mode) && room.members.length < 2) throw new ConvexError("Waiting for a friend to join");
    const now = Date.now();
    const next = { ...room, gameNo: room.gameNo + 1 };
    const game = makeGame(next, now);
    const ids = room.members.map((m) => m.playerId);
    for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) await befriend(ctx, ids[i], ids[j]);
    await ctx.db.patch(room._id, { status: "playing", gameNo: next.gameNo, game, startAt: now + COUNTDOWN_MS, endedAt: undefined });
    if (game.clock) {
      await ctx.scheduler.runAfter(COUNTDOWN_MS + game.clock.w + 250, internal.chess.flag, { roomId: room._id, gameNo: next.gameNo, seq: game.seq });
    }
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
    if (rest.length === 0) {
      patch.status = "finished";
      patch.endedAt = Date.now();
    } else if (room.hostId === me._id) patch.hostId = rest[0].playerId;
    await ctx.db.patch(room._id, patch);
    if (room.status === "playing" && room.game && rest.length > 0) {
      const fresh = (await ctx.db.get(room._id))!;
      const game = room.game as Game;
      if (game.result) return;
      if (game.puzzles) {
        const run = game.puzzles.runs.find((r) => r.playerId === me._id);
        if (run && !run.finishedAt) run.gaveUp = true;
        await finishPuzzlesIfDone(ctx, fresh, game);
        return;
      }
      const side = sideOf(game, me._id);
      const coachLeft = game.coach?.coachId === me._id;
      if (side && !coachLeft) {
        game.result = { winner: other(side), reason: "left" };
        await afterChange(ctx, fresh, game);
      }
    }
  },
});

export const presence = mutation({
  args: { code: v.string() },
  handler: async (ctx, { code }) => {
    const me = await findPlayer(ctx);
    const room = await roomByCode(ctx, code);
    if (!me || !room) return;
    const now = Date.now();
    if (!room.members.some((m) => m.playerId === me._id)) return;
    await ctx.db.patch(room._id, { members: room.members.map((m) => (m.playerId === me._id ? { ...m, lastSeen: now } : m)) });
  },
});

export const react = mutation({
  args: { code: v.string(), text: v.string() },
  handler: async (ctx, { code, text }) => {
    const me = await requirePlayer(ctx);
    const room = await requireRoom(ctx, code);
    if (!room.members.some((m) => m.playerId === me._id)) return;
    await ctx.db.insert("chessReactions", { roomId: room._id, playerId: me._id, text: text.slice(0, 24) });
  },
});

// ---------- Playing ----------
async function loadForMove(ctx: MutationCtx, code: string) {
  const me = await requirePlayer(ctx);
  const room = await requireRoom(ctx, code);
  const game = gameOf(room);
  if (game.result || room.status !== "playing") throw new ConvexError("The game is over");
  const now = Date.now();
  if (room.startAt && now < room.startAt - 300) throw new ConvexError("Wait for the countdown");
  return { me, room, game, now };
}

/** Who may move now. Throws a friendly error otherwise. */
function assertMyTurn(room: Room, game: Game, me: PId) {
  const side = sideOf(game, me);
  if (!side) throw new ConvexError(game.coach?.coachId === me ? "Your learner makes the moves" : "You're watching this game");
  if (game.state.turn !== side) throw new ConvexError("Not your turn");
  if (game.team && game.team.hand !== me) throw new ConvexError("You're the Brain this turn: pick a piece");
  return side;
}

export const move = mutation({
  args: { code: v.string(), from: v.number(), to: v.number(), promo: v.optional(v.string()) },
  handler: async (ctx, a) => {
    const { me, room, game, now } = await loadForMove(ctx, a.code);
    if (room.mode === "puzzles") throw new ConvexError("Use puzzle moves");
    const side = assertMyTurn(room, game, me._id);
    const rules = rulesFor(room.mode);
    if (game.state.duckPending) throw new ConvexError("Place the duck first");
    const m = findMove(game.state, a.from, a.to, rules, a.promo);
    if (!m) throw new ConvexError("That move isn't allowed");
    if (game.team) {
      if (!game.team.pick) throw new ConvexError("Wait for the Brain to pick a piece");
      if (typeOf(game.state.cells[m.from]) !== game.team.pick) throw new ConvexError("Move the piece the Brain picked");
    }
    if (!tick(game, side, now)) return await afterChange(ctx, room, game);
    if (game.coach) {
      game.coach.history.push({ state: game.state, moves: game.moves.length, last: game.last });
      if (game.coach.history.length > 40) game.coach.history.shift();
      game.coach.arrows = [];
      game.coach.marks = [];
    }
    const res = applyMove(game.state, m, rules);
    game.state = res.state;
    game.moves.push(res.san);
    game.last = [m.from, m.to];
    game.note = undefined;
    if (game.team) game.team = { brain: game.team.hand, hand: game.team.brain };
    await afterChange(ctx, room, game);
    return { captured: res.captured, check: res.check };
  },
});

export const duck = mutation({
  args: { code: v.string(), sq: v.number() },
  handler: async (ctx, a) => {
    const { me, room, game, now } = await loadForMove(ctx, a.code);
    const side = assertMyTurn(room, game, me._id);
    const next = placeDuck(game.state, a.sq);
    if (!next) throw new ConvexError("Put the duck on an empty square");
    if (!tick(game, side, now)) return await afterChange(ctx, room, game);
    game.state = next;
    await afterChange(ctx, room, game);
  },
});

export const card = mutation({
  args: {
    code: v.string(),
    card: v.union(v.literal("shield"), v.literal("freeze"), v.literal("swap"), v.literal("rocket")),
    a: v.number(),
    b: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { me, room, game, now } = await loadForMove(ctx, args.code);
    if (room.mode !== "powerups") throw new ConvexError("No cards in this mode");
    const side = assertMyTurn(room, game, me._id);
    const res = playCard(game.state, args.card as Card, { a: args.a, b: args.b }, rulesFor(room.mode));
    if (!res) throw new ConvexError("That card can't be played there");
    if (res.endsTurn && !tick(game, side, now)) return await afterChange(ctx, room, game);
    game.state = res.state;
    game.note = res.label;
    if (res.endsTurn) {
      game.moves.push(res.label);
      game.last = undefined;
    }
    await afterChange(ctx, room, game);
  },
});

export const pick = mutation({
  args: { code: v.string(), piece: v.string() },
  handler: async (ctx, a) => {
    const { me, room, game } = await loadForMove(ctx, a.code);
    if (!game.team) throw new ConvexError("Only in Team vs Bot");
    if (game.team.brain !== me._id) throw new ConvexError("You're the Hand this turn");
    if (game.state.turn !== "w") throw new ConvexError("Wait for Bolt");
    const has = legalMoves(game.state).some((m) => typeOf(game.state.cells[m.from]) === a.piece);
    if (!has) throw new ConvexError("That piece can't move right now");
    game.team = { ...game.team, pick: a.piece };
    await save(ctx, room, game);
  },
});

export const resign = mutation({
  args: { code: v.string() },
  handler: async (ctx, a) => {
    const { me, room, game } = await loadForMove(ctx, a.code);
    if (game.puzzles) {
      const run = game.puzzles.runs.find((r) => r.playerId === me._id);
      if (run && !run.finishedAt) run.gaveUp = true;
      await finishPuzzlesIfDone(ctx, room, game);
      return;
    }
    const side = sideOf(game, me._id) ?? (game.coach?.coachId === me._id ? "w" : null);
    if (!side) throw new ConvexError("You're watching this game");
    game.result = { winner: other(side), reason: "resigned" };
    await afterChange(ctx, room, game);
  },
});

// ---------- Coach mode ----------
export const coachMarks = mutation({
  args: {
    code: v.string(),
    arrows: v.array(v.array(v.number())),
    marks: v.array(v.object({ t: v.string(), sq: v.number() })),
  },
  handler: async (ctx, a) => {
    const { me, room, game } = await loadForMove(ctx, a.code);
    if (!game.coach || game.coach.coachId !== me._id) throw new ConvexError("Only the coach can draw");
    const okSq = (n: number) => Number.isInteger(n) && n >= 0 && n < 64;
    game.coach.arrows = a.arrows.filter((x) => x.length === 2 && okSq(x[0]) && okSq(x[1])).slice(-8) as [number, number][];
    game.coach.marks = a.marks.filter((x) => okSq(x.sq) && ["hi", "ring", "danger"].includes(x.t)).slice(-16);
    await save(ctx, room, game);
  },
});

export const coachSettings = mutation({
  args: { code: v.string(), takebacks: v.boolean() },
  handler: async (ctx, a) => {
    const { me, room, game } = await loadForMove(ctx, a.code);
    if (!game.coach || game.coach.coachId !== me._id) throw new ConvexError("Only the coach can change this");
    game.coach.takebacks = a.takebacks;
    await save(ctx, room, game);
  },
});

export const takeback = mutation({
  args: { code: v.string() },
  handler: async (ctx, a) => {
    const { me, room, game } = await loadForMove(ctx, a.code);
    const c = game.coach;
    if (!c || c.learnerId !== me._id) throw new ConvexError("Only the learner can take back");
    if (!c.takebacks) throw new ConvexError("Your coach turned take-backs off");
    if (c.undos <= 0) throw new ConvexError("No take-backs left");
    const prev = c.history.pop();
    if (!prev) throw new ConvexError("Nothing to take back");
    game.state = prev.state;
    game.moves = game.moves.slice(0, prev.moves);
    game.last = prev.last;
    c.undos -= 1;
    await save(ctx, room, game);
  },
});

// ---------- Puzzle race ----------
async function finishPuzzlesIfDone(ctx: MutationCtx, room: Room, game: Game) {
  const p = game.puzzles!;
  const present = new Set(room.members.map((m) => m.playerId));
  const open = p.runs.filter((r) => present.has(r.playerId) && !r.finishedAt && !r.gaveUp);
  if (open.length === 0) {
    game.result = p.winnerId ? { winner: "w", reason: "puzzles" } : { winner: "draw", reason: "puzzles" };
    await save(ctx, room, game, { status: "finished", endedAt: Date.now() });
  } else await save(ctx, room, game);
}

export const puzzleMove = mutation({
  args: { code: v.string(), from: v.number(), to: v.number(), promo: v.optional(v.string()) },
  handler: async (ctx, a) => {
    const { me, room, game, now } = await loadForMove(ctx, a.code);
    const p = game.puzzles;
    if (!p) throw new ConvexError("Not a puzzle race");
    const run = p.runs.find((r) => r.playerId === me._id);
    if (!run) throw new ConvexError("You're watching this race");
    if (run.finishedAt || run.gaveUp) throw new ConvexError("You're done");
    if (now < run.lockUntil) throw new ConvexError("Wait for the penalty");
    const s = fromFen(p.list[run.index]);
    const m = findMove(s, a.from, a.to, undefined, a.promo);
    if (!m) throw new ConvexError("That move isn't allowed");
    const next = applyMove(s, m).state;
    const solved = inCheck(next) && legalMoves(next).length === 0;
    if (!solved) {
      run.mistakes += 1;
      run.lockUntil = now + PUZZLE_LOCK_MS;
      await save(ctx, room, game);
      return { solved: false, done: false };
    }
    run.index += 1;
    let done = false;
    if (run.index >= p.list.length) {
      done = true;
      run.finishedAt = now;
      const first = !p.winnerId;
      if (first) p.winnerId = me._id;
      await addXp(ctx, me._id, first ? 45 : 20, { win: first });
      await finishPuzzlesIfDone(ctx, room, game);
    } else await save(ctx, room, game);
    return { solved: true, done };
  },
});

// ---------- Scheduled jobs ----------
export const botTurn = internalMutation({
  args: { roomId: v.id("chessRooms"), gameNo: v.number(), seq: v.number() },
  handler: async (ctx, { roomId, gameNo, seq }) => {
    const room = await ctx.db.get(roomId);
    if (!room || room.status !== "playing" || room.gameNo !== gameNo || !room.game) return;
    const game = room.game as Game;
    if (game.seq !== seq || game.result || !game.bot || game.state.turn !== game.bot) return;
    const m = botMove(game.state, room.botLevel);
    if (!m) return await afterChange(ctx, room, game);
    const res = applyMove(game.state, m);
    game.state = res.state;
    game.moves.push(res.san);
    game.last = [m.from, m.to];
    await afterChange(ctx, room, game);
  },
});

export const flag = internalMutation({
  args: { roomId: v.id("chessRooms"), gameNo: v.number(), seq: v.number() },
  handler: async (ctx, { roomId, gameNo, seq }) => {
    const room = await ctx.db.get(roomId);
    if (!room || room.status !== "playing" || room.gameNo !== gameNo || !room.game) return;
    const game = room.game as Game;
    if (game.seq !== seq || game.result || !game.clock) return;
    const mover = game.state.turn;
    if (!tick(game, mover, Date.now())) await afterChange(ctx, room, game);
  },
});

// ---------- Reading ----------
export const view = query({
  args: { code: v.string() },
  handler: async (ctx, { code }) => {
    const me = await findPlayer(ctx);
    const room = await roomByCode(ctx, code);
    if (!me || !room) return null;
    const now = Date.now();
    const members = await Promise.all(
      seated(room).map(async (m) => {
        const p = await ctx.db.get(m.playerId);
        return {
          id: m.playerId,
          name: p?.name ?? "Player",
          seat: m.seat,
          isMe: m.playerId === me._id,
          isHost: room.hostId === m.playerId,
          online: now - m.lastSeen < 30_000,
        };
      }),
    );
    const recent = await ctx.db
      .query("chessReactions")
      .withIndex("by_room", (q) => q.eq("roomId", room._id))
      .order("desc")
      .take(6);

    const base = {
      code: room.code,
      mode: room.mode,
      status: room.status,
      gameNo: room.gameNo,
      clockMs: room.clockMs,
      botLevel: room.botLevel,
      coachId: room.coachId ?? room.hostId,
      startAt: room.startAt,
      isHost: room.hostId === me._id,
      isMember: room.members.some((m) => m.playerId === me._id),
      meId: me._id,
      members,
      reactions: recent.map((r) => ({ id: r._id, playerId: r.playerId, text: r.text, at: r._creationTime })),
    };
    if (room.status === "lobby" || !room.game) return { ...base, game: null };

    const g = room.game as Game;
    const rules = rulesFor(room.mode);
    const myColor = sideOf(g, me._id);
    const over = !!g.result;
    let state = g.state;
    let moves = g.moves;
    let last = g.last;
    if (room.mode === "fog" && myColor && !over) {
      const seen = visibleFor(g.state, myColor, rules);
      state = { ...g.state, cells: fogCells(g.state, myColor, rules), ep: g.state.turn === myColor ? g.state.ep : -1 };
      moves = g.moves.map((m, i) => ((i % 2 === 0) === (myColor === "w") ? m : "?"));
      if (last && !(seen.has(last[0]) || seen.has(last[1]))) last = undefined;
    }
    let puzzles = null;
    if (g.puzzles) {
      const mine = g.puzzles.runs.find((r) => r.playerId === me._id);
      puzzles = {
        total: g.puzzles.list.length,
        fen: mine && mine.index < g.puzzles.list.length ? g.puzzles.list[mine.index] : null,
        mine: mine ?? null,
        winnerId: g.puzzles.winnerId,
        runs: g.puzzles.runs.map((r) => ({ playerId: r.playerId, index: r.index, mistakes: r.mistakes, finishedAt: r.finishedAt, gaveUp: r.gaveUp ?? false })),
      };
    }
    const c = g.coach;
    return {
      ...base,
      game: {
        seq: g.seq,
        state,
        white: g.white,
        black: g.black,
        bot: g.bot,
        myColor,
        moves,
        last,
        clock: g.clock,
        result: g.result,
        note: g.note,
        inCheck: !rules.kingCapture && !(room.mode === "fog" && !over) ? inCheck(g.state) : false,
        team: g.team,
        coach: c ? { coachId: c.coachId, learnerId: c.learnerId, arrows: c.arrows, marks: c.marks, takebacks: c.takebacks, undos: c.undos, canUndo: c.history.length > 0 } : null,
        puzzles,
      },
    };
  },
});

// ---------- Lessons ----------
export const lessonDone = mutation({
  args: { lesson: v.string(), stars: v.number() },
  handler: async (ctx, { lesson, stars }) => {
    const me = await requirePlayer(ctx);
    const s = Math.max(1, Math.min(3, Math.round(stars)));
    const prev = me.chessLessons?.[lesson] ?? 0;
    const xp = prev === 0 ? 10 + (s === 3 ? 5 : 0) : 5;
    await ctx.db.patch(me._id, { chessLessons: { ...(me.chessLessons ?? {}), [lesson]: Math.max(prev, s) } });
    await addXp(ctx, me._id, xp);
    return xp;
  },
});
