"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { applyMove, colorOf, findMove, fromFen, inCheck, movesFrom, type Move } from "../../../../convex/lib/chess";
import { Board } from "@/components/chess/Board";
import { Confetti, Icon, Mascot } from "@/components/ui";
import { feedback } from "@/lib/feedback";
import { minePuzzles, seedVariants, type Puzzle } from "@/lib/rushGen";

const KEY = "parti:rush";
type Saved = { best: number; solved: number; runs: number };

function load(): Saved {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "null");
    if (v && typeof v.best === "number") return { best: v.best, solved: v.solved ?? 0, runs: v.runs ?? 0 };
  } catch {}
  return { best: 0, solved: 0, runs: 0 };
}
function save(v: Saved) {
  try { localStorage.setItem(KEY, JSON.stringify(v)); } catch {}
}

function shuffle<T>(a: T[]) {
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

// Hand-checked mates, shuffled; refilled when they run out.
let seedPool: Puzzle[] = [];
function drawSeed(): Puzzle | undefined {
  if (!seedPool.length) seedPool = shuffle(seedVariants());
  return seedPool.pop();
}
const preferSeed = (queued: number) => queued === 0 || Math.random() < 0.3;

const same = (a: Move, b: Move) => a.from === b.from && a.to === b.to;

type Phase = "play" | "right" | "wrong";

export default function RushPage() {
  // This page only renders in the browser (behind the identity splash), so reading storage here is safe.
  const [stats, setStats] = useState<Saved>(load);
  const [streak, setStreak] = useState(0);
  const [lost, setLost] = useState<number | null>(null); // streak you just lost
  const [newBest, setNewBest] = useState(false);
  const [puzzle, setPuzzle] = useState<Puzzle | null>(() => drawSeed() ?? null);
  const [sel, setSel] = useState<number | null>(null);
  const [phase, setPhase] = useState<Phase>("play");
  const [shown, setShown] = useState<{ cells: string; last: [number, number] } | null>(null);
  const [shake, setShake] = useState<number | null>(null);
  const [count, setCount] = useState(0);
  const queue = useRef<Puzzle[]>([]);
  const seen = useRef(new Set<string>());
  const worker = useRef<Worker | null>(null);
  const waiting = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Hand out the next puzzle: mostly fresh generated ones, mixed with hand-checked mates.
  function next() {
    setSel(null);
    setShown(null);
    setPhase("play");
    let p: Puzzle | undefined;
    if (preferSeed(queue.current.length)) p = drawSeed();
    while (!p && queue.current.length) {
      const q = queue.current.shift()!;
      if (!seen.current.has(q.fen)) p = q;
    }
    if (!p) p = drawSeed();
    if (p) seen.current.add(p.fen);
    setPuzzle(p ?? null);
    setCount((c) => c + 1);
    refill();
  }

  function refill() {
    if (queue.current.length >= 8) return;
    if (worker.current) { worker.current.postMessage({ want: 12 }); return; }
    // No worker support: make a few between puzzles.
    if (waiting.current) return;
    waiting.current = true;
    setTimeout(() => { queue.current.push(...minePuzzles()); waiting.current = false; }, 50);
  }

  useEffect(() => {
    try {
      const w = new Worker(new URL("../../../lib/rush.worker.ts", import.meta.url), { type: "module" });
      w.onmessage = (e: MessageEvent<Puzzle>) => { queue.current.push(e.data); };
      w.onerror = () => { worker.current = null; };
      worker.current = w;
      w.postMessage({ want: 12 });
    } catch {
      worker.current = null;
    }
    return () => {
      worker.current?.terminate();
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  const state = puzzle ? fromFen(puzzle.fen) : null;
  const cells = shown?.cells ?? state?.cells ?? ".".repeat(64);
  const playing = phase === "play" && !!state;
  const targets = state && sel != null && playing ? movesFrom(state, sel).map((m) => m.to) : [];
  const check = state && inCheck(state) && !shown ? state.cells.indexOf(state.turn === "w" ? "K" : "k") : undefined;
  const answer = puzzle?.answers[0];

  function solved() {
    const s = streak + 1;
    setStreak(s);
    setLost(null);
    const best = Math.max(stats.best, s);
    if (s > stats.best && stats.best > 0 && !newBest) { setNewBest(true); feedback.win(); }
    else feedback.correct(Math.min(s, 6));
    const v = { ...stats, best, solved: stats.solved + 1 };
    setStats(v);
    save(v);
    setPhase("right");
    timer.current = setTimeout(next, 900);
  }

  function missed() {
    feedback.wrong();
    if (streak > 0) {
      setLost(streak);
      const v = { ...stats, runs: stats.runs + 1 };
      setStats(v);
      save(v);
    }
    setStreak(0);
    setNewBest(false);
    setPhase("wrong");
  }

  function tap(i: number) {
    if (!state || !puzzle || !playing) return;
    if (sel != null && targets.includes(i)) {
      const m = findMove(state, sel, i)!;
      const res = applyMove(state, m);
      setShown({ cells: res.state.cells, last: [sel, i] });
      setSel(null);
      if (puzzle.answers.some((a) => same(a, m))) {
        if (res.check) feedback.check(); else if (res.captured) feedback.capture(); else feedback.move();
        solved();
      } else {
        setShake(i);
        setTimeout(() => setShake(null), 400);
        missed();
      }
      return;
    }
    if (colorOf(state.cells[i]) === state.turn) { feedback.tap(); setSel(sel === i ? null : i); return; }
    setSel(null);
  }

  function giveUp() {
    if (!playing) return;
    setSel(null);
    missed();
  }

  const side = state?.turn === "b" ? "Black" : "White";
  const task = puzzle?.kind === "mate" ? "Find checkmate in one" : "Win material";
  const heat = streak >= 10 ? "var(--cherry-edge)" : streak >= 5 ? "var(--tangerine-ink)" : "var(--sun-ink)";

  return (
    <main className="screen tight" style={{ position: "relative" }}>
      {newBest && phase === "right" && <Confetti count={40} />}
      <header className="topbar" style={{ gap: 8 }}>
        <Link href="/chess" className="icon-btn" aria-label="Leave Puzzle Rush"><Icon.Close /></Link>
        <span className="chip" style={{ background: "#FFF0DB", color: "#9A5200" }}>PUZZLE RUSH</span>
        <span className="grow" />
        <span className="stat-pill" style={{ color: "var(--sun-ink)" }} aria-label={`Best streak ${stats.best}`}><Icon.Trophy />{stats.best}</span>
      </header>

      <section style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 14, padding: "4px 0" }} aria-live="polite">
        <span key={streak} className={streak ? "pop" : undefined} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 44, fontWeight: 900, color: streak ? heat : "var(--muted)", fontVariantNumeric: "tabular-nums" }}>
          <Icon.Flame size={38} className={streak >= 5 ? "bob" : undefined} />{streak}
        </span>
        <span style={{ display: "flex", flexDirection: "column", lineHeight: 1.15 }}>
          <span style={{ fontSize: 13, fontWeight: 900, letterSpacing: ".08em", color: "var(--muted)" }}>STREAK</span>
          <span style={{ fontSize: 15, fontWeight: 800, color: newBest ? "var(--lime-dark)" : "var(--muted)" }}>{newBest ? "New best!" : stats.best ? `Best ${stats.best}` : "Set your first record"}</span>
        </span>
      </section>

      <p style={{ margin: 0, textAlign: "center", fontSize: 18, fontWeight: 900 }}>
        {phase === "right" ? (puzzle?.kind === "mate" ? "Checkmate!" : "Nice tactic!") : phase === "wrong" ? "Not quite. Here's the move" : `${side} to move · ${task}`}
      </p>

      <div style={{ position: "relative" }}>
        <Board
          key={count}
          cells={phase === "wrong" ? state?.cells ?? cells : cells}
          flipped={state?.turn === "b"}
          selected={sel}
          targets={targets}
          last={phase === "wrong" ? null : shown?.last ?? null}
          check={check}
          shake={shake}
          moved={phase === "right" ? shown?.last[1] ?? null : null}
          arrows={phase === "wrong" && answer ? [{ from: answer.from, to: answer.to, color: "#58CC02" }] : undefined}
          onTap={tap}
          disabled={!playing}
        />
        {phase === "right" && <div className="btoast" style={{ background: "var(--lime)", color: "var(--lime-ink)", boxShadow: "0 4px 0 var(--lime-edge)" }}>+1 · {streak} in a row</div>}
      </div>

      {!puzzle && <p className="wait" style={{ margin: 0, textAlign: "center", fontWeight: 800, color: "var(--muted)" }}>Finding puzzles…</p>}

      <div className="grow" />
      {phase === "wrong" ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 10, alignItems: "center" }}>
          <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Mascot size={52} mood="wow" />
            <span style={{ fontSize: 16, fontWeight: 800, color: "var(--muted)" }}>
              {lost ? `Streak of ${lost} ended.${lost >= stats.best ? " That's your best!" : ""}` : "Streak starts again at 0."}
            </span>
          </span>
          <button className="btn btn-green" style={{ width: "100%" }} onClick={() => { feedback.tap(); next(); }}>Next puzzle</button>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 10 }}>
          <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", paddingLeft: 4 }}>
            <span style={{ fontSize: 13, fontWeight: 900, letterSpacing: ".06em", color: "var(--muted)" }}>ALL TIME</span>
            <span style={{ fontSize: 16, fontWeight: 900 }}>{stats.solved} solved</span>
          </div>
          <button className="btn btn-white" style={{ color: "var(--sun-ink)" }} disabled={!playing} onClick={() => { feedback.tap(); giveUp(); }}>
            <Icon.Bulb size={20} />Answer
          </button>
        </div>
      )}
    </main>
  );
}
