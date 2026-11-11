"use client";

import { useMutation } from "convex/react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "../../../convex/_generated/api";
import { Game } from "@/components/Game";
import { Avatar, Hearts, Icon, Sheet, formatTime, roomPaints, type Paint } from "@/components/ui";
import { feedback } from "@/lib/feedback";
import { useNow } from "@/lib/hooks";
import { BoardView, ReactionBar, ReactionFloats } from "./BoardView";
import { useTrickCredit } from "@/lib/useTrickCredit";
import type { RoomView } from "./types";

const REACTIONS = ["Nice!", "Help?", "On it!"];

export function RoomGame({ room }: { room: RoomView }) {
  const router = useRouter();
  const place = useMutation(api.rooms.place);
  const hint = useMutation(api.rooms.hint);
  const presence = useMutation(api.rooms.presence);
  const giveUp = useMutation(api.rooms.giveUp);
  const leave = useMutation(api.rooms.leave);
  const now = useNow(1000);
  const [quitOpen, setQuitOpen] = useState(false);
  const [peekId, setPeekId] = useState<string | null>(null);
  const paints = useMemo(() => roomPaints(room.players), [room.players]);
  const coop = room.mode === "coop";
  const startAt = room.startAt ?? 0;
  const [counting, setCounting] = useState(() => Date.now() < startAt);

  const credit = useTrickCredit();
  const before = room.values;
  const onPlace = useCallback(async (cell: number, digit: number) => {
    const r = await place({ code: room.code, cell, digit });
    if (r.correct && before) credit(before, cell, digit);
    return r;
  }, [place, room.code, credit, before]);
  const onSelect = useCallback((cell: number) => { if (coop) void presence({ code: room.code, cell }).catch(() => {}); }, [coop, presence, room.code]);
  const hints = useMemo(
    () => ({ left: room.hintsLeft, use: (cell: number) => hint({ code: room.code, cell }) }),
    [room.hintsLeft, hint, room.code],
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
  } else if (!coop) {
    // Close-race alerts: a rival gets near the end.
    let closest: { id: string; left: number } | null = null;
    for (const p of room.players) {
      if (p.isMe || p.finishedAt || p.gaveUp) continue;
      const left = room.empties - p.filled;
      if (left <= 10 && (!closest || left < closest.left)) closest = { id: p.id, left };
    }
    if (closest) {
      const tier = closest.left <= 3 ? 3 : 10;
      announce = {
        id: `l${closest.id}-${tier}`,
        text: tier === 3 ? `${nameOf(closest.id)} has only ${closest.left} cell${closest.left === 1 ? "" : "s"} left!` : `${nameOf(closest.id)} has ${closest.left} cells left`,
        kind: "bad",
      };
    }
  }
  useEffect(() => {
    if (!announce) return;
    if (announce.id.startsWith("l")) feedback.check();
    else if (announce.kind === "info" && announce.id.startsWith("m")) feedback.ping();
  }, [announce?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const cursors = coop
    ? room.players
        .filter((p) => !p.isMe && p.online && p.cell !== undefined)
        .map((p) => ({ cell: p.cell!, name: p.name, paint: paints.get(p.id)! }))
    : [];
  const seatPaint = new Map(room.players.map((p) => [String(p.seat), paints.get(p.id)!]));
  const digitColor = coop && room.owners ? (cell: number) => seatPaint.get(room.owners![cell])?.ink : undefined;

  // The finish: co-op when the team completes the board, a race when your own board is done.
  const solved = coop ? room.outcome === "won" : !!room.myFinishedAt;
  const rank = room.myFinishedAt ? room.players.filter((p) => p.finishedAt && p.finishedAt <= room.myFinishedAt!).length : 0;
  const finishNote = coop ? "Team solved it!" : rank ? `${rank}${["st", "nd", "rd"][rank - 1] ?? "th"} place!` : undefined;
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
        {coop ? <Hearts left={heartsLeft} total={room.maxLives} size={18} /> : <Mistakes n={room.myMistakes} free={room.maxLives} />}
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
              <button key={p.id} type="button" className="race-row" disabled={p.isMe} onClick={() => { feedback.tap(); setPeekId(p.id); }}
                aria-label={p.isMe ? undefined : `Peek at ${p.name}'s board: ${p.progress}% done, ${p.mistakes} mistakes`} style={{ opacity: p.gaveUp ? 0.4 : 1 }}>
                <Avatar name={p.name} paint={paint} size={30} />
                <span style={{ display: "flex", flexDirection: "column", gap: 4, flex: 1, minWidth: 0 }}>
                  <span style={{ display: "flex", justifyContent: "space-between", gap: 4, fontSize: 13, fontWeight: 900 }}>
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.isMe ? "You" : p.name}</span>
                    <span style={{ color: "var(--muted)", whiteSpace: "nowrap" }}>{p.finishedAt ? "✓" : `${p.progress}%`}{p.mistakes > 0 && <span style={{ color: "var(--cherry-edge)" }}> ✕{p.mistakes}</span>}</span>
                  </span>
                  <span className="bar"><span style={{ width: `${p.progress}%`, background: p.isMe ? "var(--sky)" : paint.face }} /></span>
                </span>
              </button>
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
          disabled={counting || solved}
          solved={solved}
          finishNote={finishNote}
          announce={announce}
        />
      )}

      {room.players.length > 1 && <ReactionBar code={room.code} extra={coop ? REACTIONS : []} />}
      <ReactionFloats room={room} paints={paints} />

      {counting && (
        <Countdown startAt={startAt} onDone={() => setCounting(false)} label={coop ? "Solve it together" : "First to finish wins"}>
          {room.players.map((p) => <Avatar key={p.id} name={p.name} paint={paints.get(p.id)!} size={44} />)}
        </Countdown>
      )}

      <PeekSheet room={room} id={peekId} paints={paints} onClose={() => setPeekId(null)} />

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
              await leave({ code: room.code });
              router.push("/sudoku");
            } else await giveUp({ code: room.code });
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

