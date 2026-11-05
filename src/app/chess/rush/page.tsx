"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { applyMove, colorOf, findMove, fromFen, inCheck, movesFrom, type Move, type State } from "../../../../convex/lib/chess";
import { Board } from "@/components/chess/Board";
import { Confetti, Icon, Mascot } from "@/components/ui";
import { feedback } from "@/lib/feedback";
import { minePuzzles, seedVariants, type Puzzle } from "@/lib/rushGen";
import { loadSkill, rank, rate, saveSkill, type Skill } from "@/lib/skill";

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
function seeds() {
  if (seedPool.length < 10) seedPool = shuffle(seedVariants());
  return seedPool;
}

/** Take the waiting puzzle closest to the target difficulty (with a little randomness). */
function takeNear(queue: Puzzle[], target: number, seen: Set<string>): Puzzle | undefined {
  const pool = [...queue.map((p) => ({ p, from: queue })), ...seeds().slice(-12).map((p) => ({ p, from: seedPool }))].filter((x) => !seen.has(x.p.fen));
  if (!pool.length) return undefined;
  let best = pool[0], bestD = Infinity;
  for (const x of pool) {
    const d = Math.abs(x.p.rating - target) + Math.random() * 150;
    if (d < bestD) { bestD = d; best = x; }
  }
  best.from.splice(best.from.indexOf(best.p), 1);
  return best.p;
}

const same = (a: Move, b: Move) => a.from === b.from && a.to === b.to;

type Phase = "play" | "reply" | "right" | "wrong";

