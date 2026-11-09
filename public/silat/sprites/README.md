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
- **Animations:** `idle` (loops; required, everything else is optional), `kick` (hero only: plays
  when you kick or capture), `hit` (plays when that piece takes damage).
- `frames` defaults to 1 (a still picture). `fps` defaults to 8 for idle and 14 for kick and hit.
- Keys starting with `_` are ignored. To try the example on the hero, rename `_example` to `hero`.

The example sheets come from `scripts/make-example-sprites.py`.
