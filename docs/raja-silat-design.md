# Raja Silat — design

> A roguelike deckbuilder on a chess board. You are a king who never captures: you kick, throw
> and shove chess pieces around with *pencak silat*. Your deck is your fighting style. Every
> enemy shows its next move, so every turn is a puzzle: "what can I do with *this* hand?"

Inspiration, not copies:
- *Shotgun King*: a familiar chess board plus a new way to fight is enough for a great roguelike.
- *Slay the Spire*: enemy intents, a fresh hand every turn, a deck you shape over a run, a map, relics.
- Also worth studying: *Into the Breach* (full previews, bonus goals), *Fights in Tight Spaces*
  (a grid deckbuilder with pushes) and *Pawnbarian* (chess-move cards). Our difference: everything
  moves and fights like chess pieces. That covers card shapes, promotion, castling, pawns
  marching to promote, and charging rooks you can sidestep.

---

## 1. Pillars

1. **Push, don't take.** Damage comes from pieces hitting walls, objects, each other, the board
   edge, and their own allies. The board is your weapon.
2. **You can always see it coming.** Every enemy shows its next action, and every card shows
   exactly what it will do before you play it. No reflex timing. The only randomness is your card
   draw and the **d20 reaction rolls** (section 17): previews always show the worst roll.
3. **Flashy beats safe.** The game rewards big chain reactions and fast wins more than slow, careful
   turtling.
4. **Fun in the first minute.** A new player makes a chain reaction in their first fight.
5. **Short and on the phone.** A fight is 2–4 minutes, a run is 25–35 minutes, one thumb.

---

## 2. Where it lives

Its **own section in Parti**: a fourth tab in the game switcher (Sudoku · Chess · Words · **Silat**),
at `/silat`. Section home: continue run, new run, best run, card collection, and later the daily puzzle.

It borrows code from Chess but is not part of Chess: the `Board` and `Piece` components, and the
seeded RNG and map generator from Chess Journey (`src/lib/journey.ts`).

---

## 3. A fight

### Board
- Act I **6×6**, Act II **7×7**, Act III **8×8**.
- Enemies start on the **second row from the top**, not the edge, so nothing can be knocked off
  on turn 1.

### Terrain
| Terrain | Effect |
|---|---|
| **Pillar** | Blocks movement. A piece pushed into it takes 2 damage. |
| **Hole / Lava** | A piece pushed onto it gets a Ring Out (see push rules). |
| **Mud** | A pushed piece stops on it. |
| **Rope bridge** | Breaks after one piece crosses it and becomes a hole. |

### Objects (Benda): toys for chain reactions
Objects sit on squares, block movement, and can be pushed like pieces.

| Object | Effect |
|---|---|
| **Batu** (boulder) | Can't be destroyed. A heavy projectile: kick it into pieces. |
| **Petasan** (firecracker crate) | When hit or collided with, it **explodes**: 2 damage to all 8 squares around it and pushes them 1 outward. Sets off other Petasan. |
| **Gerobak** (cart) | When pushed, it rolls **until it hits something**: 3 damage to what it hits. |
| **Pohon Kelapa** (coconut tree) | Blocks like a pillar. Kick it and a coconut drops on the square on the far side: 3 damage. |
| **Kentongan** (bell post) | Hit it: every enemy within 2 squares loses its intent this turn. One use. |

### You
- **HP 20**, carried through the run, healed at the campfire.
- **Tenaga** (energy): **3 per turn**, refills every turn.
- **Block**: absorbs damage, resets at the start of your turn.
- **Free step**: once per turn, move 1 square like a chess king. It's not a card, so you're never
  stuck without movement.

### Turn order
1. **Your turn starts**: draw **up to** 5 cards, Tenaga refills to 3, Block resets to 0.
2. **Act**: build a **combo** of cards and your free step, see it previewed, press **Play**. Repeat as
   often as Tenaga allows. **No undo**: once a combo is played it's locked in (section 17).
3. **End turn**: discard your hand. The End Turn button shows the damage you're about to take.
4. **Enemies act** in the order their intents show.
5. **Pawns march** (section 3, "The clock"). Then enemies lock in new intents.

### Push rules (the heart of the game)
A pushed piece slides square by square:
- **Into another piece or an object** → **both take 2 damage** (a Benturan). The pushed piece
  stops in front of it. The piece it hit doesn't move.
- **Into a pillar** → the pushed piece takes 2 damage and stops.
- **Onto mud** → stops there.
- **Off the board, onto a hole or lava (a Ring Out)**:
  - **Light** pieces (pawn, knight, bishop) are knocked out. Instantly. With a gong.
  - **Heavy** pieces (rook, queen, king, bosses) take **5 damage** and cling to the edge square.
- A diagonal push only checks the square it moves into. It can slip between two pieces.

### Enemies
| Piece | HP | Weight | Hits for | Intent |
|---|---|---|---|---|
| Pawn | 3 | Light | 1 | Strike |
| Knight | 5 | Light | 2 | Strike |
| Bishop | 5 | Light | 2 | Charge |
| Rook | 7 | Heavy | 3 | Charge |
| Queen | 7 | Heavy | 3 | Charge |
| King | 10 | Heavy | 2 | Strike or flee. The fight's target |

Pieces show HP as a number and visibly **crack** as they lose it.

### Intents (shown before your turn)
Each enemy turn, the **N** enemies closest to you lock in an intent, drawn as an arrow with a
number showing the order they act in. N is 2 in Act I, 3 in Act II, 4 in Act III.

