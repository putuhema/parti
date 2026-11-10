# Your own sprites for Raja Silat

Drop images in this folder, list them in `sprites.json`, reload the game. Anything you haven't
listed keeps the built-in art, so you can add sprites one at a time.

## Drawing them

- Each frame is **256×256**, **transparent background**.
- Frames sit **side by side in one horizontal strip**: 4 frames = 1024×256. Every frame the same size.
- Keep the character centred, **feet on the same line in every frame (85% down, y = 218)**,
  or the piece jitters as it animates. `example-*.png` show the guide line and frame dots.
- PNG or WebP. Any drawing app that exports frames works: Aseprite, Piskel (free, in the browser),
  Procreate (Animation Assist → export frames, then put them in a strip), Krita.

## Listing them in sprites.json

```json
{
  "hero":   { "idle": { "file": "hero-idle.png", "frames": 6, "fps": 8 },
              "kick": { "file": "hero-kick.png", "frames": 5, "fps": 14 },
              "hit":  { "file": "hero-hit.png",  "frames": 3, "fps": 14 } },
  "knight": { "idle": { "file": "knight.png" } }
}
```

- **Who:** `hero`, `pawn`, `knight`, `bishop`, `rook`, `queen`, `king` (the King in normal fights),
  `boss` (Raja Hitam).
- **Animations:** `idle` (loops; required, everything else is optional) and `hit` (plays when that piece
  takes damage) for everyone. The hero also has `kick` (kicks and captures), `step` (moved to another
  square), `block` (Block or a readied card stopped a hit), `dodge`, `win` (loops when the fight is won)
  and `ko` (plays once when you lose and stays on its last frame).
- Draw the hero **facing right**: the game mirrors it when it kicks or walks left.
- `pixel: true` keeps small pixel art crisp (frames can then be any square size, e.g. 32×32).
- `frames` defaults to 1 (a still picture). `fps` defaults to 8 for idle and 14 for kick and hit.
- Keys starting with `_` are ignored. To try the example on the hero, rename `_example` to `hero`.

The example sheets come from `scripts/make-example-sprites.py`. The hero's pixel strips (`hero-*.png`) come from
`scripts/make-hero-pixel.py`: each animation there is a list of poses you can edit, then run the script again.