/** Mistakes in a race: the first few are free, after that each one freezes the keypad for a moment. */
function Mistakes({ n, free }: { n: number; free: number }) {
  const over = n >= free;
  return (
    <span className={`mistakes${over ? " over" : n ? " some" : ""}`} aria-label={`${n} mistake${n === 1 ? "" : "s"}${over ? ", each new one freezes the keypad for 3 seconds" : `, ${free - n} before the keypad starts freezing`}`}>
      <span aria-hidden="true">✕</span> {n}
      {!over && <span className="of">/{free}</span>}
    </span>
  );
}

/** A rival's board: which cells they've filled, without the numbers. */
function PeekSheet({ room, id, paints, onClose }: { room: RoomView; id: string | null; paints: Map<string, Paint>; onClose: () => void }) {
  const p = room.players.find((x) => x.id === id);
  return (
    <Sheet open={!!p} onClose={onClose} label={p ? `${p.name}'s board` : "Board"}>
      {p && room.puzzle && (
        <>
          <span style={{ display: "flex", alignItems: "center", gap: 10, justifyContent: "center" }}>
            <Avatar name={p.name} paint={paints.get(p.id)!} size={32} />
            <span style={{ fontSize: 20, fontWeight: 900 }}>{p.name}</span>
          </span>
          <p style={{ margin: 0, textAlign: "center", fontSize: 15, fontWeight: 800, color: "var(--muted)" }}>
            {p.finishedAt ? "Finished!" : p.gaveUp ? "Gave up" : `${room.empties - p.filled} cells left`} · {p.mistakes} mistake{p.mistakes === 1 ? "" : "s"}
          </p>
          <div style={{ width: "100%", maxWidth: 300, alignSelf: "center" }}><BoardView puzzle={room.puzzle} mask={p.mask} paint={paints.get(p.id)!} /></div>
          <p style={{ margin: 0, textAlign: "center", fontSize: 13, fontWeight: 700, color: "var(--muted)" }}>Colored squares are cells they&apos;ve filled. No peeking at numbers!</p>
          <button className="btn btn-white" onClick={onClose}>Back to my board</button>
        </>
      )}
    </Sheet>
  );
}
