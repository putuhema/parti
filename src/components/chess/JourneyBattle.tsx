"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  CLASSIC,
  applyMove,
  cardTargets,
  colorOf,
  findMove,
  fogCells,
  fromFen,
  inCheck,
  legalMoves,
  movesFrom,
  outcome,
  playCard,
  rulesFor,
  typeOf,
  type Card,
  type Move,
  type State,
} from "../../../convex/lib/chess";
import { Confetti, Hearts, Icon, ME, Mascot } from "@/components/ui";
import { goalWinner } from "@/lib/engine";
import { feedback } from "@/lib/feedback";
import { CARD_INFO, TRAIT_INFO, TWIST_INFO, armyValue, type Battle } from "@/lib/journey";
import { rank } from "@/lib/skill";
import { useEngine } from "@/lib/useEngine";
import { Board, Piece } from "./Board";
import { PlayerBar } from "./bits";

export type BattleEnd = { result: "win" | "loss" | "draw"; myMoves: number; captured: string[] };

type Snap = { state: State; last: [number, number] | null; cards: Record<Card, number>; doubleLeft: boolean; botMoves: number };
type Result = { winner: "w" | "b" | "draw"; reason: string };

const CARD_ORDER: Card[] = ["shield", "freeze", "swap", "rocket"];
const ORDER = "qrbnp";
const VAL: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
const NAMES: Record<string, string> = { p: "pawn", n: "knight", b: "bishop", r: "rook", q: "queen" };

function lost(start: string, now: string, white: boolean) {
  const out: string[] = [];
  for (const t of ORDER) {
    const ch = white ? t.toUpperCase() : t;
    const n = [...start].filter((c) => c === ch).length - [...now].filter((c) => c === ch).length;
    for (let i = 0; i < n; i++) out.push(ch);
  }
  return out;
}

// Kept outside the component: randomness and clocks only run in event handlers.
const shuffled = <T,>(a: T[]) => [...a].sort(() => Math.random() - 0.5);
const now = () => Date.now();

const withEnergy = (s: State): State => (s.power ? { ...s, power: { ...s.power, energy: { w: 9, b: 0 } } } : s);
const material = (cells: string, white: boolean) => [...cells].reduce((a, c) => a + (colorOf(c) === (white ? "w" : "b") ? VAL[typeOf(c)] ?? 0 : 0), 0);

