// Risk world map: 6 continents, 24 chunky Toybox Vinyl territories, symmetric borders & sea lanes.
// Designed for effortless tapping on phones while preserving classic Risk chokepoints and continent strategy.

export type ContinentId = "na" | "sa" | "eu" | "af" | "as" | "oc";

export type TerritoryId =
  | "alaska" | "canada" | "usa" | "mexico"
  | "colombia" | "brazil" | "argentina"
  | "uk" | "nordic" | "west_eu" | "east_eu"
  | "north_af" | "egypt" | "congo" | "south_af"
  | "ural" | "siberia" | "middle_east" | "india" | "china" | "japan"
  | "indonesia" | "australia" | "new_zealand";

export type ContinentDef = {
  id: ContinentId;
  name: string;
  bonus: number;
  tint: string;
  edge: string;
  badgeX: number;
  badgeY: number;
  territories: TerritoryId[];
};

export type TerritoryDef = {
  id: TerritoryId;
  name: string;
  short: string;
  continent: ContinentId;
  x: number; // troop badge / label X in 1000x560 viewBox
  y: number; // troop badge / label Y in 1000x560 viewBox
  path: string; // SVG landmass polygon in 1000x560 viewBox
  neighbors: TerritoryId[];
};

export const CONTINENTS: Record<ContinentId, ContinentDef> = {
  na: {
    id: "na",
    name: "North America",
    bonus: 3,
    tint: "#FFE39A",
    edge: "#DFAC35",
    badgeX: 162,
    badgeY: 62,
    territories: ["alaska", "canada", "usa", "mexico"],
  },
  sa: {
    id: "sa",
    name: "South America",
    bonus: 2,
    tint: "#FFBFD2",
    edge: "#DE6E91",
    badgeX: 222,
    badgeY: 492,
    territories: ["colombia", "brazil", "argentina"],
  },
  eu: {
    id: "eu",
    name: "Europe",
    bonus: 4,
    tint: "#C6DCFF",
    edge: "#5C8DE0",
    badgeX: 486,
    badgeY: 54,
    territories: ["uk", "nordic", "west_eu", "east_eu"],
  },
  af: {
    id: "af",
    name: "Africa",
    bonus: 3,
    tint: "#FFD0A8",
    edge: "#DC8745",
    badgeX: 468,
    badgeY: 486,
    territories: ["north_af", "egypt", "congo", "south_af"],
  },
  as: {
    id: "as",
    name: "Asia",
    bonus: 5,
    tint: "#BCEFD0",
    edge: "#49B277",
    badgeX: 774,
    badgeY: 58,
    territories: ["ural", "siberia", "middle_east", "india", "china", "japan"],
  },
  oc: {
    id: "oc",
    name: "Oceania",
    bonus: 2,
    tint: "#DEC9FF",
    edge: "#9067DE",
    badgeX: 838,
    badgeY: 506,
    territories: ["indonesia", "australia", "new_zealand"],
  },
};

export const CONTINENT_LIST: ContinentDef[] = Object.values(CONTINENTS);