- **Strike** (pawn, knight, king): aims at **one square: yours or one next to it** that it can
  capture on with its chess move. Whatever stands there when it acts takes the hit. Enemies pick
  squares together to **box you in**: they cover the squares you'd most likely step to.
- **Charge** (bishop, rook, queen): picks a *direction* pointing at you. It slides that way
  **until it hits something**, damages the first thing it hits (you, **its own ally**, an object,
  or a pillar, which hurts the charger instead), and stops next to it.
- **Move**: walks toward you by its chess move.

**Angry pieces join in:** any piece you damage but don't knock out acts next enemy turn, even past
the N limit. Idle pieces aren't free punching bags.

**SKAK!** If your square and every square you could step to are all under attack, the board
flashes "SKAK!" and you need a card (Block, a dodge, or a kick that breaks the trap) to get out clean.

Intents are **locked**: enemies never re-aim after you act. That creates the puzzles:
- **Step to a square nobody aimed at** → their Strikes miss.
- **Step out of a Charge's line (the matador)** → it flies past and slams into whatever is behind
  you, often its own ally, a Petasan, or off the board.
- **Push a piece into a Charge's line or onto a Strike's square** → the enemy hits its own ally.

> Why charges: with short pushes and a 1-square step, you can never push a piece onto the exact
> square you just left. So "make them hit each other" needs attacks that travel along a line.

### The enemy king
- Strikes you if you're in its reach. Otherwise it **flees** to the square farthest from you.
- **Castling escape (Rokade)**: once per fight, when it drops below half HP, it swaps places with
  the ally farthest from you. Rushing the king works, but not in one turn.

### The clock: pawns march and promote
At the end of every enemy turn, **every pawn that didn't act moves 1 square toward your side**. A
pawn that reaches the bottom row **promotes into a queen**. Waiting around makes the fight harder,
which stops stalling the chess way.

### Win and lose
- **Win**: knock out the enemy king. The other pieces kneel and the fight ends.
- **Other floor goals**: *Survive 8 turns*, *Ring out 4 pieces*, *Protect the villager* (a neutral
  pawn that must survive).
- **Lose**: 0 HP ends the run.

### Bonus goal (Tantangan)
Every fight shows one **optional** bonus goal at the start. Doing it gives a rarer card choice or
+20 gold. These reward flashy play:
- *Ring out 2 pieces in one turn*
- *Make an enemy hit its own ally 2 times*
- *Win within 4 turns*
- *Win without taking damage*
- *Reach a 4-hit combo*
- *Blow up 2 Petasan in one chain*

### Combo
Every hit caused by one card after the first adds +1 combo. Combo 3+ gives slow motion, a gong and
1 gold per hit (max 15 gold per fight). Your best combo is shown at the end of the run.

---

## 4. Example turn

```
  a b c d e f
6 . . n . . .      Rook intent:   1 CHARGE → along rank 4, at you (3 damage).
5 . . . . . .      Knight intent: 2 STRIKE d4, your square (2 damage).
4 r . . K . p      A pawn sits behind you on f4.
3 . . . . . .      Hand: Tendang, Tangkis, Tangkis, Langkah Kuda, Tarik. Tenaga 3.
```
- **Play Tangkis ×2 and stay**: Block 6 absorbs the 5 damage, but nothing else happens.
- **Free step to c5 (the matador)**: you're off rank 4, so the rook charges past and slams into
  its own pawn on f4 for 3. The pawn breaks and the rook stops on e4. The knight strikes an empty d4.
- **Then, with all 3 Tenaga left**: the knight on c6 is right above you, on the top edge, and it's
  light. **Tendang** it upward: Ring Out. Two enemies gone, no damage taken.
  Spend the last 2 Tenaga on **Tangkis ×2** (Block 6) for the next round.

Before you commit, the board shows all of this as a preview: the rook's path, the pawn breaking,
the knight falling off, and "Incoming: 0" on the End Turn button.

---

## 5. Seeing everything before you commit

Planning should feel smart, not like trial and error.
- **Drag a card onto the board** and the result shows as a ghost before you let go: the push path,
  damage numbers on each piece, a skull on Ring Outs, Petasan blast areas.
- **Enemy forecast**: while you plan, each intent updates to show what it will hit *after* your
  move ("hits its own pawn").
- **End Turn shows incoming damage** ("Incoming: 3"). It turns red if you'd take damage you could
  still avoid with a card in your hand.
- **Combo preview**: everything you queue is previewed together, with numbered markers on the board.
  Remove a step (and everything after it) any time before Play. No undo after Play.
- **Tap and hold** any piece, object or card to see its rules in one line.

---

## 6. Cards

### Card types
| Type | Color | What it is |
|---|---|---|
| **Serang** (attack) | red | Hit and push pieces |
| **Gerak** (move) | blue | Move your king in chess-piece shapes |
| **Tangkis** (defend) | green | Block, counters and planned dodges |
| **Jurus** (power) | purple | Lasts the whole fight. Your fighting style |

Every card shows a **small pattern** of squares: you in blue, where you go in green, what you hit in red.

### Parry and dodge without reflexes
No timing presses: input lag on the web would make them annoying. Instead, **parrying and dodging
are cards you plan from the intents**, and they get the same satisfying payoff:
- **Tangkisan**: when an enemy hits you, it gets **kicked back**, and the kick can collide.
- **Elakan**: you pick a square beforehand; the first attack that would hit you makes you hop there,
  so a charge flies past you into whatever is behind.
- Same slow motion, crack and gong as any big hit. The skill is in *reading* the attack, not
  reacting to it.

