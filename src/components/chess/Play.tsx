"use client";

import { useMutation } from "convex/react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../../../convex/_generated/api";
import {
  CARD_COST,
  applyMove,
  bestMove,
  cardTargets,
  colorOf,
  findMove,
  legalMoves,
  movesFrom,
  rulesFor,
  typeOf,
  type Card,
  type Color,
  type Move,
  type State,
} from "../../../convex/lib/chess";
import { Avatar, Confetti, FRIENDS, Icon, ME, Mascot, Sheet, roomPaints, type Paint } from "@/components/ui";
import { errorText } from "@/lib/errors";
import { feedback } from "@/lib/feedback";
import { useNow } from "@/lib/hooks";
import { Board, PIECE_NAMES, Piece, type Arrow, type Mark } from "./Board";
import { Captured, Clock, Energy, PlayerBar, capturedFrom, modeInfo } from "./bits";
import type { ChessView } from "./types";

const REACTIONS = ["Nice move!", "Oops", "GG"];
const TEAM_CHIPS = ["Got it!", "Hmm…", "Great call"];
const COACH_TIPS = ["Capture this!", "Check here!", "Careful!", "Good move!", "Try again", "Think first"];
const CARDS: { id: Card; name: string; face: string; edge: string; icon: string; help: string }[] = [
  { id: "shield", name: "Shield", face: "#FFC800", edge: "#E5A800", icon: "M12 3 L20 6 V12 C20 17 16 20 12 21 C8 20 4 17 4 12 V6z", help: "Tap one of your pieces to protect it until your next turn." },
  { id: "freeze", name: "Freeze", face: "#1CB0F6", edge: "#1899D6", icon: "M12 2 v20 M3.3 7 l17.4 10 M3.3 17 L20.7 7", help: "Tap an enemy piece. It can't move for 2 turns." },
  { id: "swap", name: "Swap", face: "#CE82FF", edge: "#A568CC", icon: "M7 4 L3 8 L7 12 M3 8 H17 M17 12 L21 16 L17 20 M21 16 H7", help: "Tap two of your pieces to trade places. This uses your move." },
  { id: "rocket", name: "Rocket", face: "#FF9600", edge: "#E08600", icon: "M6 13 L12 7 L18 13 M6 19 L12 13 L18 19", help: "Tap a pawn to jump it two squares forward. This uses your move." },
];
const COACH_TOOLS = [
  { id: "arrow", name: "ARROW", icon: "M5 19 L19 5 M10 5 h9 v9" },
  { id: "hi", name: "LOOK", icon: "M2 12 C5 6 9 4 12 4 s7 2 10 8 c-3 6 -7 8 -10 8 s-7 -2 -10 -8z M12 9 a3 3 0 1 0 0 6 a3 3 0 1 0 0-6z" },
  { id: "ring", name: "TAKE", icon: "M12 3 a9 9 0 1 0 0 18 a9 9 0 1 0 0-18z M12 9 v6 M9 12 h6" },
  { id: "danger", name: "DANGER", icon: "M12 3 L22 20 H2z M12 10 v4 M12 17 v.01" },
  { id: "clear", name: "CLEAR", icon: "M8 20 h12 M4.5 14.5 l9-9 a2 2 0 0 1 3 0 l3 3 a2 2 0 0 1 0 3 L12 19 H8.5 l-4-4z" },
] as const;
type CoachTool = (typeof COACH_TOOLS)[number]["id"];
const REASONS: Record<string, string> = {
  checkmate: "by checkmate", time: "on time", resigned: "by resignation", left: "because the other player left",
  king: "by capturing the king", checks: "with three checks", stalemate: "by stalemate", "50 moves": "by the 50-move rule", "not enough pieces": "with not enough pieces left",
};

