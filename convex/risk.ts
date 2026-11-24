import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { addXp, befriend, findPlayer, freeCode, requirePlayer } from "./lib/helpers";
import { TERRITORIES, type TerritoryId } from "./lib/risk/map";
import {
  BOT_IDS,
  MODE_CHOICES,
  RISK_MAX,
  attack,
  deploy,
  endTurn,
  fortify,
  isBot,
  leaveGame,
  newGame,
  occupy,
  onDeadline,
  toFortify,
  tradeCards,
  type RiskGame,
  type RiskMode,
  type Seat,
} from "./lib/risk/rules";

type Room = Doc<"riskRooms">;

const COUNTDOWN_MS = 2800;

function requireTerritory(id: string): TerritoryId {
  if (!(id in TERRITORIES)) throw new ConvexError("Unknown territory");
  return id as TerritoryId;
}

async function roomByCode(ctx: QueryCtx, code: string) {
  return await ctx.db
    .query("riskRooms")
    .withIndex("by_code", (q) => q.eq("code", code.trim().toUpperCase()))
    .order("desc")
    .first();
}

async function requireRoom(ctx: QueryCtx, code: string) {
  const r = await roomByCode(ctx, code);
  if (!r) throw new ConvexError("Room not found");
  return r;
}

async function commit(ctx: MutationCtx, room: Room, g: RiskGame) {
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
    await ctx.scheduler.runAfter(Math.max(0, g.deadline! - Date.now()) + 80, internal.risk.tick, {
      roomId: room._id,
      gameNo: room.gameNo,
      deadline: g.deadline!,
    });
  }
}

async function award(ctx: MutationCtx, g: RiskGame) {
  const vsBots = g.players.some(isBot);
  for (const p of g.players) {
    if (isBot(p)) continue;
    const id = p as Id<"players">;
    const won = g.done?.winners.includes(p);
    if (vsBots) await addXp(ctx, id, won ? 25 : 8);
    else if (won) await addXp(ctx, id, 35, { win: true });
    else await addXp(ctx, id, 12);
  }
}