### Fighting styles (Perguruan): pick one at the start of a run
Each style adds a starting Pusaka and 2 cards, so runs feel different from the first fight.

| Style | Pusaka | Style cards | Plays like |
|---|---|---|---|
| **Harimau** (tiger) | **Cakar**: collisions you cause deal +1. | **Terkam** (1, Serang): hit for 2, push 2. · **Auman** (1, Serang): push every adjacent piece 1, gain Block 2. | Aggressive. Smash pieces together |
| **Bangau** (crane) | **Bulu Putih**: start each fight with Tangkisan in hand. | **Sayap Bangau** (1, Tangkis): Block 4, attackers are kicked back 2. · **Satu Kaki** (1, Jurus): if you don't use your free step, gain 3 Block. | Patient counters. Let them come |
| **Ular** (snake) | **Sisik**: your first Tarik each turn costs 0. | **Lilit** (1, Serang): pull a piece next to you, it loses its intent. · **Meliuk** (0, Gerak): step 1, draw 1. | Slippery. Pull, swap, reposition |

More styles unlock by playing (section 8).

### Starter deck (10)
3× Tendang · 3× Tangkis · 1× Langkah Kuda · 1× Tarik · 2 style cards.
Your **first hand of every fight** always has at least one Serang and one Gerak or Tangkis.

### Card set (≈30, plus style cards)
Cost in Tenaga. "+" is the upgraded version (campfire).

| Card | Cost | Type | Effect | + |
|---|---|---|---|---|
| **Tendang** | 1 | Serang | Hit an adjacent piece for 2, push 1. | 3 damage |
| **Tangkis** | 1 | Tangkis | Block 3. | Block 5 |
| **Langkah Kuda** | 1 | Gerak | Jump like a knight. | Costs 0 |
| **Tarik** | 1 | Serang | Pull a piece in a straight line (up to 3 away) until it's next to you. | Also deals 2 |
| **Tendangan Lurus** | 1 | Serang | Hit for 2, push 3. | Push 4 |
| **Tendangan Sabit** | 2 | Serang | Hit the 3 squares in an arc for 2 each, push 1. | 3 each |
| **Bantingan** | 1 | Serang | Throw an adjacent piece over you to the square behind you. 2 on landing. | 4 on landing |
| **Pukulan Dalam** | 1 | Serang | Hit for 5. No push. | 7 |
| **En Passant** | 0 | Serang | Hit for 3 a piece that moved next to you last enemy turn. | 5 |
| **Skak!** | 2 | Serang | If the enemy king is in a clear straight or diagonal line from you: 3 damage and it skips its next action. | Costs 1 |
| **Sapuan** | 1 | Serang | All adjacent pawns fall over: they skip their next action. | Any light piece |
| **Tolak Angin** | 2 | Serang | Push every adjacent piece 2 squares outward. | Also 1 damage each |
| **Badai** | 3 | Serang | Hit for 3, push 2. If it collides, repeat on the piece it hit (up to 4 times). *(rare)* | Costs 2 |
| **Sapu Benteng** | 2 | Gerak | Dash in a straight line until blocked. Kick what you hit: 2, push 1. | 3, push 2 |
| **Gajah Miring** | 1 | Gerak | Dash diagonally up to 3 squares. | Then draw 1 |
| **Pion Nekat** | 0 | Gerak | Step 1 square toward the top row. **Played on the top row, it promotes into Ratu for the rest of the run.** | Step 2 |
| **Ratu** | 1 | Gerak | Move like a queen, then play a free Tendang. *(only from promotion)* | Costs 0 |
| **Rokade** | 1 | Gerak | Swap places with any piece or object in a clear straight line. | Then Block 3 |
| **Harimau Lompat** | 2 | Gerak | Jump like a knight, then hit every adjacent piece for 2, push 1. *(rare)* | 3 each |
| **Tangkisan** | 1 | Tangkis | Block 2. Every enemy that hits you this turn is kicked back 1. | Block 4 |
| **Elakan** | 1 | Tangkis | Pick an empty adjacent square. The first time you'd be hit this turn, you hop there instead. | Two hops |
| **Kuda-kuda** | 2 | Tangkis | Block 8. You can't be pushed this turn. | Block 11 |
| **Kuncian** | 1 | Tangkis | Cancel an adjacent piece's intent. | Range 2 |
| **Gertak** | 0 | Tangkis | Turn one charging enemy to face you now (re-aim it through its allies). Exhaust. | No exhaust |
| **Momentum** | 2 | Jurus | All your pushes go 1 square further. *(rare)* | Costs 1 |
| **Gaya Harimau** | 1 | Jurus | Collisions you cause deal +1 damage. | +2 |
| **Gaya Ular** | 1 | Jurus | After your free step, draw 1 card. | Also +1 Block |
| **Gaya Monyet** | 2 | Jurus | Your first Gerak card each turn costs 0. | Costs 1 |
| **Gaya Bangau** | 1 | Jurus | When your Block absorbs a whole hit, gain 1 Tenaga next turn. | Also +2 Block |
| **Tenaga Dalam** | 2 | Jurus | +1 Tenaga every turn. Lose 1 HP every turn. *(rare)* | No HP loss |
| **Sumpah Pendekar** | 3 | Jurus | Each Ring Out refunds 1 Tenaga and draws 1 card. *(rare)* | Costs 2 |

**"Exhaust"** = removed for the rest of the fight once played.

### Curse cards (added by elites and taboos)
- **Lelah** (tired): can't be played. Gone after the fight.
- **Kram** (cramp): costs 1, does nothing. Exhaust.

---

## 7. Run structure

