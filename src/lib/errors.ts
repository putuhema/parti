import { ConvexError } from "convex/values";

/** Friendly text for an error thrown by a Convex function. */
export function errorText(e: unknown, fallback = "Something went wrong") {
  if (e instanceof ConvexError) return String(e.data);
  if (e instanceof Error) {
    const m = e.message.match(/ConvexError: ([^\n]+)/);
    if (m) return m[1];
  }
  return fallback;
}