export default function RushPage() {
  // This page only renders in the browser (behind the identity splash), so reading storage here is safe.
  const [stats, setStats] = useState<Saved>(load);
  const [skill, setSkill] = useState<Skill>(() => loadSkill("puzzle"));
  const [streak, setStreak] = useState(0);
  const [lost, setLost] = useState<number | null>(null); // streak you just lost
  const [newBest, setNewBest] = useState(false);
  const [puzzle, setPuzzle] = useState<Puzzle | null>(() => takeNear([], loadSkill("puzzle").rating, new Set()) ?? null);
  const [pos, setPos] = useState<State | null>(() => null);
  const [step, setStep] = useState(0);
  const [sel, setSel] = useState<number | null>(null);
  const [phase, setPhase] = useState<Phase>("play");
  const [shown, setShown] = useState<{ cells: string; last: [number, number] } | null>(null);
  const [shake, setShake] = useState<number | null>(null);
  const [count, setCount] = useState(0);
  const [delta, setDelta] = useState<number | null>(null);
  const queue = useRef<Puzzle[]>([]);
  const seen = useRef(new Set<string>());
  const worker = useRef<Worker | null>(null);
  const waiting = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const target = skill.rating + streak * 30;

  function next() {
    setSel(null);
    setShown(null);
    setPhase("play");
    setStep(0);
    setPos(null);
    const p = takeNear(queue.current, target, seen.current) ?? takeNear([], target, new Set());
    if (p) seen.current.add(p.fen);
    setPuzzle(p ?? null);
    setCount((c) => c + 1);
    refill();
  }

  function refill() {
    if (queue.current.length >= 10) return;
    if (worker.current) { worker.current.postMessage({ want: 14 }); return; }
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
      w.postMessage({ want: 14 });
    } catch {
      worker.current = null;
    }
    return () => {
      worker.current?.terminate();
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  const state = pos ?? (puzzle ? fromFen(puzzle.fen) : null);
  const cells = shown?.cells ?? state?.cells ?? ".".repeat(64);
  const playing = phase === "play" && !!state;
  const targets = state && sel != null && playing ? movesFrom(state, sel).map((m) => m.to) : [];
  const check = state && inCheck(state) && !shown ? state.cells.indexOf(state.turn === "w" ? "K" : "k") : undefined;
  const cur = puzzle?.steps[step];
  const answer = cur?.answers[0];
  const flipped = puzzle ? fromFen(puzzle.fen).turn === "b" : false;

  function grade(ok: boolean) {
    if (!puzzle) return;
    const before = skill.rating;
    const s = rate(skill, puzzle.rating, ok ? 1 : 0, 0.6);
    setSkill(s);
    saveSkill("puzzle", s);
    setDelta(s.rating - before);
  }

  function solved() {
    const s = streak + 1;
    setStreak(s);
    setLost(null);
    grade(true);
    const best = Math.max(stats.best, s);
    if (s > stats.best && stats.best > 0 && !newBest) { setNewBest(true); feedback.win(); }
    else feedback.correct(Math.min(s, 6));
    const v = { ...stats, best, solved: stats.solved + 1 };
    setStats(v);
    save(v);
    setPhase("right");
    timer.current = setTimeout(next, 1000);
  }

  function missed() {
    feedback.wrong();
    grade(false);
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
    if (!state || !puzzle || !cur || !playing) return;
    if (sel != null && targets.includes(i)) {
      const m = findMove(state, sel, i)!;
      const res = applyMove(state, m);
      setShown({ cells: res.state.cells, last: [sel, i] });
      setSel(null);
      if (!cur.answers.some((a) => same(a, m))) {
        setShake(i);
        setTimeout(() => setShake(null), 400);
        setShown(null);
        missed();
        return;
      }
      if (res.check) feedback.check(); else if (res.captured) feedback.capture(); else feedback.move();
      if (!cur.reply) { solved(); return; }
      // More to find: the opponent answers, then it's your turn again.
      setPhase("reply");
      const reply = cur.reply;
      timer.current = setTimeout(() => {
        const r2 = applyMove(res.state, reply);
        if (r2.captured) feedback.capture(); else feedback.move();
        setPos(r2.state);
        setShown({ cells: r2.state.cells, last: [reply.from, reply.to] });
        setStep((k) => k + 1);
        setPhase("play");
        timer.current = setTimeout(() => setShown(null), 500);
      }, 650);
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
  const total = puzzle?.steps.length ?? 1;
  const task = puzzle?.kind === "mate" ? "Checkmate in one" : puzzle?.kind === "mate2" ? (step === 0 ? "Checkmate in two" : "Now finish it: checkmate!") : total > 1 ? (step === 0 ? "Win material in 2 moves" : "Now cash in!") : "Win material";
  const heat = streak >= 10 ? "var(--cherry-edge)" : streak >= 5 ? "var(--tangerine-ink)" : "var(--sun-ink)";
  const stars = puzzle ? (puzzle.rating < 800 ? 1 : puzzle.rating < 1100 ? 2 : puzzle.rating < 1400 ? 3 : puzzle.rating < 1700 ? 4 : 5) : 0;

  return (
    <main className="screen tight" style={{ position: "relative" }}>
      {newBest && phase === "right" && <Confetti count={40} />}
      <header className="topbar" style={{ gap: 8 }}>
        <Link href="/chess" className="icon-btn" aria-label="Leave Puzzle Rush"><Icon.Close /></Link>
        <span className="chip" style={{ background: "#FFF0DB", color: "#9A5200" }}>PUZZLE RUSH</span>
        <span className="grow" />
        <span className="stat-pill" style={{ color: "var(--sun-ink)" }} aria-label={`Best streak ${stats.best}`}><Icon.Trophy />{stats.best}</span>
      </header>

      <section style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "2px 2px" }} aria-live="polite">
        <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span key={streak} className={streak ? "pop" : undefined} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 40, fontWeight: 900, color: streak ? heat : "var(--muted)", fontVariantNumeric: "tabular-nums" }}>
            <Icon.Flame size={34} className={streak >= 5 ? "bob" : undefined} />{streak}
          </span>
          <span style={{ display: "flex", flexDirection: "column", lineHeight: 1.15 }}>
            <span style={{ fontSize: 12, fontWeight: 900, letterSpacing: ".08em", color: "var(--muted)" }}>STREAK</span>
            <span style={{ fontSize: 14, fontWeight: 800, color: newBest ? "var(--lime-dark)" : "var(--muted)" }}>{newBest ? "New best!" : stats.best ? `Best ${stats.best}` : "Set a record"}</span>
          </span>
        </span>
        <span style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", lineHeight: 1.15 }}>
          <span style={{ fontSize: 12, fontWeight: 900, letterSpacing: ".08em", color: "var(--muted)" }}>PUZZLE RATING</span>
          <span style={{ fontSize: 18, fontWeight: 900 }}>
            {skill.rating}
            {delta !== null && delta !== 0 && <span key={count + "d"} className="pop" style={{ marginLeft: 6, fontSize: 14, color: delta > 0 ? "var(--lime-dark)" : "var(--cherry-edge)" }}>{delta > 0 ? "+" : ""}{delta}</span>}
          </span>
          <span style={{ fontSize: 12, fontWeight: 800, color: "var(--muted)" }}>{rank(skill.rating)}</span>
        </span>
      </section>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
        <p style={{ margin: 0, textAlign: "center", fontSize: 17, fontWeight: 900 }}>
          {phase === "right" ? (puzzle?.kind === "win" ? "Nice tactic!" : "Checkmate!") : phase === "wrong" ? "Not quite. Here's the move" : phase === "reply" ? "Good! Watch their reply…" : `${side} to move · ${task}`}
        </p>
      </div>
      {puzzle && (
        <div style={{ display: "flex", justifyContent: "center", gap: 3 }} aria-label={`Difficulty ${stars} of 5`}>
          {Array.from({ length: 5 }, (_, k) => <svg key={k} width="14" height="14" viewBox="0 0 24 24"><path d="M12 2 L15 9 L22 9.5 L16.5 14 L18.5 21 L12 17 L5.5 21 L7.5 14 L2 9.5 L9 9z" fill={k < stars ? "#FFC800" : "#E5E5E5"} /></svg>)}
          {total > 1 && <span style={{ marginLeft: 6, fontSize: 12, fontWeight: 900, color: "var(--muted)" }}>MOVE {step + 1} / {total}</span>}
        </div>
      )}

      <div style={{ position: "relative" }}>
        <Board
          key={count}
          cells={phase === "wrong" ? state?.cells ?? cells : cells}
          flipped={flipped}
          selected={sel}
          targets={targets}
          last={phase === "wrong" ? null : shown?.last ?? null}
          check={check}
          shake={shake}
          moved={phase === "right" || phase === "reply" ? shown?.last[1] ?? null : null}
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
