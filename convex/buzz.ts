import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { addXp, befriend, findPlayer, freeCode, requirePlayer } from "./lib/helpers";
import { BUZZ_CATS, BUZZ_MAX, COLS, ROWS, tileValue } from "./lib/buzz/board";
import { BUZZ_QUESTIONS } from "./lib/buzz/questions";

type PId = Id<"players">;
type Room = Doc<"buzzRooms">;

export type BuzzTry = { by: PId; pick: number; correct: boolean };
export type BuzzEvent = { kind: "hot" | "left"; by: PId; at: number };

/** Everything about one game of Buzz Board. Stored on the room. */
export interface BuzzGame {
  seq: number;
  rows: number;
  cats: number[]; // category index per column
  tiles: { q: number; used: boolean; hot: boolean }[]; // index = row * COLS + col
  players: PId[];
  picker: PId; // who chooses the next tile
  scores: Record<string, number>;
  stats: Record<string, { right: number; wrong: number }>;
  phase: "pick" | "wager" | "question" | "reveal" | "done";
  tile: number | null;
  wager: number | null; // only on the hot seat tile
  order: number[]; // order[k] = index into the question's choices
  tries: BuzzTry[];
  takenBy: PId | null; // who answered this tile right
  log: BuzzEvent[];
  deadline?: number;
  sched?: number;
  done?: { winners: PId[]; text: "board" | "left" };
}

const COUNTDOWN_MS = 3000;
const PICK_MS = 20_000;
const WAGER_MS = 15_000;
const ANSWER_MS = 15_000;
const REVEAL_MS = 3200;

const shuffle = <T,>(list: T[]) => {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};
const pickOne = <T,>(list: T[]) => list[Math.floor(Math.random() * list.length)];

// ---------- Room helpers ----------
async function roomByCode(ctx: QueryCtx, code: string) {
  return await ctx.db
    .query("buzzRooms")
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
async function commit(ctx: MutationCtx, room: Room, g: BuzzGame) {
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
    await ctx.scheduler.runAfter(Math.max(0, g.deadline! - Date.now()) + 80, internal.buzz.tick, { roomId: room._id, gameNo: room.gameNo, deadline: g.deadline! });
  }
}

async function award(ctx: MutationCtx, g: BuzzGame) {
  const solo = g.players.length === 1;
  for (const p of g.players) {
    if (solo) await addXp(ctx, p, 20);
    else if (g.done?.winners.includes(p)) await addXp(ctx, p, 30, { win: true });
    else await addXp(ctx, p, 10);
  }
}

// ---------- Game rules ----------
function setup(players: PId[], rows: number, now: number): BuzzGame {
  const cats = shuffle(BUZZ_CATS.map((_, i) => i)).slice(0, COLS);
  const tiles = Array.from({ length: rows * COLS }, (_, i) => {
    const tier = Math.floor(i / COLS);
    const cat = cats[i % COLS];
    const q = pickOne(BUZZ_QUESTIONS.filter((x) => x.cat === cat && x.tier === tier));
    return { q: q.id, used: false, hot: false };
  });
  // One hidden hot seat tile, never in the cheapest row.
  tiles[COLS + Math.floor(Math.random() * (tiles.length - COLS))].hot = true;
  return {
    seq: 0,
    rows,
    cats,
    tiles,
    players,
    picker: players[0],
    scores: Object.fromEntries(players.map((p) => [p, 0])),
    stats: Object.fromEntries(players.map((p) => [p, { right: 0, wrong: 0 }])),
    phase: "pick",
    tile: null,
    wager: null,
    order: [],
    tries: [],
    takenBy: null,
    log: [],
    deadline: now + COUNTDOWN_MS + PICK_MS,
  };
}

function note(g: BuzzGame, e: Omit<BuzzEvent, "at">, now: number) {
  g.log = [...g.log, { ...e, at: now }].slice(-6);
}

/** Most you can bet on the hot seat: your score, or the board's top value if that's more. */
export const maxWager = (score: number, rows: number) => Math.max(score, rows * 100);

function openTile(g: BuzzGame, i: number, now: number) {
  g.tile = i;
  g.order = shuffle([0, 1, 2, 3]);
  g.tries = [];
  g.takenBy = null;
  g.wager = null;
  if (g.tiles[i].hot) {
    note(g, { kind: "hot", by: g.picker }, now);
    g.phase = "wager";
    g.deadline = now + WAGER_MS;
  } else {
    g.phase = "question";
    g.deadline = now + ANSWER_MS;
  }
}