export const TERRITORIES: Record<TerritoryId, TerritoryDef> = {
  // ---- North America ----
  alaska: {
    id: "alaska",
    name: "Alaska",
    short: "ALA",
    continent: "na",
    x: 84,
    y: 120,
    path: "M 34 108 L 88 80 L 138 90 L 136 150 L 76 158 L 32 138 Z",
    neighbors: ["canada", "japan"],
  },
  canada: {
    id: "canada",
    name: "Canada",
    short: "CAN",
    continent: "na",
    x: 204,
    y: 122,
    path: "M 138 90 L 240 82 L 288 118 L 268 164 L 136 150 Z",
    neighbors: ["alaska", "usa", "uk"],
  },
  usa: {
    id: "usa",
    name: "United States",
    short: "USA",
    continent: "na",
    x: 174,
    y: 196,
    path: "M 92 156 L 268 164 L 254 226 L 116 232 L 88 194 Z",
    neighbors: ["canada", "mexico"],
  },
  mexico: {
    id: "mexico",
    name: "Mexico",
    short: "MEX",
    continent: "na",
    x: 170,
    y: 266,
    path: "M 116 232 L 222 228 L 236 276 L 194 302 L 132 284 Z",
    neighbors: ["usa", "colombia"],
  },

  // ---- South America ----
  colombia: {
    id: "colombia",
    name: "Colombia",
    short: "COL",
    continent: "sa",
    x: 238,
    y: 332,
    path: "M 194 302 L 274 298 L 296 348 L 220 364 L 188 338 Z",
    neighbors: ["mexico", "brazil", "argentina"],
  },
  brazil: {
    id: "brazil",
    name: "Brazil",
    short: "BRA",
    continent: "sa",
    x: 298,
    y: 386,
    path: "M 274 344 L 348 346 L 358 408 L 292 436 L 252 400 Z",
    neighbors: ["colombia", "argentina", "north_af"],
  },
  argentina: {
    id: "argentina",
    name: "Argentina",
    short: "ARG",
    continent: "sa",
    x: 248,
    y: 444,
    path: "M 220 364 L 276 398 L 292 436 L 260 502 L 214 484 L 204 416 Z",
    neighbors: ["colombia", "brazil"],
  },

  // ---- Europe ----
  uk: {
    id: "uk",
    name: "Britain",
    short: "GBR",
    continent: "eu",
    x: 400,
    y: 132,
    path: "M 366 108 L 424 100 L 434 148 L 382 162 L 360 138 Z",
    neighbors: ["canada", "nordic", "west_eu"],
  },
  nordic: {
    id: "nordic",
    name: "Scandinavia",
    short: "NOR",
    continent: "eu",
    x: 506,
    y: 108,
    path: "M 454 84 L 544 74 L 564 126 L 514 144 L 456 130 Z",
    neighbors: ["uk", "west_eu", "east_eu", "ural"],
  },
  west_eu: {
    id: "west_eu",
    name: "West Europe",
    short: "WEU",
    continent: "eu",
    x: 444,
    y: 196,
    path: "M 392 168 L 486 156 L 494 222 L 420 232 L 388 206 Z",
    neighbors: ["uk", "nordic", "east_eu", "north_af"],
  },
  east_eu: {
    id: "east_eu",
    name: "East Europe",
    short: "EEU",
    continent: "eu",
    x: 544,
    y: 184,
    path: "M 486 144 L 594 134 L 604 218 L 494 222 Z",
    neighbors: ["nordic", "west_eu", "ural", "middle_east", "egypt"],
  },

  // ---- Africa ----
  north_af: {
    id: "north_af",
    name: "Sahara",
    short: "SAH",
    continent: "af",
    x: 446,
    y: 300,
    path: "M 392 264 L 498 258 L 502 336 L 418 344 L 384 304 Z",
    neighbors: ["brazil", "west_eu", "egypt", "congo"],
  },
  egypt: {
    id: "egypt",
    name: "Egypt",
    short: "EGY",
    continent: "af",
    x: 544,
    y: 298,
    path: "M 498 258 L 590 264 L 584 336 L 502 336 Z",
    neighbors: ["east_eu", "north_af", "congo", "middle_east"],
  },
  congo: {
    id: "congo",
    name: "Congo",
    short: "CON",
    continent: "af",
    x: 496,
    y: 374,
    path: "M 432 344 L 564 336 L 560 408 L 448 410 Z",
    neighbors: ["north_af", "egypt", "south_af"],
  },
  south_af: {
    id: "south_af",
    name: "South Africa",
    short: "SAF",
    continent: "af",
    x: 504,
    y: 448,
    path: "M 448 410 L 560 408 L 540 488 L 474 488 Z",
    neighbors: ["congo"],
  },

  // ---- Asia ----
  ural: {
    id: "ural",
    name: "Ural",
    short: "URA",
    continent: "as",
    x: 664,
    y: 128,
    path: "M 594 94 L 722 86 L 728 172 L 604 176 Z",
    neighbors: ["nordic", "east_eu", "siberia", "middle_east", "china"],
  },
  siberia: {
    id: "siberia",
    name: "Siberia",
    short: "SIB",
    continent: "as",
    x: 808,
    y: 122,
    path: "M 722 86 L 882 82 L 906 144 L 844 172 L 728 172 Z",
    neighbors: ["ural", "china", "japan"],
  },
  middle_east: {
    id: "middle_east",
    name: "Middle East",
    short: "MDE",
    continent: "as",
    x: 642,
    y: 244,
    path: "M 594 210 L 694 198 L 702 288 L 614 294 L 590 256 Z",
    neighbors: ["east_eu", "egypt", "ural", "india"],
  },
  india: {
    id: "india",
    name: "India",
    short: "IND",
    continent: "as",
    x: 734,
    y: 280,
    path: "M 694 228 L 784 236 L 774 328 L 718 338 L 692 288 Z",
    neighbors: ["middle_east", "china", "indonesia"],
  },
  china: {
    id: "china",
    name: "China",
    short: "CHN",
    continent: "as",
    x: 806,
    y: 214,
    path: "M 728 172 L 866 172 L 876 254 L 784 260 L 724 228 Z",
    neighbors: ["ural", "siberia", "india", "japan", "indonesia"],
  },
  japan: {
    id: "japan",
    name: "Japan",
    short: "JPN",
    continent: "as",
    x: 928,
    y: 204,
    path: "M 902 166 L 952 174 L 960 228 L 916 244 L 896 208 Z",
    neighbors: ["siberia", "china", "alaska"],
  },

  // ---- Oceania ----
  indonesia: {
    id: "indonesia",
    name: "Indonesia",
    short: "IDN",
    continent: "oc",
    x: 794,
    y: 374,
    path: "M 738 352 L 844 352 L 856 392 L 750 398 Z",
    neighbors: ["india", "china", "australia"],
  },
  australia: {
    id: "australia",
    name: "Australia",
    short: "AUS",
    continent: "oc",
    x: 842,
    y: 454,
    path: "M 776 418 L 896 414 L 906 488 L 800 494 L 768 462 Z",
    neighbors: ["indonesia", "new_zealand"],
  },
  new_zealand: {
    id: "new_zealand",
    name: "New Zealand",
    short: "NZL",
    continent: "oc",
    x: 944,
    y: 484,
    path: "M 924 456 L 966 462 L 962 512 L 920 508 Z",
    neighbors: ["australia"],
  },
};

export const TERRITORY_IDS = Object.keys(TERRITORIES) as TerritoryId[];

/** Sea-lane visual bridges drawn as soft dashed curves across ocean gaps. */
export const SEA_LANES: { from: TerritoryId; to: TerritoryId; wrap?: boolean }[] = [
  { from: "canada", to: "uk" },
  { from: "brazil", to: "north_af" },
  { from: "west_eu", to: "north_af" },
  { from: "uk", to: "nordic" },
  { from: "uk", to: "west_eu" },
  { from: "india", to: "indonesia" },
  { from: "china", to: "indonesia" },
  { from: "china", to: "japan" },
  { from: "siberia", to: "japan" },
  { from: "indonesia", to: "australia" },
  { from: "australia", to: "new_zealand" },
  { from: "alaska", to: "japan", wrap: true },
];

export function isAdjacent(a: TerritoryId, b: TerritoryId): boolean {
  return TERRITORIES[a].neighbors.includes(b);
}
