// Your tile art for Juragan's isometric board.
//
// Draw a tile on the template in public/boom/tiles/_template.svg, export it as a 256 × 256 PNG (or SVG, or WebP)
// into public/boom/tiles/, then add a line below. Any key you leave out keeps the built-in placeholder.
//
// Keys, from most specific to least: "space-<n>" (one space, 0 is Start), then the kind of space:
//   lot-0 … lot-7    a town, by island group (0 Papua, 1 Maluku & Nusa Tenggara, 2 Sulawesi, 3 Kalimantan,
//                    4 Sumatra, 5 Bali & Lombok, 6 Jawa, 7 Jakarta)
//   hub              pelabuhan, bandara, stasiun, terminal
//   start, jail, jackpot, wheel        the four corners (Start, Diperiksa, Dana Aspirasi, Kampanye)
//   surprise, bonus, tax               Kejutan, Serangan Fajar, Pungli
//   ground                              the empty cells inside the ring
//
// Names, prices and owner colours are laid on top of your art by the game, so leave the top face free of text.

export const TILE_ART: Record<string, string> = {
  // "lot-6": "/boom/tiles/lot-jawa.png",
  // "start": "/boom/tiles/start.png",
  // "ground": "/boom/tiles/ground.png",
};

/** Set to false once your art carries its own labels and you don't want the game's flat names on top. */
export const SHOW_LABELS = true;
