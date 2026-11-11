"use client";

import { useMutation } from "convex/react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { api } from "../../../convex/_generated/api";
import { points } from "../../../convex/lib/scramble/board";
import { Countdown } from "@/components/words/common";
import { Avatar, Confetti, Icon, Mascot, Sheet, roomPaints, type Paint } from "@/components/ui";
import { feedback } from "@/lib/feedback";
import { useIdentity } from "@/lib/identity";
import { GAME_NAME, type GridGameView, type GridView } from "./common";
import { GridPlay, Missed } from "./Grid";

export function ScramblePlay({ room }: { room: GridView }) {
  const g = room.game!;
  const { token } = useIdentity();
  const submit = useMutation(api.scramble.submit);
  const paints = roomPaints(room.members);
  const nameOf = (id: string) => {
    const m = room.members.find((x) => x.id === id);
    return m?.isMe ? "You" : m?.name ?? "Left";
  };
  const mine = g.found[room.meId] ?? [];

  return (
    <main className="screen tight" style={{ position: "relative", gap: 12 }}>
      <Header room={room} g={g} />
      <GridPlay
        grid={g.grid}
        endsAt={g.endsAt}
        found={mine}
        disabled={!g.isPlayer || !!g.done}
        submit={(path) => submit({ token, code: room.code, path })}
        header={g.players.length > 1 ? <Scores g={g} paints={paints} nameOf={nameOf} /> : undefined}
      />
      {room.startAt && !g.done && <Countdown startAt={room.startAt} label="Find as many words as you can" />}
      {g.done && <Done room={room} g={g} paints={paints} nameOf={nameOf} />}
    </main>
  );
}

function Header({ room, g }: { room: GridView; g: GridGameView }) {
  const { token } = useIdentity();
  const router = useRouter();
  const leave = useMutation(api.scramble.leave);
  const [ask, setAsk] = useState(false);
  const go = async () => { await leave({ token, code: room.code }).catch(() => {}); router.push("/scramble"); };
  return (
    <>
      <header className="topbar" style={{ gap: 8 }}>
        <button className="icon-btn" aria-label="Leave game" onClick={() => { feedback.tap(); if (g.done || !g.isPlayer) void go(); else setAsk(true); }}><Icon.Close /></button>
        <span className="chip" style={{ background: "var(--cream-2)", color: "var(--plum)" }}>{GAME_NAME.toUpperCase()} · {g.lang.toUpperCase()}</span>
        <span className="grow" />
        <span className="chip chip-mist" aria-label={`Room code ${room.code}`}>{room.code}</span>
      </header>
      <Sheet open={ask} onClose={() => setAsk(false)} label="Leave game">
        <h2 style={{ margin: 0, fontSize: 24, fontWeight: 900, textAlign: "center" }}>Leave this round?</h2>
        <p style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "var(--muted)", textAlign: "center" }}>Your words so far still count.</p>
        <button className="btn btn-green" onClick={() => setAsk(false)}>Keep playing</button>
        <button className="btn btn-white" style={{ color: "var(--cherry-edge)" }} onClick={go}>Leave</button>
      </Sheet>
    </>
  );
}

function Scores({ g, paints, nameOf }: { g: GridGameView; paints: Map<string, Paint>; nameOf: (id: string) => string }) {
  const cols = g.players.length > 3 ? 3 : g.players.length;
  return (
    <section className="bz-scores" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }} aria-label="Scores">
      {g.players.map((id) => (
        <div key={id} className="bz-score">
          <Avatar name={nameOf(id)} paint={paints.get(id)} size={22} />
          <span style={{ flex: 1, minWidth: 0, fontSize: 12, fontWeight: 900, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{nameOf(id)}</span>
          <span key={g.scores[id]} className="pop" style={{ fontSize: 15, fontWeight: 900, fontVariantNumeric: "tabular-nums" }} aria-label={`${g.scores[id]} points, ${g.counts[id]} words`}>{g.scores[id]}</span>
        </div>
      ))}
    </section>
  );
}

