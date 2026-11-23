// Every picture on Juragan's board, in one place: swap any of them for your own art, and animate it.
//
// Drop a file in public/boom/ (PNG, WebP, SVG, or an animated GIF / APNG / WebP, which just play), then add a line
// below. Anything you leave out keeps the built-in drawing (and its built-in motion).
//
//   "diorama:perahu": { src: "/boom/sea/perahu.png", anim: "bob" },
//   "diorama:kapal":  { src: "/boom/sea/kapal-sheet.png", frames: 6, fps: 8 },   // a sprite sheet, frames in one row
//   "tile:lot-6":     { src: "/boom/tiles/lot-jawa.png" },
//   "building:3":     { src: "/boom/buildings/hotel.png", scale: 1.2, dy: -4 },
//
// KEYS
//   tile:<key>        the block a space sits on (128 × 128, see public/boom/tiles/README.md). <key> is space-<n> for
//                     one space, or lot-0 … lot-7 (by island group), hub, start, jail, jackpot, wheel, surprise,
//                     bonus, tax, judol, fish, and ground for the cells off the track.
//   diorama:<scene>   the little scene standing on a space or out at sea: lot-0 … lot-7, Pelabuhan, Bandara,
//                     Stasiun, Terminal, start, jail, jackpot, wheel, surprise, bonus, tax, judol, fish, and the
//                     extras islet, perahu, kapal, ikan (a jumping fish) and dewan (the Gedung Dewan in the middle).
//   building:<level>  what stands on a bought town: 0 empty lot, 1 warung, 2 ruko, 3 hotel.
//   fish:<key>        what you catch at Mancing: teri, kembung, tongkol, kerapu, tuna, sepatu, botol, karung.
//
// FIELDS
//   src      the image.
//   frames   for a sprite sheet: how many frames, side by side in one row. fps sets the speed (default 8).
//   anim     a motion preset on top: bob, sway, float, pulse, spin, wiggle, blink, jump, or none.
//   scale    bigger or smaller than its slot (1 = fills it). dx / dy nudge it, in world pixels.

export type Anim = "none" | "bob" | "sway" | "float" | "pulse" | "spin" | "wiggle" | "blink" | "jump";
export type Asset = { src: string; frames?: number; fps?: number; anim?: Anim; scale?: number; dx?: number; dy?: number };

export const ASSETS: Record<string, Asset> = {
  // "diorama:perahu": { src: "/boom/sea/perahu.png", anim: "bob" },
};

/** Motion for the built-in drawings, when there's no override. */
export const DEFAULT_ANIM: Record<string, Anim> = {
  "diorama:perahu": "bob",
  "diorama:kapal": "bob",
  "diorama:Pelabuhan": "bob",
  "diorama:islet": "float",
  "diorama:ikan": "jump",
  "diorama:judol": "pulse",
};

/** Set to false once your tile art carries its own labels and you don't want the game's flat names on top. */
export const SHOW_LABELS = true;

/** The override for a key, if there is one. */
export const assetFor = (key: string): Asset | undefined => ASSETS[key];
/** The motion for a key: the override's, or the built-in one. */
export const animFor = (key: string): Anim => ASSETS[key]?.anim ?? DEFAULT_ANIM[key] ?? "none";
