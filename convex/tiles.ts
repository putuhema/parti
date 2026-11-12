import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { addXp, befriend, findPlayer, freeCode, requirePlayer } from "./lib/helpers";
import { botMoves, pickBotMove } from "./lib/tiles/bot";
import { CELLS, RACK, TILES_MAX, TURN_MS, judge, newBag, rackSum, takeFrom, type Placed, type TileLang } from "./lib/tiles/rules";
import { isWord } from "./lib/words/dict";

type Room = Doc<"tileRooms">;
/** A player id, or "bot" for the computer opponent. */
type Seat = Id<"players"> | "bot";

export const BOT = "bot";

export type TileEvent =
  | { kind: "play"; by: Seat; words: string[]; score: number; cells: number[]; at: number }
  | { kind: "swap"; by: Seat; n: number; at: number }
  | { kind: "pass" | "timeout" | "left"; by: Seat; at: number };

/** Everything about one game of Tile Town. Stored on the room. */
export interface TileGame {
  seq: number;
  lang: TileLang;
  board: string[]; // CELLS squares, "" when empty
  bag: string[]; // shuffled; never sent to phones
  racks: Record<string, string[]>; // each rack only goes to its owner
  players: Seat[];
  gone: Seat[]; // left mid-game; their turns are skipped
  scores: Record<string, number>;
  turn: Seat;
  idle: number; // turns in a row with no tiles played
  log: TileEvent[];
  last: number[]; // squares of the most recent play
  played?: { w: string; by: Seat; score: number }[]; // every word made this game, oldest first
  deadline?: number;
  sched?: number;
  done?: { winners: Seat[]; reason: "out" | "stuck" | "left"; adjust: Record<string, number> };
}

const COUNTDOWN_MS = 3000;
const BOT_MS = 2200; // how long the bot "thinks"
const lang = v.union(v.literal("en"), v.literal("id"));

// ---------- Room helpers ----------
async function roomByCode(ctx: QueryCtx, code: string) {
  return await ctx.db
    .query("tileRooms")
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
async function commit(ctx: MutationCtx, room: Room, g: TileGame) {
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
    await ctx.scheduler.runAfter(Math.max(0, g.deadline! - Date.now()) + 80, internal.tiles.tick, { roomId: room._id, gameNo: room.gameNo, deadline: g.deadline! });
  }
}

async function award(ctx: MutationCtx, g: TileGame) {
  const vsBot = g.players.includes(BOT);
  for (const p of g.players) {
    if (p === BOT || g.gone.includes(p)) continue;
    const won = g.done?.winners.includes(p);
    if (vsBot) await addXp(ctx, p, won ? 20 : 5);
    else if (won) await addXp(ctx, p, 30, { win: true });
    else await addXp(ctx, p, 10);
  }
}

// ---------- Game rules ----------
const active = (g: TileGame) => g.players.filter((p) => !g.gone.includes(p));

function draw(g: TileGame, p: Seat) {
  while (g.racks[p].length < RACK && g.bag.length) g.racks[p].push(g.bag.shift()!);
}

function setup(players: Seat[], gameLang: TileLang, now: number): TileGame {
  const g: TileGame = {
    seq: 0,
    lang: gameLang,
    board: Array(CELLS).fill(""),
    bag: newBag(gameLang, Math.random),
    racks: Object.fromEntries(players.map((p) => [p, []])),
    players,
    gone: [],
    scores: Object.fromEntries(players.map((p) => [p, 0])),
    turn: players[0],
    idle: 0,
    log: [],
    last: [],
    played: [],
  };
  for (const p of players) draw(g, p);
  startTurn(g, now + COUNTDOWN_MS);
  return g;
}

function note(g: TileGame, e: TileEvent) {
  g.log = [...g.log, e].slice(-30);
}

function startTurn(g: TileGame, from: number) {
  g.deadline = from + (g.turn === BOT ? BOT_MS : TURN_MS);
}

function nextTurn(g: TileGame, now: number) {
  const left = active(g);
  let k = g.players.indexOf(g.turn);
  do k = (k + 1) % g.players.length;
  while (!left.includes(g.players[k]));
  g.turn = g.players[k];
  startTurn(g, now);
}

/** End the game. Tiles left on racks count against their owners; whoever went out collects them. */
function finish(g: TileGame, reason: "out" | "stuck" | "left", out?: Seat) {
  const adjust: Record<string, number> = {};
  let pot = 0;
  for (const p of active(g)) {
    const left = rackSum(g.lang, g.racks[p]);
    if (p === out || reason === "left") continue;
    adjust[p] = -left;
    pot += left;
  }
  if (out) adjust[out] = pot;
  for (const [p, d] of Object.entries(adjust)) g.scores[p] = Math.max(0, g.scores[p] + d);
  const left = active(g);
  const top = Math.max(...left.map((p) => g.scores[p]));
  g.deadline = undefined;
  g.done = { winners: left.filter((p) => g.scores[p] === top), reason, adjust };
}

