"use client";

import { useMutation } from "convex/react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { api } from "../../../convex/_generated/api";
import { Avatar, Confetti, Icon, Mascot, formatTime, roomPaints, type Paint } from "@/components/ui";
import { feedback } from "@/lib/feedback";
import { useNow } from "@/lib/hooks";
import { BoardView, ReactionBar, ReactionFloats } from "./BoardView";
import type { RoomView } from "./types";

export function RoomResults({ room }: { room: RoomView }) {
  const rematch = useMutation(api.rooms.rematch);
  const paints = useMemo(() => roomPaints(room.players), [room.players]);
  const coop = room.mode === "coop";
  const start = room.startAt ?? 0;
  const iWon = coop ? room.outcome === "won" : room.winnerId === room.meId;
  const stillPlaying = room.status === "playing";
  const [watchId, setWatchId] = useState<string | null>(null);

  useEffect(() => {
    if (iWon) feedback.win();
  }, [iWon]);

  const winnerName = room.players.find((p) => p.id === room.winnerId)?.name;
  let title = "Race over";
  let line = "";
  if (coop) {
    title = room.outcome === "won" ? "Team solved it!" : "Out of hearts!";
    line = room.outcome === "won" ? `Solved together in ${formatTime((room.endedAt ?? start) - start)}.` : "So close. Run it back?";
  } else if (iWon) {
    title = "You won!";
    line = room.players.length > 1 ? "First to finish. Bragging rights unlocked." : "Nice warm-up!";
  } else if (room.myFinishedAt) {
    title = "Solved!";
    line = winnerName ? `${winnerName} got there first. Rematch?` : "";
  } else if (winnerName) {
    title = `${winnerName} won!`;
    line = "Better luck next round.";
  }
  if (stillPlaying && !coop) line = "The others are still solving. Tap Watch to spectate.";

  const standings = [...room.players].sort((a, b) => {
    if (coop) return b.filled - a.filled;
    const rank = (p: typeof a) => (p.finishedAt ? p.finishedAt : p.gaveUp ? 9e15 : 8e15 - p.progress);
    return rank(a) - rank(b);
  });

  const myTime = room.myFinishedAt ? room.myFinishedAt - start : room.endedAt && coop ? room.endedAt - start : null;
  const xp = coop ? (room.outcome === "won" ? 30 : 0) : iWon ? 45 : room.myFinishedAt ? 20 : 0;

  const watched = room.players.find((p) => p.id === watchId);
  if (watched && watched.board && room.puzzle) {
    return <Watch room={room} p={watched} paints={paints} onBack={() => setWatchId(null)} onSwitch={setWatchId} />;
  }

  return (
    <main className="screen">
      {iWon && <Confetti />}
      <ReactionFloats room={room} paints={paints} />
      <section style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, paddingTop: 24 }}>
        <Mascot size={120} mood={iWon || room.myFinishedAt ? "joy" : "wow"} className={iWon ? "jump" : "bob"} />
        <h1 style={{ margin: "8px 0 0", fontSize: 38, fontWeight: 900, color: iWon ? "var(--lime-dark)" : "var(--ink)", textAlign: "center" }}>{title}</h1>
        {line && <p style={{ margin: 0, fontSize: 17, fontWeight: 700, color: "var(--muted)", textAlign: "center" }}>{line}</p>}
      </section>

      <section className="rise" style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 10 }}>
        <Stat label="XP" value={`+${xp}`} face="var(--sun)" ink="var(--sun-ink)" head="#5C4200" />
        <Stat label="TIME" value={myTime ? formatTime(myTime) : "—"} face="var(--sky)" ink="var(--sky-edge)" head="#003F5E" />
        <Stat label={coop ? "HEARTS LOST" : "MISTAKES"} value={String(room.myMistakes)} face="var(--lime)" ink="var(--lime-dark)" head="var(--lime-ink)" />
      </section>

      <section className="rise" style={{ display: "flex", flexDirection: "column", gap: 10, animationDelay: "120ms" }}>
        <h2 className="label">{coop ? "Who filled what" : "Standings"}</h2>
        {standings.map((p, i) => {
          const top = !coop && i === 0 && p.finishedAt;
          return (
            <div
              key={p.id}
              style={{
                display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", borderRadius: 16,
                border: `2px solid ${p.isMe ? "var(--sky-line)" : "var(--line)"}`, background: p.isMe ? "var(--sky-soft)" : "#fff",
              }}
            >
              <span style={{ width: 24, fontSize: 20, fontWeight: 900, color: top ? "var(--sun-ink)" : "var(--muted)" }}>{i + 1}</span>
              <Avatar name={p.name} paint={paints.get(p.id)!} />
              <span style={{ flex: 1, display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
                <span style={{ fontSize: 18, fontWeight: 900 }}>{p.isMe ? "You" : p.name}</span>
                {!coop && !p.finishedAt && !p.gaveUp && (
                  <span className="bar" style={{ height: 8 }}><span style={{ width: `${p.progress}%`, background: paints.get(p.id)!.face }} /></span>
                )}
              </span>
              {!coop && stillPlaying && !p.isMe && !p.finishedAt && !p.gaveUp && p.board ? (
                <button className="btn btn-sm btn-green" style={{ width: "auto", padding: "0 14px" }} onClick={() => { feedback.tap(); setWatchId(p.id); }} aria-label={`Watch ${p.name} solve`}>Watch</button>
              ) : (
                <span style={{ fontSize: 16, fontWeight: 900, color: p.isMe ? "var(--sky-edge)" : "var(--muted)" }}>
                  {coop ? `${p.filled} cells` : p.finishedAt ? formatTime(p.finishedAt - start) : p.gaveUp ? "Gave up" : "Solving…"}
                </span>
              )}
            </div>
          );
        })}
      </section>

      {!coop && stillPlaying && room.players.length > 1 && <ReactionBar code={room.code} />}
      <div className="grow" />
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {room.isHost ? (
          <button className="btn btn-green" onClick={() => { feedback.tap(); void rematch({ code: room.code }); }} disabled={stillPlaying && !coop}>
            {stillPlaying && !coop ? "Rematch when everyone's done" : "Rematch"}
          </button>
        ) : (
          <button className="btn" disabled>Waiting for host to rematch…</button>
        )}
        <Link href="/sudoku" className="btn btn-white">Back to Sudoku</Link>
      </div>
    </main>
  );
}

