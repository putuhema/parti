// The isometric grid Juragan's board is drawn on.
//
// A classic 2:1 projection. Each grid cell is a diamond TW wide and TH tall. Every space is a tile image drawn
// on a TILE × TILE canvas: the top face is the diamond, the two side faces drop DEPTH below it, and HEAD pixels of
// headroom above let art (a gate, a monument) stand taller than the tile. See public/boom/tiles/README.md.
//
//            HEAD (44)       ← room for art that sticks up
//          ◇  top face       ← 128 × 64 diamond, centre at ANCHOR (64, 76)
//          ▯▯ side faces     ← DEPTH (20) deep
//
// The grid can be turned in quarter turns. `turn` maps a cell to where it ends up, and `place` gives the
// diamond centre of a cell in world pixels plus its draw order (cells further down the screen are drawn later).

export const TW = 128;
export const TH = 64;
export const DEPTH = 20;
export const HEAD = 44;
export const TILE = 128;
/** Where the centre of the top face sits inside a tile image. */
export const ANCHOR = { x: TW / 2, y: HEAD + TH / 2 };
/** How thick the land (the plus) is above the sea, and how deep the sea's own base is. */
export const SLAB = 22;
export const SEA = 12;

export type Rot = 0 | 1 | 2 | 3;
export type Cell = { col: number; row: number };

/** Where a cell lands after `rot` quarter turns, on a grid of `cols` × `rows`. */
export function turn({ col, row }: Cell, cols: number, rows: number, rot: Rot): Cell {
  switch (rot) {
    case 1: return { col: rows - 1 - row, row: col };
    case 2: return { col: cols - 1 - col, row: rows - 1 - row };
    case 3: return { col: row, row: cols - 1 - col };
    default: return { col, row };
  }
}

/** The grid's size after turning (a quarter turn swaps columns and rows). */
export const turnedSize = (cols: number, rows: number, rot: Rot) => (rot % 2 ? { cols: rows, rows: cols } : { cols, rows });

/** The whole board's size in world pixels. */
export function worldSize(cols: number, rows: number) {
  const k = cols + rows;
  return { w: (k * TW) / 2, h: HEAD + (k * TH) / 2 + DEPTH + SLAB + SEA };
}

/** The centre of a turned cell's top face, in world pixels, and its draw order. */
export function place({ col, row }: Cell, rows: number) {
  return { x: ((col - row + rows) * TW) / 2, y: HEAD + ((col + row) * TH) / 2 + TH / 2, z: col + row };
}

/** The diamond around a point, as an SVG points string (`dy` drops it, e.g. to ground level). */
export function diamond(x: number, y: number, dy = 0) {
  return `${x},${y - TH / 2 + dy} ${x + TW / 2},${y + dy} ${x},${y + TH / 2 + dy} ${x - TW / 2},${y + dy}`;
}
