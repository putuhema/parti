/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as auth from "../auth.js";
import type * as boom from "../boom.js";
import type * as brain from "../brain.js";
import type * as buzz from "../buzz.js";
import type * as chess from "../chess.js";
import type * as crons from "../crons.js";
import type * as daily from "../daily.js";
import type * as defs from "../defs.js";
import type * as emoji from "../emoji.js";
import type * as faceoff from "../faceoff.js";
import type * as heist from "../heist.js";
import type * as http from "../http.js";
import type * as invites from "../invites.js";
import type * as leaderboard from "../leaderboard.js";
import type * as lib_boom_rules from "../lib/boom/rules.js";
import type * as lib_brain_cards from "../lib/brain/cards.js";
import type * as lib_brain_rules from "../lib/brain/rules.js";
import type * as lib_buzz_board from "../lib/buzz/board.js";
import type * as lib_buzz_questions from "../lib/buzz/questions.js";
import type * as lib_chess from "../lib/chess.js";
import type * as lib_chessPuzzles from "../lib/chessPuzzles.js";
import type * as lib_emoji_content from "../lib/emoji/content.js";
import type * as lib_emoji_rules from "../lib/emoji/rules.js";
import type * as lib_faceoff_roster from "../lib/faceoff/roster.js";
import type * as lib_heist_levels from "../lib/heist/levels.js";
import type * as lib_heist_rules from "../lib/heist/rules.js";
import type * as lib_helpers from "../lib/helpers.js";
import type * as lib_party_rules from "../lib/party/rules.js";
import type * as lib_potato_rules from "../lib/potato/rules.js";
import type * as lib_scramble_board from "../lib/scramble/board.js";
import type * as lib_scramble_solve from "../lib/scramble/solve.js";
import type * as lib_sketch_art from "../lib/sketch/art.js";
import type * as lib_sketch_rules from "../lib/sketch/rules.js";
import type * as lib_story_content from "../lib/story/content.js";
import type * as lib_story_rules from "../lib/story/rules.js";
import type * as lib_sudoku from "../lib/sudoku.js";
import type * as lib_sync_deck from "../lib/sync/deck.js";
import type * as lib_sync_rules from "../lib/sync/rules.js";
import type * as lib_tiles_bot from "../lib/tiles/bot.js";
import type * as lib_tiles_rules from "../lib/tiles/rules.js";
import type * as lib_trivia_board from "../lib/trivia/board.js";
import type * as lib_trivia_questions from "../lib/trivia/questions.js";
import type * as lib_truth_rules from "../lib/truth/rules.js";
import type * as lib_words_content from "../lib/words/content.js";
import type * as lib_words_dict from "../lib/words/dict.js";
import type * as lib_words_en from "../lib/words/en.js";
import type * as lib_words_enCommon from "../lib/words/enCommon.js";
import type * as lib_words_id from "../lib/words/id.js";
import type * as lib_words_idCommon from "../lib/words/idCommon.js";
import type * as party from "../party.js";
import type * as players from "../players.js";
import type * as potato from "../potato.js";
import type * as rooms from "../rooms.js";
import type * as scramble from "../scramble.js";
import type * as sketch from "../sketch.js";
import type * as story from "../story.js";
import type * as sync from "../sync.js";
import type * as tiles from "../tiles.js";
import type * as trivia from "../trivia.js";
import type * as truth from "../truth.js";
import type * as words from "../words.js";
import type * as wordsView from "../wordsView.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  auth: typeof auth;
  boom: typeof boom;
  brain: typeof brain;
  buzz: typeof buzz;
  chess: typeof chess;
  crons: typeof crons;
  daily: typeof daily;
  defs: typeof defs;
  emoji: typeof emoji;
  faceoff: typeof faceoff;
  heist: typeof heist;
  http: typeof http;
  invites: typeof invites;
  leaderboard: typeof leaderboard;
  "lib/boom/rules": typeof lib_boom_rules;
  "lib/brain/cards": typeof lib_brain_cards;
  "lib/brain/rules": typeof lib_brain_rules;
  "lib/buzz/board": typeof lib_buzz_board;
  "lib/buzz/questions": typeof lib_buzz_questions;
  "lib/chess": typeof lib_chess;
  "lib/chessPuzzles": typeof lib_chessPuzzles;
  "lib/emoji/content": typeof lib_emoji_content;
  "lib/emoji/rules": typeof lib_emoji_rules;
  "lib/faceoff/roster": typeof lib_faceoff_roster;
  "lib/heist/levels": typeof lib_heist_levels;
  "lib/heist/rules": typeof lib_heist_rules;
  "lib/helpers": typeof lib_helpers;
  "lib/party/rules": typeof lib_party_rules;
  "lib/potato/rules": typeof lib_potato_rules;
  "lib/scramble/board": typeof lib_scramble_board;
  "lib/scramble/solve": typeof lib_scramble_solve;
  "lib/sketch/art": typeof lib_sketch_art;
  "lib/sketch/rules": typeof lib_sketch_rules;
  "lib/story/content": typeof lib_story_content;
  "lib/story/rules": typeof lib_story_rules;
  "lib/sudoku": typeof lib_sudoku;
  "lib/sync/deck": typeof lib_sync_deck;
  "lib/sync/rules": typeof lib_sync_rules;
  "lib/tiles/bot": typeof lib_tiles_bot;
  "lib/tiles/rules": typeof lib_tiles_rules;
  "lib/trivia/board": typeof lib_trivia_board;
  "lib/trivia/questions": typeof lib_trivia_questions;
  "lib/truth/rules": typeof lib_truth_rules;
  "lib/words/content": typeof lib_words_content;
  "lib/words/dict": typeof lib_words_dict;
  "lib/words/en": typeof lib_words_en;
  "lib/words/enCommon": typeof lib_words_enCommon;
  "lib/words/id": typeof lib_words_id;
  "lib/words/idCommon": typeof lib_words_idCommon;
  party: typeof party;
  players: typeof players;
  potato: typeof potato;
  rooms: typeof rooms;
  scramble: typeof scramble;
  sketch: typeof sketch;
  story: typeof story;
  sync: typeof sync;
  tiles: typeof tiles;
  trivia: typeof trivia;
  truth: typeof truth;
  words: typeof words;
  wordsView: typeof wordsView;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {
  betterAuth: import("@convex-dev/better-auth/_generated/component.js").ComponentApi<"betterAuth">;
};
