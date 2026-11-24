import type { FunctionReturnType } from "convex/server";
import type { api } from "../../../convex/_generated/api";

export type PoseView = NonNullable<FunctionReturnType<typeof api.pose.view>>;
export type PoseLiveGame = NonNullable<PoseView["game"]>;

export const GAME_NAME = "Pose Match";
export const RULE =
  "Strike the pose on camera! Take turns matching each silhouette, rate your partner's snap, and build a shared photobooth strip.";