A map of paths like Chess Journey (fight, elite, treasure, campfire, shop, mystery, boss). After each
fight: **pick 1 of 3 cards** (or skip) plus gold.
- **Campfire**: heal 30% HP **or** upgrade a card.
- **Shop**: buy cards and Pusaka, pay to **remove** a card.
- **Mystery**: an event with a choice, e.g. a *dukun* offers a rare card for a curse.

### The first 10 minutes (fun from the start)
- **Fight 1 is handmade**, not random: a Petasan crate sits between two pawns, and the rook's charge
  lines up with them. The previews make the chain reaction easy to spot. No tutorial text, just
  short tips on the first card you drag.
- **Fights 1–3 come from a small set of handmade layouts** that each show off one idea: the
  matador, the Ring Out, the Petasan chain.
- **The first card reward always has a flashy card** (Badai, Tolak Angin or Sapu Benteng).
- **First fights are short**: 3–4 turns.

| Act | Place | Board | Terrain and objects | Boss |
|---|---|---|---|---|
| I | **Sawah** (rice fields) | 6×6 | Mud, Batu, Pohon Kelapa, Petasan | **Raja Hitam**: the enemy King (30 HP), the final boss. See section 17 |
| II | **Candi** (temple ruins) | 7×7 | Pillars, rope bridges, Kentongan, Gerobak | **Ratu Kembar**: twin queens (12 HP each); when one is hit, the other charges |
| III | **Kawah** (volcano crater) | 8×8 | Lava holes, Petasan, Gerobak | **Raja Putih**: the white king (30 HP) who also knows silat. His kicks **push you**, into pieces (2 damage) or lava (5) |

Bosses ignore "skip a turn" effects (Skak!, Sapuan, Kuncian): those deal 4 damage to them instead.

### Elite traits
Elites are normal fights where 1–2 pieces have a trait:
- **Berduri** (spiked): kicking it costs you 1 HP.
- **Licin** (slippery): your pushes move it 1 square further.
- **Berat** (heavy): a light piece that counts as heavy.
- **Pemanggil** (summoner): a pawn appears next to it every 3 turns.

### Pusaka (relics)
| Pusaka | Effect |
|---|---|
| **Keris Pusaka** | Tendang deals +1 damage. |
| **Kopi Tubruk** | +1 Tenaga on your first turn of each fight. |
| **Jamu Kunyit** | Heal 6 HP after every boss and elite. |
| **Selendang Merah** | Ring Outs give +5 gold. |
| **Peci Hitam** | See enemy intents one turn further ahead. |
| **Batu Akik** | Draw 6 cards instead of 5. |
| **Gong Kecil** | Combo 3+ gives 3 Block. |
| **Sandal Jepit** | Two free steps per turn. |

### Pantangan (taboos): optional risk
Before an elite or boss you **may** accept one taboo for a better reward (rare card, Pusaka, or
double gold). It's always your choice, never a forced trade.
- *The enemy queen acts twice.*
- *No free step this fight.*
- *Add 2 Lelah to your deck for this fight.*
- *One extra enemy intent each turn.*

---

## 8. Reasons to come back

- **Unlocks**: each run gives XP toward new cards, new Pusaka and the 4th style, **Monyet**
  (monkey: throws, cheap chaotic cards).
- **Ascension levels (Sabuk)**: belts from white to black. Each belt adds one rule, like "pawns
  march 2 squares".
- **Daily puzzle (Teka-teki Harian)**: one handmade position, one hand, win in one turn. Same for
  everyone, with a streak and leaderboard, like Sudoku's Daily Duel. A quick way to play without
  starting a run.

---

## 9. Feel (the "satisfying" part)

Builds on the tactile chess board: sliding pieces, landing squash, capture pop.
- **Play a card**: drag it up from the hand onto the board; the ghost preview shows the result.
- **Kick**: the king leans in for a moment, then the piece slides with an ease-out.
- **Hit-stop**: freeze 60 ms on each collision, short screen shake that grows with damage.
- **Cracks**: pieces crack more as their HP drops.
- **Ring Out**: the piece spins and falls off the board with a *gong*. The combo number pops up.
- **Petasan**: a pop, sparks, and the pieces around it fly outward.
- **Counter (Tangkisan)**: slow motion as the attacker is kicked back.
- **SKAK!**: the board edge pulses red and a drum hit plays.
- **Intents**: arrows pulse softly, the next to act is brightest, the target square shows a red X.
- **Fast enemy turns**: the whole enemy turn takes 2.5 seconds at most; tap to speed it up.
- **Haptics**: light tap on step, firm on kick, double buzz on collision, long on Ring Out.

---

## 10. Loopholes found and how they're fixed

A review of ways the game could get boring or be broken. The fixes are already in the rules above.

