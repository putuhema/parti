"use client";

import type { FunctionReturnType } from "convex/server";
import { api } from "../../../convex/_generated/api";

export type GridView = NonNullable<FunctionReturnType<typeof api.scramble.view>>;
export type GridGameView = NonNullable<GridView["game"]>;

export const GAME_NAME = "Scramble";
export const RULE = "Everyone gets the same 4×4 grid of letters. Swipe across touching letters, diagonals too, to make words of 3 or more. You have 2 minutes, and longer words score far more.";
