"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { applyMove, bestMove, botMove, findMove, inCheck, movesFrom, outcome, startState, colorOf, type Move, type State } from "../../../../convex/lib/chess";
import { Board } from "@/components/chess/Board";
import { Captured, PlayerBar, capturedFrom } from "@/components/chess/bits";
import { Confetti, Icon, ME, Mascot, Sheet } from "@/components/ui";
import { feedback } from "@/lib/feedback";
import { useIdentity } from "@/lib/identity";

const LEVELS = [
  { n: 1, name: "Gentle", sub: "Makes mistakes" },
  { n: 2, name: "Casual", sub: "Plays okay" },
  { n: 3, name: "Tricky", sub: "Thinks ahead" },
];

type Snap = { state: State; last: [number, number] | null; moves: string[] };

export default function BotPage() {
  const { me } = useIdentity();
  const [level, setLevel] = useState<number | null>(null);
  const [snap, setSnap] = useState<Snap>({ state: startState("classic"), last: null, moves: [] });
  const [history, setHistory] = useState<Snap[]>([]);
  const [sel, setSel] = useState<number | null>(null);
  const [hint, setHint] = useState<Move | null>(null);
  const [toast, setToast] = useState<{ text: string; kind: string; id: number } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const s = snap.state;
  const result = outcome(s);
  const myTurn = s.turn === "w" && !result;
  const targets = sel != null && myTurn ? movesFrom(s, sel).map((m) => m.to) : [];
  const check = inCheck(s) ? s.cells.indexOf(s.turn === "w" ? "K" : "k") : undefined;
  const cap = capturedFrom(s.cells);

  function say(text: string, kind: string) {
    setToast({ text, kind, id: Date.now() });
  }

  function play(from: number, to: number, base: Snap) {
    const m = findMove(base.state, from, to)!;
    const res = applyMove(base.state, m);
    const next: Snap = { state: res.state, last: [from, to], moves: [...base.moves, res.san] };
    setSnap(next);
    if (res.check) feedback.check(); else if (res.captured) feedback.capture(); else feedback.move();
    return { next, res };
  }

  function tap(i: number) {
    if (!myTurn) return;
    if (sel != null && targets.includes(i)) {
      setHistory((h) => [...h, snap]);
      setHint(null);
      setSel(null);
      const { next, res } = play(sel, i, snap);
      if (res.check) say("Check!", "good");
      if (outcome(next.state)) return;
      timer.current = setTimeout(() => {
        const bm = botMove(next.state, level ?? 1);
        if (!bm) return;
        const r2 = play(bm.from, bm.to, next);
        if (r2.res.check) say("Check!", "bad");
      }, 450);
      return;
    }
    if (colorOf(s.cells[i]) === "w") { feedback.tap(); setSel(sel === i ? null : i); return; }
    setSel(null);
  }

  function undo() {
    if (!history.length || s.turn !== "w") return;
    feedback.tap();
    setSnap(history[history.length - 1]);
    setHistory(history.slice(0, -1));
    setSel(null);
    setHint(null);
  }

  function restart(lv: number) {
    if (timer.current) clearTimeout(timer.current);
    setLevel(lv);
    setSnap({ state: startState("classic"), last: null, moves: [] });
    setHistory([]);
    setSel(null);
    setHint(null);
  }

  const won = result?.winner === "w";
  const status = result ? "" : s.turn === "b" ? "Bolt is thinking…" : inCheck(s) ? "You're in check! Protect your king" : sel != null ? "Tap a dot to move" : "Your move";

  return (
    <main className="screen tight" style={{ position: "relative" }}>
      <header className="topbar">
        <Link href="/chess" className="icon-btn" aria-label="Leave game"><Icon.Close /></Link>
        <span className="chip chip-grape">PRACTICE · {LEVELS[(level ?? 1) - 1].name.toUpperCase()}</span>
        <span className="grow" />
        <button className="icon-btn" aria-label="New game" onClick={() => setLevel(null)}><Icon.Undo size={20} color="#AFAFAF" /></button>
      </header>

      <PlayerBar name="Bolt the bot" bot thinking={s.turn === "b" && !result} sub={<Captured pieces={cap.byBlack} plus={-cap.diff} />} />
      <div style={{ position: "relative" }}>
        <Board cells={s.cells} selected={sel} targets={targets} last={snap.last} check={check} onTap={tap} moved={snap.last?.[1] ?? null} arrows={hint ? [{ from: hint.from, to: hint.to, color: "#58CC02", dash: true }] : undefined} />
        {toast && <div key={toast.id} className="btoast" style={toast.kind === "bad" ? { background: "var(--cherry)", color: "#fff", boxShadow: "0 4px 0 var(--cherry-edge)" } : { background: "var(--lime)", color: "var(--lime-ink)", boxShadow: "0 4px 0 var(--lime-edge)" }}>{toast.text}</div>}
      </div>
      <PlayerBar name="You" initial={me.name} paint={ME} sub={<Captured pieces={cap.byWhite} plus={cap.diff} />} />
      <p style={{ margin: 0, textAlign: "center", fontSize: 17, fontWeight: 900, color: inCheck(s) && s.turn === "w" ? "var(--cherry-edge)" : "var(--ink)" }} aria-live="polite">{status}</p>
      <div className="movelist" aria-label="Moves">
        {snap.moves.map((m, k) => <span key={k} className={k === snap.moves.length - 1 ? "now" : undefined}>{k % 2 === 0 ? `${k / 2 + 1}. ` : ""}{m}</span>).slice(-8)}
      </div>
      <div className="grow" />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 10 }}>
        <button className="btn btn-white" onClick={undo} disabled={!history.length || s.turn !== "w"}>Take back</button>
        <button className="btn btn-white" style={{ color: "var(--sun-ink)" }} disabled={!myTurn} onClick={() => { feedback.tap(); setHint(bestMove(s)); }}>
          <Icon.Bulb size={20} />Hint
        </button>
      </div>

      <Sheet open={level === null} onClose={() => setLevel(1)} label="Pick Bolt's level">
        <div style={{ display: "flex", justifyContent: "center" }}><Mascot size={70} className="bob" /></div>
        <h2 style={{ margin: 0, fontSize: 24, fontWeight: 900, textAlign: "center" }}>How strong is Bolt?</h2>
        {LEVELS.map((l) => (
          <button key={l.n} className="card" onClick={() => { feedback.unlock(); feedback.tap(); restart(l.n); }} style={{ padding: "12px 16px" }}>
            <span className="col"><span className="title">{l.name}</span><span className="sub">{l.sub}</span></span>
            <Icon.Chevron />
          </button>
        ))}
      </Sheet>

      {result && (
        <div className="overlay">
          {won && <Confetti />}
          <Mascot size={110} mood={won ? "joy" : "wow"} className={won ? "jump" : undefined} />
          <h2 style={{ margin: 0, fontSize: 36, fontWeight: 900, color: won ? "var(--lime-dark)" : "var(--tangerine-ink)" }}>{won ? "Checkmate!" : result.winner === "draw" ? "It's a draw" : "Bolt wins"}</h2>
          <p style={{ margin: 0, fontSize: 18, fontWeight: 700, color: "var(--muted)", textAlign: "center" }}>{won ? "You beat Bolt!" : result.winner === "draw" ? `Draw by ${result.reason}.` : "Checkmate. Try again, or take back a move."}</p>
          <button className="btn btn-green" onClick={() => restart(level ?? 1)}>Play again</button>
          {!won && history.length > 0 && <button className="btn btn-white" onClick={undo}>Take back</button>}
          <Link href="/chess" className="btn btn-white">Back home</Link>
        </div>
      )}
    </main>
  );
}