/** A scoreless turn. Once everyone has had two in a row, the game is stuck and ends. */
function idleTurn(g: TileGame, now: number) {
  g.idle += 1;
  if (g.idle >= 2 * active(g).length) return finish(g, "stuck");
  nextTurn(g, now);
}

function play(g: TileGame, p: Seat, tiles: Placed[], now: number) {
  const rest = takeFrom(g.racks[p], tiles.map((t) => t.l));
  if (!rest) throw new ConvexError("Those tiles aren't on your rack");
  const j = judge(g.board, tiles, g.lang);
  if (!j.ok) throw new ConvexError(j.error);
  const bad = j.words.find((w) => !isWord(w.word, g.lang));
  if (bad) throw new ConvexError(`${bad.word.toUpperCase()} isn't in our word list`);
  for (const t of tiles) g.board[t.i] = t.l;
  g.racks[p] = rest;
  g.scores[p] += j.score;
  g.idle = 0;
  g.last = tiles.map((t) => t.i);
  note(g, { kind: "play", by: p, words: j.words.map((w) => w.word), score: j.score, cells: g.last, at: now });
  g.played = [...(g.played ?? []), ...j.words.map((w) => ({ w: w.word, by: p, score: w.score }))];
  draw(g, p);
  if (g.racks[p].length === 0) return finish(g, "out", p);
  nextTurn(g, now);
}

function swap(g: TileGame, p: Seat, letters: string[], now: number) {
  if (letters.length === 0) throw new ConvexError("Pick tiles to swap");
  if (g.bag.length < RACK) throw new ConvexError(`You can swap while the bag has ${RACK}+ tiles`);
  const rest = takeFrom(g.racks[p], letters);
  if (!rest) throw new ConvexError("Those tiles aren't on your rack");
  g.racks[p] = rest;
  draw(g, p);
  // Returned tiles go back in at random spots, after you've drawn.
  for (const l of letters) g.bag.splice(Math.floor(Math.random() * (g.bag.length + 1)), 0, l);
  note(g, { kind: "swap", by: p, n: letters.length, at: now });
  idleTurn(g, now);
}

function botTurn(g: TileGame, now: number) {
  const move = pickBotMove(botMoves(g.board, g.racks[BOT], g.lang, Math.random), Math.random);
  if (move) return play(g, BOT, move.tiles, now);
  if (g.bag.length >= RACK) return swap(g, BOT, [...g.racks[BOT]], now);
  note(g, { kind: "pass", by: BOT, at: now });
  idleTurn(g, now);
}

function onDeadline(g: TileGame, now: number) {
  if (g.turn === BOT) return botTurn(g, now);
  note(g, { kind: "timeout", by: g.turn, at: now });
  idleTurn(g, now);
}

// ---------- Lobby ----------
export const create = mutation({
  args: {},
  handler: async (ctx) => {
    const me = await requirePlayer(ctx);
    const code = await freeCode(ctx);
    await ctx.db.insert("tileRooms", { code, hostId: me._id, lang: "en", status: "lobby", gameNo: 0, members: [{ playerId: me._id, seat: 0, lastSeen: Date.now() }] });
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
    if (room.members.length >= TILES_MAX) throw new ConvexError("This room is full");
    const taken = new Set(room.members.map((m) => m.seat));
    let seat = 0;
    while (taken.has(seat)) seat++;
    await ctx.db.patch(room._id, { members: [...room.members, { playerId: me._id, seat, lastSeen: Date.now() }] });
    return room.code;
  },
});

