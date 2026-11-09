/* eslint-disable @typescript-eslint/no-explicit-any */
import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, mutation, type MutationCtx, type QueryCtx } from "./_generated/server";
import { addXp, befriend, findPlayer, freeCode, requirePlayer } from "./lib/helpers";
import {
  CATEGORIES,
  CHAINS,
  EMOJI,
  ODD_DECOYS,
  ODD_SETS,
  PROMPTS,
  RIDDLES,
  SCRAMBLES,
  SPY_POOL,
  norm,
  pickLang,
  riddleAccepts,
  sameAnswer,
  scramblePoints,
  type Lang,
  type RoomLang,
} from "./lib/words/content";
import { isWord, pairExamples, pairWords } from "./lib/words/dict";
import { wordLang, wordMode } from "./schema";

type PId = Id<"players">;
type Room = Doc<"wordRooms">;
export type WordMode = Room["mode"];

/** Everything about one game. `m` holds the mode's own state. */
export interface WordGame {
  seq: number;
  mode: WordMode;
  lang: RoomLang;
  players: PId[];
  scores: Record<string, number>;
  phase: string;
  round: number;
  rounds: number;
  deadline?: number;
  sched?: number;
  done?: { winners: PId[]; text: string; coop?: boolean; success?: boolean };
  m: any;
}

const MAX_MEMBERS = 4;
const COUNTDOWN_MS = 3000;
const ALPHA = "abcdefghijklmnopqrstuvwxyz";

const shuffle = <T,>(list: T[]) => {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};
const other = (g: WordGame, id: PId) => g.players.find((p) => p !== id)!;

// ---------- Room helpers ----------
async function roomByCode(ctx: QueryCtx, code: string) {
  return await ctx.db
    .query("wordRooms")
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
async function commit(ctx: MutationCtx, room: Room, g: WordGame) {
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
    await ctx.scheduler.runAfter(Math.max(0, g.deadline! - Date.now()) + 80, internal.words.tick, { roomId: room._id, gameNo: room.gameNo, deadline: g.deadline! });
  }
}

async function award(ctx: MutationCtx, g: WordGame) {
  const d = g.done!;
  for (const p of g.players) {
    if (d.coop) await addXp(ctx, p, d.success ? 25 : 10, { win: !!d.success });
    else if (d.winners.includes(p)) await addXp(ctx, p, d.winners.length > 1 ? 20 : 30, { win: d.winners.length === 1 });
    else await addXp(ctx, p, 10);
  }
}

function finishByScore(g: WordGame, text = "") {
  const best = Math.max(...g.players.map((p) => g.scores[p] ?? 0));
  const winners = g.players.filter((p) => (g.scores[p] ?? 0) === best);
  g.phase = "done";
  g.deadline = undefined;
  g.done = { winners, text };
}

// ---------- Setting up each mode ----------
function setup(mode: WordMode, lang: RoomLang, players: PId[], now: number): WordGame {
  const g: WordGame = { seq: 0, mode, lang, players, scores: Object.fromEntries(players.map((p) => [p, 0])), phase: "play", round: 0, rounds: 1, m: {} };
  const start = now + COUNTDOWN_MS;
  switch (mode) {
    case "chain":
      // Each player first writes their own five words or takes a ready-made chain.
      g.phase = "setup";
      g.m = { picks: {}, event: null };
      break;
    case "hangman":
    case "guess":
      g.phase = "setup";
      g.m = { secrets: {}, hints: {}, found: {}, wrong: {}, lives: {}, asked: [], turn: players[0], log: [] };
      break;
    case "pair":
      g.rounds = 5;
      g.phase = "pick";
      g.m = pairRound(g, 0);
      break;
    case "chemistry":
      g.rounds = 8;
      g.phase = "answer";
      g.m = { order: shuffle(PROMPTS.map((_, i) => i)).slice(0, 8), answers: {}, history: [], matches: 0 };
      g.deadline = start + 25_000;
      break;
    case "dontsay": {
      const tier = (t: number) => shuffle(CATEGORIES.map((c, i) => ({ c, i })).filter((x) => x.c.tier === t).map((x) => x.i));
      // The small tiers come back a second time, when your easy answers are used up.
      const t3 = tier(3).slice(0, 3), t4 = tier(4).slice(0, 4);
      const order = [...tier(1).slice(0, 2), ...tier(2).slice(0, 2), ...t3, ...t4, ...shuffle(t3), ...shuffle(t4)];
      g.rounds = order.length;
      g.phase = "answer";
      g.m = { order, answers: {}, hearts: Object.fromEntries(players.map((p) => [p, 3])), used: Object.fromEntries(players.map((p) => [p, []])), verdict: {}, history: [] };
      g.deadline = start + 15_000;
      break;
    }
    case "spy": {
      const l = pickLang(lang);
      const words = shuffle(SPY_POOL[l]).slice(0, 16);
      const idx = shuffle(words.map((_, i) => i));
      g.phase = "clue";
      g.m = { lang: l, words, targets: { [players[0]]: idx.slice(0, 3), [players[1]]: idx.slice(3, 6) }, found: [], wrong: [], misses: 0, giver: players[1], clue: null, log: [] };
      g.deadline = start + 5 * 60_000;
      break;
    }
    case "odd":
      g.rounds = 6;
      g.phase = "make";
      g.m = { maker: players[0], set: null, tries: 0, picked: [], linkPick: null };
      break;
    case "scramble":
      g.rounds = 3;
      g.m = scrambleRound(g, 0);
      g.deadline = start + 60_000;
      break;
    case "emoji":
      g.rounds = 6;
      g.m = { order: shuffle(RIDDLES.map((_, i) => i)).slice(0, 6), describer: players[0], emoji: [], guesses: [], solved: false, total: 0, history: [] };
      g.deadline = start + 90_000;
      break;
  }
  return g;
}