| # | Problem | Why it's boring | Fix |
|---|---|---|---|
| 1 | **The free step dodges every Strike.** Strikes aimed only at your square always miss. | Pawns and knights are harmless; only charges matter. | Strikes can aim at the squares *next to* you, and enemies coordinate to box you in. SKAK! when you're trapped. |
| 2 | **Stalling forever.** Step away every turn and never commit. | Fights drag, no tension. | **Pawns march and promote into queens.** Bonus goals reward fast wins. |
| 3 | **Ring Out is too cheap.** One 1-Tenaga kick removes a 7 HP rook on a small board. | Every fight is "kick it off the edge". | Heavy pieces take 5 damage instead. Enemies start one row in from the edge. |
| 4 | **Free punching bags.** Only N enemies act, so idle ones can be beaten up safely. | No risk, no thinking. | **Angry pieces**: anything you damage acts next turn. |
| 5 | **Rushing the king.** Burst it down on turn 1, every fight. | One strategy beats everything. | The king flees and has one castling escape. It sits behind its army. |
| 6 | **Boring starter deck.** Slay the Spire's Strike/Defend start is slow. | The first fights feel samey. | Styles at run start, handmade first fights, a flashy first reward. |
| 7 | **Dead hands.** Drawing 5 Tangkis when you need to attack. | "Nothing to do" turns. | The free step, guaranteed mix in the first hand, small decks via card removal. |
| 8 | **Trial and error.** Misreading a push or an intent and losing HP. | Feels unfair; players stop planning. | Ghost previews, intent forecasts, incoming-damage on End Turn, free undo. |
| 9 | **Lockdown cards on bosses.** Kuncian/Skak!/Sapuan every turn = a boss that never acts. | Boss fights become trivial. | Bosses turn skips into 4 damage. |

Smaller ones:
- **Combo gold farming** with a summoner elite → gold is capped at 15 per fight.
- **Badai chains forever** → max 4 repeats.
- **Long enemy turns** → 2.5 seconds max, tap to skip.

---

## 11. Rule details (so building it isn't guesswork)

- **Order inside the enemy turn**: intents resolve one by one in their shown order. Each one sees the
  board as it is at that moment.
- **An enemy that dies before acting** loses its intent.
- **A Move intent whose square is now taken**: the piece stays put.
- **A charge that starts next to something** hits it immediately without moving.
- **Two charges hitting each other**: the moving one damages the one standing still.
- **Strikes hit whatever is on the square**: you, an enemy, or an object (objects take no damage,
  except Petasan, which explodes).
- **Pushes into you**: enemies can't push you, except Raja Putih. When he does, you take 2 on a
  collision and 5 on lava, and you stop on the edge like a heavy piece.
- **Your free step** can go to any empty adjacent square, even one under attack.
- **Elakan's hop** happens before the hit lands. If the hop square is also attacked later in the
  turn, that attack still hits you there.
- **Petasan chains**: explosions resolve one at a time, closest first.
- **Pion Nekat** "top row" means the enemy's starting side.
- **Angry pieces** act after the N regular intents, in order of distance to you.

---

## 12. Later: co-op

Two friends, each a *pendekar* (fighter) with their own deck, on one board against one army. Plan
in the same turn, then resolve in seat order. Combos between players count double. Build after
solo works.

---

## 13. Tech and test plan

### Code
- **Client-only** for solo, like Chess Journey: run saved in `localStorage`, seeded RNG, no server.
- `src/lib/silat/rules.ts`: board, push, damage, intents, enemy AI, pawn march. Pure functions,
  no React.
- `src/lib/silat/cards.ts`: card data and effects. `src/lib/silat/run.ts`: map, rewards, shop, Pusaka.
- `src/app/silat/page.tsx` (section home) and `src/app/silat/run/page.tsx` (map and fights).
- Add **Silat** as the fourth tab in `GameSwitch` (`src/components/ui.tsx`).
- **Reuse `Board`**: `arrows` for intents, `marks` for danger squares, `size` for 6×6/7×7, the slide
  animation for pushes. Add: HP numbers, cracks, terrain, objects, ghost previews.
- The **preview uses the same rules code** as the real move: run the rules on a copy of the board
  and draw the result. One source of truth, so the preview can't lie.

### Testing (less trial and error)
- **Scenario tests**: small positions with an expected result, written straight from this doc. The
  example turn in section 4 is test #1. Every rule in section 11 gets one.
- **Lab screen** (`/silat/lab`, dev only): place any pieces and objects, pick any hand, play a turn.
  For trying ideas in seconds.
- **Bot playtester**: a simple script plays 1,000 fights with a greedy strategy after every rules
  change and reports:
  - average fight length (aim: 3–6 turns)
  - turns with at least one collision or Ring Out (aim: 60%+)
  - how long a "just keep stepping away" player survives (aim: it loses or gets nothing)
  - how often each card is played and wins
  - the strongest card and Pusaka, to spot anything broken

### Milestones
1. **One fight**: 6×6, the starter deck, free step, pushes, intents, pawn march, previews, undo,
   Petasan and Batu, win/lose. Plus the lab screen and scenario tests.
   *The test: is it fun in the first minute, and does it stay fun for 5 fights?*
2. **Cards and feel**: the full card set, styles, terrain, combo, bonus goals, hit-stop, sounds, upgrades.
3. **The run**: map, 3 acts, bosses, elites, Pusaka, Pantangan, shop, save/resume, the Silat tab.
4. **Coming back**: unlocks, belts, daily puzzle.
5. **Co-op**: Convex room, two fighters.

---

## 14. Decisions

| Date | Decision |
|---|---|
| 2026-11-06 | **Deckbuilder.** Cards replace fixed actions. Tenaga is the one energy number (3 per turn). |
| 2026-11-06 | **No reflex timing.** No timed parry or dodge, because of web input lag. Parry and dodge are planned cards (Tangkisan, Elakan). |
| 2026-11-06 | **Its own section in Parti**: a fourth "Silat" tab, not part of Chess. |
| 2026-11-06 | **Design review** (section 10): box-in Strikes, pawn march clock, heavy pieces, angry pieces, king escape, styles, objects, bonus goals, full previews and undo. |

## 15. Built so far (first playable, 2026-11-09)

Code: `src/lib/silat/` (rules, cards, run, tests), `src/components/silat/`, `src/app/silat/`.
Run the rule tests with `bun test src`.