function setWager(g: BuzzGame, amount: number, now: number) {
  g.wager = amount;
  g.phase = "question";
  g.deadline = now + ANSWER_MS;
}

/** Who may still answer this tile. */
function canTry(g: BuzzGame, p: PId) {
  if (!g.players.includes(p) || g.tries.some((t) => t.by === p)) return false;
  return g.tiles[g.tile!].hot ? p === g.picker : true;
}

function answer(g: BuzzGame, p: PId, pick: number, now: number) {
  const correct = g.order[pick] === 0;
  const worth = g.wager ?? tileValue(g.tile!);
  g.tries = [...g.tries, { by: p, pick, correct }];
  if (correct) {
    g.scores[p] += worth;
    g.stats[p].right += 1;
    g.takenBy = p;
    g.picker = p; // a right answer picks next
    reveal(g, now);
  } else {
    g.scores[p] -= worth;
    g.stats[p].wrong += 1;
    if (!g.players.some((x) => canTry(g, x))) reveal(g, now);
  }
}

function reveal(g: BuzzGame, now: number) {
  g.tiles[g.tile!].used = true;
  g.phase = "reveal";
  g.deadline = now + REVEAL_MS;
}

function afterReveal(g: BuzzGame, now: number) {
  if (g.tiles.every((t) => t.used)) {
    const top = Math.max(...g.players.map((p) => g.scores[p]));
    g.phase = "done";
    g.deadline = undefined;
    g.done = { winners: g.players.filter((p) => g.scores[p] === top), text: "board" };
    return;
  }
  g.phase = "pick";
  g.tile = null;
  g.wager = null;
  g.tries = [];
  g.takenBy = null;
  g.deadline = now + PICK_MS;
}

function onDeadline(g: BuzzGame, now: number) {
  switch (g.phase) {
    case "pick": openTile(g, g.tiles.findIndex((t) => !t.used), now); break;
    case "wager": setWager(g, tileValue(g.tile!), now); break;
    case "question": reveal(g, now); break;
    case "reveal": afterReveal(g, now); break;
  }
}

// ---------- Lobby ----------
export const create = mutation({
  args: {},
  handler: async (ctx) => {
    const me = await requirePlayer(ctx);
    const code = await freeCode(ctx);
    await ctx.db.insert("buzzRooms", { code, hostId: me._id, rows: 4, status: "lobby", gameNo: 0, members: [{ playerId: me._id, seat: 0, lastSeen: Date.now() }] });
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
    if (room.members.length >= BUZZ_MAX) throw new ConvexError("This room is full");
    const taken = new Set(room.members.map((m) => m.seat));
    let seat = 0;
    while (taken.has(seat)) seat++;
    await ctx.db.patch(room._id, { members: [...room.members, { playerId: me._id, seat, lastSeen: Date.now() }] });
    return room.code;
  },
});

