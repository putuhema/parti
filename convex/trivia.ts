import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { addXp, befriend, findPlayer, freeCode, requirePlayer } from "./lib/helpers";
import { BOARD, CATS, GOALS, targets } from "./lib/trivia/board";
import { QUESTIONS } from "./lib/trivia/questions";

type PId = Id<"players">;
type Room = Doc<"triviaRooms">;

export type TriviaEvent = { kind: "gem" | "right" | "wrong" | "late" | "again" | "wild" | "left"; by: PId; cat?: number; at: number };

/** Everything about one game of Quiz Loop. Stored on the room. */
export interface TriviaGame {
  seq: number;
  goal: number;
  players: PId[];
  turn: number; // index into players
  pos: Record<string, number>;
  gems: Record<string, number[]>;
  stats: Record<string, { right: number; asked: number }>;
  phase: "roll" | "move" | "pick" | "question" | "reveal" | "done";
  roll: number | null;
  options: number[];
  q: { id: number; cat: number; gem: boolean; order: number[] } | null; // order[k] = index into the question's choices
  result: { pick: number | null; correct: boolean; gem: number | null } | null;
  used: number[];
  log: TriviaEvent[];
  deadline?: number;
  sched?: number;
  done?: { winner: PId | null; text: "gems" | "left" };
}

const MAX_MEMBERS = 4;
const COUNTDOWN_MS = 3000;
const ROLL_MS = 30_000;
const MOVE_MS = 20_000;
const PICK_MS = 15_000;
const ANSWER_MS = 20_000;
const REVEAL_MS = 2800;

