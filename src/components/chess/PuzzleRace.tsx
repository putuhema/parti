"use client";

import { useMutation } from "convex/react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../../../convex/_generated/api";
import { applyMove, colorOf, findMove, fromFen, movesFrom } from "../../../convex/lib/chess";
import { Avatar, Confetti, Icon, Mascot, Sheet, formatTime, roomPaints } from "@/components/ui";
import { errorText } from "@/lib/errors";
import { feedback } from "@/lib/feedback";
import { useNow } from "@/lib/hooks";
import { useIdentity } from "@/lib/identity";
import { Board } from "./Board";
import { modeInfo } from "./bits";
import type { ChessView } from "./types";

export function PuzzleRace({ room }: { room: ChessView }) {
  const g = room.game!;
  const p = g.puzzles!;
  const { token } = useIdentity();
  const router = useRouter();
  const now = useNow(250);
  const move = useMutation(api.chess.puzzleMove);
  const resign = useMutation(api.chess.resign);
  const leave = useMutation(api.chess.leave);
  const rematch = useMutation(api.chess.rematch);
  const paints = roomPaints(room.members);
  const mode = modeInfo("puzzles");
  const mine = p.mine;
  const state = useMemo(() => (p.fen ? fromFen(p.fen) : null), [p.fen]);
  const [sel, setSel] = useState<number | null>(null);
  const [shown, setShown] = useState<{ fen: string; cells: string; last: [number, number] } | null>(null);
  const [toast, setToast] = useState<{ text: string; good: boolean; id: number } | null>(null);
  const [quit, setQuit] = useState(false);
  const started = !room.startAt || now >= room.startAt;
  const locked = !!mine && now < mine.lockUntil;
  const done = !!mine && (!!mine.finishedAt || mine.gaveUp);
  const over = room.status === "finished";
  const view = shown && shown.fen === p.fen ? shown : null;
  const cells = view ? view.cells : state?.cells ?? ".".repeat(64);
  const targets = state && sel != null && !locked && !view ? movesFrom(state, sel).map((m) => m.to) : [];
  const elapsed = Math.max(0, (mine?.finishedAt ?? now) - (room.startAt ?? now));

  const lastIndex = useRef(mine?.index ?? 0);
  useEffect(() => {
    if (!mine) return;
    if (mine.index > lastIndex.current) {
      feedback.check();
      setToast({ text: mine.index >= p.total ? "All solved!" : "Checkmate! Next puzzle", good: true, id: Date.now() });
    }
    lastIndex.current = mine.index;
  }, [mine?.index]); // eslint-disable-line react-hooks/exhaustive-deps

  function tap(i: number) {
    if (!state || locked || done || !started || view) return;
    if (sel != null && targets.includes(i)) {
      const m = findMove(state, sel, i)!;
      const res = applyMove(state, m);
      setShown({ fen: p.fen!, cells: res.state.cells, last: [sel, i] });
      setSel(null);
      if (res.captured) feedback.capture(); else feedback.move();
      move({ token, code: room.code, from: m.from, to: m.to, promo: m.promo })
        .then((r) => {
          if (!r.solved) {
            feedback.wrong();
            setToast({ text: "Not mate! Frozen 10s", good: false, id: Date.now() });
            setTimeout(() => setShown(null), 700);
          }
        })
        .catch((e) => { setShown(null); feedback.wrong(); setToast({ text: errorText(e), good: false, id: Date.now() }); });
      return;
    }
    if (colorOf(state.cells[i]) === state.turn) { feedback.tap(); setSel(sel === i ? null : i); return; }
    setSel(null);
  }

  const runs = [...p.runs].sort((a, b) => (b.index - a.index) || ((a.finishedAt ?? Infinity) - (b.finishedAt ?? Infinity)));
  const winner = p.winnerId;
  const iWon = winner === room.meId;
  const leaveRoom = async () => { await leave({ token, code: room.code }).catch(() => {}); router.push("/chess"); };

  return (
    <main className="screen tight" style={{ position: "relative" }}>
      <header className="topbar" style={{ gap: 8 }}>
        <button className="icon-btn" aria-label="Leave race" onClick={() => (over || done ? void leaveRoom() : setQuit(true))}><Icon.Close /></button>
        <span className="chip" style={{ background: mode.soft, color: mode.ink }}>PUZZLE RACE · MATE IN 1</span>
        <span className="grow" />
        <span style={{ fontSize: 18, fontWeight: 900, fontVariantNumeric: "tabular-nums", color: "var(--muted)" }} aria-label="Time">{formatTime(started ? elapsed : 0)}</span>
      </header>

      <section style={{ display: "flex", flexDirection: "column", gap: 8 }} aria-label="Race progress">
        {runs.map((r) => {
          const m = room.members.find((x) => x.id === r.playerId);
          const paint = paints.get(r.playerId) ?? paints.values().next().value!;
          return (
            <div key={r.playerId} style={{ display: "flex", alignItems: "center", gap: 8, opacity: r.gaveUp ? 0.45 : 1 }}>
              <Avatar name={m?.name ?? "?"} paint={paint} size={28} />
              <span style={{ width: 64, fontSize: 14, fontWeight: 900, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m?.isMe ? "You" : m?.name ?? "Left"}</span>
              <span style={{ flex: 1, display: "grid", gridTemplateColumns: `repeat(${p.total}, minmax(0, 1fr))`, gap: 4 }}>
                {Array.from({ length: p.total }, (_, k) => <span key={k} style={{ height: 12, borderRadius: 6, background: k < r.index ? paint.face : "var(--line)", transition: "background 300ms" }} />)}
              </span>
              <span style={{ width: 26, textAlign: "right", fontSize: 14, fontWeight: 900, color: "var(--muted)" }}>{r.finishedAt ? <Icon.Check size={16} /> : `${r.index}/${p.total}`}</span>
            </div>
          );
        })}
      </section>

      {state && !done && (
        <>
          <p style={{ margin: "4px 0 0", textAlign: "center", fontSize: 18, fontWeight: 900 }}>
            Puzzle {(mine?.index ?? 0) + 1} of {p.total}: {state.turn === "w" ? "white" : "black"} to move
          </p>
          <div style={{ position: "relative" }}>
            <Board cells={cells} flipped={state.turn === "b"} selected={sel} targets={targets} last={view?.last ?? null} onTap={tap} disabled={!started || locked} />
            {locked && (
              <div style={{ position: "absolute", inset: 0, borderRadius: 14, background: "rgba(255,255,255,.75)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 6, fontWeight: 900 }} role="status">
                <Icon.Lock size={34} />
                <span style={{ fontSize: 42, color: "var(--cherry-edge)" }}>{Math.ceil((mine!.lockUntil - now) / 1000)}</span>
                <span style={{ fontSize: 16, color: "var(--muted)" }}>That wasn&apos;t checkmate</span>
              </div>
            )}
            {toast && <div key={toast.id} className="btoast" style={toast.good ? { background: "var(--lime)", color: "var(--lime-ink)", boxShadow: "0 4px 0 var(--lime-edge)" } : { background: "var(--cherry)", color: "#fff", boxShadow: "0 4px 0 var(--cherry-edge)" }} onAnimationEnd={() => setToast(null)}>{toast.text}</div>}
          </div>
          <p style={{ margin: 0, textAlign: "center", fontSize: 15, fontWeight: 800, color: "var(--muted)" }}>Find the move that checkmates. Check with no escape!</p>
        </>
      )}

      {done && !over && (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12, padding: "30px 0", textAlign: "center" }}>
          <Mascot size={90} mood={iWon ? "joy" : "happy"} className="bob" />
          <h2 style={{ margin: 0, fontSize: 28, fontWeight: 900 }}>{mine?.gaveUp ? "You stopped" : iWon ? "You finished first!" : "All solved!"}</h2>
          <p className="wait" style={{ margin: 0, fontSize: 16, fontWeight: 800, color: "var(--muted)" }}>Waiting for the others to finish…</p>
        </div>
      )}

      {!started && (
        <div className="overlay" role="status">
          <span className="label">5 checkmates. Fastest wins!</span>
          <span className="countdown">{Math.max(1, Math.ceil(((room.startAt ?? now) - now) / 1000))}</span>
        </div>
      )}

      <Sheet open={quit} onClose={() => setQuit(false)} label="Leave race">
        <h2 style={{ margin: 0, fontSize: 24, fontWeight: 900, textAlign: "center" }}>Stop racing?</h2>
        <button className="btn btn-green" onClick={() => setQuit(false)}>Keep going</button>
        <button className="btn btn-white" style={{ color: "var(--cherry-edge)" }} onClick={() => { setQuit(false); void resign({ token, code: room.code }); }}>Give up</button>
      </Sheet>

      {over && (
        <div className="overlay">
          {iWon && <Confetti />}
          <Mascot size={110} mood={iWon ? "joy" : "wow"} className={iWon ? "jump" : undefined} />
          <h2 style={{ margin: 0, fontSize: 34, fontWeight: 900, textAlign: "center", color: iWon ? "var(--lime-dark)" : "var(--tangerine-ink)" }}>{iWon ? "You win the race!" : winner ? `${room.members.find((m) => m.id === winner)?.name ?? "Someone"} wins!` : "Race over"}</h2>
          <p style={{ margin: 0, fontSize: 17, fontWeight: 700, color: "var(--muted)", textAlign: "center" }}>
            {mine?.finishedAt ? `You solved all ${p.total} in ${formatTime(elapsed)}${mine.mistakes ? ` with ${mine.mistakes} miss${mine.mistakes > 1 ? "es" : ""}` : ", no misses"}. ${iWon ? "+45 XP" : "+20 XP"}` : "Try again in a rematch!"}
          </p>
          {room.isHost ? <button className="btn btn-green" onClick={() => void rematch({ token, code: room.code })}>Rematch</button> : <p className="wait" style={{ margin: 0, fontWeight: 900, color: "var(--muted)" }}>Waiting for the host…</p>}
          <button className="btn btn-white" onClick={leaveRoom}>Back home</button>
        </div>
      )}
    </main>
  );
}