- One 6×6 act: 6 fights + boss **Mandor Benteng** (rook, 24 HP, hits 4). Fight 1 is the handmade
  boulder-into-firecracker showcase. Card reward after each fight, run saved on the device.
- 18 cards (no styles, upgrades, shop, Pusaka or taboos yet). Placeholder art throughout.
- Tap a card, tap a target to preview, tap again to play. Free step, undo, incoming-damage forecast.

Rule changes found while building and playtesting:
- **The king holds its throne** and strikes if you're next to it. Fleeing every turn made fights a
  long chase. King: 16 HP, hits 3. Its castling escape (once, below half HP) is in.
- **A pushed piece loses a plan it can no longer do** from its new square (it would otherwise teleport).
- **Stuck pieces don't use up the action limit**; the slots go to pieces that can act.
- **Boulders don't move in explosions** (a blast bounced the boulder back into you).
- Heal after a fight is 2 HP.

**Villagers (Warga), added after the first playtest felt boring and easy.** A bot that uses the
forecast won ~100% of runs and lost ~1 HP per fight: seeing every attack plus a free step made
dodging trivial. Now each fight has villagers (3 HP) that enemies also attack. A villager who dies
costs you 3 HP that Block can't stop; saving them all heals 3 extra after the fight. Tendang on a
villager shoves it without hurting it. Enemies act in order of how close they are to their prey
(you or a villager), and from floor 3, 3 of them act each turn (4 from floor 6).
After this change the same bot wins ~70% of runs, loses ~3.7 HP and ~0.9 villagers per fight,
and fights last ~5 turns. Losses cluster on floors 5–7.