const shuffle = <T,>(list: T[]) => {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

// ---------- Room helpers ----------
async function roomByCode(ctx: QueryCtx, code: string) {
  return await ctx.db
    .query("triviaRooms")
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
async function commit(ctx: MutationCtx, room: Room, g: TriviaGame) {
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
    await ctx.scheduler.runAfter(Math.max(0, g.deadline! - Date.now()) + 80, internal.trivia.tick, { roomId: room._id, gameNo: room.gameNo, deadline: g.deadline! });
  }
}

async function award(ctx: MutationCtx, g: TriviaGame) {
  const solo = g.players.length === 1;
  for (const p of g.players) {
    if (solo) await addXp(ctx, p, 20);
    else if (g.done?.winner === p) await addXp(ctx, p, 30, { win: true });
    else await addXp(ctx, p, 10);
  }
}

// ---------- Game rules ----------
function setup(players: PId[], goal: number, now: number): TriviaGame {
  const g: TriviaGame = {
    seq: 0,
    goal,
    players,
    turn: 0,
    pos: Object.fromEntries(players.map((p) => [p, 0])),
    gems: Object.fromEntries(players.map((p) => [p, []])),
    stats: Object.fromEntries(players.map((p) => [p, { right: 0, asked: 0 }])),
    phase: "roll",
    roll: null,
    options: [],
    q: null,
    result: null,
    used: [],
    log: [],
  };
  g.deadline = now + COUNTDOWN_MS + ROLL_MS;
  return g;
}

const current = (g: TriviaGame) => g.players[g.turn];

function note(g: TriviaGame, e: Omit<TriviaEvent, "at">, now: number) {
  g.log = [...g.log, { ...e, at: now }].slice(-6);
}

function startTurn(g: TriviaGame, now: number, next: boolean) {
  if (next) g.turn = (g.turn + 1) % g.players.length;
  g.phase = "roll";
  g.roll = null;
  g.options = [];
  g.q = null;
  g.result = null;
  g.deadline = now + ROLL_MS;
}

function roll(g: TriviaGame, now: number) {
  g.roll = 1 + Math.floor(Math.random() * 6);
  g.options = targets(g.pos[current(g)], g.roll);
  g.phase = "move";
  g.deadline = now + MOVE_MS;
}

function move(g: TriviaGame, to: number, now: number) {
  const me = current(g);
  g.pos[me] = to;
  const space = BOARD[to];
  if (space.kind === "start" || space.kind === "again") {
    note(g, { kind: "again", by: me }, now);
    startTurn(g, now, false);
  } else if (space.kind === "wild") {
    note(g, { kind: "wild", by: me }, now);
    g.phase = "pick";
    g.deadline = now + PICK_MS;
  } else {
    ask(g, space.cat, space.kind === "gem", now);
  }
}

function ask(g: TriviaGame, cat: number, gem: boolean, now: number) {
  let pool = QUESTIONS.filter((q) => q.cat === cat && !g.used.includes(q.id));
  if (!pool.length) {
    // Every question in this category was asked: start the category over.
    g.used = g.used.filter((id) => QUESTIONS[id].cat !== cat);
    pool = QUESTIONS.filter((q) => q.cat === cat);
  }
  const q = pool[Math.floor(Math.random() * pool.length)];
  g.used.push(q.id);
  g.q = { id: q.id, cat, gem, order: shuffle([0, 1, 2, 3]) };
  g.result = null;
  g.phase = "question";
  g.deadline = now + ANSWER_MS;
  g.stats[current(g)].asked += 1;
}

function answer(g: TriviaGame, pick: number | null, now: number) {
  const me = current(g);
  const q = g.q!;
  const correct = pick !== null && q.order[pick] === 0;
  let gem: number | null = null;
  if (correct) {
    g.stats[me].right += 1;
    if (q.gem && !g.gems[me].includes(q.cat)) {
      g.gems[me] = [...g.gems[me], q.cat];
      gem = q.cat;
    }
  }
  g.result = { pick, correct, gem };
  note(g, { kind: gem !== null ? "gem" : correct ? "right" : pick === null ? "late" : "wrong", by: me, cat: q.cat }, now);
  g.phase = "reveal";
  g.deadline = now + REVEAL_MS;
}

function afterReveal(g: TriviaGame, now: number) {
  const me = current(g);
  if (g.gems[me].length >= g.goal) {
    g.phase = "done";
    g.deadline = undefined;
    g.done = { winner: me, text: "gems" };
    return;
  }
  // A right answer keeps your turn going.
  startTurn(g, now, !g.result?.correct);
}

function onDeadline(g: TriviaGame, now: number) {
  switch (g.phase) {
    case "roll": roll(g, now); break;
    case "move": move(g, g.options[0], now); break;
    case "pick": ask(g, Math.floor(Math.random() * CATS.length), false, now); break;
    case "question": answer(g, null, now); break;
    case "reveal": afterReveal(g, now); break;
  }
}

// ---------- Lobby ----------
export const create = mutation({
  args: { goal: v.optional(v.number()) },
  handler: async (ctx, { goal }) => {
    const me = await requirePlayer(ctx);
    const code = await freeCode(ctx);
    const g = GOALS.find((x) => x === goal) ?? 4;
    await ctx.db.insert("triviaRooms", { code, hostId: me._id, goal: g, status: "lobby", gameNo: 0, members: [{ playerId: me._id, seat: 0, lastSeen: Date.now() }] });
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

export const settings = mutation({
  args: { code: v.string(), goal: v.number() },
  handler: async (ctx, { code, goal }) => {
    const me = await requirePlayer(ctx);
    const room = await requireRoom(ctx, code);
    if (room.hostId !== me._id) throw new ConvexError("Only the host can change this");
    if (room.status === "playing") return;
    if (!GOALS.some((x) => x === goal)) throw new ConvexError("Pick 3, 4 or 6 gems");
    await ctx.db.patch(room._id, { goal });
  },
});

export const start = mutation({
  args: { code: v.string() },
  handler: async (ctx, { code }) => {
    const me = await requirePlayer(ctx);
    const room = await requireRoom(ctx, code);
    if (room.hostId !== me._id) throw new ConvexError("Only the host can start");
    if (room.status === "playing") return;
    const seated = [...room.members].sort((a, b) => a.seat - b.seat).map((m) => m.playerId);
    // Rotate who goes first each game.
    const shift = room.gameNo % seated.length;
    const players = [...seated.slice(shift), ...seated.slice(0, shift)];
    const now = Date.now();
    for (let i = 0; i < players.length; i++) for (let j = i + 1; j < players.length; j++) await befriend(ctx, players[i], players[j]);
    const fresh = { ...room, gameNo: room.gameNo + 1, status: "playing" as const, startAt: now + COUNTDOWN_MS, endedAt: undefined };
    await ctx.db.patch(room._id, { gameNo: fresh.gameNo, status: "playing", startAt: fresh.startAt, endedAt: undefined });
    await commit(ctx, fresh, setup(players, room.goal, now));
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
    const g = room.game as TriviaGame | undefined;
    if (room.status !== "playing" || !g || g.done || !g.players.includes(me._id) || rest.length === 0) return;
    const now = Date.now();
    const fresh = (await ctx.db.get(room._id))!;
    const idx = g.players.indexOf(me._id);
    const wasTurn = idx === g.turn;
    g.players = g.players.filter((p) => p !== me._id);
    note(g, { kind: "left", by: me._id }, now);
    if (g.players.length === 1 && room.members.length > 1) {
      // Last one standing wins.
      g.phase = "done";
      g.deadline = undefined;
      g.done = { winner: g.players[0], text: "left" };
    } else if (wasTurn) {
      g.turn = g.turn % g.players.length;
      startTurn(g, now, false);
    } else if (idx < g.turn) {
      g.turn -= 1;
    }
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
  args: { code: v.string(), action: v.union(v.literal("roll"), v.literal("move"), v.literal("pick"), v.literal("answer")), n: v.optional(v.number()) },
  handler: async (ctx, { code, action, n }) => {
    const me = await requirePlayer(ctx);
    const room = await requireRoom(ctx, code);
    if (room.status !== "playing" || !room.game) throw new ConvexError("The game isn't running");
    const g = room.game as TriviaGame;
    if (g.done) throw new ConvexError("The game is over");
    if (!g.players.includes(me._id)) throw new ConvexError("You're watching this game");
    if (current(g) !== me._id) throw new ConvexError("It's not your turn");
    const now = Date.now();
    if (room.startAt && now < room.startAt - 200) throw new ConvexError("Wait for the countdown");
    const x = n ?? -1;
    if (action === "roll") {
      if (g.phase !== "roll") throw new ConvexError("You already rolled");
      roll(g, now);
    } else if (action === "move") {
      if (g.phase !== "move" || !g.options.includes(x)) throw new ConvexError("You can't move there");
      move(g, x, now);
    } else if (action === "pick") {
      if (g.phase !== "pick" || !Number.isInteger(x) || x < 0 || x >= CATS.length) throw new ConvexError("Pick a category");
      ask(g, x, false, now);
    } else {
      if (g.phase !== "question" || !Number.isInteger(x) || x < 0 || x > 3) throw new ConvexError("Too late to answer");
      answer(g, x, now);
    }
    await commit(ctx, room, g);
    return { roll: g.roll };
  },
});

export const tick = internalMutation({
  args: { roomId: v.id("triviaRooms"), gameNo: v.number(), deadline: v.number() },
  handler: async (ctx, { roomId, gameNo, deadline }) => {
    const room = await ctx.db.get(roomId);
    if (!room || room.status !== "playing" || room.gameNo !== gameNo || !room.game) return;
    const g = room.game as TriviaGame;
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
          return { id: m.playerId, name: p?.name ?? "Player", seat: m.seat, isMe: m.playerId === me._id, isHost: room.hostId === m.playerId, lastSeen: m.lastSeen };
        }),
    );
    const base = {
      code: room.code,
      goal: room.goal,
      status: room.status,
      gameNo: room.gameNo,
      startAt: room.startAt ?? null,
      isHost: room.hostId === me._id,
      isMember: room.members.some((m) => m.playerId === me._id),
      meId: me._id,
      members,
    };
    if (room.status === "lobby" || !room.game) return { ...base, game: null };
    const g = room.game as TriviaGame;
    let question = null;
    if (g.q) {
      const full = QUESTIONS[g.q.id];
      const shown = g.phase === "reveal" || !!g.done;
      question = {
        cat: g.q.cat,
        gem: g.q.gem,
        text: full.text,
        choices: g.q.order.map((i) => full.choices[i]),
        correct: shown ? g.q.order.indexOf(0) : null, // only after the answer is locked in
      };
    }
    return {
      ...base,
      game: {
        seq: g.seq,
        goal: g.goal,
        players: g.players,
        turn: current(g) ?? null,
        isPlayer: g.players.includes(me._id),
        pos: g.pos,
        gems: g.gems,
        stats: g.stats,
        phase: g.phase,
        roll: g.roll,
        options: g.options,
        question,
        result: g.result,
        log: g.log,
        deadline: g.deadline ?? null,
        done: g.done ?? null,
      },
    };
  },
});
