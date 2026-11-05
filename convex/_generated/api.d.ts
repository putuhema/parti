/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as chess from "../chess.js";
import type * as crons from "../crons.js";
import type * as daily from "../daily.js";
import type * as leaderboard from "../leaderboard.js";
import type * as lib_chess from "../lib/chess.js";
import type * as lib_chessPuzzles from "../lib/chessPuzzles.js";
import type * as lib_helpers from "../lib/helpers.js";
import type * as lib_sudoku from "../lib/sudoku.js";
import type * as lib_words_content from "../lib/words/content.js";
import type * as lib_words_dict from "../lib/words/dict.js";
import type * as lib_words_en from "../lib/words/en.js";
import type * as lib_words_id from "../lib/words/id.js";
import type * as players from "../players.js";
import type * as rooms from "../rooms.js";
import type * as words from "../words.js";
import type * as wordsView from "../wordsView.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  chess: typeof chess;
  crons: typeof crons;
  daily: typeof daily;
  leaderboard: typeof leaderboard;
  "lib/chess": typeof lib_chess;
  "lib/chessPuzzles": typeof lib_chessPuzzles;
  "lib/helpers": typeof lib_helpers;
  "lib/sudoku": typeof lib_sudoku;
  "lib/words/content": typeof lib_words_content;
  "lib/words/dict": typeof lib_words_dict;
  "lib/words/en": typeof lib_words_en;
  "lib/words/id": typeof lib_words_id;
  players: typeof players;
  rooms: typeof rooms;
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

export declare const components: {};
