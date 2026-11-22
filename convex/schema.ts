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
    // Sudoku coach: per trick, how often you found it after a nudge vs. needed it shown.
    tricks: v.optional(v.record(v.string(), v.object({ found: v.number(), shown: v.number() }))),
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

  tileRooms: defineTable({
    code: v.string(),
    hostId: v.id("players"),
    lang: v.union(v.literal("en"), v.literal("id")),
    status: v.union(v.literal("lobby"), v.literal("playing"), v.literal("finished")),
    gameNo: v.number(),
    members: v.array(v.object({ playerId: v.id("players"), seat: v.number(), lastSeen: v.number() })),
    game: v.optional(v.any()), // see TileGame in convex/tiles.ts
    startAt: v.optional(v.number()),
    endedAt: v.optional(v.number()),
  }).index("by_code", ["code"]),

  boomRooms: defineTable({
    code: v.string(),
    hostId: v.id("players"),
    rounds: v.number(),
    status: v.union(v.literal("lobby"), v.literal("playing"), v.literal("finished")),
    gameNo: v.number(),
    members: v.array(v.object({ playerId: v.id("players"), seat: v.number(), lastSeen: v.number() })),
    game: v.optional(v.any()), // see BoomGame in convex/lib/boom/rules.ts
    startAt: v.optional(v.number()),
    endedAt: v.optional(v.number()),
  }).index("by_code", ["code"]),

  sketchRooms: defineTable({
    code: v.string(),
    hostId: v.id("players"),
    source: v.union(v.literal("book"), v.literal("own")), // picture book, or the describer draws their own
    status: v.union(v.literal("lobby"), v.literal("playing"), v.literal("finished")),
    gameNo: v.number(),
    members: v.array(v.object({ playerId: v.id("players"), seat: v.number(), lastSeen: v.number() })),
    game: v.optional(v.any()), // see SketchGame in convex/lib/sketch/rules.ts
    startAt: v.optional(v.number()),
    endedAt: v.optional(v.number()),
  }).index("by_code", ["code"]),

  // One drawing per drawer per round, kept apart from the room so drawers saving don't clash.
  sketchDrawings: defineTable({
    roomId: v.id("sketchRooms"),
    gameNo: v.number(),
    round: v.number(),
    playerId: v.id("players"),
    strokes: v.array(v.array(v.number())),
  }).index("by_roomId_and_gameNo_and_round_and_playerId", ["roomId", "gameNo", "round", "playerId"]),

  syncRooms: defineTable({
    code: v.string(),
    hostId: v.id("players"),
    decks: v.array(v.union(v.literal("light"), v.literal("dreams"), v.literal("deep"), v.literal("flirty"))),
    length: v.number(),
    own: v.boolean(), // two "ask your own question" cards per game
    status: v.union(v.literal("lobby"), v.literal("playing"), v.literal("finished")),
    gameNo: v.number(),
    members: v.array(v.object({ playerId: v.id("players"), seat: v.number(), lastSeen: v.number() })),
    game: v.optional(v.any()), // see SyncGame in convex/lib/sync/rules.ts
    endedAt: v.optional(v.number()),
  }).index("by_code", ["code"]),

  // What a pair of players has played together in In Sync: stats, questions seen, and past answers for throwbacks.
  syncPairs: defineTable({
    key: v.string(), // the two player ids, sorted and joined
    games: v.number(),
    bestSync: v.number(),
    lastSync: v.number(),
    seen: v.array(v.string()), // capped
    memories: v.array(v.object({ qid: v.string(), at: v.number(), answers: v.record(v.string(), v.union(v.number(), v.array(v.number()), v.string())) })), // capped
  }).index("by_key", ["key"]),

  heistRooms: defineTable({
    code: v.string(),
    hostId: v.id("players"),
    level: v.string(), // a level id from convex/lib/heist/levels.ts
    status: v.union(v.literal("lobby"), v.literal("playing"), v.literal("finished")),
    gameNo: v.number(),
    // Seat 0 plays the Cat, seat 1 the Hacker. Alone, you play both.
    members: v.array(v.object({ playerId: v.id("players"), seat: v.number(), lastSeen: v.number() })),
    game: v.optional(v.any()), // see HeistGame in convex/heist.ts
    endedAt: v.optional(v.number()),
  }).index("by_code", ["code"]),

  // Best result per player per Heist Night level.
  heistStars: defineTable({
    playerId: v.id("players"),
    levelId: v.string(),
    stars: v.number(),
    bestRounds: v.number(),
  }).index("by_playerId_and_levelId", ["playerId", "levelId"]),

  brainRooms: defineTable({
    code: v.string(),
    hostId: v.id("players"),
    mode: v.union(v.literal("teach"), v.literal("agree")),
    topics: v.array(v.union(v.literal("space"), v.literal("body"), v.literal("animals"), v.literal("indonesia"), v.literal("history"), v.literal("life"))),
    rounds: v.number(),
    status: v.union(v.literal("lobby"), v.literal("playing"), v.literal("finished")),
    gameNo: v.number(),
    members: v.array(v.object({ playerId: v.id("players"), seat: v.number(), lastSeen: v.number() })),
    game: v.optional(v.any()), // see BrainGame in convex/lib/brain/rules.ts
    endedAt: v.optional(v.number()),
  }).index("by_code", ["code"]),

  // The fact cards each player has learned in Brain Swap (at most one entry per card).
  brainBooks: defineTable({
    playerId: v.id("players"),
    learned: v.array(v.string()),
  }).index("by_playerId", ["playerId"]),

  storyRooms: defineTable({
    code: v.string(),
    hostId: v.id("players"),
    length: v.number(), // lines in the story
    starter: v.optional(v.number()), // index into STARTERS; unset means a surprise
    status: v.union(v.literal("lobby"), v.literal("playing"), v.literal("finished")),
    gameNo: v.number(),
    members: v.array(v.object({ playerId: v.id("players"), seat: v.number(), lastSeen: v.number() })),
    game: v.optional(v.any()), // see StoryGame in convex/lib/story/rules.ts
    endedAt: v.optional(v.number()),
  }).index("by_code", ["code"]),

  // Finished Sneaky Stories, kept on the pair's Story Shelf.
  storyBooks: defineTable({
    key: v.string(), // the two player ids, sorted and joined
    starter: v.number(),
    names: v.record(v.string(), v.string()),
    lines: v.array(v.object({ by: v.string(), text: v.string(), secret: v.string(), spotted: v.union(v.boolean(), v.null()), twist: v.optional(v.string()) })),
  }).index("by_key", ["key"]),

  truthRooms: defineTable({
    code: v.string(),
    hostId: v.id("players"),
    themes: v.array(v.string()), // theme ids from convex/lib/truth/rules.ts; empty means all
    rounds: v.number(),
    status: v.union(v.literal("lobby"), v.literal("playing"), v.literal("finished")),
    gameNo: v.number(),
    members: v.array(v.object({ playerId: v.id("players"), seat: v.number(), lastSeen: v.number() })),
    game: v.optional(v.any()), // see TruthGame in convex/lib/truth/rules.ts
    endedAt: v.optional(v.number()),
  }).index("by_code", ["code"]),

  // Truths revealed in Truth or Tale: things a pair now knows about each other.
  truthVault: defineTable({
    key: v.string(), // the two player ids, sorted and joined
    owner: v.id("players"), // whose truth it is
    text: v.string(),
    theme: v.string(),
  }).index("by_key", ["key"]),

  emojiRooms: defineTable({
    code: v.string(),
    hostId: v.id("players"),
    categories: v.array(v.string()), // category ids from convex/lib/emoji/content.ts; empty means all
    rounds: v.number(),
    status: v.union(v.literal("lobby"), v.literal("playing"), v.literal("finished")),
    gameNo: v.number(),
    members: v.array(v.object({ playerId: v.id("players"), seat: v.number(), lastSeen: v.number() })),
    game: v.optional(v.any()), // see EmojiGame in convex/lib/emoji/rules.ts
    endedAt: v.optional(v.number()),
  }).index("by_code", ["code"]),

  // Best Emoji Charades score per pair, per game length.
  emojiBests: defineTable({
    key: v.string(), // the two player ids, sorted and joined, then "|" and the number of rounds
    best: v.number(),
    games: v.number(),
  }).index("by_key", ["key"]),

  partyRooms: defineTable({
    code: v.string(),
    hostId: v.id("players"),
    rounds: v.number(),
    status: v.union(v.literal("lobby"), v.literal("playing"), v.literal("finished")),
    gameNo: v.number(),
    members: v.array(v.object({ playerId: v.id("players"), seat: v.number(), lastSeen: v.number() })),
    game: v.optional(v.any()), // see PartyGame in convex/lib/party/rules.ts
    endedAt: v.optional(v.number()),
  }).index("by_code", ["code"]),

  // Each player's best score in each Party Blitz minigame.
  partyBests: defineTable({
    playerId: v.id("players"),
    micro: v.string(),
    best: v.number(),
  }).index("by_playerId_and_micro", ["playerId", "micro"]),

  potatoRooms: defineTable({
    code: v.string(),
    hostId: v.id("players"),
    lives: v.number(),
    status: v.union(v.literal("lobby"), v.literal("playing"), v.literal("finished")),
    gameNo: v.number(),
    members: v.array(v.object({ playerId: v.id("players"), seat: v.number(), lastSeen: v.number() })),
    game: v.optional(v.any()), // see PotatoGame in convex/lib/potato/rules.ts
    endedAt: v.optional(v.number()),
  }).index("by_code", ["code"]),

  islandRooms: defineTable({
    code: v.string(),
    hostId: v.id("players"),
    rounds: v.number(),
    status: v.union(v.literal("lobby"), v.literal("playing"), v.literal("finished")),
    gameNo: v.number(),
    members: v.array(v.object({ playerId: v.id("players"), seat: v.number(), lastSeen: v.number() })),
    game: v.optional(v.any()), // see IslandGame in convex/lib/island/rules.ts
    endedAt: v.optional(v.number()),
  }).index("by_code", ["code"]),

  // Word meanings from Wiktionary, cached so each word is fetched once.
  wordDefs: defineTable({
    lang: v.union(v.literal("en"), v.literal("id")),
    word: v.string(),
    defs: v.array(v.object({ pos: v.string(), text: v.string() })),
    fetchedAt: v.number(),
  }).index("by_lang_and_word", ["lang", "word"]),

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