export function JourneyBattle({ battle, cards, hearts, maxHearts, boss, onEnd }: { battle: Battle; cards: Record<Card, number>; hearts: number; maxHearts: number; boss: boolean; onEnd: (e: BattleEnd) => void }) {
  const rules = battle.fog ? rulesFor("fog") : battle.twist === "threecheck" ? rulesFor("threecheck") : CLASSIC;
  const ask = useEngine();
  const start = useMemo(() => {
    const s = fromFen(battle.fen);
    s.power = {
      energy: { w: 9, b: 0 },
      shields: [...battle.shieldW, ...battle.shieldB].map((sq) => ({ sq, until: 6 })),
      frozen: battle.frozenB.map((sq) => ({ sq, until: 4 })),
      cardPly: -1,
    };
    return s;
  }, [battle]);
  const startCards = useMemo(() => {
    const c = { ...cards };
    if (battle.extraCard) c[battle.extraCard] += 1;
    return c;
  }, [cards, battle.extraCard]);
  const [snap, setSnap] = useState<Snap>({ state: start, last: null, cards: startCards, doubleLeft: battle.double, botMoves: 0 });
  const [history, setHistory] = useState<Snap[]>([]);
  const [sel, setSel] = useState<number | null>(null);
  const [hint, setHint] = useState<Move | null>(null);
  const [hints, setHints] = useState(battle.hints);
  const [undos, setUndos] = useState(battle.undos);
  const [cardMode, setCardMode] = useState<{ card: Card; first?: number } | null>(null);
  const [toast, setToast] = useState<{ text: string; kind: "good" | "bad" | "info"; id: number } | null>(null);
  const [intro, setIntro] = useState(true);
  const [thinking, setThinking] = useState(false);
  const gen = useRef(0); // bumps on undo so a late bot answer is ignored
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { gen.current++; if (timer.current) clearTimeout(timer.current); }, []);

  const s = snap.state;
  const myMoves = Math.ceil(s.ply / 2);

  function judge(st: State): Result | null {
    const g = goalWinner(st, battle.goal);
    if (g) {
      const reason = battle.goal.kind === "hill" ? "king of the hill" : battle.goal.kind === "queenhunt" ? "capturing the queen" : battle.goal.kind === "survive" ? "holding the line" : battle.goal.kind === "threecheck" ? "three checks" : "taking the king";
      return { winner: g, reason };
    }
    if (battle.twist === "blitz" && st.turn === "w" && Math.ceil(st.ply / 2) >= 25) return { winner: "b", reason: "time" };
    return outcome(st, rules);
  }

  const result = judge(s);
  const myTurn = s.turn === "w" && !result && !intro && !thinking;
  const playable = withEnergy(s);
  const targets = sel != null && myTurn && !cardMode ? movesFrom(s, sel, rules).map((m) => m.to) : [];
  const cardSquares = cardMode && myTurn ? cardTargets(playable, cardMode.card, rules, cardMode.first) : [];
  const check = !rules.kingCapture && inCheck(s) ? s.cells.indexOf(s.turn === "w" ? "K" : "k") : undefined;
  const cardPlayed = s.power?.cardPly === s.ply;
  const live = (list?: { sq: number; until: number }[]) => (list ?? []).filter((x) => x.until > s.ply).map((x) => x.sq);

  function say(text: string, kind: "good" | "bad" | "info") {
    setToast({ text, kind, id: now() });
  }

  /** Bot strength right now: a little mercy when you're losing badly, a little bite when you're crushing it. */
  function liveRating(st: State) {
    const diff = material(st.cells, true) - material(st.cells, false) - (material(start.cells, true) - material(start.cells, false));
    return battle.rating + (diff >= 5 ? 120 : diff >= 3 ? 60 : diff <= -6 ? -120 : diff <= -3 ? -60 : 0);
  }

  // ---- Enemy tricks that happen after its move ----
  function afterBot(st: State, botMoves: number): { state: State; note?: string } {
    let out = st;
    let note: string | undefined;
    if (judge(out)) return { state: out };
    if (battle.twist === "horde" && botMoves % 4 === 0) {
      const spots: number[] = [];
      for (let i = 8; i < 24; i++) if (out.cells[i] === ".") spots.push(i);
      for (const sq of shuffled(spots)) {
        const cells = out.cells.slice(0, sq) + "p" + out.cells.slice(sq + 1);
        const trial = { ...out, cells };
        if (!inCheck(trial, "w")) { out = trial; note = "Reinforcements arrive!"; break; }
      }
    }
    if (battle.traits.includes("frost") && botMoves % 5 === 0 && out.power && !inCheck(out, "w")) {
      const mine = out.cells.split("").map((c, i) => ({ c, i })).filter((x) => colorOf(x.c) === "w" && x.c !== "K").sort((a, b) => VAL[typeOf(b.c)] - VAL[typeOf(a.c)]);
      for (const { i } of mine) {
        const trial: State = { ...out, power: { ...out.power, frozen: [...out.power.frozen, { sq: i, until: out.ply + 4 }] } };
        if (legalMoves(trial, rules).length > 0) { out = trial; note = `Frost! Your ${NAMES[typeOf(out.cells[i])]} is frozen`; break; }
      }
    }
    return { state: out, note };
  }

  function botTurn(base: Snap) {
    if (judge(base.state)) return;
    const my = ++gen.current;
    setThinking(true);
    const started = now();
    ask({ state: base.state, rating: liveRating(base.state), goal: battle.goal, rules }).then((bm) => {
      if (my !== gen.current) return;
      const wait = Math.max(0, 450 - (now() - started));
      timer.current = setTimeout(() => {
        if (my !== gen.current) return;
        if (!bm) { setThinking(false); return; }
        const res = applyMove(base.state, bm, rules);
        const botMoves = base.botMoves + 1;
        if (res.check) { feedback.check(); say("Check!", "bad"); } else if (res.captured) feedback.capture(); else feedback.move();
        // Swift: the first time, it goes again.
        if (battle.traits.includes("swift") && botMoves === 1 && !res.check && !judge(res.state)) {
          const again = { ...base, state: { ...res.state, turn: "b" as const, ep: -1 }, last: [bm.from, bm.to] as [number, number], botMoves };
          setSnap(again);
          say("Swift! It moves again", "bad");
          botTurn(again);
          return;
        }
        const after = afterBot(res.state, botMoves);
        if (after.note) say(after.note, "bad");
        setSnap({ ...base, state: after.state, last: [bm.from, bm.to], botMoves });
        setThinking(false);
      }, wait);
    });
  }

  function afterMine(base: Snap, next: State, last: [number, number], check: boolean) {
    let state = next;
    let doubleLeft = base.doubleLeft;
    let again = false;
    if (doubleLeft && !check && !judge(next)) {
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
      if (played.endsTurn) afterMine(base, played.state, snap.last ?? [i, i], !rules.kingCapture && inCheck(played.state));
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
    if (!history.length || undos <= 0) return;
    gen.current++;
    if (timer.current) clearTimeout(timer.current);
    feedback.tap();
    setThinking(false);
    setSnap(history[history.length - 1]);
    setHistory(history.slice(0, -1));
    setUndos(undos - 1);
    setSel(null);
    setHint(null);
    setCardMode(null);
  }

  function showHint() {
    if (!myTurn || hints <= 0) return;
    feedback.tap();
    setHints(hints - 1);
    const my = gen.current;
    ask({ state: { ...s, turn: "w" }, rating: 2200, goal: battle.goal, rules }).then((m) => { if (my === gen.current) setHint(m); });
  }

  const capW = lost(start.cells, s.cells, false); // taken by me
  const capB = lost(start.cells, s.cells, true);
  const won = result?.winner === "w";
  const twist = TWIST_INFO[battle.twist];
  const shown = battle.fog && !result ? fogCells(s, "w", rules) : s.cells;
  const lastShown = snap.last && battle.fog && shown[snap.last[1]] === "?" ? null : snap.last;
  let status = "";
  if (!result) {
    if (s.turn === "b" || thinking) status = `${battle.name} is thinking…`;
    else if (cardMode) status = cardMode.card === "swap" && cardMode.first !== undefined ? "Now tap the second piece" : CARD_INFO[cardMode.card].help;
    else if (check !== undefined) status = "You're in check! Protect your king";
    else if (sel != null) status = "Tap a dot to move";
    else if (battle.twist === "blitz") status = `Your move · ${25 - myMoves} moves left`;
    else if (battle.twist === "survive") status = `Your move · survive ${Math.max(0, 15 - myMoves)} more`;
    else if (rules.threeCheck) status = `Your move · checks ${s.checks.w}/3`;
    else status = "Your move";
  }
  const endText = won
    ? `Won by ${result!.reason} in ${myMoves} move${myMoves === 1 ? "" : "s"}.`
    : result?.winner === "draw"
      ? `Draw by ${result.reason}. You survive, but earn no reward.`
      : result?.reason === "time"
        ? "Out of moves! You lose a heart."
        : `Lost by ${result?.reason}. You lose a heart.`;

  return (
    <main className="screen tight" style={{ position: "relative" }}>
      <header className="topbar" style={{ gap: 6, flexWrap: "wrap" }}>
        <span className="chip" style={{ background: boss ? "#4B4B4B" : "var(--sky-soft)", color: boss ? "#fff" : "var(--sky-edge)" }}>{boss ? "BOSS" : "BATTLE"}</span>
        {twist && <span className="chip" style={{ background: twist.color, color: "#fff" }}>{twist.name.toUpperCase()}</span>}
        <span className="grow" />
        <Hearts left={hearts} total={maxHearts} size={20} />
      </header>

      <PlayerBar
        name={battle.name}
        bot
        thinking={(s.turn === "b" || thinking) && !result}
        sub={<span className="sub">{capB.map((p, k) => <Piece key={k} code={p} size={18} style={{ marginRight: -4 }} />)}{rules.threeCheck && <span style={{ marginLeft: 8 }}>Checks {s.checks.b}/3</span>}</span>}
        right={<span style={{ fontSize: 13, fontWeight: 900, color: "var(--muted)", textAlign: "right", lineHeight: 1.2 }}>{rank(battle.rating)}<br />{battle.rating}</span>}
      />
      <div style={{ position: "relative" }}>
        <Board
          cells={shown}
          selected={cardMode ? cardMode.first ?? null : sel}
          targets={targets}
          last={lastShown}
          check={check}
          onTap={tap}
          moved={lastShown?.[1] ?? null}
          frozen={live(s.power?.frozen)}
          shields={live(s.power?.shields)}
          glow={cardMode ? cardSquares : battle.twist === "hill" ? [27, 28, 35, 36] : undefined}
          arrows={hint ? [{ from: hint.from, to: hint.to, color: "#58CC02", dash: true }] : undefined}
        />
        {toast && <div key={toast.id} className="btoast" onAnimationEnd={() => setToast(null)} style={toast.kind === "bad" ? { background: "var(--cherry)", color: "#fff", boxShadow: "0 4px 0 var(--cherry-edge)" } : toast.kind === "info" ? { background: "#fff", color: "var(--ink)", boxShadow: "0 4px 0 var(--line)" } : { background: "var(--lime)", color: "var(--lime-ink)", boxShadow: "0 4px 0 var(--lime-edge)" }}>{toast.text}</div>}
      </div>
      <PlayerBar name="You" initial="Y" paint={ME} sub={<span className="sub">{capW.map((p, k) => <Piece key={k} code={p} size={18} style={{ marginRight: -4 }} />)}{rules.threeCheck && <span style={{ marginLeft: 8 }}>Checks {s.checks.w}/3</span>}</span>} />
      <p style={{ margin: 0, textAlign: "center", fontSize: 16, fontWeight: 900, minHeight: 22, color: check !== undefined && s.turn === "w" ? "var(--cherry-edge)" : "var(--ink)" }} aria-live="polite">{status}</p>

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
        <button className="btn btn-white" onClick={undo} disabled={!history.length || undos <= 0 || !!result}>Undo ({undos})</button>
        <button className="btn btn-white" style={{ color: "var(--sun-ink)" }} disabled={!myTurn || hints <= 0} onClick={showHint}><Icon.Bulb size={20} />Hint ({hints})</button>
      </div>

      {intro && (
        <div className="overlay">
          <Mascot size={80} mood="wow" className="bob" />
          <h2 style={{ margin: 0, fontSize: 28, fontWeight: 900, textAlign: "center" }}>{boss ? `${battle.name} appears!` : `${battle.name} blocks the way`}</h2>
          <span style={{ fontSize: 15, fontWeight: 900, color: "var(--muted)" }}>{rank(battle.rating)} · rating {battle.rating}</span>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, width: "100%", maxWidth: 340 }}>
            {twist && <div style={{ padding: "10px 12px", borderRadius: 14, background: "#fff", border: `2px solid ${twist.color}` }}><b style={{ color: twist.color }}>{twist.name}</b><div style={{ fontSize: 14, fontWeight: 700, color: "var(--muted)" }}>{twist.text}</div></div>}
            {battle.traits.map((t) => <div key={t} style={{ padding: "10px 12px", borderRadius: 14, background: "#fff", border: "2px solid var(--line)" }}><b>{TRAIT_INFO[t].name}</b><div style={{ fontSize: 14, fontWeight: 700, color: "var(--muted)" }}>{TRAIT_INFO[t].text}</div></div>)}
            {!twist && !battle.traits.length && <p style={{ margin: 0, textAlign: "center", fontWeight: 700, color: "var(--muted)" }}>Checkmate the enemy king to win.</p>}
            {battle.double && <p style={{ margin: 0, textAlign: "center", fontWeight: 700, color: "var(--muted)" }}>Battle Cry: you move twice on your first turn.</p>}
          </div>
          <button className="btn btn-green" style={{ maxWidth: 340 }} onClick={() => { feedback.unlock(); feedback.go(); setIntro(false); }}>Fight!</button>
        </div>
      )}

      {result && (
        <div className="overlay">
          {won && <Confetti />}
          <Mascot size={100} mood={won ? "joy" : "wow"} className={won ? "jump" : undefined} />
          <h2 style={{ margin: 0, fontSize: 34, fontWeight: 900, textAlign: "center", color: won ? "var(--lime-dark)" : "var(--tangerine-ink)" }}>
            {won ? (boss ? `You beat ${battle.name}!` : "Victory!") : result.winner === "draw" ? "A draw" : "Defeated"}
          </h2>
          <p style={{ margin: 0, fontSize: 17, fontWeight: 700, color: "var(--muted)", textAlign: "center" }}>{endText}</p>
          {!won && undos > 0 && history.length > 0 && result.reason !== "time" && <button className="btn btn-white" onClick={undo}>Undo last move ({undos})</button>}
          <button className="btn btn-green" onClick={() => { feedback.tap(); onEnd({ result: won ? "win" : result.winner === "draw" ? "draw" : "loss", myMoves, captured: capW }); }}>Continue</button>
        </div>
      )}
    </main>
  );
}

/** Rating the bot "really" played at, counting army size: beating a bigger army counts for more. */
export function effectiveRating(battle: Battle) {
  const s = fromFen(battle.fen);
  const diff = armyValue(s.cells.replace(/[A-Z]/g, ".")) - armyValue(s.cells.replace(/[a-z]/g, "."));
  return battle.rating + Math.max(-350, Math.min(350, diff * 28));
}
