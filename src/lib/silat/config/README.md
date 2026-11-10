# Raja Silat config

Tweak the game here without touching code. Save a file and the dev server reloads. If something is wrong
(a typo, a missing number, a move that doesn't exist), the game stops with an error that names the file and
the field, e.g. `Raja Silat config (enemies.json): variants.dukun uses move "mendd", which isn't in "moves"`.
Keys that start with `_` are comments and are ignored. Run `bun test src/lib/silat` after big changes:
some tests check exact numbers, so they'll tell you what you changed.

## balance.json — the rules
| Group | What's in it |
|---|---|
| `hero` | starting HP and gold, Tenaga per turn, hand size, healing after fights / at the campfire / in the shop |
| `push` | crash damage (`bump` + 1 per `crashPerSquares` flown, up to `crashMax`), heavy pieces at the edge, how far heavy pieces slide, guard and slam reach |
| `dice` | the d20 needed for enemy jabs, your dodge and your kick-back |
| `enemies` | how often a leader calls a pawn, gold per knockout |
| `difficulty` | the army budget formula, elite multiplier and HP bonus, HP and hit growth per prison, how many enemies act per turn |
| `bosses` | boss HP and hit per depth; `powersByDepth`: `[[3, 1], [5, 2], [99, 3]]` = 1 power up to depth 3, 2 up to 5, then 3 |

## cards.json — every card
```json
"tendang": { "name": "Tendang", "cost": 1, "type": "Serang", "text": "Hit {dmg}, send it flying", "values": { "dmg": 1 } }
```
- `type`: `Serang` (attack), `Gerak` (move), `Tangkis` (block), `Jurus` (power), `Siasat` (tactic).
- `style`: `harimau`, `bangau` or `ular` (shows up more for that style). `tier`: 1, 2 or 3 (when it starts
  appearing; leave it out for basics that are never offered). `rare`, `exhaust`: `true`/`false`.
- `values`: the card's numbers. `{name}` in `text` shows the value, so changing `"dmg": 1` to `2` changes both the
  card and its text. Only rename or remove a value if you know the code doesn't use it.
- `starterDeck`: the deck every run starts with. `styleCards`: each style's signature card(s).

### Making a brand-new card without code
Give it a `target` and a list of `effects`. They run in order:
```json
"beruntun": {
  "name": "Pukulan Beruntun", "cost": 1, "type": "Serang", "tier": 2,
  "text": "Hit a neighbor {hits} times for {dmg}",
  "values": { "dmg": 1, "hits": 3 },
  "target": "adjacentUnit",
  "effects": [ { "do": "hit", "dmg": "dmg" }, { "do": "hit", "dmg": "dmg" }, { "do": "hit", "dmg": "dmg" } ]
}
```
- `target`: `self`, `adjacent` (a piece or object next to you), `adjacentUnit` (an enemy next to you),
  `emptyAdjacent` (an empty square next to you), `knight` (an empty knight jump), `anyUnit`, `lineUnit` (first
  enemy in a straight or diagonal line).
- `effects` (`"do"`): `kick` (`dmg`, `push` = a number or `"fly"`, `crash`), `hit` (`dmg`, no push), `push`
  (`push`), `block` (`amount`), `draw` (`n`), `move` (step onto the target square), `lock` (the target loses its
  action), `heal` (`amount`, you), `tenaga` (`n`).
- A number can be written directly (`"dmg": 2`) or as the name of one of the card's values (`"dmg": "dmg"`).
- `pattern` (optional): the little 5×5 picture, square numbers 0–24 with 12 = you, e.g. `{ "7": "hit" }`
  (marks: `hit`, `push`, `go`, `guard`).
- A card made only of `hit` effects can also be used for captures (its total damage).

## enemies.json — pieces, movesets, bosses
- `pieces`: base HP, hit, heavy, and budget `cost` for each chess piece (`p n b r q k`).
- `moves`: signature moves. Each has a `kind` that sets how it behaves; the rest are its numbers:
  | kind | Does | Numbers |
  |---|---|---|
  | `kick` | when you stand right beside it and its normal attack can't reach you: damage, then pushes you away | `damage`, `push` |
  | `block` | gains a shield that soaks damage until the next enemy turn, when you're within `range` | `amount`, `range` |
  | `heal` | heals the most hurt ally (or itself) within `range` | `amount`, `range` |
  | `summon` | calls a piece next to itself | `piece` |
  | `command` | an ally within `range` acts next turn and hits `bonus` harder once | `bonus`, `range` |
  | `decree` | every ally within `range` acts next turn and hits `bonus` harder | `bonus`, `range` |
  | `slam` | when you're within `range`: hits you and every square next to you | `range` |
  | `beam` | when you're in a straight or diagonal line with it: hits everything along that line, its own pieces too | `damage` |
  | `whirl` | when you're next to it: hits you and knocks everything around it `push` squares away | `damage`, `push` |
  | `pounce` | leaps to an empty square next to you (up to `range` away) and strikes | `damage`, `range` |
  | `curse` | shuffles `count` copies of `card` (from cards.json, e.g. `kram`) into your draw pile for this fight | `card`, `count` |

  `summon` also takes `count`, and `heal` takes `all: true` to heal every hurt ally. `damage` left out = the piece's
  own hit. Slam is a move too: only pieces that list it slam (plain Rooks do; Queens and Kings don't).

  Every move also has `cooldown` (turns to wait after using it), a `name` and a `text` (with `{placeholders}`).
- `variants`: the enemies a fight can contain. Each is a `piece` with optional `name`, `hp`, `hit`, `moves` (tried in
  order, before its normal chess move), `traits`, and when it can appear: `weight`, `minRow`/`maxRow` (map floor,
  0 = Warm-up … 6 = boss) and `minDepth` (which prison). Every piece needs at least one variant.
  Example: give knights a second kind of horse:
  ```json
  { "id": "war_horse", "piece": "n", "name": "Kuda Perang", "hp": 7, "moves": ["back_kick"], "weight": 1, "minDepth": 2 }
  ```
- `traits`: boss and elite powers (name and text; what they do is in code). `eliteTraits`: the ones elites can get.
- `bosses`: the first boss (`first`, with its `kit`), which `pieces` generated bosses can be, the `epithets` for
  their names, and the `powers` (traits) they draw from.
- `bosses.kits`: boss **movesets**. A boss cycles through its `pattern` (skipping any move that can't happen right
  now) and switches to `phase2` below half HP. A generated boss picks a kit for its piece, and its name is one of the
  kit's `titles` plus an epithet. Every piece in `pieces` needs at least one kit with `titles`. Example:
  ```json
  { "id": "ratu_badai", "piece": "q", "titles": ["Ratu Badai"], "name": "Storm Queen",
    "pattern": ["beam", "decree", "beam"], "phase2": ["beam", "whirl", "beam"] }
  ```
