import type { FunctionReturnType } from "convex/server";
import type { api } from "../../../convex/_generated/api";

export type RoomView = NonNullable<FunctionReturnType<typeof api.rooms.view>>;
export type RoomPlayer = RoomView["players"][number];