// ---------- Lobby ----------
export const create = mutation({
  args: {},
  handler: async (ctx) => {
    const me = await requirePlayer(ctx);
    const code = await freeCode(ctx);
    await ctx.db.insert("riskRooms", {
      code,
      hostId: me._id,
      mode: "blitz",
      bots: 2,
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
    if (room.members.length >= RISK_MAX) throw new ConvexError("This room is full");
    const taken = new Set(room.members.map((m) => m.seat));
    let seat = 0;
    while (taken.has(seat)) seat++;
    await ctx.db.patch(room._id, {
      members: [...room.members, { playerId: me._id, seat, lastSeen: Date.now() }],
    });
    return room.code;
  },
});

export const settings = mutation({
  args: {
    code: v.string(),
    mode: v.optional(v.union(v.literal("blitz"), v.literal("domination"))),
    bots: v.optional(v.number()),
  },
  handler: async (ctx, { code, mode, bots }) => {
    const me = await requirePlayer(ctx);
    const room = await requireRoom(ctx, code);
    if (room.hostId !== me._id) throw new ConvexError("Only the host can change this");
    if (room.status === "playing") return;
    const patch: Partial<Room> = {};
    if (mode !== undefined) {
      if (!(MODE_CHOICES as readonly string[]).includes(mode)) throw new ConvexError("Invalid mode");
      patch.mode = mode;
    }
    if (bots !== undefined) {
      if (!Number.isInteger(bots) || bots < 0 || bots > BOT_IDS.length) throw new ConvexError("Invalid bot count");
      patch.bots = bots;
    }
    if (Object.keys(patch).length) await ctx.db.patch(room._id, patch);
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
    const maxBots = Math.min(BOT_IDS.length, RISK_MAX - humans.length);
    const botCount = Math.max(humans.length === 1 ? 1 : 0, Math.min(room.bots, maxBots));
    const seated: Seat[] = [...humans, ...BOT_IDS.slice(0, botCount)];
    if (seated.length < 2) throw new ConvexError("Need at least 2 players or bots");
    for (let i = 0; i < humans.length; i++) {
      for (let j = i + 1; j < humans.length; j++) await befriend(ctx, humans[i], humans[j]);
    }
    const k = room.gameNo % seated.length;
    const players = [...seated.slice(k), ...seated.slice(0, k)];
    const now = Date.now();
    const fresh: Room = {
      ...room,
      gameNo: room.gameNo + 1,
      status: "playing",
      startAt: now + COUNTDOWN_MS,
      endedAt: undefined,
    };
    await ctx.db.patch(room._id, {
      gameNo: fresh.gameNo,
      status: "playing",
      startAt: fresh.startAt,
      endedAt: undefined,
    });
    await commit(ctx, fresh, newGame(players, room.mode as RiskMode, now, COUNTDOWN_MS, Math.random));
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
    if (rest.length === 0) {
      patch.status = "finished";
      patch.endedAt = Date.now();
    } else if (room.hostId === me._id) {
      patch.hostId = rest[0].playerId;
    }
    await ctx.db.patch(room._id, patch);
    const g = room.game as RiskGame | undefined;
    if (room.status !== "playing" || !g || g.done || !g.players.includes(me._id) || g.out.includes(me._id)) return;
    const fresh = (await ctx.db.get(room._id))!;
    leaveGame(g, me._id, Math.random, Date.now());
    await commit(ctx, fresh, g);
  },
});

export const presence = mutation({
  args: { code: v.string() },
  handler: async (ctx, { code }) => {
    const me = await findPlayer(ctx);
    const room = await roomByCode(ctx, code);
    if (!me || !room || !room.members.some((m) => m.playerId === me._id)) return;
    await ctx.db.patch(room._id, {
      members: room.members.map((m) => (m.playerId === me._id ? { ...m, lastSeen: Date.now() } : m)),
    });
  },
});

// ---------- Playing ----------
export const act = mutation({
  args: {
    code: v.string(),
    move: v.union(
      v.object({ kind: v.literal("deploy"), to: v.string(), count: v.number() }),
      v.object({ kind: v.literal("trade"), cardIds: v.array(v.number()) }),
      v.object({ kind: v.literal("attack"), from: v.string(), to: v.string(), blitz: v.boolean() }),
      v.object({ kind: v.literal("occupy"), count: v.number() }),
      v.object({ kind: v.literal("toFortify") }),
      v.object({ kind: v.literal("fortify"), from: v.string(), to: v.string(), count: v.number() }),
      v.object({ kind: v.literal("endTurn") }),
    ),
  },
  handler: async (ctx, { code, move }) => {
    const me = await requirePlayer(ctx);
    const room = await requireRoom(ctx, code);
    if (room.status !== "playing" || !room.game) throw new ConvexError("The game isn't running");
    const g = room.game as RiskGame;
    if (g.done) throw new ConvexError("The game is over");
    if (!g.players.includes(me._id) || g.out.includes(me._id)) throw new ConvexError("You're watching this game");
    const now = Date.now();
    if (room.startAt && now < room.startAt - 200) throw new ConvexError("Wait for the countdown");
    if (g.turn !== me._id) throw new ConvexError("It's not your turn");

    try {
      if (move.kind === "deploy") {
        deploy(g, requireTerritory(move.to), move.count, now);
      } else if (move.kind === "trade") {
        tradeCards(g, move.cardIds, now);
      } else if (move.kind === "attack") {
        attack(g, requireTerritory(move.from), requireTerritory(move.to), move.blitz, Math.random, now);
      } else if (move.kind === "occupy") {
        occupy(g, move.count, now);
      } else if (move.kind === "toFortify") {
        toFortify(g, now);
      } else if (move.kind === "fortify") {
        fortify(g, requireTerritory(move.from), requireTerritory(move.to), move.count, Math.random, now);
      } else if (move.kind === "endTurn") {
        endTurn(g, Math.random, now);
      }
    } catch (err) {
      throw new ConvexError(err instanceof Error ? err.message : "Invalid move");
    }

    await commit(ctx, room, g);
  },
});

export const tick = internalMutation({
  args: { roomId: v.id("riskRooms"), gameNo: v.number(), deadline: v.number() },
  handler: async (ctx, { roomId, gameNo, deadline }) => {
    const room = await ctx.db.get(roomId);
    if (!room || room.status !== "playing" || room.gameNo !== gameNo || !room.game) return;
    const g = room.game as RiskGame;
    if (g.done || g.deadline !== deadline) return;
    onDeadline(g, Math.random, Date.now());
    await commit(ctx, room, g);
  },
});

// ---------- Client View ----------
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
          return {
            id: m.playerId as string,
            name: p?.name ?? "Player",
            seat: m.seat,
            isMe: m.playerId === me._id,
            isHost: room.hostId === m.playerId,
            lastSeen: m.lastSeen,
          };
        }),
    );
    const base = {
      code: room.code,
      mode: room.mode,
      bots: room.bots,
      status: room.status,
      gameNo: room.gameNo,
      startAt: room.startAt ?? null,
      isHost: room.hostId === me._id,
      isMember: room.members.some((m) => m.playerId === me._id),
      meId: me._id as string,
      members,
    };
    if (room.status === "lobby" || !room.game) return { ...base, game: null };
    const g = room.game as RiskGame;
    const names: Record<string, string> = {};
    const cardCounts: Record<string, number> = {};
    for (const p of g.players) {
      cardCounts[p] = g.cards[p]?.length ?? 0;
      if (isBot(p)) continue;
      const m = members.find((x) => x.id === p);
      names[p] = m?.name ?? (await ctx.db.get(p as Id<"players">))?.name ?? "Player";
    }
    return {
      ...base,
      game: {
        seq: g.seq,
        mode: g.mode,
        players: g.players,
        names,
        out: g.out,
        isPlayer: g.players.includes(me._id) && !g.out.includes(me._id),
        owners: g.owners,
        troops: g.troops,
        myCards: g.cards[me._id] ?? [],
        cardCounts,
        tradesDone: g.tradesDone,
        turn: g.turn,
        phase: g.phase,
        round: g.round,
        reinforce: g.reinforce,
        conqueredThisTurn: g.conqueredThisTurn,
        pendingOccupy: g.pendingOccupy ?? null,
        lastBattle: g.lastBattle ?? null,
        log: g.log,
        deadline: g.deadline ?? null,
        done: g.done ?? null,
      },
    };
  },
});
