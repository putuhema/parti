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
import type * as buzz from "../buzz.js";
import type * as chess from "../chess.js";
import type * as crons from "../crons.js";
import type * as daily from "../daily.js";
import type * as faceoff from "../faceoff.js";
import type * as http from "../http.js";
import type * as invites from "../invites.js";
import type * as leaderboard from "../leaderboard.js";
import type * as lib_buzz_board from "../lib/buzz/board.js";
import type * as lib_buzz_questions from "../lib/buzz/questions.js";
import type * as lib_chess from "../lib/chess.js";
import type * as lib_chessPuzzles from "../lib/chessPuzzles.js";
import type * as lib_faceoff_roster from "../lib/faceoff/roster.js";
import type * as lib_helpers from "../lib/helpers.js";
import type * as lib_scramble_board from "../lib/scramble/board.js";
import type * as lib_scramble_solve from "../lib/scramble/solve.js";
import type * as lib_sudoku from "../lib/sudoku.js";
import type * as lib_trivia_board from "../lib/trivia/board.js";
import type * as lib_trivia_questions from "../lib/trivia/questions.js";
import type * as lib_words_content from "../lib/words/content.js";
import type * as lib_words_dict from "../lib/words/dict.js";
import type * as lib_words_en from "../lib/words/en.js";
import type * as lib_words_enCommon from "../lib/words/enCommon.js";
import type * as lib_words_id from "../lib/words/id.js";
import type * as lib_words_idCommon from "../lib/words/idCommon.js";
import type * as players from "../players.js";
import type * as rooms from "../rooms.js";
import type * as scramble from "../scramble.js";
import type * as trivia from "../trivia.js";
import type * as words from "../words.js";
import type * as wordsView from "../wordsView.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  auth: typeof auth;
  buzz: typeof buzz;
  chess: typeof chess;
  crons: typeof crons;
  daily: typeof daily;
  faceoff: typeof faceoff;
  http: typeof http;
  invites: typeof invites;
  leaderboard: typeof leaderboard;
  "lib/buzz/board": typeof lib_buzz_board;
  "lib/buzz/questions": typeof lib_buzz_questions;
  "lib/chess": typeof lib_chess;
  "lib/chessPuzzles": typeof lib_chessPuzzles;
  "lib/faceoff/roster": typeof lib_faceoff_roster;
  "lib/helpers": typeof lib_helpers;
  "lib/scramble/board": typeof lib_scramble_board;
  "lib/scramble/solve": typeof lib_scramble_solve;
  "lib/sudoku": typeof lib_sudoku;
  "lib/trivia/board": typeof lib_trivia_board;
  "lib/trivia/questions": typeof lib_trivia_questions;
  "lib/words/content": typeof lib_words_content;
  "lib/words/dict": typeof lib_words_dict;
  "lib/words/en": typeof lib_words_en;
  "lib/words/enCommon": typeof lib_words_enCommon;
  "lib/words/id": typeof lib_words_id;
  "lib/words/idCommon": typeof lib_words_idCommon;
  players: typeof players;
  rooms: typeof rooms;
  scramble: typeof scramble;
  trivia: typeof trivia;
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
