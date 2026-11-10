/** Buzz Board: categories and board sizes. Shared by server and phones. */

export const BUZZ_CATS = [
  { name: "Animals", icon: "🐾", face: "#58CC02", edge: "#46A302", soft: "#E8FAD9", ink: "#2F6E00" },
  { name: "Space & Earth", icon: "🪐", face: "#1CB0F6", edge: "#1478A8", soft: "#DDF4FF", ink: "#1478A8" },
  { name: "World Map", icon: "🗺️", face: "#2B70C9", edge: "#1F57A0", soft: "#E3EEFC", ink: "#1F57A0" },
  { name: "Food", icon: "🍜", face: "#FF4B4B", edge: "#EA2B2B", soft: "#FFDFE0", ink: "#B81F1F" },
  { name: "Music & Film", icon: "🎵", face: "#CE82FF", edge: "#A568CC", soft: "#F3E2FF", ink: "#8A4FB5" },
  { name: "Sports", icon: "⚽", face: "#FF9600", edge: "#E08600", soft: "#FFF0DB", ink: "#9A5200" },
  { name: "Inventions", icon: "💡", face: "#FFC800", edge: "#E5A800", soft: "#FFF4CC", ink: "#7A5800" },
  { name: "Words", icon: "🔤", face: "#D9489F", edge: "#B2347F", soft: "#FFE8F5", ink: "#B2347F" },
] as const;

/** Every board has this many category columns. */
export const COLS = 5;
/** Rows of tiles the host can pick. Row r is worth (r + 1) × 100. */
export const ROWS = [3, 4, 5] as const;
export const BUZZ_MAX = 6;

export const tileValue = (index: number) => (Math.floor(index / COLS) + 1) * 100;