function Stat({ label, value, face, ink, head }: { label: string; value: string; face: string; ink: string; head: string }) {
  return (
    <div style={{ border: `2px solid ${face}`, borderRadius: 16, overflow: "hidden", display: "flex", flexDirection: "column" }}>
      <span style={{ background: face, color: head, fontSize: 12, fontWeight: 900, letterSpacing: ".06em", textAlign: "center", padding: 5 }}>{label}</span>
      <span style={{ fontSize: 24, fontWeight: 900, color: ink, textAlign: "center", padding: "10px 0" }}>{value}</span>
    </div>
  );
}

type Player = RoomView["players"][number];

/** Watch someone who's still solving: their live board, progress and mistakes. */
function Watch({ room, p, paints, onBack, onSwitch }: { room: RoomView; p: Player; paints: Map<string, Paint>; onBack: () => void; onSwitch: (id: string) => void }) {
  const now = useNow(1000);
  const start = room.startAt ?? 0;
  const paint = paints.get(p.id)!;
  const others = room.players.filter((x) => !x.isMe && !x.finishedAt && !x.gaveUp && x.board && x.id !== p.id);
  const last = room.lastMove?.playerId === p.id && room.lastMove.correct ? room.lastMove.cell : null;
  const done = !!p.finishedAt || p.gaveUp || room.status === "finished";
  return (
    <main className="screen tight" style={{ gap: 12 }}>
      <header className="topbar" style={{ gap: 8 }}>
        <button className="icon-btn" aria-label="Back to results" onClick={() => { feedback.tap(); onBack(); }}><Icon.Back /></button>
        <span className="chip chip-sky">WATCHING</span>
        <span className="grow" />
        <span style={{ fontSize: 18, fontWeight: 900, fontVariantNumeric: "tabular-nums", color: "var(--muted)" }} aria-label="Race time">{formatTime((p.finishedAt ?? now) - start)}</span>
      </header>

      <section style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <Avatar name={p.name} paint={paint} size={40} />
        <span style={{ display: "flex", flexDirection: "column", gap: 4, flex: 1, minWidth: 0 }}>
          <span style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 17, fontWeight: 900 }}>
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</span>
            <span style={{ color: "var(--muted)", whiteSpace: "nowrap" }}>{room.empties - p.filled} left{p.mistakes > 0 && <span style={{ color: "var(--cherry-edge)" }}> · ✕{p.mistakes}</span>}</span>
          </span>
          <span className="bar"><span style={{ width: `${p.progress}%`, background: paint.face }} /></span>
        </span>
      </section>

      {done && (
        <p className="pop" style={{ margin: 0, padding: "10px 14px", borderRadius: 16, background: "var(--sun-soft)", textAlign: "center", fontSize: 17, fontWeight: 900, color: "var(--sun-ink)" }}>
          {p.finishedAt ? `${p.name} finished in ${formatTime(p.finishedAt - start)}!` : p.gaveUp ? `${p.name} gave up` : "Race over"}
        </p>
      )}

      <BoardView puzzle={room.puzzle!} values={p.board} paint={paint} last={last} />

      <ReactionBar code={room.code} />
      {others.length > 0 && (
        <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
          {others.map((o) => (
            <button key={o.id} className="btn btn-white btn-sm" style={{ width: "auto", padding: "0 12px" }} onClick={() => { feedback.tap(); onSwitch(o.id); }}>
              Watch {o.name}
            </button>
          ))}
        </div>
      )}
      <div className="grow" />
      <button className="btn btn-white" onClick={() => { feedback.tap(); onBack(); }}>Back to results</button>
      <ReactionFloats room={room} paints={paints} />
    </main>
  );
}
