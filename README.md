# Parti

Mobile-first Sudoku and chess with friends. Next.js (App Router) + Convex.

## Sudoku

- **Race**: everyone gets the same puzzle. First to finish wins. 3 hearts; after that each mistake freezes your keypad for 3s.
- **Co-op**: one shared board, filled in together live. Teammates' cursors and colors show on the board. 5 shared hearts.
- **Daily Duel**: one puzzle a day (UTC), same for everyone, one try, no hints, +5s per mistake. Builds a streak.
- **Leaderboard**: Today (best duel time), This week (duel points), League (weekly XP; top 3 move up, bottom 3 move down every Monday).
- **Practice solo**: offline puzzles at 4 levels.

Answers live only on the server; the client never sees the solution in multiplayer or the daily duel.

## Chess

- **Learn**: 12 lessons in 2 units. Meet the pieces (collect stars, capture pieces), then piece values, check, escaping check, checkmate and castling. Stars and XP are saved per player.
- **Practice vs Bolt**: a bot on your phone at 3 levels, with take-backs and hints.
- **Classic 1 vs 1** with a clock (3, 5, 10 min or none). Colors swap every rematch.
- **Team vs Bot (Hand & Brain)**: the Brain picks a piece type, the Hand moves one. Roles swap every move.
- **Coach Mode**: the learner plays Bolt while the coach draws arrows and marks live, sends quick tips, can peek at the best move, and allows take-backs.
- **Puzzle Race**: 5 mate-in-one puzzles; a wrong move freezes you for 10 seconds; first to finish wins.
- **Power-ups**: earn energy by capturing or giving check; cards Shield, Freeze, Swap and Rocket.
- **Fog of War**: you only see what your pieces can reach (hidden on the server). Capture the king to win.
- **Duck Chess**: after each move, place the duck on an empty square. Capture the king to win.
- **Shuffle Start**: shuffled back row, same for both sides, no castling.
- **Three-Check**: three checks win.

Every move is checked on the server. Promotion always makes a queen.

## Words

Ten word games for 2 players (Scrambled Sprint: 2 to 4), in English, Indonesian or both:

- **Word Chain**: five linked words; take turns guessing the next one; misses and passes open letters.
- **Hangman Duel**: crack each other's secret word; wrong letters pop your 6 balloons.
- **Letter Pair**: one picks the first letter, the other the last; race to a real word (+3 first, +1 second).
- **Chemistry** (co-op): finish the phrase the same way; translations count as a match.
- **Don't Say It**: answer the category without the banned word or repeats; categories shrink; 3 hearts.
- **Guess My Word**: ask one letter per turn; both of you learn about both words.
- **Spy Word** (co-op): one-word clues to find your partner's 3 secret words on a 4x4 grid.
- **Odd One Out**: make a set of 4 (ready-made or your own), spot the odd one, name the link.
- **Scrambled Sprint**: unscramble the word and find hidden words in 60 seconds.
- **Emoji Riddle** (co-op): describe a word with emoji only; fewer emoji, more points.

Word lists: English comes from the system dictionary (Webster's 2nd, public domain). Indonesian is a
hand-picked list of about 1,100 common words in `convex/lib/words/id.ts`. A fuller Indonesian
dictionary can be dropped into that file.

## Run it locally

Two terminals:

```bash
npx convex dev
```

```bash
npm run dev
```

Then open http://localhost:3000. To try multiplayer on one computer, open a second window at
http://127.0.0.1:3000 (a different address gets its own player).

The first `npx convex dev` asks you to log in or run locally without an account. Running it
with `CONVEX_AGENT_MODE=anonymous` uses a local database with no account.

## Deploy

1. `npx convex login`, then `npx convex deploy` to create a cloud Convex deployment.
2. Deploy the Next.js app (for example to Vercel) with `NEXT_PUBLIC_CONVEX_URL` set to the
   cloud deployment URL.

## Where things are

- `convex/schema.ts`: tables
- `convex/lib/sudoku.ts`: puzzle generator (unique solutions, seeded for the daily)
- `convex/rooms.ts`: lobby, race, co-op, reactions, presence
- `convex/daily.ts`, `convex/leaderboard.ts`, `convex/crons.ts`
- `src/components/Game.tsx`: board, number pad, notes, undo, hints, combos and animations
- `src/lib/feedback.ts`: synthesized sounds and vibration
- `src/app/globals.css`: design tokens and the chunky 3D components
- `convex/lib/chess.ts`: chess rules for every mode, plus the bot (shared by server and phone)
- `convex/lib/chessPuzzles.ts`: checkmate, check and escape puzzles generated from bot games
- `convex/chess.ts`: chess rooms, moves, cards, duck, coach marks, puzzle race, bot turns and clocks
- `src/lib/lessons.ts`: lesson content; `src/app/chess/`: chess screens; `src/components/chess/`: board and game UI
- `convex/lib/words/`: word lists, game content (chains, prompts, categories, puzzles, emoji) and dictionary checks
- `convex/words.ts`: word rooms and the rules for all ten modes; `convex/wordsView.ts`: what each player may see
- `src/app/words/`, `src/components/words/`: Words screens