function Done({ room, g, paints, nameOf }: { room: GridView; g: GridGameView; paints: Map<string, Paint>; nameOf: (id: string) => string }) {
  const { token } = useIdentity();
  const router = useRouter();
  const rematch = useMutation(api.scramble.rematch);
  const leave = useMutation(api.scramble.leave);
  const d = g.done!;
  const solo = g.players.length === 1;
  const iWon = d.winners.includes(room.meId);
  const happy = solo ? (g.scores[room.meId] ?? 0) > 0 : iWon;
  const played = useRef(false);
  useEffect(() => {
    if (played.current) return;
    played.current = true;
    if (happy) feedback.win(); else feedback.wrong();
  }, [happy]);
  // Words more than one player found.
  const counts = new Map<string, number>();
  for (const p of g.players) for (const w of g.found[p]) counts.set(w, (counts.get(w) ?? 0) + 1);
  const ranked = [...g.players].sort((a, b) => (g.scores[b] ?? 0) - (g.scores[a] ?? 0));
  const myScore = g.scores[room.meId] ?? 0;
  const title = solo ? `${myScore} points` : d.winners.length > 1 ? (iWon ? "You tied for first!" : "It's a tie") : iWon ? "You win!" : d.winners.length ? `${nameOf(d.winners[0])} wins` : "No words this time";
  return (
    <div className="overlay sg-results">
      {happy && <Confetti />}
      <Mascot size={80} mood={happy ? "joy" : "wow"} className={happy ? "jump" : undefined} />
      <h2 style={{ margin: 0, fontSize: 32, fontWeight: 900, textAlign: "center", color: happy ? "var(--lime-dark)" : "var(--tangerine-ink)" }}>{title}</h2>
      <p style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "var(--muted)", textAlign: "center" }}>
        {solo ? `${g.found[room.meId]?.length ?? 0} of ${g.total} words found` : "Faded words were found by more than one player"}
      </p>
      <div className="list" style={{ width: "100%", maxWidth: 420, background: "#fff" }}>
        {ranked.map((p) => (
          <div key={p} className={`list-row${p === room.meId ? " me" : ""}`} style={{ flexDirection: "column", alignItems: "stretch", gap: 8 }}>
            <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <Avatar name={nameOf(p)} paint={paints.get(p)} size={30} />
              <span style={{ flex: 1, fontSize: 16, fontWeight: 900 }}>{nameOf(p)}{d.winners.includes(p) && !solo && " 👑"}</span>
              <span style={{ fontSize: 13, fontWeight: 800, color: "var(--muted)" }}>{g.found[p].length} words</span>
              <span style={{ fontSize: 18, fontWeight: 900, fontVariantNumeric: "tabular-nums", minWidth: 32, textAlign: "right" }}>{g.scores[p]}</span>
            </span>
            {g.found[p].length > 0 && (
              <span className="sg-found">
                {[...g.found[p]].sort((a, b) => b.length - a.length).map((w) => (
                  <span key={w} className={`sg-chip${(counts.get(w) ?? 0) > 1 ? " shared" : ""}`}>{w.toUpperCase()}<b>{points(w)}</b></span>
                ))}
              </span>
            )}
          </div>
        ))}
      </div>
      <div style={{ width: "100%", maxWidth: 420 }}><Missed words={g.missed} total={g.total} /></div>
      {room.isHost ? (
        <button className="btn btn-green" style={{ maxWidth: 420, flexShrink: 0 }} onClick={() => { feedback.tap(); void rematch({ token, code: room.code }); }}>New grid</button>
      ) : (
        <p className="wait" style={{ margin: 0, fontWeight: 900, color: "var(--muted)" }}>Waiting for the host…</p>
      )}
      <button className="btn btn-white" style={{ maxWidth: 420, flexShrink: 0 }} onClick={async () => { await leave({ token, code: room.code }).catch(() => {}); router.push("/scramble"); }}>Back home</button>
    </div>
  );
}