export const settings = mutation({
  args: { code: v.string(), rows: v.number() },
  handler: async (ctx, { code, rows }) => {
    const me = await requirePlayer(ctx);
    const room = await requireRoom(ctx, code);
    if (room.hostId !== me._id) throw new ConvexError("Only the host can change this");
    if (room.status === "playing") return;
    if (!ROWS.some((x) => x === rows)) throw new ConvexError("Pick 3, 4 or 5 rows");
    await ctx.db.patch(room._id, { rows });
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
    // Rotate who picks first each game.
    const shift = room.gameNo % seated.length;
    const players = [...seated.slice(shift), ...seated.slice(0, shift)];
    const now = Date.now();
    for (let i = 0; i < players.length; i++) for (let j = i + 1; j < players.length; j++) await befriend(ctx, players[i], players[j]);
    const fresh = { ...room, gameNo: room.gameNo + 1, status: "playing" as const, startAt: now + COUNTDOWN_MS, endedAt: undefined };
    await ctx.db.patch(room._id, { gameNo: fresh.gameNo, status: "playing", startAt: fresh.startAt, endedAt: undefined });
    await commit(ctx, fresh, setup(players, room.rows, now));
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
    const g = room.game as BuzzGame | undefined;
    if (room.status !== "playing" || !g || g.done || !g.players.includes(me._id) || rest.length === 0) return;
    const now = Date.now();
    const fresh = (await ctx.db.get(room._id))!;
    const idx = g.players.indexOf(me._id);
    g.players = g.players.filter((p) => p !== me._id);
    note(g, { kind: "left", by: me._id }, now);
    if (g.players.length === 1 && room.members.length > 1) {
      // Last one standing wins.
      g.phase = "done";
      g.deadline = undefined;
      g.done = { winners: [g.players[0]], text: "left" };
    } else if (g.picker === me._id) {
      g.picker = g.players[idx % g.players.length];
      // A hot seat belongs to its picker: if they leave mid-tile, close it.
      if ((g.phase === "wager" || g.phase === "question") && g.tiles[g.tile!].hot) reveal(g, now);
    }
    if (g.phase === "question" && !g.players.some((x) => canTry(g, x))) reveal(g, now);
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
  args: { code: v.string(), action: v.union(v.literal("pick"), v.literal("wager"), v.literal("answer")), n: v.number() },
  handler: async (ctx, { code, action, n }) => {
    const me = await requirePlayer(ctx);
    const room = await requireRoom(ctx, code);
    if (room.status !== "playing" || !room.game) throw new ConvexError("The game isn't running");
    const g = room.game as BuzzGame;
    if (g.done) throw new ConvexError("The game is over");
    if (!g.players.includes(me._id)) throw new ConvexError("You're watching this game");
    const now = Date.now();
    if (room.startAt && now < room.startAt - 200) throw new ConvexError("Wait for the countdown");
    if (!Number.isInteger(n)) throw new ConvexError("Not allowed");
    if (action === "pick") {
      if (g.phase !== "pick") throw new ConvexError("A tile is already open");
      if (g.picker !== me._id) throw new ConvexError("It's not your pick");
      if (n < 0 || n >= g.tiles.length || g.tiles[n].used) throw new ConvexError("That tile is gone");
      openTile(g, n, now);
    } else if (action === "wager") {
      if (g.phase !== "wager" || g.picker !== me._id) throw new ConvexError("Not your bet");
      const max = maxWager(g.scores[me._id], g.rows);
      if (n < 5 || n > max) throw new ConvexError(`Bet between 5 and ${max}`);
      setWager(g, n, now);
    } else {
      if (g.phase !== "question") throw new ConvexError("Too late to answer");
      if (n < 0 || n > 3) throw new ConvexError("Pick an answer");
      if (g.tries.some((t) => t.by === me._id)) throw new ConvexError("You already answered");
      if (!canTry(g, me._id)) throw new ConvexError("This one's not yours");
      answer(g, me._id, n, now);
    }
    await commit(ctx, room, g);
  },
});

export const tick = internalMutation({
  args: { roomId: v.id("buzzRooms"), gameNo: v.number(), deadline: v.number() },
  handler: async (ctx, { roomId, gameNo, deadline }) => {
    const room = await ctx.db.get(roomId);
    if (!room || room.status !== "playing" || room.gameNo !== gameNo || !room.game) return;
    const g = room.game as BuzzGame;
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
      rows: room.rows,
      status: room.status,
      gameNo: room.gameNo,
      startAt: room.startAt ?? null,
      isHost: room.hostId === me._id,
      isMember: room.members.some((m) => m.playerId === me._id),
      meId: me._id,
      members,
    };
    if (room.status === "lobby" || !room.game) return { ...base, game: null };
    const g = room.game as BuzzGame;
    const shown = g.phase === "reveal" || !!g.done;
    let question = null;
    if (g.tile !== null && (g.phase === "question" || g.phase === "reveal" || (g.phase === "done" && g.tile !== null))) {
      const full = BUZZ_QUESTIONS[g.tiles[g.tile].q];
      question = {
        cat: full.cat,
        text: full.text,
        choices: g.order.map((i) => full.choices[i]),
        correct: shown ? g.order.indexOf(0) : null, // only once the tile is closed
      };
    }
    return {
      ...base,
      game: {
        seq: g.seq,
        rows: g.rows,
        cats: g.cats,
        // Hot seat stays secret until someone opens it.
        tiles: g.tiles.map((t, i) => ({ used: t.used, hot: t.hot && (t.used || i === g.tile) })),
        players: g.players,
        picker: g.picker,
        isPlayer: g.players.includes(me._id),
        scores: g.scores,
        stats: g.stats,
        phase: g.phase,
        tile: g.tile,
        wager: g.wager,
        maxWager: maxWager(g.scores[me._id] ?? 0, g.rows),
        question,
        tries: g.tries,
        takenBy: g.takenBy,
        log: g.log,
        deadline: g.deadline ?? null,
        done: g.done ?? null,
      },
    };
  },
});
