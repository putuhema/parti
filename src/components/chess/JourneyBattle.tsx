"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  CLASSIC,
  applyMove,
  bestMove,
  botMove,
  cardTargets,
  colorOf,
  findMove,
  fromFen,
  inCheck,
  movesFrom,
  outcome,
  playCard,
  rulesFor,
  type Card,
  type Move,
  type State,
} from "../../../convex/lib/chess";
import { Confetti, Hearts, Icon, ME, Mascot } from "@/components/ui";
import { feedback } from "@/lib/feedback";
import { CARD_INFO, TWIST_INFO, type Battle } from "@/lib/journey";
import { Board, Piece } from "./Board";
import { PlayerBar } from "./bits";

export type BattleEnd = "win" | "loss" | "draw";

type Snap = { state: State; last: [number, number] | null; cards: Record<Card, number>; doubleLeft: boolean };

const CARD_ORDER: Card[] = ["shield", "freeze", "swap", "rocket"];
const ORDER = "qrbnp";

function lost(start: string, now: string, white: boolean) {
  const out: string[] = [];
  for (const t of ORDER) {
    const ch = white ? t.toUpperCase() : t;
    const n = [...start].filter((c) => c === ch).length - [...now].filter((c) => c === ch).length;
    for (let i = 0; i < n; i++) out.push(ch);
  }
  return out;
}

function withEnergy(s: State): State {
  return s.power ? { ...s, power: { ...s.power, energy: { w: 9, b: 0 } } } : s;
}

