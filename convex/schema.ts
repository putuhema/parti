import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export const mode = v.union(v.literal("race"), v.literal("coop"));
export const chessMode = v.union(
  v.literal("classic"),
  v.literal("team"),
  v.literal("coach"),
  v.literal("puzzles"),
  v.literal("powerups"),
  v.literal("fog"),
  v.literal("duck"),
  v.literal("shuffle"),
  v.literal("threecheck"),
);
export const wordMode = v.union(
  v.literal("chain"),
  v.literal("hangman"),
  v.literal("pair"),
  v.literal("chemistry"),
  v.literal("dontsay"),
  v.literal("guess"),
  v.literal("spy"),
  v.literal("odd"),
  v.literal("scramble"),
  v.literal("emoji"),
);
export const wordLang = v.union(v.literal("en"), v.literal("id"), v.literal("mix"));
export const difficulty = v.union(
  v.literal("easy"),
  v.literal("medium"),
  v.literal("hard"),
  v.literal("expert"),
);

export default defineSchema({
  players: defineTable({
    name: v.string(),
    userId: v.optional(v.string()), // Better Auth user (a guest or a saved account)
    token: v.optional(v.string()), // old device-only login; cleared once claimed by an account
    tier: v.number(), // league: 0 Bronze .. 4 Diamond
    weekKey: v.string(), // Monday (UTC) of the week the weekly numbers belong to
    weekXp: v.number(),
    weekPts: v.number(), // Daily Duel points this week
    streak: v.number(),
    lastDailyDate: v.optional(v.string()),
    wins: v.number(),
    chessLessons: v.optional(v.record(v.string(), v.number())), // lesson id -> best stars
  })
    .index("by_token", ["token"])
    .index("by_user", ["userId"])
    .index("by_tier_week_xp", ["tier", "weekKey", "weekXp"])
    .index("by_week_pts", ["weekKey", "weekPts"]),

  friendships: defineTable({ a: v.id("players"), b: v.id("players") })
    .index("by_a", ["a"])
    .index("by_pair", ["a", "b"]),

  rooms: defineTable({
    code: v.string(),
    hostId: v.id("players"),
    mode,
    difficulty,
    status: v.union(v.literal("lobby"), v.literal("playing"), v.literal("finished")),
    gameNo: v.number(),
    puzzle: v.optional(v.string()),
    solution: v.optional(v.string()), // never sent to clients
    startAt: v.optional(v.number()),
    endedAt: v.optional(v.number()),
    winnerId: v.optional(v.id("players")),
    outcome: v.optional(v.union(v.literal("won"), v.literal("lost"))), // co-op
    lives: v.number(),
    lastMove: v.optional(
      v.object({
        playerId: v.id("players"),
        cell: v.number(),
        digit: v.number(),
        correct: v.boolean(),
        at: v.number(),
      }),
    ),
  }).index("by_code", ["code"]),

  roomPlayers: defineTable({
    roomId: v.id("rooms"),
    playerId: v.id("players"),
    seat: v.number(),
    lastSeen: v.number(),
    cell: v.optional(v.number()),
  })
    .index("by_room", ["roomId"])
    .index("by_room_player", ["roomId", "playerId"]),

  boards: defineTable({
    roomId: v.id("rooms"),
    gameNo: v.number(),
    playerId: v.optional(v.id("players")), // empty for the shared co-op board
    values: v.string(),
    owners: v.optional(v.string()), // co-op: seat number per cell, "-" for none
    filled: v.number(),
    mistakes: v.number(),
    finishedAt: v.optional(v.number()),
    gaveUp: v.optional(v.boolean()),
    hints: v.optional(v.number()),
  }).index("by_room_game", ["roomId", "gameNo"]),

  reactions: defineTable({
    roomId: v.id("rooms"),
    playerId: v.id("players"),
    text: v.string(),
  }).index("by_room", ["roomId"]),

  dailyPuzzles: defineTable({
    date: v.string(),
    number: v.number(),
    difficulty,
    puzzle: v.string(),
    solution: v.string(),
  }).index("by_date", ["date"]),

  dailyRuns: defineTable({
    date: v.string(),
    playerId: v.id("players"),
    values: v.string(),
    mistakes: v.number(),
    startedAt: v.number(),
    finishedAt: v.optional(v.number()),
    timeMs: v.optional(v.number()),
    boxOrder: v.optional(v.array(v.number())), // boxes in the order they were cleared
  })
    .index("by_date_time", ["date", "timeMs"])
    .index("by_player_date", ["playerId", "date"]),

  chessRooms: defineTable({
    code: v.string(),
    hostId: v.id("players"),
    mode: chessMode,
    clockMs: v.number(), // per player, 0 = no clock
    botLevel: v.number(),
    coachId: v.optional(v.id("players")),
    status: v.union(v.literal("lobby"), v.literal("playing"), v.literal("finished")),
    gameNo: v.number(),
    members: v.array(v.object({ playerId: v.id("players"), seat: v.number(), lastSeen: v.number() })),
    game: v.optional(v.any()), // see Game in convex/chess.ts
    startAt: v.optional(v.number()),
    endedAt: v.optional(v.number()),
  }).index("by_code", ["code"]),

  wordRooms: defineTable({
    code: v.string(),
    hostId: v.id("players"),
    mode: wordMode,
    lang: wordLang,
    status: v.union(v.literal("lobby"), v.literal("playing"), v.literal("finished")),
    gameNo: v.number(),
    members: v.array(v.object({ playerId: v.id("players"), seat: v.number(), lastSeen: v.number() })),
    game: v.optional(v.any()), // see convex/words.ts
    startAt: v.optional(v.number()),
    endedAt: v.optional(v.number()),
  }).index("by_code", ["code"]),

  triviaRooms: defineTable({
    code: v.string(),
    hostId: v.id("players"),
    goal: v.number(), // gems needed to win
    status: v.union(v.literal("lobby"), v.literal("playing"), v.literal("finished")),
    gameNo: v.number(),
    members: v.array(v.object({ playerId: v.id("players"), seat: v.number(), lastSeen: v.number() })),
    game: v.optional(v.any()), // see TriviaGame in convex/trivia.ts
    startAt: v.optional(v.number()),
    endedAt: v.optional(v.number()),
  }).index("by_code", ["code"]),

  buzzRooms: defineTable({
    code: v.string(),
    hostId: v.id("players"),
    rows: v.number(), // tile rows on the board (3, 4 or 5)
    status: v.union(v.literal("lobby"), v.literal("playing"), v.literal("finished")),
    gameNo: v.number(),
    members: v.array(v.object({ playerId: v.id("players"), seat: v.number(), lastSeen: v.number() })),
    game: v.optional(v.any()), // see BuzzGame in convex/buzz.ts
    startAt: v.optional(v.number()),
    endedAt: v.optional(v.number()),
  }).index("by_code", ["code"]),

  faceRooms: defineTable({
    code: v.string(),
    hostId: v.id("players"),
    status: v.union(v.literal("lobby"), v.literal("playing"), v.literal("finished")),
    gameNo: v.number(),
    members: v.array(v.object({ playerId: v.id("players"), seat: v.number(), lastSeen: v.number() })),
    game: v.optional(v.any()), // see FaceGame in convex/faceoff.ts
    startAt: v.optional(v.number()),
    endedAt: v.optional(v.number()),
  }).index("by_code", ["code"]),

  gridRooms: defineTable({
    code: v.string(),
    hostId: v.id("players"),
    lang: v.union(v.literal("en"), v.literal("id")),
    status: v.union(v.literal("lobby"), v.literal("playing"), v.literal("finished")),
    gameNo: v.number(),
    members: v.array(v.object({ playerId: v.id("players"), seat: v.number(), lastSeen: v.number() })),
    game: v.optional(v.any()), // see GridGame in convex/scramble.ts
    startAt: v.optional(v.number()),
    endedAt: v.optional(v.number()),
  }).index("by_code", ["code"]),

  gridDailies: defineTable({
    date: v.string(),
    number: v.number(),
    grid: v.array(v.string()),
    words: v.array(v.string()), // every word in the grid; never sent before you finish
  }).index("by_date", ["date"]),

  gridDailyRuns: defineTable({
    date: v.string(),
    playerId: v.id("players"),
    found: v.array(v.string()),
    score: v.number(),
    startedAt: v.number(),
    endsAt: v.number(),
    awarded: v.optional(v.boolean()),
  })
    .index("by_player_date", ["playerId", "date"])
    .index("by_date_score", ["date", "score"]),

  invites: defineTable({
    from: v.id("players"),
    to: v.id("players"),
    game: v.string(), // e.g. "Scramble"
    path: v.string(), // where accepting takes you, e.g. /scramble/room/K7Q2
    code: v.string(),
  })
    .index("by_to", ["to"])
    .index("by_from_to_code", ["from", "to", "code"]),

  chessReactions: defineTable({
    roomId: v.id("chessRooms"),
    playerId: v.id("players"),
    text: v.string(),
  }).index("by_room", ["roomId"]),
});