const openFor = (word: string) => word.split("").map((_, j) => j === 0);

function pairRound(g: WordGame, round: number) {
  const [a, b] = g.players;
  const firstBy = round % 2 === 0 ? a : b;
  const lastBy = firstBy === a ? b : a;
  return { firstBy, lastBy, first: null as string | null, last: null as string | null, note: "", answers: {} as Record<string, { word: string; at: number; pts: number }>, examples: [] as string[] };
}

function scrambleRound(g: WordGame, round: number) {
  const l = pickLang(g.lang);
  const used = new Set<string>(g.m?.usedWords ?? []);
  const pool = SCRAMBLES[l].filter((s) => !used.has(s.word));
  const puzzle = shuffle(pool.length ? pool : SCRAMBLES[l])[0];
  let letters = shuffle(puzzle.word.split(""));
  if (letters.join("") === puzzle.word) letters = letters.reverse();
  return { lang: l, word: puzzle.word, bonus: puzzle.bonus, letters, found: Object.fromEntries(g.players.map((p) => [p, []])), usedWords: [...used, puzzle.word], round };
}

// ---------- Lobby ----------
export const create = mutation({
  args: { token: v.string(), mode: v.optional(wordMode), lang: v.optional(wordLang) },
  handler: async (ctx, { token, mode, lang }) => {
    const me = await requirePlayer(ctx, token);
    const code = await freeCode(ctx);
    await ctx.db.insert("wordRooms", { code, hostId: me._id, mode: mode ?? "chain", lang: lang ?? "en", status: "lobby", gameNo: 0, members: [{ playerId: me._id, seat: 0, lastSeen: Date.now() }] });
    return code;
  },
});

