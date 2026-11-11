// Raja Silat: the tower. A run climbs 100 floors, in ten tiers of ten. Every tier is its own place
// (meadow, village, forest...) with its own branching map and a guardian on its top floor.
// Beat the guardian of floor 100 and the run is won.

export type Biome = "meadow" | "village" | "forest" | "sands" | "keep" | "frost" | "clouds" | "stars" | "ember" | "throne";

/** Floors in one tier (also the rows of one map: see map.ts). */
export const TIER_FLOORS = 10;

export const TIERS: { biome: Biome; name: string }[] = [
  { biome: "meadow", name: "Green Meadow" },
  { biome: "village", name: "Hill Village" },
  { biome: "forest", name: "Old Forest" },
  { biome: "sands", name: "Sun Sands" },
  { biome: "keep", name: "Stone Keep" },
  { biome: "frost", name: "Frost Ledge" },
  { biome: "clouds", name: "Cloud Garden" },
  { biome: "stars", name: "Star Terrace" },
  { biome: "ember", name: "Ember Forge" },
  { biome: "throne", name: "Black Throne" },
];

export const TOWER_TIERS = TIERS.length;
export const TOWER_FLOORS = TOWER_TIERS * TIER_FLOORS;

/** The tier a depth is (1 = the bottom of the tower). */
export const tierFor = (depth: number) => TIERS[Math.max(1, Math.min(TOWER_TIERS, depth)) - 1];
/** The floor of the tower a map row is: 1 to 100. */
export const towerFloor = (depth: number, row: number) => Math.min(TOWER_FLOORS, (Math.max(1, depth) - 1) * TIER_FLOORS + row + 1);

/** Where a fight takes place. It only changes how the board is drawn. */
export interface Env {
  biome: Biome;
  /** An elite or guardian fight: fought in an arena, with a crowd. */
  arena: boolean;
  /** The floor of the tower, 1 to 100. */
  floor: number;
}

/** Each tier's colours, shared by the map (the tower) and the 3D board (the island it stands on). */
export interface Look {
  /** The sky, top to bottom. */
  sky: [string, string];
  /** The island's top and its underside. */
  grass: string; dirt: string;
  /** The two colours of the board's squares. */
  tileA: string; tileB: string;
  leaf: string; rock: string;
  /** Sunlight, and how bright the day is (1 = noon). */
  sun: string; day: number;
  /** The tower's bricks on the map. */
  brick: string;
}
export const LOOKS: Record<Biome, Look> = {
  meadow: { sky: ["#8fd3f4", "#d8f3ff"], grass: "#7fc24a", dirt: "#8a5a36", tileA: "#d9c9a3", tileB: "#8fb85a", leaf: "#4f9d3a", rock: "#9aa0a6", sun: "#fff3d0", day: 1, brick: "#b79e7c" },
  village: { sky: ["#a9c8ee", "#e4eefb"], grass: "#8ed05a", dirt: "#7b5a8c", tileA: "#f1dcae", tileB: "#c9a56c", leaf: "#5fae48", rock: "#a8a3b3", sun: "#fff0d8", day: 1, brick: "#c2a47e" },
  forest: { sky: ["#6fb7a8", "#cfeede"], grass: "#4f9a44", dirt: "#5f4630", tileA: "#b7c79a", tileB: "#6f9a58", leaf: "#2f7a3c", rock: "#7f8a78", sun: "#f3ffd8", day: 0.9, brick: "#8f9a78" },
  sands: { sky: ["#f6c37a", "#fdebc8"], grass: "#e6c27a", dirt: "#b07a42", tileA: "#f4dfb0", tileB: "#d9ad6a", leaf: "#6aa85a", rock: "#c99a62", sun: "#ffe2a8", day: 1.05, brick: "#d6b27c" },
  keep: { sky: ["#9aa7bd", "#dde3ee"], grass: "#8f9498", dirt: "#5c5f66", tileA: "#c5c9cf", tileB: "#8e949c", leaf: "#5c8a5a", rock: "#70757d", sun: "#f1f4ff", day: 0.92, brick: "#9a9da3" },
  frost: { sky: ["#9fd0f5", "#f1fbff"], grass: "#eef6fb", dirt: "#7f9ab8", tileA: "#f7fcff", tileB: "#b9d9ee", leaf: "#5f9a8a", rock: "#b8c8d8", sun: "#eaf6ff", day: 1, brick: "#b9c8d6" },
  clouds: { sky: ["#7fb6ff", "#fbe3f1"], grass: "#bfe8a8", dirt: "#f2f2fa", tileA: "#fffaf0", tileB: "#f3c9dc", leaf: "#8fd08a", rock: "#ffffff", sun: "#fff6ea", day: 1.05, brick: "#e6dfee" },
  stars: { sky: ["#161a3a", "#4a3f7a"], grass: "#4a5a8a", dirt: "#2a2f55", tileA: "#8f9ad0", tileB: "#4f5a96", leaf: "#6a7fd0", rock: "#6a70a0", sun: "#b9c8ff", day: 0.82, brick: "#5a5f8f" },
  ember: { sky: ["#3a1410", "#b8472a"], grass: "#4a3a36", dirt: "#2a1c1a", tileA: "#8a6a5c", tileB: "#4f3a34", leaf: "#c9562a", rock: "#3a2c2a", sun: "#ffb078", day: 0.88, brick: "#6a4a40" },
  throne: { sky: ["#1a1420", "#5a2a4a"], grass: "#3a3340", dirt: "#1f1a24", tileA: "#b9a7c9", tileB: "#4a3f5a", leaf: "#7a3f6a", rock: "#4a4252", sun: "#e8c8ff", day: 0.85, brick: "#4a4050" },
};