export function JourneyBattle({ battle, cards, hearts, maxHearts, boss, onEnd }: { battle: Battle; cards: Record<Card, number>; hearts: number; maxHearts: number; boss: boolean; onEnd: (r: BattleEnd, myMoves: number) => void }) {
  const rules = battle.twist === "threecheck" ? rulesFor("threecheck") : CLASSIC;
  const start = useMemo(() => {
    const s = fromFen(battle.fen);
    s.power = { energy: { w: 9, b: 0 }, shields: [], frozen: [], cardPly: -1 };
    return s;
  }, [battle.fen]);
  const [snap, setSnap] = useState<Snap>({ state: start, last: null, cards: { ...cards }, doubleLeft: battle.double });
  const [history, setHistory] = useState<Snap[]>([]);
  const [sel, setSel] = useState<number | null>(null);
  const [hint, setHint] = useState<Move | null>(null);
  const [hints, setHints] = useState(battle.hints);
  const [takebacks, setTakebacks] = useState(battle.takebacks);
  const [cardMode, setCardMode] = useState<{ card: Card; first?: number } | null>(null);
  const [toast, setToast] = useState<{ text: string; kind: "good" | "bad" | "info"; id: number } | null>(null);
  const [intro, setIntro] = useState(true);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const s = snap.state;
  const myMoves = Math.ceil(s.ply / 2);
  const blitzOut = battle.twist === "blitz" && s.turn === "w" && myMoves >= 30;
  const result = outcome(s, rules) ?? (blitzOut ? { winner: "b" as const, reason: "time" } : null);
  const myTurn = s.turn === "w" && !result && !intro;
  const playable = withEnergy(s);
  const targets = sel != null && myTurn && !cardMode ? movesFrom(s, sel, rules).map((m) => m.to) : [];
  const cardSquares = cardMode && myTurn ? cardTargets(playable, cardMode.card, rules, cardMode.first) : [];
  const check = inCheck(s) ? s.cells.indexOf(s.turn === "w" ? "K" : "k") : undefined;
  const cardPlayed = s.power?.cardPly === s.ply;
  const live = (list?: { sq: number; until: number }[]) => (list ?? []).filter((x) => x.until > s.ply).map((x) => x.sq);

  function say(text: string, kind: "good" | "bad" | "info") {
    setToast({ text, kind, id: Date.now() });
  }

  function botTurn(base: Snap) {
    if (outcome(base.state, rules)) return;
    timer.current = setTimeout(() => {
      const bm = botMove(base.state, battle.level);
      if (!bm) return;
      const res = applyMove(base.state, bm, rules);
      setSnap({ ...base, state: res.state, last: [bm.from, bm.to] });
      if (res.check) { feedback.check(); say("Check!", "bad"); } else if (res.captured) feedback.capture(); else feedback.move();
    }, 420);
  }

  function afterMine(base: Snap, next: State, last: [number, number], check: boolean) {
    let state = next;
    let doubleLeft = base.doubleLeft;
    let again = false;
    if (doubleLeft && !check && !outcome(next, rules)) {
      state = { ...next, turn: "w", ep: -1 };
      doubleLeft = false;
      again = true;
    }
    const snapNext: Snap = { ...base, state, last, doubleLeft };
    setSnap(snapNext);
    if (again) { say("Battle Cry! Move again", "good"); return; }
    botTurn(snapNext);
  }

  function tap(i: number) {
    if (!myTurn) return;
    if (cardMode) {
      if (!cardSquares.includes(i)) { say("Tap a glowing square", "info"); return; }
      if (cardMode.card === "swap" && cardMode.first === undefined) { feedback.tap(); setCardMode({ card: "swap", first: i }); return; }
      const card = cardMode.card;
      const played = playCard(playable, card, { a: cardMode.first ?? i, b: cardMode.first !== undefined ? i : undefined }, rules);
      setCardMode(null);
      if (!played) { feedback.wrong(); return; }
      setHistory((h) => [...h, snap]);
      setHint(null);
      feedback.correct();
      say(played.label, "good");
      const base: Snap = { ...snap, cards: { ...snap.cards, [card]: snap.cards[card] - 1 } };
      if (played.endsTurn) afterMine(base, played.state, snap.last ?? [i, i], inCheck(played.state));
      else setSnap({ ...base, state: played.state });
      return;
    }
    if (sel != null && targets.includes(i)) {
      setHistory((h) => [...h, snap]);
      setHint(null);
      setSel(null);
      const m = findMove(s, sel, i, rules)!;
      const res = applyMove(s, m, rules);
      if (res.check) { feedback.check(); say("Check!", "good"); } else if (res.captured) feedback.capture(); else feedback.move();
      afterMine(snap, res.state, [sel, i], res.check);
      return;
    }
    if (colorOf(s.cells[i]) === "w") { feedback.tap(); setSel(sel === i ? null : i); return; }
    setSel(null);
  }

  function undo() {
    if (!history.length || takebacks <= 0 || (s.turn !== "w" && !result)) return;
    if (timer.current) clearTimeout(timer.current);
    feedback.tap();
    setSnap(history[history.length - 1]);
    setHistory(history.slice(0, -1));
    setTakebacks(takebacks - 1);
    setSel(null);
    setHint(null);
    setCardMode(null);
  }

  function showHint() {
    if (!myTurn || hints <= 0) return;
    feedback.tap();
    setHints(hints - 1);
    setHint(bestMove({ ...s, turn: "w" }));
  }

  const capW = lost(start.cells, s.cells, false); // taken by me
  const capB = lost(start.cells, s.cells, true);
  const won = result?.winner === "w";
  const twist = TWIST_INFO[battle.twist];
  let status = "";
  if (!result) {
    if (s.turn === "b") status = `${battle.name} is thinking…`;
    else if (cardMode) status = cardMode.card === "swap" && cardMode.first !== undefined ? "Now tap the second piece" : CARD_INFO[cardMode.card].help;
    else if (inCheck(s)) status = "You're in check! Protect your king";
    else if (sel != null) status = "Tap a dot to move";
    else status = battle.twist === "blitz" ? `Your move · ${30 - myMoves} moves left` : "Your move";
  }

  return (
    <main className="screen tight" style={{ position: "relative" }}>
      <header className="topbar" style={{ gap: 8 }}>
        <span className="chip" style={{ background: boss ? "#4B4B4B" : "var(--sky-soft)", color: boss ? "#fff" : "var(--sky-edge)" }}>{boss ? "BOSS" : "BATTLE"}{twist ? ` · ${twist.name.toUpperCase()}` : ""}</span>
        <span className="grow" />
        <Hearts left={hearts} total={maxHearts} size={20} />
      </header>

      <PlayerBar name={battle.name} bot thinking={s.turn === "b" && !result} sub={<span className="sub">{capB.map((p, k) => <Piece key={k} code={p} size={18} style={{ marginRight: -4 }} />)}{rules.threeCheck && <span style={{ marginLeft: 8 }}>Checks {s.checks.b}/3</span>}</span>} />
      <div style={{ position: "relative" }}>
        <Board
          cells={s.cells}
          selected={cardMode ? cardMode.first ?? null : sel}
          targets={targets}
          last={snap.last}
          check={check}
          onTap={tap}
          moved={snap.last?.[1] ?? null}
          frozen={live(s.power?.frozen)}
          shields={live(s.power?.shields)}
          glow={cardMode ? cardSquares : undefined}
          arrows={hint ? [{ from: hint.from, to: hint.to, color: "#58CC02", dash: true }] : undefined}
        />
        {toast && <div key={toast.id} className="btoast" onAnimationEnd={() => setToast(null)} style={toast.kind === "bad" ? { background: "var(--cherry)", color: "#fff", boxShadow: "0 4px 0 var(--cherry-edge)" } : toast.kind === "info" ? { background: "#fff", color: "var(--ink)", boxShadow: "0 4px 0 var(--line)" } : { background: "var(--lime)", color: "var(--lime-ink)", boxShadow: "0 4px 0 var(--lime-edge)" }}>{toast.text}</div>}
      </div>
      <PlayerBar name="You" initial="Y" paint={ME} sub={<span className="sub">{capW.map((p, k) => <Piece key={k} code={p} size={18} style={{ marginRight: -4 }} />)}{rules.threeCheck && <span style={{ marginLeft: 8 }}>Checks {s.checks.w}/3</span>}</span>} />
      <p style={{ margin: 0, textAlign: "center", fontSize: 16, fontWeight: 900, minHeight: 22, color: inCheck(s) && s.turn === "w" ? "var(--cherry-edge)" : "var(--ink)" }} aria-live="polite">{status}</p>

      <section style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 8, alignItems: "end" }} aria-label="Your cards">
        {CARD_ORDER.map((c) => {
          const info = CARD_INFO[c];
          const n = snap.cards[c];
          const on = cardMode?.card === c;
          const can = myTurn && n > 0 && !cardPlayed && cardTargets(playable, c, rules).length > 0;
          return (
            <button key={c} className="pcard" aria-pressed={on} disabled={!can && !on} aria-label={`${info.name}, ${n} left`} onClick={() => { feedback.tap(); setSel(null); setHint(null); setCardMode(on ? null : { card: c }); }} style={on ? { borderColor: info.edge, boxShadow: `0 4px 0 ${info.edge}` } : undefined}>
              <span className="top" style={{ background: n > 0 ? info.face : "#E5E5E5", boxShadow: `inset 0 -4px 0 ${n > 0 ? info.edge : "#D0D0D0"}`, height: 38 }}>
                <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true"><path d={info.icon} stroke="#fff" strokeWidth="2.6" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>
              </span>
              <span className="bottom">
                <span style={{ fontSize: 13, fontWeight: 900 }}>{info.name}</span>
                <span style={{ fontSize: 12, fontWeight: 800, color: "var(--muted)" }}>×{n}</span>
              </span>
            </button>
          );
        })}
      </section>

      <div className="grow" />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 10 }}>
        <button className="btn btn-white" onClick={undo} disabled={!history.length || takebacks <= 0 || s.turn !== "w" || !!result}>Undo ({takebacks})</button>
        <button className="btn btn-white" style={{ color: "var(--sun-ink)" }} disabled={!myTurn || hints <= 0} onClick={showHint}><Icon.Bulb size={20} />Hint ({hints})</button>
      </div>

      {intro && (
        <div className="overlay">
          <Mascot size={86} mood="wow" className="bob" />
          <h2 style={{ margin: 0, fontSize: 30, fontWeight: 900, textAlign: "center" }}>{boss ? "King Bolt appears!" : `${battle.name} blocks the way`}</h2>
          <p style={{ margin: 0, fontSize: 17, fontWeight: 700, color: "var(--muted)", textAlign: "center" }}>
            {twist ? `${twist.name}: ${twist.text}.` : rules.threeCheck ? "" : "Checkmate the enemy king to win."}
            {battle.double ? " Battle Cry: you move twice on your first turn." : ""}
          </p>
          <button className="btn btn-green" onClick={() => { feedback.unlock(); feedback.go(); setIntro(false); }}>Fight!</button>
        </div>
      )}

      {result && (
        <div className="overlay">
          {won && <Confetti />}
          <Mascot size={110} mood={won ? "joy" : "wow"} className={won ? "jump" : undefined} />
          <h2 style={{ margin: 0, fontSize: 34, fontWeight: 900, textAlign: "center", color: won ? "var(--lime-dark)" : "var(--tangerine-ink)" }}>
            {won ? (boss ? "You beat King Bolt!" : "Victory!") : result.winner === "draw" ? "A draw" : "Defeated"}
          </h2>
          <p style={{ margin: 0, fontSize: 17, fontWeight: 700, color: "var(--muted)", textAlign: "center" }}>
            {won ? `Won by ${result.reason} in ${myMoves} moves.` : result.winner === "draw" ? `Draw by ${result.reason}. You survive, but get no reward.` : result.reason === "time" ? "Out of moves! You lose a heart." : "You lose a heart."}
          </p>
          {!won && takebacks > 0 && history.length > 0 && result.reason !== "time" && <button className="btn btn-white" onClick={undo}>Take back ({takebacks})</button>}
          <button className="btn btn-green" onClick={() => { feedback.tap(); onEnd(won ? "win" : result.winner === "draw" ? "draw" : "loss", myMoves); }}>Continue</button>
        </div>
      )}
    </main>
  );
}
