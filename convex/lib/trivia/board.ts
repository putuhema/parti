/** Quiz Loop board: a ring of 24 spaces around a 7×7 grid. Shared by server and phones. */

export const CATS = [
  { name: "Science", icon: "🔬", face: "#1CB0F6", edge: "#1478A8", soft: "#DDF4FF", ink: "#1478A8" },
  { name: "Places", icon: "🌏", face: "#58CC02", edge: "#46A302", soft: "#E8FAD9", ink: "#2F6E00" },
  { name: "History", icon: "🏛️", face: "#FFC800", edge: "#E5A800", soft: "#FFF4CC", ink: "#7A5800" },
  { name: "Arts", icon: "🎨", face: "#CE82FF", edge: "#A568CC", soft: "#F3E2FF", ink: "#8A4FB5" },
  { name: "Sports", icon: "⚽", face: "#FF9600", edge: "#E08600", soft: "#FFF0DB", ink: "#9A5200" },
  { name: "Food & Life", icon: "🍜", face: "#FF4B4B", edge: "#EA2B2B", soft: "#FFDFE0", ink: "#B81F1F" },
] as const;

export type Space =
  | { kind: "start" } // free roll
  | { kind: "again" } // free roll
  | { kind: "wild" } // pick any category
  | { kind: "cat"; cat: number } // answer right to roll again
  | { kind: "gem"; cat: number }; // answer right to win that gem

export const RING = 24;
export const GOALS = [3, 4, 6] as const;

/** Gems sit on every 4th space starting at 2. Start and 12 are free rolls, 8 and 20 are wild. */
export const BOARD: Space[] = (() => {
  const special: Record<number, Space> = { 0: { kind: "start" }, 12: { kind: "again" }, 8: { kind: "wild" }, 20: { kind: "wild" } };
  const fill = [3, 4, 5, 0, 1, 2, 3, 4, 5, 0, 1, 2, 3, 4];
  let k = 0;
  return Array.from({ length: RING }, (_, i): Space => {
    if (special[i]) return special[i];
    if (i % 4 === 2) return { kind: "gem", cat: (i - 2) / 4 };
    return { kind: "cat", cat: fill[k++] };
  });
})();

/** Where space i sits on the 7×7 grid (row, col). Clockwise from the top-left corner. */
export function cellOf(i: number): [number, number] {
  if (i <= 6) return [0, i];
  if (i <= 12) return [i - 6, 6];
  if (i <= 18) return [6, 18 - i];
  return [24 - i, 0];
}

/** The two spaces a roll can take you to: clockwise and counter-clockwise. */
export function targets(from: number, roll: number) {
  return [(from + roll) % RING, (from - roll + RING) % RING];
}
