import type { FunctionReturnType } from "convex/server";
import type { api } from "../../../convex/_generated/api";

export type ChessView = NonNullable<FunctionReturnType<typeof api.chess.view>>;
export type ChessGameView = NonNullable<ChessView["game"]>;
