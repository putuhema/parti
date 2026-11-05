"use client";

import { useMutation } from "convex/react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "../../../convex/_generated/api";
import { Game } from "@/components/Game";
import { Avatar, Hearts, Icon, Sheet, formatTime, roomPaints, type Paint } from "@/components/ui";
import { feedback } from "@/lib/feedback";
import { useNow } from "@/lib/hooks";
import { useIdentity } from "@/lib/identity";
import type { RoomView } from "./types";

const REACTIONS = ["Nice!", "Help?", "On it!"];

export function RoomGame({ room }: { room: RoomView }) {
  const { token } = useIdentity();
  const router = useRouter();
  const place = useMutation(api.rooms.place);
  const hint = useMutation(api.rooms.hint);
  const presence = useMutation(api.rooms.presence);
  const react = useMutation(api.rooms.react);
  const giveUp = useMutation(api.rooms.giveUp);
  const leave = useMutation(api.rooms.leave);
  const now = useNow(1000);
  const [quitOpen, setQuitOpen] = useState(false);
  const paints = useMemo(() => roomPaints(room.players), [room.players]);
  const coop = room.mode === "coop";
  const startAt = room.startAt ?? 0;
  const [counting, setCounting] = useState(() => Date.now() < startAt);

  const onPlace = useCallback((cell: number, digit: number) => place({ token, code: room.code, cell, digit }), [place, token, room.code]);
  const onSelect = useCallback((cell: number) => { if (coop) void presence({ token, code: room.code, cell }).catch(() => {}); }, [coop, presence, token, room.code]);
  const hints = useMemo(
    () => ({ left: room.hintsLeft, use: (cell: number) => hint({ token, code: room.code, cell }) }),
    [room.hintsLeft, hint, token, room.code],
  );

  // Announcements: teammates' moves (co-op) and the first finisher (race).
  const nameOf = (id: string) => room.players.find((p) => p.id === id)?.name ?? "Someone";
  let announce: { id: string; text: string; kind?: "info" | "bad" } | null = null;
  if (coop && room.lastMove && room.lastMove.playerId !== room.meId) {
    announce = {
      id: `m${room.lastMove.at}`,
      text: room.lastMove.correct ? `${nameOf(room.lastMove.playerId)} placed a ${room.lastMove.digit}` : `${nameOf(room.lastMove.playerId)} lost a heart`,
      kind: room.lastMove.correct ? "info" : "bad",
    };
  }
  if (!coop && room.winnerId && room.winnerId !== room.meId) {
    announce = { id: `w${room.winnerId}`, text: `${nameOf(room.winnerId)} finished first!`, kind: "info" };
  }
  useEffect(() => { if (announce?.kind === "info" && announce.id.startsWith("m")) feedback.ping(); }, [announce?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Floating reactions from friends.
  const [mountedAt] = useState(() => Date.now());
  const seen = useRef(new Set<string>());
  const [floats, setFloats] = useState<{ id: string; text: string; paint: Paint; left: number }[]>([]);
  useEffect(() => {
    for (const r of room.reactions) {
      if (seen.current.has(r.id) || r.at < mountedAt) continue;
      seen.current.add(r.id);
      const paint = paints.get(r.playerId) ?? paints.values().next().value!;
      const f = { id: r.id, text: r.playerId === room.meId ? r.text : `${nameOf(r.playerId)}: ${r.text}`, paint, left: 10 + Math.random() * 50 };
      setFloats((x) => [...x, f]);
      setTimeout(() => setFloats((x) => x.filter((y) => y.id !== f.id)), 2300);
    }
  }, [room.reactions]); // eslint-disable-line react-hooks/exhaustive-deps

  const cursors = coop
    ? room.players
        .filter((p) => !p.isMe && p.online && p.cell !== undefined)
        .map((p) => ({ cell: p.cell!, name: p.name, paint: paints.get(p.id)! }))
    : [];
  const seatPaint = new Map(room.players.map((p) => [String(p.seat), paints.get(p.id)!]));
  const digitColor = coop && room.owners ? (cell: number) => seatPaint.get(room.owners![cell])?.ink : undefined;

  const elapsed = Math.max(0, now - startAt);
  const heartsLeft = Math.max(0, room.maxLives - room.myMistakes);
  const teamFilled = room.players.reduce((n, p) => n + p.filled, 0);

  return (
    <main className="screen tight">
      <header className="topbar" style={{ gap: 8 }}>
        <button className="icon-btn" aria-label="Leave game" onClick={() => { feedback.tap(); setQuitOpen(true); }}><Icon.Close /></button>
        <span className={`chip ${coop ? "chip-grape" : "chip-sky"}`}>{coop ? "CO-OP" : "RACE"} · {room.difficulty.toUpperCase()}</span>
        <span className="grow" />
        <span style={{ fontSize: 18, fontWeight: 900, fontVariantNumeric: "tabular-nums", color: "var(--muted)" }} aria-label="Time">{formatTime(elapsed)}</span>
        <Hearts left={heartsLeft} total={room.maxLives} size={coop ? 18 : 22} />
      </header>

      {coop ? (
        <section style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontSize: 16, fontWeight: 900 }}>Team progress</span>
            <span style={{ display: "flex", alignItems: "center" }}>
              {room.players.map((p, i) => (
                <Avatar key={p.id} name={p.name} paint={paints.get(p.id)!} size={28} style={{ border: "2px solid #fff", boxShadow: "none", marginLeft: i ? -8 : 0, opacity: p.online ? 1 : 0.4 }} />
              ))}
              <span style={{ fontSize: 16, fontWeight: 900, color: "var(--lime-dark)", marginLeft: 8 }}>{Math.round((teamFilled / room.empties) * 100)}%</span>
            </span>
          </div>
          <div className="bar" style={{ height: 16, borderRadius: 9 }}>
            {room.players.map((p) => (
              <span key={p.id} style={{ width: `${(p.filled / room.empties) * 100}%`, background: paints.get(p.id)!.face, borderRadius: 0 }} />
            ))}
          </div>
        </section>
      ) : (
        <section style={{ display: "grid", gridTemplateColumns: `repeat(${Math.min(room.players.length, 4)}, minmax(0, 1fr))`, gap: 10 }} aria-label="Race progress">
          {room.players.map((p) => {
            const paint = paints.get(p.id)!;
            return (
              <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 8, opacity: p.gaveUp ? 0.4 : 1 }}>
                <Avatar name={p.name} paint={paint} size={30} />
                <span style={{ display: "flex", flexDirection: "column", gap: 4, flex: 1, minWidth: 0 }}>
                  <span style={{ display: "flex", justifyContent: "space-between", gap: 4, fontSize: 13, fontWeight: 900 }}>
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.isMe ? "You" : p.name}</span>
                    <span style={{ color: "var(--muted)" }}>{p.finishedAt ? "✓" : `${p.progress}%`}</span>
                  </span>
                  <span className="bar"><span style={{ width: `${p.progress}%`, background: p.isMe ? "var(--sky)" : paint.face }} /></span>
                </span>
              </div>
            );
          })}
        </section>
      )}

      {room.puzzle && room.values && (
        <Game
          puzzle={room.puzzle}
          values={room.values}
          onPlace={onPlace}
          onSelect={onSelect}
          hints={hints}
          digitColor={digitColor}
          cursors={cursors}
          disabled={counting}
          announce={announce}
        />
      )}

      {coop && room.players.length > 1 && (
        <div style={{ display: "flex", gap: 6, justifyContent: "center", flexWrap: "wrap" }}>
          {REACTIONS.map((r) => (
            <button key={r} className="btn btn-white btn-sm" style={{ minHeight: 36, fontSize: 14, color: "var(--ink)" }} onClick={() => { feedback.tap(); void react({ token, code: room.code, text: r }); }}>
              {r}
            </button>
          ))}
        </div>
      )}

      {floats.map((f) => (
        <div key={f.id} className="reaction-float" style={{ left: `${f.left}%`, background: f.paint.face, boxShadow: `0 4px 0 ${f.paint.edge}` }}>{f.text}</div>
      ))}

      {counting && (
        <Countdown startAt={startAt} onDone={() => setCounting(false)} label={coop ? "Solve it together" : "First to finish wins"}>
          {room.players.map((p) => <Avatar key={p.id} name={p.name} paint={paints.get(p.id)!} size={44} />)}
        </Countdown>
      )}

      <Sheet open={quitOpen} onClose={() => setQuitOpen(false)} label="Leave game">
        <h2 style={{ margin: 0, fontSize: 24, fontWeight: 900, textAlign: "center" }}>{coop ? "Leave your team?" : "Give up this race?"}</h2>
        <p style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "var(--muted)", textAlign: "center" }}>
          {coop ? "Your friends can keep solving without you." : "You'll see the results, but you won't get a time."}
        </p>
        <button className="btn btn-green" onClick={() => setQuitOpen(false)}>Keep playing</button>
        <button
          className="btn btn-white"
          style={{ color: "var(--cherry-edge)" }}
          onClick={async () => {
            setQuitOpen(false);
            if (coop) {
              await leave({ token, code: room.code });
              router.push("/");
            } else await giveUp({ token, code: room.code });
          }}
        >
          {coop ? "Leave" : "Give up"}
        </button>
      </Sheet>
    </main>
  );
}

function Countdown({ startAt, onDone, label, children }: { startAt: number; onDone: () => void; label: string; children: React.ReactNode }) {
  const [left, setLeft] = useState(() => Math.ceil((startAt - Date.now()) / 1000));
  const done = useRef(onDone);
  useEffect(() => { done.current = onDone; });
  useEffect(() => {
    let last = -1;
    const t = setInterval(() => {
      const ms = startAt - Date.now();
      if (ms <= 0) {
        clearInterval(t);
        feedback.go();
        done.current();
        return;
      }
      const s = Math.ceil(ms / 1000);
      if (s !== last) {
        last = s;
        setLeft(s);
        if (s <= 3) feedback.tick();
      }
    }, 50);
    return () => clearInterval(t);
  }, [startAt]);
  return (
    <div className="overlay" role="status" aria-live="assertive">
      <span className="label">{label}</span>
      <span key={left} className="countdown">{left > 3 ? "Ready" : left}</span>
      <div style={{ display: "flex", gap: 10 }}>{children}</div>
    </div>
  );
}