export const join = mutation({
  args: { token: v.string(), code: v.string() },
  handler: async (ctx, { token, code }) => {
    const me = await requirePlayer(ctx, token);
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
  args: { token: v.string(), code: v.string(), mode: v.optional(wordMode), lang: v.optional(wordLang) },
  handler: async (ctx, a) => {
    const me = await requirePlayer(ctx, a.token);
    const room = await requireRoom(ctx, a.code);
    if (room.hostId !== me._id) throw new ConvexError("Only the host can change this");
    if (room.status === "playing") return;
    await ctx.db.patch(room._id, { ...(a.mode ? { mode: a.mode } : {}), ...(a.lang ? { lang: a.lang } : {}) });
  },
});

export const start = mutation({
  args: { token: v.string(), code: v.string() },
  handler: async (ctx, { token, code }) => {
    const me = await requirePlayer(ctx, token);
    const room = await requireRoom(ctx, code);
    if (room.hostId !== me._id) throw new ConvexError("Only the host can start");
    if (room.status === "playing") return;
    if (room.members.length < 2) throw new ConvexError("Waiting for a friend to join");
    const max = room.mode === "scramble" ? 4 : 2;
    const players = [...room.members].sort((a, b) => a.seat - b.seat).slice(0, max).map((m) => m.playerId);
    if (room.gameNo % 2 === 1 && max === 2) players.reverse(); // take turns going first
    const now = Date.now();
    const game = setup(room.mode, room.lang, players, now);
    for (let i = 0; i < players.length; i++) for (let j = i + 1; j < players.length; j++) await befriend(ctx, players[i], players[j]);
    const fresh = { ...room, gameNo: room.gameNo + 1, status: "playing" as const, startAt: now + COUNTDOWN_MS, endedAt: undefined };
    await ctx.db.patch(room._id, { gameNo: fresh.gameNo, status: "playing", startAt: fresh.startAt, endedAt: undefined });
    await commit(ctx, fresh, game);
  },
});

export const rematch = mutation({
  args: { token: v.string(), code: v.string() },
  handler: async (ctx, { token, code }) => {
    const me = await requirePlayer(ctx, token);
    const room = await requireRoom(ctx, code);
    if (room.hostId !== me._id) throw new ConvexError("Only the host can start a rematch");
    await ctx.db.patch(room._id, { status: "lobby", game: undefined, startAt: undefined, endedAt: undefined });
  },
});

export const leave = mutation({
  args: { token: v.string(), code: v.string() },
  handler: async (ctx, { token, code }) => {
    const me = await requirePlayer(ctx, token);
    const room = await roomByCode(ctx, code);
    if (!room || !room.members.some((m) => m.playerId === me._id)) return;
    const rest = room.members.filter((m) => m.playerId !== me._id);
    const patch: Partial<Room> = { members: rest };
    if (rest.length === 0) { patch.status = "finished"; patch.endedAt = Date.now(); }
    else if (room.hostId === me._id) patch.hostId = rest[0].playerId;
    await ctx.db.patch(room._id, patch);
    const g = room.game as WordGame | undefined;
    if (room.status === "playing" && g && !g.done && g.players.includes(me._id) && rest.length > 0) {
      const fresh = (await ctx.db.get(room._id))!;
      g.phase = "done";
      g.deadline = undefined;
      g.done = { winners: g.players.filter((p) => p !== me._id), text: "left" };
      await commit(ctx, fresh, g);
    }
  },
});

export const presence = mutation({
  args: { token: v.string(), code: v.string() },
  handler: async (ctx, { token, code }) => {
    const me = await findPlayer(ctx, token);
    const room = await roomByCode(ctx, code);
    if (!me || !room || !room.members.some((m) => m.playerId === me._id)) return;
    await ctx.db.patch(room._id, { members: room.members.map((m) => (m.playerId === me._id ? { ...m, lastSeen: Date.now() } : m)) });
  },
});

// ---------- Playing: one entry point for every mode ----------
export const act = mutation({
  args: { token: v.string(), code: v.string(), action: v.string(), text: v.optional(v.string()), n: v.optional(v.number()), list: v.optional(v.array(v.string())) },
  handler: async (ctx, a) => {
    const me = await requirePlayer(ctx, a.token);
    const room = await requireRoom(ctx, a.code);
    if (room.status !== "playing" || !room.game) throw new ConvexError("The game isn't running");
    const g = room.game as WordGame;
    if (g.done) throw new ConvexError("The game is over");
    if (!g.players.includes(me._id)) throw new ConvexError("You're watching this game");
    if (room.startAt && Date.now() < room.startAt - 200) throw new ConvexError("Wait for the countdown");
    const res = handle(g, me._id, a.action, { text: a.text ?? "", n: a.n ?? 0, list: a.list ?? [] }, Date.now());
    await commit(ctx, room, g);
    return res ?? { ok: true };
  },
});

export const tick = internalMutation({
  args: { roomId: v.id("wordRooms"), gameNo: v.number(), deadline: v.number() },
  handler: async (ctx, { roomId, gameNo, deadline }) => {
    const room = await ctx.db.get(roomId);
    if (!room || room.status !== "playing" || room.gameNo !== gameNo || !room.game) return;
    const g = room.game as WordGame;
    if (g.done || g.deadline !== deadline) return;
    onDeadline(g, Date.now());
    await commit(ctx, room, g);
  },
});

type Input = { text: string; n: number; list: string[] };
const fail = (msg: string): never => { throw new ConvexError(msg); };

function handle(g: WordGame, me: PId, action: string, x: Input, now: number): unknown {
  switch (g.mode) {
    case "chain": return chain(g, me, action, x);
    case "hangman": return hangman(g, me, action, x);
    case "pair": return pair(g, me, action, x, now);
    case "chemistry": return chemistry(g, me, action, x, now);
    case "dontsay": return dontsay(g, me, action, x, now);
    case "guess": return guessWord(g, me, action, x);
    case "spy": return spy(g, me, action, x);
    case "odd": return odd(g, me, action, x);
    case "scramble": return scramble(g, me, action, x);
    case "emoji": return emoji(g, me, action, x, now);
  }
}

function onDeadline(g: WordGame, now: number) {
  switch (g.mode) {
    case "pair":
      if (g.phase === "race") revealPair(g, now);
      else if (g.phase === "reveal") nextPair(g);
      break;
    case "chemistry":
      if (g.phase === "answer") revealChem(g, now);
      else nextChem(g, now);
      break;
    case "dontsay":
      if (g.phase === "answer") revealDont(g, now);
      else nextDont(g, now);
      break;
    case "spy":
      g.phase = "done";
      g.done = { winners: [], text: "time", coop: true, success: false };
      break;
    case "scramble":
      if (g.phase === "play") { g.phase = "reveal"; g.deadline = now + 6000; }
      else nextScramble(g, now);
      break;
    case "emoji":
      if (g.phase === "play") revealEmoji(g, now, false);
      else nextEmoji(g, now);
      break;
  }
}

// ---------- Word Chain ----------
const CHAIN_MIN = 2, CHAIN_MAX = 10;
function chainSetup(g: WordGame, me: PId, action: string, x: Input) {
  const m = g.m;
  if (m.picks[me]) fail("You're all set. Waiting for your friend");
  if (action === "ready") m.picks[me] = "ready";
  else if (action === "custom") {
    const words = x.list.slice(0, 5).map((w) => norm(w).replace(/ /g, ""));
    if (words.length !== 5 || words.some((w) => !w)) fail("Fill in all five words");
    if (words.some((w) => w.length < CHAIN_MIN || w.length > CHAIN_MAX)) fail(`Each word needs ${CHAIN_MIN} to ${CHAIN_MAX} letters`);
    if (new Set(words).size !== 5) fail("Use five different words");
    m.picks[me] = words;
  } else fail("Unknown move");
  if (!g.players.every((p) => m.picks[p])) return;

  // Each player gets a board: the chain their friend made for them (or a ready-made one).
  const used = new Set<string>();
  const boards: Record<string, any> = {};
  for (const p of g.players) {
    const friend = other(g, p);
    const pick = m.picks[friend];
    let words: string[], lang: Lang, maker: PId | null;
    if (Array.isArray(pick)) {
      words = pick; lang = g.lang === "id" ? "id" : "en"; maker = friend;
    } else {
      lang = pickLang(g.lang);
      const pool = CHAINS[lang].filter((c) => !used.has(c.join()));
      words = shuffle(pool.length ? pool : CHAINS[lang])[0];
      maker = null;
    }
    used.add(words.join());
    boards[p] = { words, lang, maker, wi: 1, open: openFor(words[1]), solved: ["given"], done: false };
  }
  g.m = { boards, turn: g.players[0], event: null };
  g.phase = "play";
}

/**
 * Both chains run at once. A right guess keeps your turn; a wrong guess or
 * opening a letter hands the turn to your friend, who guesses on their chain.
 */
function chain(g: WordGame, me: PId, action: string, x: Input) {
  if (g.phase === "setup") return chainSetup(g, me, action, x);
  const m = g.m;
  if (m.turn !== me) fail("It's your friend's turn");
  const b = m.boards[me];
  if (b.done) fail("Your chain is finished");
  const word: string = b.words[b.wi];
  const giveUp = () => {
    const j = b.open.indexOf(false);
    if (j >= 0) b.open[j] = true;
    if (!b.open.includes(false)) { b.solved[b.wi] = "nobody"; m.event = { type: "nobody", by: me, word }; advanceBoard(b); }
  };
  let result: { correct: boolean; points?: number } = { correct: false };
  let keepTurn = false;
  if (action === "guess") {
    if (norm(x.text).replace(/ /g, "") === word) {
      const pts = Math.max(1, b.open.filter((o: boolean) => !o).length);
      g.scores[me] += pts;
      if (b.maker) g.scores[b.maker] += 1; // a fair chain earns its writer a point
      b.solved[b.wi] = me;
      m.event = { type: "solved", by: me, word, pts };
      result = { correct: true, points: pts };
      advanceBoard(b);
      keepTurn = true;
    } else {
      m.event = { type: "miss", by: me, guess: norm(x.text).slice(0, 14) };
      giveUp();
    }
  } else if (action === "pass") {
    m.event = { type: "pass", by: me };
    giveUp();
  } else fail("Unknown move");

  const friend = other(g, me);
  if (b.done && m.boards[friend].done) { finishByScore(g); return result; }
  // Hand over on a miss, or when my chain is done; stay if my friend has nothing left.
  if ((!keepTurn || b.done) && !m.boards[friend].done) m.turn = friend;
  return result;
}
function advanceBoard(b: any) {
  b.wi += 1;
  if (b.wi >= b.words.length) { b.done = true; return; }
  b.open = openFor(b.words[b.wi]);
}

// ---------- Hangman Duel & Guess My Word: secret words ----------
function setSecret(g: WordGame, me: PId, x: Input, min: number, max: number) {
  if (g.phase !== "setup") fail("Secret words are already set");
  const w = norm(x.text).replace(/ /g, "");
  if (w.length < min || w.length > max) fail(`Use a word with ${min} to ${max} letters`);
  if (!isWord(w, g.lang)) fail(`${w.toUpperCase()} isn't in our word list. Try another word`);
  const m = g.m;
  m.secrets[me] = w;
  if (x.list[0]) m.hints[me] = x.list[0].slice(0, 20);
  if (g.players.every((p) => m.secrets[p])) {
    g.phase = "play";
    for (const p of g.players) { m.found[p] = []; m.wrong[p] = []; m.lives[p] = 6; }
  }
}

function hangman(g: WordGame, me: PId, action: string, x: Input) {
  const m = g.m;
  if (action === "secret") return setSecret(g, me, x, 4, 10);
  if (g.phase !== "play") fail("Wait for both secret words");
  if (m.lives[me] <= 0) fail("You're out of balloons");
  const target: string = m.secrets[other(g, me)];
  if (action === "letter") {
    const l = norm(x.text).slice(0, 1);
    if (!l) fail("Pick a letter");
    if (m.found[me].includes(l) || m.wrong[me].includes(l)) fail("You tried that letter");
    if (target.includes(l)) {
      m.found[me].push(l);
      if ([...target].every((c) => m.found[me].includes(c))) return crack(g, me);
      return { hit: true };
    }
    m.wrong[me].push(l);
    m.lives[me] -= 1;
  } else if (action === "word") {
    if (norm(x.text).replace(/ /g, "") === target) { m.found[me] = [...new Set(target)]; return crack(g, me); }
    m.lives[me] -= 1;
  } else fail("Unknown move");
  if (g.players.every((p) => m.lives[p] <= 0)) { g.phase = "done"; g.done = { winners: [], text: "draw" }; }
  return { hit: false };
}
function crack(g: WordGame, me: PId) {
  g.scores[me] = 1;
  g.phase = "done";
  g.done = { winners: [me], text: "cracked" };
  return { hit: true, cracked: true };
}

function guessWord(g: WordGame, me: PId, action: string, x: Input) {
  const m = g.m;
  if (action === "secret") return setSecret(g, me, x, 4, 8);
  if (g.phase !== "play") fail("Wait for both secret words");
  if (m.turn !== me) fail("It's your friend's turn");
  if (action === "ask") {
    const l = norm(x.text).slice(0, 1);
    if (!l) fail("Pick a letter");
    if (m.asked.some((q: any) => q.letter === l)) fail("Someone already asked about that letter");
    m.asked.push({ letter: l, by: me });
    m.log.unshift({ type: "ask", by: me, letter: l });
  } else if (action === "word") {
    const w = norm(x.text).replace(/ /g, "");
    const ok = w === m.secrets[other(g, me)];
    m.log.unshift({ type: "guess", by: me, word: w, ok });
    if (ok) { g.scores[me] = 1; g.phase = "done"; g.done = { winners: [me], text: "guessed" }; return { ok }; }
  } else fail("Unknown move");
  m.turn = other(g, me);
  m.log = m.log.slice(0, 8);
  return action === "word" ? { ok: false } : undefined;
}

// ---------- Letter Pair ----------
function pair(g: WordGame, me: PId, action: string, x: Input, now: number) {
  const m = g.m;
  if (action === "pick") {
    if (g.phase !== "pick") fail("Letters are already picked");
    const l = norm(x.text).slice(0, 1);
    if (!l) fail("Pick a letter");
    if (me === m.firstBy && !m.first) m.first = l;
    else if (me === m.lastBy && !m.last) m.last = l;
    else fail("You already picked");
    if (m.first && m.last) {
      let words = pairWords(m.first, m.last, g.lang);
      if (words.length < 2) {
        const options = shuffle(ALPHA.split("")).filter((b) => pairWords(m.first, b, g.lang, 5).length >= 3);
        const was = m.last;
        m.last = options[0] ?? "e";
        m.note = `No ${g.lang === "id" ? "kata" : "words"} fit ${m.first.toUpperCase()}…${was.toUpperCase()}, so the end letter is now ${m.last.toUpperCase()}`;
        words = pairWords(m.first, m.last, g.lang);
      }
      const pool = pairExamples(m.first, m.last, g.lang);
      const short = pool.filter((w) => w.length <= 6);
      m.examples = shuffle(short.length >= 4 ? short : pool).slice(0, 8);
      if (words.length === 0) m.examples = [];
      g.phase = "race";
      g.deadline = now + 20_000 + 1500;
    }
    return;
  }
  if (action === "word") {
    if (g.phase !== "race") fail("Not yet");
    if (m.answers[me]) fail("You already scored this round");
    const w = norm(x.text).replace(/ /g, "");
    if (w[0] !== m.first || w[w.length - 1] !== m.last) fail(`It has to start with ${m.first.toUpperCase()} and end with ${m.last.toUpperCase()}`);
    if (w.length < 3) fail("At least 3 letters");
    if (!isWord(w, g.lang)) fail(`${w.toUpperCase()} isn't in our word list`);
    const firstOne = Object.keys(m.answers).length === 0;
    const pts = firstOne ? 3 : 1;
    m.answers[me] = { word: w, at: now, pts };
    g.scores[me] += pts;
    if (g.players.every((p) => m.answers[p])) revealPair(g, now);
    return { pts };
  }
  fail("Unknown move");
}
function revealPair(g: WordGame, now: number) { g.phase = "reveal"; g.deadline = now + 5000; }
function nextPair(g: WordGame) {
  if (g.round + 1 >= g.rounds) return finishByScore(g);
  g.round += 1;
  g.phase = "pick";
  g.deadline = undefined;
  g.m = pairRound(g, g.round);
}

// ---------- Chemistry ----------
function chemistry(g: WordGame, me: PId, action: string, x: Input, now: number) {
  const m = g.m;
  if (action === "answer") {
    if (g.phase !== "answer") fail("Wait for the next prompt");
    const t = norm(x.text);
    if (!t) fail("Type a word");
    m.answers[me] = t.slice(0, 24);
    if (g.players.every((p) => m.answers[p])) revealChem(g, now);
    return;
  }
  if (action === "next") { if (g.phase === "reveal") nextChem(g, now); return; }
  fail("Unknown move");
}
function revealChem(g: WordGame, now: number) {
  const m = g.m;
  const p = PROMPTS[m.order[g.round]];
  const [a, b] = g.players.map((id) => m.answers[id] ?? "");
  const match = sameAnswer(p, a, b);
  if (match) { m.matches += 1; for (const id of g.players) g.scores[id] += 2; }
  m.history.unshift({ prompt: m.order[g.round], answers: { ...m.answers }, match });
  g.phase = "reveal";
  g.deadline = now + 6000;
}
function nextChem(g: WordGame, now: number) {
  const m = g.m;
  if (g.round + 1 >= g.rounds) {
    g.phase = "done";
    g.deadline = undefined;
    g.done = { winners: g.players, text: `${m.matches} of ${g.rounds}`, coop: true, success: m.matches >= g.rounds / 2 };
    return;
  }
  g.round += 1;
  m.answers = {};
  g.phase = "answer";
  g.deadline = now + 25_000;
}

// ---------- Don't Say It ----------
function dontsay(g: WordGame, me: PId, action: string, x: Input, now: number) {
  const m = g.m;
  if (action === "answer") {
    if (g.phase !== "answer") fail("Wait for the next category");
    const t = norm(x.text);
    if (!t) fail("Type an answer");
    m.answers[me] = t.slice(0, 24);
    if (g.players.every((p) => m.answers[p])) revealDont(g, now);
    return;
  }
  if (action === "next") { if (g.phase === "reveal") nextDont(g, now); return; }
  fail("Unknown move");
}
function revealDont(g: WordGame, now: number) {
  const m = g.m;
  const c = CATEGORIES[m.order[g.round]];
  m.verdict = {};
  for (const p of g.players) {
    const a: string = m.answers[p] ?? "";
    let why = "";
    if (!a) why = "time";
    else if (c.ban.includes(a)) why = "banned";
    else if (m.used[p].includes(a)) why = "repeat";
    else if (!c.answers.includes(a)) why = "wrong";
    const ok = !why;
    if (ok) { m.used[p].push(a); g.scores[p] += 1; } else m.hearts[p] -= 1;
    m.verdict[p] = { ok, why };
  }
  m.history.unshift({ cat: m.order[g.round], answers: { ...m.answers }, verdict: { ...m.verdict } });
  g.phase = "reveal";
  g.deadline = now + 6000;
  const alive = g.players.filter((p) => m.hearts[p] > 0);
  if (alive.length < g.players.length || g.round + 1 >= g.rounds) {
    g.deadline = now + 6000;
    m.ending = true;
  }
}
function nextDont(g: WordGame, now: number) {
  const m = g.m;
  if (m.ending) {
    const best = Math.max(...g.players.map((p) => m.hearts[p]));
    const winners = g.players.filter((p) => m.hearts[p] === best);
    g.phase = "done";
    g.deadline = undefined;
    g.done = { winners: winners.length === g.players.length ? [] : winners, text: winners.length === g.players.length ? "draw" : "survived" };
    return;
  }
  g.round += 1;
  m.answers = {};
  m.verdict = {};
  g.phase = "answer";
  g.deadline = now + 15_000;
}

// ---------- Spy Word ----------
function spy(g: WordGame, me: PId, action: string, x: Input) {
  const m = g.m;
  const guesser = other(g, m.giver);
  if (action === "clue") {
    if (me !== m.giver || g.phase !== "clue") fail("It's not your turn to give a clue");
    const w = norm(x.text).replace(/ /g, "");
    if (!w || w.length > 16) fail("Use one word");
    if (m.words.includes(w)) fail("Your clue can't be a word on the board");
    const left = m.targets[guesser].filter((i: number) => !m.found.includes(i)).length;
    const n = Math.max(1, Math.min(left, Math.round(x.n)));
    m.clue = { word: w, n, left: n };
    m.log.unshift({ type: "clue", by: me, word: w, n });
    g.phase = "guess";
    return;
  }
  if (action === "tap") {
    if (me !== guesser || g.phase !== "guess") fail("Wait for a clue");
    const i = Math.round(x.n);
    if (i < 0 || i >= m.words.length || m.found.includes(i) || m.wrong.includes(i)) fail("Pick another word");
    if (m.targets[guesser].includes(i)) {
      m.found.push(i);
      m.clue.left -= 1;
      if (m.found.length >= 6) { g.phase = "done"; g.deadline = undefined; g.done = { winners: g.players, text: "found", coop: true, success: true }; return { hit: true }; }
      if (m.clue.left <= 0 || m.targets[guesser].every((t: number) => m.found.includes(t))) swapSpy(g);
      return { hit: true };
    }
    m.wrong.push(i);
    m.misses += 1;
    if (m.misses >= 3) { g.phase = "done"; g.deadline = undefined; g.done = { winners: [], text: "misses", coop: true, success: false }; return { hit: false }; }
    swapSpy(g);
    return { hit: false };
  }
  if (action === "end") { if (me === guesser && g.phase === "guess") swapSpy(g); return; }
  fail("Unknown move");
}
function swapSpy(g: WordGame) {
  const m = g.m;
  const next = other(g, m.giver);
  // Skip a giver whose partner has nothing left to find.
  const partnerOf = (giver: PId) => other(g, giver);
  const hasLeft = (giver: PId) => m.targets[partnerOf(giver)].some((i: number) => !m.found.includes(i));
  m.giver = hasLeft(next) ? next : m.giver;
  m.clue = null;
  g.phase = "clue";
}

// ---------- Odd One Out ----------
function odd(g: WordGame, me: PId, action: string, x: Input) {
  const m = g.m;
  const guesser = other(g, m.maker);
  if (action === "ready" || action === "custom") {
    if (me !== m.maker || g.phase !== "make") fail("It's your friend's turn to make a set");
    let words: string[], oddIdx: number, link: string, lang: Lang;
    if (action === "ready") {
      lang = pickLang(g.lang);
      const used = new Set<string>(m.usedSets ?? []);
      const pool = ODD_SETS[lang].filter((s) => !used.has(s.link));
      const s = shuffle(pool.length ? pool : ODD_SETS[lang])[0];
      m.usedSets = [...used, s.link];
      words = s.words; oddIdx = s.odd; link = s.link;
    } else {
      lang = g.lang === "id" ? "id" : "en";
      words = x.list.slice(0, 4).map((w) => norm(w).slice(0, 16));
      if (words.length !== 4 || words.some((w) => !w)) fail("Fill in all four words");
      if (new Set(words).size !== 4) fail("Use four different words");
      oddIdx = Math.round(x.n);
      if (oddIdx < 0 || oddIdx > 3) fail("Mark the odd one");
      link = x.text.trim().slice(0, 40);
      if (!link) fail("Write what links the other three");
    }
    const order = shuffle([0, 1, 2, 3]);
    const decoys = shuffle(ODD_DECOYS[lang].filter((d) => norm(d) !== norm(link))).slice(0, 2);
    const options = shuffle([link, ...decoys]);
    m.set = { words: order.map((i) => words[i]), odd: order.indexOf(oddIdx), link, options, linkIdx: options.indexOf(link) };
    m.tries = 0; m.picked = []; m.linkPick = null; m.pts = 0;
    g.phase = "guess";
    return;
  }
  if (action === "tap") {
    if (me !== guesser || g.phase !== "guess") fail("Wait for the set");
    const i = Math.round(x.n);
    if (m.picked.includes(i)) return;
    m.picked.push(i);
    if (i === m.set.odd) {
      m.pts = m.tries === 0 ? 2 : 1;
      if (m.tries === 0) g.scores[m.maker] += 1; // a good, fair set
      g.phase = "link";
      return { hit: true };
    }
    m.tries += 1;
    if (m.tries >= 2) { m.pts = 0; g.phase = "link"; }
    return { hit: false };
  }
  if (action === "link") {
    if (me !== guesser || g.phase !== "link") fail("Not yet");
    m.linkPick = Math.round(x.n);
    if (m.linkPick === m.set.linkIdx) m.pts += 2;
    g.scores[guesser] += m.pts;
    g.phase = "reveal";
    return { right: m.linkPick === m.set.linkIdx };
  }
  if (action === "next") {
    if (g.phase !== "reveal") return;
    if (g.round + 1 >= g.rounds) return finishByScore(g);
    g.round += 1;
    m.maker = guesser;
    m.set = null;
    g.phase = "make";
    return;
  }
  fail("Unknown move");
}

// ---------- Scrambled Sprint ----------
function scramble(g: WordGame, me: PId, action: string, x: Input) {
  const m = g.m;
  if (action !== "word") fail("Unknown move");
  if (g.phase !== "play") fail("Time's up for this word");
  const w = norm(x.text).replace(/ /g, "");
  if (w.length < 3) fail("At least 3 letters");
  const pool = m.word.split("");
  for (const ch of w) { const k = pool.indexOf(ch); if (k < 0) fail("Use only the letters you have"); pool.splice(k, 1); }
  if (m.found[me].some((f: any) => f.w === w)) fail(`You already found ${w.toUpperCase()}`);
  let pts = 0;
  if (w === m.word || m.bonus.includes(w)) pts = scramblePoints(w, m.word);
  else if (w.length >= 4 && isWord(w, m.lang)) pts = 1;
  else fail(`${w.toUpperCase()} isn't in our word list`);
  m.found[me].push({ w, pts });
  g.scores[me] += pts;
  return { pts, main: w === m.word };
}
function nextScramble(g: WordGame, now: number) {
  if (g.round + 1 >= g.rounds) return finishByScore(g);
  g.round += 1;
  g.m = scrambleRound(g, g.round);
  g.phase = "play";
  g.deadline = now + 60_000;
}

// ---------- Emoji Riddle ----------
const ALL_EMOJI = new Set(EMOJI.flatMap((e) => e.list));
function emoji(g: WordGame, me: PId, action: string, x: Input, now: number) {
  const m = g.m;
  const guesser = other(g, m.describer);
  if (action === "emoji") {
    if (me !== m.describer || g.phase !== "play") fail("Your friend is describing this one");
    if (!ALL_EMOJI.has(x.text)) fail("Pick an emoji from the list");
    if (RIDDLES[m.order[g.round]].ban.includes(x.text)) fail("Too easy! That emoji is banned for this word");
    if (m.emoji.length >= 8) fail("That's the most emoji you can use");
    m.emoji.push(x.text);
    return;
  }
  if (action === "undo") { if (me === m.describer && g.phase === "play") m.emoji.pop(); return; }
  if (action === "guess") {
    if (me !== guesser || g.phase !== "play") fail("Wait for the emoji");
    if (m.emoji.length === 0) fail("Wait for at least one emoji");
    const r = RIDDLES[m.order[g.round]];
    const ok = riddleAccepts(r, x.text);
    m.guesses.unshift({ text: norm(x.text).slice(0, 24), ok });
    m.guesses = m.guesses.slice(0, 6);
    if (ok) revealEmoji(g, now, true);
    return { ok };
  }
  if (action === "skip") { if (g.phase === "play") revealEmoji(g, now, false); return; }
  if (action === "next") { if (g.phase === "reveal") nextEmoji(g, now); return; }
  fail("Unknown move");
}
function revealEmoji(g: WordGame, now: number, solved: boolean) {
  const m = g.m;
  const pts = solved ? Math.max(1, 5 - m.emoji.length) : 0;
  m.solved = solved;
  m.pts = pts;
  m.total += pts;
  for (const p of g.players) g.scores[p] += pts;
  m.history.unshift({ riddle: m.order[g.round], emoji: [...m.emoji], solved, pts });
  g.phase = "reveal";
  g.deadline = now + 7000;
}
function nextEmoji(g: WordGame, now: number) {
  const m = g.m;
  if (g.round + 1 >= g.rounds) {
    g.phase = "done";
    g.deadline = undefined;
    g.done = { winners: g.players, text: `${m.total}`, coop: true, success: m.total >= 9 };
    return;
  }
  g.round += 1;
  m.describer = other(g, m.describer);
  m.emoji = [];
  m.guesses = [];
  m.solved = false;
  g.phase = "play";
  g.deadline = now + 90_000;
}
