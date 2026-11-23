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

Then register the file in `src/components/boom/assets.ts`:

```ts
export const ASSETS: Record<string, Asset> = {
  "tile:lot-6": { src: "/boom/tiles/lot-jawa.png" },
  "tile:start": { src: "/boom/tiles/start-sheet.png", frames: 8, fps: 10 }, // an animated sprite sheet
};
```

Tile keys: `tile:space-<n>` for one space, or `tile:lot-0` … `tile:lot-7` (by island group), `tile:hub`,
`tile:start`, `tile:jail`, `tile:jackpot`, `tile:wheel`, `tile:surprise`, `tile:bonus`, `tile:tax`, `tile:judol`,
`tile:fish`, and `tile:ground` for the cells off the track.

The same file swaps everything else too: the little dioramas on each space and out at sea (`diorama:…`), the
buildings (`building:0` … `building:3`) and the catches at Mancing (`fish:…`). Any of them can be a still image,
an animated GIF/APNG/WebP, or a sprite sheet, with a motion preset (`bob`, `sway`, `float`, `pulse`, `spin`,
`wiggle`, `blink`) on top.