**Billiards kicks and smarter enemies, added after the second playtest ("kicks too small, enemies
stupid").**
- A kicked piece flies until it hits something. A crash deals 2, +1 per square flown (max 7), and
  knocks what it hit one square on (Newton's cradle), so one kick can chain. Heavy pieces slide at
  most 2. Explosions send enemies flying. Villagers are only ever shoved one square.
- Cards: Tendang "hit 2, send it flying"; Tendangan Lurus "hit 1, flies, crash +3"; Badai (2 cost)
  "hit 4, flies, crash +3"; Tolak Angin sends everything around you flying. Gaya Harimau: kicks +1.
  Momentum: crashes +2.
- Enemies pick squares that threaten you and villagers, and avoid squares where you could kick
  them off the board or into their friends. Every 3 turns the king (or boss) calls a pawn.
- Bot results: ~64% runs won, ~4.4 turns per fight, 2.3 pieces knocked off the board per fight
  (was 0.8), best combo per fight 4.4 (was 3.6).

**Guards and harder hits, added after the third playtest ("I can pick pieces off one by one, no big
decisions, no sweat").**
- **Guarded pieces** (chess defence): a piece is guarded when an ally covers its square: pawns the
  two squares diagonally in front, knights their jumps, the king the squares around it, sliders 2
  squares along their lines. Kicks only budge a guarded piece 1 square and it can't be knocked off
  the board (it takes 5 instead). Shown as a blue shield. So the order of your attacks matters:
  break the guard first, or crash a flying piece into the formation.
- Enemies prefer squares where an ally guards them.
- Enemy hits: pawn 2, knight 3, bishop 3, rook 4, queen 5, king 4. A knight now kills a villager
  in one hit. Enemies acting per turn: 2 on floor 1, 3 on floor 2, 4 on floors 3–4, all from floor 5.
- Bot results: ~56% runs won, ~4.4 turns per fight, 1.3 ring outs per fight, best combo 4.2.

**Reactions (zone of control), added at the player's request.** Ending any move (free step or a
move card) on a square an enemy covers makes that enemy strike you at once, for half its normal hit
(rounded up). Each enemy reacts at most once per turn. Covered squares are the same ones it guards
allies on, so one rule teaches both. Step dots and move-card targets turn red with the damage.
Full-damage reactions made the bot refuse to approach anything (0% wins, fights stalled at ~23
turns); half damage keeps fights moving. To pay for it you start with **30 HP** and heal **6**
after each fight. Bot: ~63% runs won, ~8.5 HP lost per fight (was ~4), ~4.7 turns per fight.

**Gameplay pass (player request: improve what's there, no new systems).**
- **Boulders and firecracker crates removed** from fights. The first fight ("Warm-up") now teaches
  the crash: kick the pawn in front of you into the pawn behind it, while the knight threatens a villager.
- **Enemy AI:** bishops, rooks and queens only charge down a clear line (never through their own
  ally). Strikers pick the hit that hurts you most: you, or a villager they can finish off. When you
  get within 2 of the king, pieces close ranks around it, and the king steps back into the formation.
- **Cards:** Tendang hit 1 (damage comes from the crash), Pukulan Dalam hit 4 no push (for guarded or
  heavy pieces), Bantingan throws a piece over you and sends it flying, Tendangan Sabit costs 1,
  Tarik also hits 1, Tangkis Block 4, Tangkisan Block 3. Starter: 3 Tendang, Pukulan Dalam,
  3 Tangkis, Langkah Kuda, Tarik, Bantingan.
- **Fight variety:** formations Pawn Wall, Cavalry, Snipers, Siege, Escort (3 villagers) and Hold
  Out (survive 5 turns, or beat the king). The header shows the formation and the turns left.
- **Feel:** your king lunges toward what it hits; enemy turns are faster.
- **Balance:** 24 HP, heal 4 after each fight. Bot: ~55% runs won, ~6.6 HP lost per fight.

**Villagers removed (player request).** No more villagers in any fight; the Escort formation is gone.
Enemies only target you. Losing villagers was most of the unavoidable damage, so without them the bot
won 100% at 24 HP. Now: **20 HP, heal 2** after each fight. Bot: ~60% runs won, ~4 HP lost per fight
(a fifth of your health), runs end at ~9 HP, losses on floors 4–6.

**Map and Pusaka (for replayability).**
- **Map:** 7 rows. Warm-up fight at the bottom, boss at the top, a row of campfires before the boss.
  In between you choose a path through fights (gold + a card), elites (tougher, +2 HP on every
  piece, gold + a card + pick 1 of 2 Pusaka), campfires (rest +5 HP, or remove a card), the Warung
  shop (cards, a Pusaka, healing, card removal), mystery events (The Dukun, Warung Kopi, The Old
  Master, Mossy Shrine) and treasure (pick 1 of 2 Pusaka).
- **12 Pusaka** that bend the rules (src/lib/silat/relics.ts): Keris Berapi, Selendang Angin, Peci
  Hitam, Gelang Besi, Kopi Tubruk, Tasbih, Sandal Jepit, Batu Akik, Jamu Kunyit, Kendang, Songket
  Merah, Keris Pusaka. Every run starts with a random common one.
- **Balance:** 16 HP, heal 1 after fights (campfires and events give more). Boss: 30 HP with an
  extra knight. Bot taking random paths: ~70% runs won, most losses on floors 2–4 and at the boss.

**Slams and knockout impact (player: "no reason to Block, kills don't feel satisfying").**
- **Hantam (slam):** rooks, queens, the king and the boss slam when you're within 2 squares,
  hitting your square and all 8 around it. (Changed later at the player's request: slams only hurt
  you, never the slammer's own pieces.) One free step can't escape
  it, so you Block it, knock the slammer out of reach, lock it, or use a move card. Shown as a red
  3×3 and a burst badge.
- **Knockouts:** white flash, the piece bursts into fragments, a stamped "KO!", heavier sound and
  vibration, a falling-whoosh-and-gong for ring outs, and +2 gold per knockout added to the reward.
  The end-of-fight screen waits ~1 second so the final blow lands.
- Bot (random paths): ~48% runs won (was ~70%); losses spread over floors 2–4 and the boss.

**Intents re-aim after your moves (player: "make it feel like they're attacking").** This replaces
"intents are locked". After every action you take, enemies re-plan: strikes follow you if you're
still in reach, moves head for your new square, and the badge pops when an intent changes.
Big attacks stay committed once wound up: a charge can't turn (the matador still works) and a slam
lands on the area it was aimed at. Slams only wind up when enemies plan at the end of their turn,
never in the middle of yours (otherwise every step near the king cost 4 HP and fights stalled).
Knights far from you no longer idle. Bot: ~52% runs won, losses spread over floors 1–4 and the boss.

**Playstyles (pick one at the start of each run).** Every run starts with a base deck (3 Tendang,
3 Tangkis, Langkah Kuda, Pukulan Dalam) plus two cards of your style; card rewards lean 4:1 toward it.
- **Harimau (tiger), crash and chain:** Terkam (hit 2, flies, draw 1 if it crashes), Rantai (hit 2,
  flies, free after a crash this turn), Amuk (power: +2 Block per crash), plus Tendangan Lurus,
  Tolak Angin, Badai, Gaya Harimau, Momentum.
- **Bangau (crane), defend and punish:** Napas Panjang (Block 4, draw 1), Balas (0 cost: hit for
  your Block +2), Benteng Diri (power: 3 Block each turn), Pantulan (rare power: soaked damage hits
  back), plus Kuda-kuda, Tangkisan, Kuncian.
- **Ular (snake), move and strike:** Liuk (0 cost: step, draw 1), Lilit (2: pull a piece next to you
  and lock it), Sabetan (hit everything around you for 1), Lincah (power: each move makes your next
  kick +2), Bayangan (rare power: moves never set off reactions), plus Gajah Miring, Sapu Benteng, Elakan.
- Cards show their style as a coloured dot; Rantai's cost turns green when it's free. Undo is cleared
  after a card draws (no peeking at your deck).
- Bot, 450 runs: ~47% won overall; Ular 52%, Bangau 47%, Harimau 41%.

## 16. Open questions

1. **Tab name**: "Silat" (short, fits the tab bar) or "Raja Silat"?
2. **Language**: English UI with Indonesian card names (as above), or full Bahasa Indonesia?
3. **HP**: is 20 right for a whole run? Decide after playtesting milestone 1.
4. **Box-in Strikes**: they may make Act I too hard. If so, Act I Strikes aim only at your square.
5. **More pressure later, if needed**: enemies that strike a whole line or area, or a turn limit.

## 17. Game Plan pass (2026-11-09): combos, dice, piles, chess tactics, the King

Folded in from the "Chess Prison Deckbuilder" game plan, kept in the Raja Silat world.

### Combo queue, no undo
- Tap cards (and squares) to queue a combo; your free step can be part of it. The board previews the
  whole chain: numbered markers, ghosts, damage, KOs. The End Turn slot becomes **Play combo (n)**.
- Tap a queued card or chip to drop it and everything after it. **Clear** empties the combo.
- **The combo counter carries across the whole chain**, so chaining cards is how you hit Combo 3+.
- A queued step that can't happen anymore when its turn comes (a roll went your way, a piece moved)
  **fizzles** and is logged; its card stays in your hand.
- Undo is gone.

### d20 reactions
Hidden d20 rolls, shown in the log and as a floating die on the board. A 20 always works, a 1 always fails.
| Roll | Who | Needs |
|---|---|---|
| Jab as you arrive (reaction) | enemy | 10+ |
| Elakan dodge | you | 8+ (one try; used up either way) |
| Tangkisan kick-back | you | 8+ |

Previews and the End Turn forecast assume the worst ("Up to N damage") and never use up the dice. Dice
have their own random stream, so rolling never changes your card draws.

### Deck and hand
- Draw **up to** hand size each turn (5, Batu Akik +1, Tambah +1). The draw and discard piles show counts
  under the hand; tap either to see both (the draw pile in A–Z order, not draw order).

### New cards
| Card | Cost | Type | Effect |
|---|---|---|---|
| Langkah Pion | 0 | Gerak | Step up 1, or hit diagonally up for 2. On the top row it becomes Langkah Ratu (this fight) |
| Langkah Ratu | 2 | Gerak (rare) | Move like a queen |
| Rokade | 1 | Gerak | Swap with the first piece or object in a straight line |
| Garpu Kuda (fork) | 2 | Serang | Knight jump, then hit 2 on every piece a knight's jump away |
| Paku (pin) | 1 | Tangkis | First piece in a line can't act; +2 damage if a piece is behind it |
| Tusuk Sate (skewer) | 2 | Serang | Hit 3 on the first piece in a line and 3 on the one behind |
| Serangan Terbuka (discovered attack) | 1 | Gerak | Step 1; every piece in a clear line from your old square takes 2 |
| En Passant | 0 | Serang | Hit 3 on a neighbor that moved last enemy turn |
| Skak! | 2 | Serang | The King in a clear line: hit 3 and it loses its action |
| Kerambit | 0 | Serang | Hit a neighbor for 4. Exhaust |
| Cambuk | 1 | Serang | First piece in a straight line: hit 2, pull it next to you |
| Sogok (bribe) | 1 | Siasat | Any piece skips its next action. Exhaust |
| Bom Asap (smoke) | 1 | Siasat | No reactions to your moves this turn. Block 2 |
| Intai (scout) | 1 | Siasat | Draw 2 |
| Putar Balik (recycle) | 0 | Siasat | Shuffle discard into draw, draw 1. Exhaust |
| Simpan (stash) | 0 | Siasat | Keep your unplayed cards for next turn |
| Naik Pangkat (promotion) | 1 | Siasat | Promote every card in hand for this fight (Tendang→Badai, Kuda→Ratu, Tangkis→Kuda-kuda, Tarik→Lilit, Sabit→Tolak Angin, Dalam→Kerambit). Exhaust |
| Tambah (expand) | 1 | Jurus | +1 hand size this fight, draw 1. Exhaust |
| Mata Elang (advantage) | 0 | Siasat | Your d20s roll twice, keep the best, until next turn. Draw 1 |
| Tenang (steady hand) | 0 | Siasat | +4 on your d20s until next turn. Block 2 |
| Ejek (taunt) | 1 | Siasat | Enemy jabs roll twice, keep the worst. Block 3 |

**Siasat** (tactics, pink) is a new card type for cards that bend the rules. Lock effects (Paku, Sogok,
Skak!, Kuncian, Lilit) can't hold a boss: it takes 4 damage instead.

### Raja Hitam, the final boss
The enemy King himself (30 HP, hits 4) with a rook, bishop, two knights and three pawns.
- **Phase 1**: holds his throne like any king: strikes next to him, slams within 2.
- **Phase 2 (half HP)**: "MURKA!" He castles away to the ally farthest from you, calls two pawns, hits
  for 5, walks straight at you, kicks you back 2 squares when his strike lands (crash 2+, edge 5), and
  calls a pawn every 2 turns instead of 3.

### Not done from the plan
- Prison setting and names (kept the Silat world on purpose).
- Rive sprites and animations; dice are a CSS float for now.
- Lockpick (no locks in this world; Rokade covers "Castle").

### Fight layout (floating log and hand)
- The board takes the full width and shrinks on short screens, so the hand never covers it.
- The battle log is a toggle (top-right button): a translucent panel floats over the board. Hide closes it.
- One line under the board shows the card tip, the combo chips, or the latest event.
- The hand floats at the bottom; cards that start a named combo get a ▸ marker, cards that finish one
  glow and get a ✦ marker, and the tray lists "next ✦ name".

### Jurus Rangkai: named combos (`src/lib/silat/rangkai.ts`)
Specific cards played in order inside **one** combo power up the last card ("surge" = its first hit deals
more). Playing one shows a big banner over the board, a fanfare and a board pulse. All are listed in the
Card Collection.

| Name | Sequence | Bonus |
|---|---|---|
| Terkam Ganda | Terkam → Terkam | +3 hit, +3 Block |
| Jebakan Passant | En Passant → any Serang | +3 hit, refund 1 Tenaga |
| Tendangan Beruntun | Tendang ×3 | +4 hit on the third |
| Serbuan Kuda | Langkah Kuda → any Serang | +2 hit |
| Tarik Banting | Tarik → Bantingan | +3 hit |
| Paku Sate | Paku → Tusuk Sate | +4 hit |
| Skakmat Silat | Skak! → any Serang | +4 hit |
| Rokade Kilat | Rokade → any Serang | +2 hit, draw 1 |
| Bayang Bangau | Elakan → Tangkisan | your dodge and kick-back can't fail, +2 Block |
| Benteng Tiga Lapis | Tangkis ×3 | +6 Block |
| Serangan Bayangan | Bom Asap → Kerambit | +4 hit |
| Langkah Harimau | Free step → Terkam | +2 hit |
