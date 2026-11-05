// Makes Puzzle Rush puzzles off the main thread so the board never stutters.
import { minePuzzles } from "./rushGen";

let want = 0;
let busy = false;

function loop() {
  if (want <= 0) { busy = false; return; }
  busy = true;
  for (const p of minePuzzles()) { postMessage(p); want--; }
  setTimeout(loop, 0);
}

addEventListener("message", (e: MessageEvent<{ want: number }>) => {
  want = Math.max(want, e.data.want);
  if (!busy) loop();
});