export function ChessPlay({ room }: { room: ChessView }) {
  const g = room.game!;
  const router = useRouter();
  const now = useNow(g.clock ? 200 : 1000);
  const rules = rulesFor(room.mode);
  const mode = modeInfo(room.mode);
  const api_ = {
    move: useMutation(api.chess.move),
    duck: useMutation(api.chess.duck),
    card: useMutation(api.chess.card),
    pick: useMutation(api.chess.pick),
    resign: useMutation(api.chess.resign),
    leave: useMutation(api.chess.leave),
    rematch: useMutation(api.chess.rematch),
    react: useMutation(api.chess.react),
    marks: useMutation(api.chess.coachMarks),
    coachSettings: useMutation(api.chess.coachSettings),
    takeback: useMutation(api.chess.takeback),
  };
  const paints = roomPaints(room.members);
  const nameOf = (id?: string) => room.members.find((m) => m.id === id)?.name ?? "Friend";
  const paintOf = (id?: string): Paint => (id ? paints.get(id as never) : undefined) ?? FRIENDS[0];

  const coach = g.coach;
  const team = g.team;
  const isCoach = coach?.coachId === room.meId;
  const myColor = g.myColor as Color | null;
  const flipped = myColor === "b";
  const result = g.result;
  const started = !room.startAt || now >= room.startAt;
  const counting = !started && !result;

  // Optimistic board: show my move right away until the server answers.
  const [pending, setPending] = useState<{ seq: number; state: State; last: [number, number] } | null>(null);
  const live = pending && pending.seq === g.seq ? pending : null;
  const state: State = live ? live.state : (g.state as State);
  const last = live ? live.last : ((g.last as [number, number] | undefined) ?? null);
  const playable: State = useMemo(() => ({ ...state, cells: state.cells.replace(/\?/g, ".") }), [state]);

  const [sel, setSel] = useState<number | null>(null);
  const [cardMode, setCardMode] = useState<{ card: Card; first?: number } | null>(null);
  const [toast, setToast] = useState<{ text: string; kind: "good" | "bad" | "info"; id: number } | null>(null);
  const [quit, setQuit] = useState(false);
  const [tool, setTool] = useState<CoachTool>("arrow");
  const [arrowFrom, setArrowFrom] = useState<number | null>(null);
  const [peek, setPeek] = useState(false);

  const say = (text: string, kind: "good" | "bad" | "info" = "info") => setToast({ text, kind, id: Date.now() + Math.random() });
  const fail = (e: unknown) => { feedback.wrong(); setPending(null); say(errorText(e, "Not allowed"), "bad"); };

  // Sounds + toasts when the server's game changes.
  const prev = useRef({ moves: g.moves.length, cells: g.state.cells, check: g.inCheck, note: g.note });
  useEffect(() => {
    const p = prev.current;
    const toasts: [string, "good" | "bad" | "info"][] = [];
    if (g.moves.length > p.moves) {
      const before = p.cells.replace(/[.*?]/g, "").length, after = g.state.cells.replace(/[.*?]/g, "").length;
      if (g.inCheck) {
        feedback.check();
        const side = g.state.turn;
        const text = room.mode === "threecheck" ? `Check ${g.state.checks[side === "w" ? "b" : "w"]} of 3!` : "Check!";
        toasts.push([text, side === myColor ? "bad" : "good"]);
      } else if (after < before) feedback.capture();
      else feedback.move();
    }
    if (g.note && g.note !== p.note) toasts.push([g.note, "info"]);
    if (toasts.length) setTimeout(() => toasts.forEach(([t, k]) => say(t, k)), 0);
    prev.current = { moves: g.moves.length, cells: g.state.cells, check: g.inCheck, note: g.note };
  }, [g.seq]); // eslint-disable-line react-hooks/exhaustive-deps

  // Results sound.
  const resultKey = result ? result.winner + result.reason : "";
  useEffect(() => {
    if (!result) return;
    const iWon = isCoach ? result.winner === "w" : result.winner === myColor;
    if (iWon) feedback.win(); else feedback.wrong();
  }, [resultKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Reactions floating up from player bars.
  const [mountedAt] = useState(() => Date.now());
  const seen = useRef(new Set<string>());
  const [floats, setFloats] = useState<{ id: string; text: string; playerId: string }[]>([]);
  useEffect(() => {
    for (const r of room.reactions) {
      if (seen.current.has(r.id) || r.at < mountedAt) continue;
      seen.current.add(r.id);
      const f = { id: r.id, text: r.text, playerId: r.playerId };
      setFloats((x) => [...x, f]);
      if (r.playerId !== room.meId) feedback.ping();
      setTimeout(() => setFloats((x) => x.filter((y) => y.id !== f.id)), 1800);
    }
  }, [room.reactions]); // eslint-disable-line react-hooks/exhaustive-deps
  const latestTip = coach ? room.reactions.find((r) => r.playerId === coach.coachId) : undefined;
  const coachTip = latestTip && now - latestTip.at < 25_000 ? latestTip : undefined; // tips fade after a while

  // ---------- Whose move ----------
  const turn = state.turn;
  const myTurn = !result && started && !!myColor && turn === myColor && (!team || (team.hand === room.meId && !!team.pick));
  const duckTime = myTurn && !!state.duckPending;
  const pickedType = team?.pick;
  const targets = sel != null && myTurn && !duckTime ? movesFrom(playable, sel, rules).map((m) => m.to) : [];
  const cardSquares = cardMode && myTurn ? cardTargets(playable, cardMode.card, rules, cardMode.first) : [];
  const teamGlow = team && pickedType && turn === "w" ? [...state.cells].map((ch, i) => (colorOf(ch) === "w" && typeOf(ch) === pickedType && movesFrom(playable, i, rules).length ? i : -1)).filter((i) => i >= 0) : [];
  const checkSq = g.inCheck ? state.cells.indexOf(turn === "w" ? "K" : "k") : undefined;

  function tryMove(from: number, to: number) {
    const m = findMove(playable, from, to, rules);
    if (!m) return;
    const res = applyMove(playable, m, rules);
    setPending({ seq: g.seq, state: { ...res.state, cells: mergeFog(state.cells, res.state.cells) }, last: [from, to] });
    setSel(null);
    if (res.captured) feedback.capture(); else feedback.move();
    api_.move({ code: room.code, from, to, promo: m.promo }).catch(fail);
  }

  function tapBoard(i: number) {
    if (isCoach) return coachTap(i);
    if (!myTurn) {
      if (myColor && !result && started && colorOf(state.cells[i]) === myColor) {
        setSel(sel === i ? null : i); // pre-look at moves while waiting
      }
      return;
    }
    if (duckTime) {
      if (state.cells[i] !== ".") { say("Pick an empty square", "info"); return; }
      const cells = state.cells.replace("*", ".").split("");
      cells[i] = "*";
      setPending({ seq: g.seq, state: { ...state, cells: cells.join(""), duckPending: false }, last: last ?? [i, i] });
      feedback.correct();
      api_.duck({ code: room.code, sq: i }).catch(fail);
      return;
    }
    if (cardMode) {
      if (!cardSquares.includes(i)) { say("Tap a glowing square", "info"); return; }
      if (cardMode.card === "swap" && cardMode.first === undefined) { setCardMode({ card: "swap", first: i }); feedback.tap(); return; }
      const c = cardMode.card;
      setCardMode(null);
      feedback.clear();
      api_.card({ code: room.code, card: c, a: cardMode.first ?? i, b: cardMode.first !== undefined ? i : undefined }).catch(fail);
      return;
    }
    if (sel != null && targets.includes(i)) return tryMove(sel, i);
    const ch = state.cells[i];
    if (colorOf(ch) === myColor) {
      if (team && typeOf(ch) !== pickedType) { say(`Move a ${PIECE_NAMES[pickedType ?? "p"]}!`, "info"); return; }
      feedback.tap();
      setSel(sel === i ? null : i);
      return;
    }
    setSel(null);
  }

  // ---------- Coach drawing ----------
  const [draft, setDraft] = useState<{ seq: number; arrows: [number, number][]; marks: Mark[] } | null>(null);
  const shownArrows: [number, number][] = draft && draft.seq === g.seq ? draft.arrows : ((coach?.arrows as [number, number][]) ?? []);
  const shownMarks: Mark[] = draft && draft.seq === g.seq ? draft.marks : ((coach?.marks as Mark[]) ?? []);
  function sendMarks(arrows: [number, number][], marks: Mark[]) {
    setDraft({ seq: g.seq, arrows, marks });
    api_.marks({ code: room.code, arrows, marks }).catch(fail);
  }
  function coachTap(i: number) {
    if (result) return;
    feedback.tap();
    if (tool === "arrow") {
      if (arrowFrom == null) { setArrowFrom(i); return; }
      if (arrowFrom !== i) sendMarks([...shownArrows, [arrowFrom, i]], shownMarks);
      setArrowFrom(null);
      return;
    }
    if (tool === "clear") return;
    const t = tool as Mark["t"];
    const has = shownMarks.some((m) => m.sq === i && m.t === t);
    sendMarks(shownArrows, has ? shownMarks.filter((m) => !(m.sq === i && m.t === t)) : [...shownMarks, { t, sq: i }]);
  }
  const best: Move | null = useMemo(() => (isCoach && peek && !result && turn === "w" ? bestMove(g.state as State) : null), [isCoach, peek, result, turn, g.seq]); // eslint-disable-line react-hooks/exhaustive-deps

  const arrows: Arrow[] = coach ? shownArrows.map(([from, to]) => ({ from, to })) : [];
  if (best) arrows.push({ from: best.from, to: best.to, color: "#58CC02", dash: true });

  // ---------- Clocks ----------
  const clockLeft = (c: Color) => {
    if (!g.clock) return 0;
    const base = g.clock[c];
    return turn === c && !result && started ? Math.max(0, base - Math.max(0, now - g.clock.since)) : base;
  };

  // ---------- Bars ----------
  const cap = room.mode === "fog" && !result ? null : capturedFrom(state.cells);
  const whiteIds = g.white as string[], blackIds = g.black as string[];
  const sideName = (c: Color) => {
    if (g.bot === c) return "Bolt the bot";
    const ids = c === "w" ? whiteIds : blackIds;
    if (team && c === "w") return "Your team";
    return ids.map((id) => (id === room.meId ? "You" : nameOf(id))).join(" & ");
  };
  const sidePaint = (c: Color) => {
    const ids = c === "w" ? whiteIds : blackIds;
    return ids.includes(room.meId) ? ME : paintOf(ids[0]);
  };
  const bottom: Color = flipped ? "b" : "w";
  const top: Color = bottom === "w" ? "b" : "w";

  function bar(c: Color) {
    const bot = g.bot === c;
    const ids = c === "w" ? whiteIds : blackIds;
    const thinking = !result && started && turn === c && (bot || !ids.includes(room.meId));
    const sub = (
      <span className="sub" style={{ gap: 8 }}>
        {cap && <Captured pieces={c === "w" ? cap.byWhite : cap.byBlack} plus={c === "w" ? cap.diff : -cap.diff} />}
        {room.mode === "threecheck" && <span aria-label={`${g.state.checks[c]} checks given`} style={{ display: "inline-flex", gap: 3 }}>{[0, 1, 2].map((k) => <span key={k} style={{ width: 10, height: 10, borderRadius: 5, background: k < g.state.checks[c] ? "#FF86D0" : "#E5E5E5" }} />)}</span>}
        {room.mode === "powerups" && state.power && <Energy n={state.power.energy[c]} />}
        {bot && <span style={{ color: "var(--grape-ink)" }}>Level {room.botLevel}</span>}
      </span>
    );
    return (
      <PlayerBar
        name={sideName(c)}
        initial={team && c === "w" ? "T" : nameOf(ids[0])}
        paint={sidePaint(c)}
        bot={bot}
        thinking={thinking}
        sub={sub}
        right={g.clock ? <Clock ms={clockLeft(c)} on={!result && started && turn === c} label={`${sideName(c)} clock`} /> : undefined}
      >
        {floats.filter((f) => (bot ? false : ids.includes(f.playerId as never))).map((f) => (
          <span key={f.id} className="float-chip" style={{ background: paintOf(f.playerId).face, color: "#fff", boxShadow: `0 3px 0 ${paintOf(f.playerId).edge}` }}>{f.text}</span>
        ))}
      </PlayerBar>
    );
  }

  // ---------- Status line ----------
  let status = "";
  if (result) status = "";
  else if (isCoach) status = tool === "arrow" ? (arrowFrom != null ? "Now tap where it should go" : `Arrow: tap a piece, then a square. ${nameOf(coach!.learnerId)} sees it live.`) : tool === "hi" ? "Look: tap a square to point at it" : tool === "ring" ? "Take: tap a piece they can capture" : tool === "danger" ? "Danger: tap a square that's under attack" : "";
  else if (!myColor) status = "You're watching";
  else if (turn !== myColor) status = g.bot === turn ? "Bolt is thinking…" : `${sideName(turn)} is thinking…`;
  else if (team && team.brain === room.meId) status = team.pick ? `${nameOf(team.hand)} is moving a ${PIECE_NAMES[team.pick]}` : "You're the Brain: pick a piece type";
  else if (team && !team.pick) status = `Waiting for ${nameOf(team.brain)} to pick a piece…`;
  else if (duckTime) status = "Now put the duck on any empty square";
  else if (cardMode) status = CARDS.find((c) => c.id === cardMode.card)!.help;
  else if (g.inCheck) status = "You're in check! Protect your king";
  else status = sel != null ? "Tap a dot to move" : "Your move";

  // ---------- Result text ----------
  let title = "", sub = "", happy = false;
  if (result) {
    const w = result.winner;
    const reason = REASONS[result.reason] ?? "";
    if (w === "draw") { title = "It's a draw"; sub = `Draw ${reason}.`; }
    else if (coach) { happy = w === "w"; title = w === "w" ? (isCoach ? `${nameOf(coach.learnerId)} won!` : "You won!") : "Bolt wins"; sub = `${w === "w" ? "Beat Bolt" : "Bolt won"} ${reason}. ${isCoach ? "+15 XP for coaching" : w === "w" ? "+30 XP" : "+15 XP"}`; }
    else if (team) { happy = w === "w"; title = w === "w" ? "Team wins!" : "Bolt wins"; sub = `${w === "w" ? "You two beat Bolt" : "Bolt won"} ${reason}. ${w === "w" ? "+35 XP" : "+10 XP"}`; }
    else if (myColor) { happy = w === myColor; title = happy ? (result.reason === "checkmate" ? "Checkmate!" : "You win!") : `${sideName(w)} wins`; sub = `${happy ? "You won" : "Lost"} ${reason}. ${happy ? "+40 XP" : "+10 XP"}`; }
    else { title = `${sideName(w)} wins`; sub = `Won ${reason}.`; }
  }

  const leaveRoom = async () => { await api_.leave({ code: room.code }).catch(() => {}); router.push("/chess"); };
  const cards = room.mode === "powerups" && state.power ? state.power : null;
  const cardPlayed = cards ? cards.cardPly === state.ply : false;

  return (
    <main className="screen tight" style={{ position: "relative" }}>
      <header className="topbar" style={{ gap: 8 }}>
        <button className="icon-btn" aria-label="Leave game" onClick={() => { feedback.tap(); if (result) void leaveRoom(); else setQuit(true); }}><Icon.Close /></button>
        <span className="chip" style={{ background: mode.soft, color: mode.ink }}>{mode.name.toUpperCase()}{g.clock ? ` · ${Math.round(room.clockMs / 60000)} MIN` : ""}</span>
        <span className="grow" />
        {coach && !isCoach && <span className="chip" style={{ background: "#FFF0DB", color: "#9A5200" }}>YOU LEARN</span>}
        {coach && isCoach && (
          <button className="icon-btn" style={{ width: "auto", gap: 6, fontSize: 12, fontWeight: 900, color: "var(--muted)" }} role="switch" aria-checked={coach.takebacks} aria-label="Allow take-backs" onClick={() => api_.coachSettings({ code: room.code, takebacks: !coach.takebacks }).catch(fail)}>
            <span className={`switch${coach.takebacks ? " on" : ""}`} />TAKE-BACKS
          </button>
        )}
      </header>

      {isCoach ? (
        <PlayerBar name="Bolt the bot" bot thinking={!result && turn === "b"} sub={<span className="sub" style={{ color: "var(--grape-ink)" }}>Level {room.botLevel}</span>} />
      ) : bar(top)}

      <div style={{ position: "relative" }}>
        <Board
          cells={state.cells}
          flipped={flipped}
          selected={isCoach ? null : sel}
          targets={cardMode ? [] : targets}
          last={last}
          check={checkSq}
          moved={last?.[1] ?? null}
          glow={cardMode ? cardSquares : teamGlow}
          frozen={state.power?.frozen.filter((f) => f.until > state.ply).map((f) => f.sq)}
          shields={state.power?.shields.filter((f) => f.until > state.ply).map((f) => f.sq)}
          arrows={arrows}
          marks={coach ? shownMarks : undefined}
          pending={isCoach ? arrowFrom : null}
          onTap={tapBoard}
          disabled={!!result || counting}
        />
        {toast && (
          <div key={toast.id} className="btoast" style={toast.kind === "bad" ? { background: "var(--cherry)", color: "#fff", boxShadow: "0 4px 0 var(--cherry-edge)" } : toast.kind === "good" ? { background: "var(--lime)", color: "var(--lime-ink)", boxShadow: "0 4px 0 var(--lime-edge)" } : { background: "#fff", color: "var(--ink)", border: "2px solid var(--line)", boxShadow: "0 4px 0 var(--line)" }} onAnimationEnd={() => setToast(null)}>{toast.text}</div>
        )}
      </div>

      {isCoach ? (
        <PlayerBar name={nameOf(coach!.learnerId)} paint={paintOf(coach!.learnerId)} thinking={!result && turn === "w"} sub={<span className="sub" style={{ color: "var(--sky-edge)" }}>Learner · playing white</span>}
          right={<button className="btn btn-sm btn-white" aria-pressed={peek} style={{ color: "var(--sun-ink)", ...(peek ? { background: "var(--sun-soft)", borderColor: "var(--sun)" } : {}) }} onClick={() => { feedback.tap(); setPeek(!peek); }}><Icon.Bulb size={18} />Best</button>}
        />
      ) : bar(bottom)}

      {coach && !isCoach && (
        <section className="coach-panel" aria-live="polite">
          <Avatar name={nameOf(coach.coachId)} paint={paintOf(coach.coachId)} size={34} />
          <span style={{ display: "flex", flexDirection: "column", gap: 3, flex: 1 }}>
            <span style={{ fontSize: 13, fontWeight: 900, letterSpacing: ".04em", color: "#9A5200" }}>{nameOf(coach.coachId).toUpperCase()} · YOUR COACH</span>
            <span style={{ fontSize: 16, fontWeight: 800, lineHeight: 1.35 }}>{coachTip ? coachTip.text : shownArrows.length || shownMarks.length ? "Look at the marks on your board!" : "Your coach is watching. Ask if you're stuck!"}</span>
          </span>
        </section>
      )}

      {team && !result && (
        <section style={{ borderRadius: 18, background: "var(--sky-soft)", border: "2px solid var(--sky-line)", padding: "10px 12px", display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 8 }}>
            {[team.brain, team.hand].map((id, k) => (
              <span key={id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 8px", borderRadius: 14, background: "#fff", boxShadow: id === room.meId ? "0 0 0 3px var(--sky)" : "none" }}>
                <Avatar name={nameOf(id)} paint={id === room.meId ? ME : paintOf(id)} size={30} />
                <span style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
                  <span style={{ fontSize: 15, fontWeight: 900 }}>{id === room.meId ? "You" : nameOf(id)}</span>
                  <span style={{ fontSize: 12, fontWeight: 900, letterSpacing: ".06em", color: k === 0 ? "#9A5200" : "var(--sky-edge)" }}>{k === 0 ? "BRAIN" : "HAND"}</span>
                </span>
              </span>
            ))}
          </div>
          {team.brain === room.meId && turn === "w" && !team.pick && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(6, minmax(0, 1fr))", gap: 6 }} aria-label="Pick a piece type">
              {["p", "n", "b", "r", "q", "k"].map((t) => {
                const ok = legalMoves(playable, rules).some((m) => typeOf(playable.cells[m.from]) === t);
                return (
                  <button key={t} className="key" style={{ minHeight: 52, padding: 4 }} disabled={!ok} aria-label={`Pick ${PIECE_NAMES[t]}`} onClick={() => { feedback.tap(); api_.pick({ code: room.code, piece: t }).catch(fail); }}>
                    <Piece code={t.toUpperCase()} size={34} />
                  </button>
                );
              })}
            </div>
          )}
          {team.pick && turn === "w" && (
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ width: 46, height: 46, borderRadius: 14, background: "#fff", boxShadow: "0 3px 0 var(--sky-line)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><Piece code={team.pick.toUpperCase()} size={36} /></span>
              <span style={{ fontSize: 16, fontWeight: 900, color: "var(--sky-edge)" }}>
                {team.brain === room.meId ? `You picked: ${PIECE_NAMES[team.pick]}` : `${nameOf(team.brain)} picked: ${PIECE_NAMES[team.pick]}. Move a glowing one!`}
              </span>
            </div>
          )}
        </section>
      )}

      {!result && <p style={{ margin: 0, textAlign: "center", fontSize: 16, fontWeight: 900, color: g.inCheck && turn === myColor ? "var(--cherry-edge)" : "var(--ink)" }} aria-live="polite">{status}</p>}

      {!coach && !team && (
        <div className="movelist" aria-label="Moves">
          {g.moves.map((m, k) => <span key={k} className={k === g.moves.length - 1 ? "now" : undefined}>{k % 2 === 0 ? `${k / 2 + 1}. ` : ""}{m}</span>).slice(-8)}
        </div>
      )}
      {room.mode === "fog" && !result && <p style={{ margin: 0, textAlign: "center", fontSize: 13, fontWeight: 800, color: "var(--muted)" }}>Grey squares are hidden. Capture the king to win.</p>}

      <div className="grow" />

      {cards && myColor && !result && (
        <section style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 8, alignItems: "end", paddingTop: 10 }} aria-label="Power-up cards">
          {CARDS.map((c) => {
            const on = cardMode?.card === c.id;
            const can = myTurn && !duckTime && !cardPlayed && cards.energy[myColor] >= CARD_COST[c.id] && cardTargets(playable, c.id, rules).length > 0;
            return (
              <button key={c.id} className="pcard" aria-pressed={on} disabled={!can && !on} aria-label={`${c.name}, costs ${CARD_COST[c.id]} energy`} onClick={() => { feedback.tap(); setSel(null); setCardMode(on ? null : { card: c.id }); }} style={on ? { borderColor: c.edge, boxShadow: `0 4px 0 ${c.edge}` } : undefined}>
                <span className="top" style={{ background: c.face, boxShadow: `inset 0 -4px 0 ${c.edge}` }}>
                  <svg width="26" height="26" viewBox="0 0 24 24" aria-hidden="true"><path d={c.icon} stroke="#fff" strokeWidth="2.6" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>
                </span>
                <span className="bottom">
                  <span style={{ fontSize: 14, fontWeight: 900 }}>{c.name}</span>
                  <Energy n={CARD_COST[c.id]} max={CARD_COST[c.id]} size={10} />
                </span>
              </button>
            );
          })}
        </section>
      )}

      {isCoach && !result && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(5, minmax(0, 1fr))", gap: 8 }} role="radiogroup" aria-label="Coach tools">
            {COACH_TOOLS.map((t) => (
              <button key={t.id} className="ctool" role={t.id === "clear" ? undefined : "radio"} aria-checked={t.id === "clear" ? undefined : tool === t.id} onClick={() => {
                feedback.tap();
                if (t.id === "clear") { sendMarks([], []); setArrowFrom(null); return; }
                setTool(t.id); setArrowFrom(null);
              }}>
                <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true"><path d={t.icon} stroke={tool === t.id && t.id !== "clear" ? "#fff" : "#E08600"} strokeWidth="2.4" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>
                {t.name}
              </button>
            ))}
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "center" }} aria-label="Quick tips">
            {COACH_TIPS.map((t) => <button key={t} className="pchip" onClick={() => { feedback.tap(); void api_.react({ code: room.code, text: t }); say(`Sent: ${t}`, "info"); }}>{t}</button>)}
          </div>
        </>
      )}

      {coach && !isCoach && !result && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 10 }}>
          <button className="btn btn-white" style={{ color: "#9A5200", fontSize: 16 }} onClick={() => { feedback.tap(); void api_.react({ code: room.code, text: "Help? ✋" }); say("Your coach got the message", "info"); }}>Ask coach</button>
          <button className="btn btn-white" style={{ fontSize: 16 }} disabled={!coach.takebacks || coach.undos <= 0 || !coach.canUndo} onClick={() => { feedback.tap(); setPending(null); api_.takeback({ code: room.code }).catch(fail); }}>
            <Icon.Undo size={20} color="#1899D6" />Undo · {coach.undos}
          </button>
        </div>
      )}

      {!coach && !result && myColor && (
        <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
          {(team ? TEAM_CHIPS : REACTIONS).map((r) => <button key={r} className="btn btn-white btn-sm" style={{ color: "var(--ink)", minHeight: 40 }} onClick={() => { feedback.tap(); void api_.react({ code: room.code, text: r }); }}>{r}</button>)}
        </div>
      )}

      {counting && <Countdown startAt={room.startAt!} label={team ? "Team up against Bolt" : coach ? (isCoach ? "Help your learner win" : "Your coach is here to help") : myColor === "w" ? "You play white. You go first!" : myColor === "b" ? "You play black" : "Watching"} />}

      <Sheet open={quit} onClose={() => setQuit(false)} label="Leave game">
        <h2 style={{ margin: 0, fontSize: 24, fontWeight: 900, textAlign: "center" }}>{myColor || isCoach ? "Resign this game?" : "Stop watching?"}</h2>
        <p style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "var(--muted)", textAlign: "center" }}>{myColor ? "Your opponent gets the win." : isCoach ? "The learner's game ends too." : "You can come back with the code."}</p>
        <button className="btn btn-green" onClick={() => setQuit(false)}>Keep playing</button>
        {(myColor || isCoach) && <button className="btn btn-white" style={{ color: "var(--cherry-edge)" }} onClick={() => { setQuit(false); api_.resign({ code: room.code }).catch(fail); }}>Resign</button>}
        <button className="btn btn-white" onClick={leaveRoom}>Leave room</button>
      </Sheet>

      {result && (
        <div className="overlay">
          {happy && <Confetti />}
          <Mascot size={110} mood={happy ? "joy" : "wow"} className={happy ? "jump" : undefined} />
          <h2 style={{ margin: 0, fontSize: 36, fontWeight: 900, textAlign: "center", color: happy ? "var(--lime-dark)" : result.winner === "draw" ? "var(--sky-btn)" : "var(--tangerine-ink)" }}>{title}</h2>
          <p style={{ margin: 0, fontSize: 18, fontWeight: 700, color: "var(--muted)", textAlign: "center" }}>{sub}</p>
          {room.isHost ? (
            <button className="btn btn-green" onClick={() => { feedback.tap(); api_.rematch({ code: room.code }).catch(fail); }}>Rematch</button>
          ) : (
            <p className="wait" style={{ margin: 0, fontSize: 16, fontWeight: 900, color: "var(--muted)" }}>Waiting for the host to start a rematch</p>
          )}
          <button className="btn btn-white" onClick={leaveRoom}>Back home</button>
        </div>
      )}
    </main>
  );
}

/** In fog, keep hidden squares hidden after an optimistic move. */
function mergeFog(before: string, after: string) {
  return after.split("").map((ch, i) => (before[i] === "?" && ch === "." ? "?" : ch)).join("");
}

function Countdown({ startAt, label }: { startAt: number; label: string }) {
  const now = useNow(100);
  const left = Math.ceil((startAt - now) / 1000);
  const lastTick = useRef(-1);
  useEffect(() => {
    if (left !== lastTick.current) {
      lastTick.current = left;
      if (left > 0 && left <= 3) feedback.tick();
      if (left === 0) feedback.go();
    }
  }, [left]);
  return (
    <div className="overlay" role="status" aria-live="assertive">
      <span className="label">{label}</span>
      <span key={left} className="countdown">{left > 3 ? "Ready" : Math.max(1, left)}</span>
    </div>
  );
}