export const settings = mutation({
  args: { code: v.string(), lang },
  handler: async (ctx, { code, lang }) => {
    const me = await requirePlayer(ctx);
    const room = await requireRoom(ctx, code);
    if (room.hostId !== me._id) throw new ConvexError("Only the host can change this");
    if (room.status === "playing") return;
    await ctx.db.patch(room._id, { lang });
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
    const humans = seated.filter((p): p is Id<"players"> => p !== BOT);
    for (let i = 0; i < humans.length; i++) for (let j = i + 1; j < humans.length; j++) await befriend(ctx, humans[i], humans[j]);
    // Take turns going first, game to game.
    const k = room.gameNo % seated.length;
    const players = [...seated.slice(k), ...seated.slice(0, k)];
    const now = Date.now();
    const fresh = { ...room, gameNo: room.gameNo + 1, status: "playing" as const, startAt: now + COUNTDOWN_MS, endedAt: undefined };
    await ctx.db.patch(room._id, { gameNo: fresh.gameNo, status: "playing", startAt: fresh.startAt, endedAt: undefined });
    await commit(ctx, fresh, setup(players, room.lang, now));
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
    const g = room.game as TileGame | undefined;
    if (room.status !== "playing" || !g || g.done || !g.players.includes(me._id) || g.gone.includes(me._id)) return;
    // The rest play on without you; with one player (or only the bot) left, the game ends.
    const fresh = (await ctx.db.get(room._id))!;
    const now = Date.now();
    note(g, { kind: "left", by: me._id, at: now });
    g.gone = [...g.gone, me._id];
    const humans = active(g).filter((p) => p !== BOT);
    if (active(g).length < 2 || humans.length === 0) finish(g, "left");
    else if (g.turn === me._id) nextTurn(g, now);
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
    move: v.union(
      v.object({ kind: v.literal("play"), tiles: v.array(v.object({ i: v.number(), l: v.string() })) }),
      v.object({ kind: v.literal("swap"), letters: v.array(v.string()) }),
      v.object({ kind: v.literal("pass") }),
    ),
  },
  handler: async (ctx, { code, move }) => {
    const me = await requirePlayer(ctx);
    const room = await requireRoom(ctx, code);
    if (room.status !== "playing" || !room.game) throw new ConvexError("The game isn't running");
    const g = room.game as TileGame;
    if (g.done) throw new ConvexError("The game is over");
    if (!g.players.includes(me._id) || g.gone.includes(me._id)) throw new ConvexError("You're watching this game");
    const now = Date.now();
    if (room.startAt && now < room.startAt - 200) throw new ConvexError("Wait for the countdown");
    if (g.turn !== me._id) throw new ConvexError("It's not your turn");
    if (move.kind === "play") {
      if (move.tiles.length > RACK) throw new ConvexError("Too many tiles");
      play(g, me._id, move.tiles.map((t) => ({ i: t.i, l: t.l.toLowerCase() })), now);
    } else if (move.kind === "swap") {
      if (move.letters.length > RACK) throw new ConvexError("Too many tiles");
      swap(g, me._id, move.letters.map((l) => l.toLowerCase()), now);
    } else {
      note(g, { kind: "pass", by: me._id, at: now });
      idleTurn(g, now);
    }
    await commit(ctx, room, g);
  },
});

export const tick = internalMutation({
  args: { roomId: v.id("tileRooms"), gameNo: v.number(), deadline: v.number() },
  handler: async (ctx, { roomId, gameNo, deadline }) => {
    const room = await ctx.db.get(roomId);
    if (!room || room.status !== "playing" || room.gameNo !== gameNo || !room.game) return;
    const g = room.game as TileGame;
    if (g.done || g.deadline !== deadline) return;
    onDeadline(g, Date.now());
    await commit(ctx, room, g);
  },
});

/** Which of these words are in the room's word list, for the preview while you place tiles. */
export const check = query({
  args: { code: v.string(), words: v.array(v.string()) },
  handler: async (ctx, { code, words }) => {
    const room = await roomByCode(ctx, code);
    if (!room) return [];
    const l = (room.game as TileGame | undefined)?.lang ?? room.lang;
    return words.slice(0, 12).map((w) => isWord(w, l));
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
      lang: room.lang,
      status: room.status,
      gameNo: room.gameNo,
      startAt: room.startAt ?? null,
      isHost: room.hostId === me._id,
      isMember: room.members.some((m) => m.playerId === me._id),
      meId: me._id as string,
      members,
    };
    if (room.status === "lobby" || !room.game) return { ...base, game: null };
    const g = room.game as TileGame;
    const isPlayer = g.players.includes(me._id);
    // Your own rack only; everyone's leftover tiles show once the game is over.
    const racks = Object.fromEntries(g.players.map((p) => [p, g.done || p === me._id ? g.racks[p] : null]));
    return {
      ...base,
      game: {
        seq: g.seq,
        lang: g.lang,
        board: g.board,
        bagCount: g.bag.length,
        rack: isPlayer ? g.racks[me._id] : [],
        racks,
        rackCounts: Object.fromEntries(g.players.map((p) => [p, g.racks[p].length])),
        players: g.players as string[],
        gone: g.gone as string[],
        isPlayer: isPlayer && !g.gone.includes(me._id),
        vsBot: g.players.includes(BOT),
        scores: g.scores,
        turn: g.turn as string,
        idle: g.idle,
        log: g.log,
        last: g.last,
        played: (g.played ?? []).map((x) => ({ w: x.w, by: x.by as string, score: x.score })),
        deadline: g.deadline ?? null,
        done: g.done ? { winners: g.done.winners as string[], reason: g.done.reason, adjust: g.done.adjust } : null,
      },
    };
  },
});
