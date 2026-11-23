# Juragan tile art

The board is a 2:1 isometric grid. Each space is one tile image.

| | 1x (in game) | 2x (draw at this) |
|---|---|---|
| Canvas | 128 × 128 | 256 × 256 |
| Top face (diamond) | 128 × 64, top vertex at y 44 | 256 × 128, top vertex at y 88 |
| Side faces | 20 deep | 40 deep |
| Headroom above the top face | 44 | 88 |
| Anchor (centre of the top face) | (64, 76) | (128, 152) |

Start from `_template.svg`. Light comes from the top left, so the left side face is lighter than the right one.
Keep the dashed red area in the middle of the top face fairly plain: the game writes the space's name and price
there, flat on the tile, and figures and buildings stand on the anchor.

The board rotates in quarter turns, but tile images are never rotated, so draw them so they look right from
this one angle.

Then register the file in `src/components/boom/tiles.ts`:

```ts
export const TILE_ART: Record<string, string> = {
  "lot-6": "/boom/tiles/lot-jawa.png",
};
```

Keys: `space-<n>` for one space, or `lot-0` … `lot-7` (by island group), `hub`, `start`, `jail`, `jackpot`,
`wheel`, `surprise`, `bonus`, `tax`, and `ground` for the empty cells inside the ring.
