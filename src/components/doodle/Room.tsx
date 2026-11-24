"use client";

import { useMutation } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { api } from "../../../convex/_generated/api";
import { DOODLE_MAX, DOODLE_ROUNDS, DOODLE_TIMERS } from "../../../convex/lib/doodle/rules";
import { InviteFriends } from "@/components/InviteFriends";
import { Avatar, Icon, roomPaints } from "@/components/ui";
import { errorText } from "@/lib/errors";
import { feedback } from "@/lib/feedback";
import { useNow } from "@/lib/hooks";
import { AirCanvas, DoodleBoard } from "./AirCanvas";

export type DoodleView = NonNullable<FunctionReturnType<typeof api.doodle.view>>;

export function DoodleLobby({ room }: { room: DoodleView }) {
  const router = useRouter();
  const start = useMutation(api.doodle.start);
  const settings = useMutation(api.doodle.settings);
  const leave = useMutation(api.doodle.leave);
  const [copied, setCopied] = useState(false);
  const [starting, setStarting] = useState(false);
  const paints = roomPaints(room.members);

  async function share() {
    feedback.tap();
    const url = `${location.origin}/doodle/room/${room.code}`;
    try {
      if (navigator.share) await navigator.share({ title: "pums party", text: `Draw in mid-air with me in Air Doodle! Code ${room.code}`, url });
      else {
        await navigator.clipboard.writeText(url);
        setCopied(true);
        setTimeout(() => setCopied(false), 1800);
      }
    } catch {}
  }

  return (
    <main className="screen tight">
      <header className="topbar">
        <button className="icon-btn" onClick={async () => { await leave({ code: room.code }).catch(() => {}); router.push("/doodle"); }}>
          <Icon.Close />
        </button>
        <span style={{ flex: 1, display: "flex", flexDirection: "column" }}>
          <span className="label" style={{ fontSize: 12 }}>Room code</span>
          <span style={{ fontSize: 22, fontWeight: 900, letterSpacing: ".14em" }}>{room.code}</span>
        </span>
        <button className="icon-btn" style={{ border: "2px solid var(--line)", boxShadow: "0 3px 0 var(--line)" }} onClick={share} aria-label="Share">
          <Icon.Share size={18} />
        </button>
      </header>

      <section className="rise ad-hero">
        <span className="ps-kicker">HAND TRACKING · NEON AIR PICTIONARY</span>
        <h1 className="display" style={{ margin: 0, fontSize: 30 }}>Air Doodle</h1>
        <p style={{ margin: 0, fontSize: 14, fontWeight: 700, opacity: 0.92 }}>
          Point your index finger at the camera to paint glowing strokes in mid-air — pinch to lift the pen!
        </p>
      </section>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <section style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span className="label">Rounds</span>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6 }}>
            {DOODLE_ROUNDS.map((r) => (
              <button key={r} type="button" className="seg" aria-pressed={room.rounds === r} disabled={!room.isHost} style={{ minHeight: 44 }} onClick={() => void settings({ code: room.code, rounds: r })}>
                {r}
              </button>
            ))}
          </div>
        </section>
        <section style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span className="label">Draw time</span>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6 }}>
            {DOODLE_TIMERS.map((t) => (
              <button key={t} type="button" className="seg" aria-pressed={room.turnSec === t} disabled={!room.isHost} style={{ minHeight: 44 }} onClick={() => void settings({ code: room.code, turnSec: t })}>
                {t}s
              </button>
            ))}
          </div>
        </section>
      </div>

      <section style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <span className="label">Players ({room.members.length}/{DOODLE_MAX})</span>
          {copied && <span style={{ fontSize: 13, fontWeight: 900, color: "var(--lime-ink)" }}>Link copied!</span>}
        </div>
        {room.members.map((m) => (
          <div key={m.id} className="row-card" style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <Avatar name={m.name} paint={paints.get(m.id)} size={38} />
            <span style={{ flex: 1, fontWeight: 900 }}>{m.name} {m.isMe && <span style={{ color: "var(--muted)" }}>(you)</span>}</span>
            {m.isHost && <span className="pill" style={{ background: "var(--sun-soft)", color: "var(--sun-ink)" }}>Host</span>}
          </div>
        ))}
      </section>

      <InviteFriends kind="doodle" code={room.code} />
      <div className="grow" />
      {room.isHost ? (
        <button
          className="btn btn-green"
          disabled={starting}
          onClick={async () => {
            feedback.unlock();
            feedback.tap();
            setStarting(true);
            await start({ code: room.code }).catch(() => setStarting(false));
          }}
        >
          {starting ? "Starting…" : room.members.length === 1 ? "Start solo air-draw" : `Start with ${room.members.length} players`}
        </button>
      ) : (
        <p style={{ margin: 0, textAlign: "center", fontWeight: 800, color: "var(--muted)" }}>Waiting for host…</p>
      )}
    </main>
  );
}

export function DoodlePlay({ room }: { room: DoodleView }) {
  const router = useRouter();
  const syncStrokes = useMutation(api.doodle.syncStrokes);
  const guessMut = useMutation(api.doodle.guess);
  const acceptMut = useMutation(api.doodle.acceptGuess);
  const revealMut = useMutation(api.doodle.reveal);
  const nextMut = useMutation(api.doodle.next);
  const rematchMut = useMutation(api.doodle.rematch);
  const leaveMut = useMutation(api.doodle.leave);

  const now = useNow(250);
  const [guessText, setGuessText] = useState("");
  const [error, setError] = useState("");

  const g = room.game!;
  const paints = roomPaints(room.members);
  const isDrawer = g.drawerId === room.meId;
  const drawerName = g.names[g.drawerId] ?? "Artist";
  const secsLeft = g.deadline ? Math.max(0, Math.ceil((g.deadline - now) / 1000)) : null;

  const handleSync = useCallback(
    (strokes: number[][]) => {
      void syncStrokes({ code: room.code, strokes }).catch(() => {});
    },
    [room.code, syncStrokes],
  );

  if (g.done) {
    const sorted = [...g.players].sort((a, b) => (g.scores[b] ?? 0) - (g.scores[a] ?? 0));
    return (
      <main className="screen tight">
        <header className="topbar">
          <button className="icon-btn" onClick={async () => { await leaveMut({ code: room.code }).catch(() => {}); router.push("/doodle"); }}>
            <Icon.Close />
          </button>
          <span style={{ flex: 1, fontWeight: 900, fontSize: 18 }}>Air Doodle Recap</span>
        </header>
        <section className="rise ad-hero">
          <span className="ps-kicker">MASTERPIECES COMPLETE</span>
          <h1 className="display" style={{ margin: 0, fontSize: 30 }}>
            {g.players.length >= 2
              ? g.done.winners.length === 1
                ? `${g.names[g.done.winners[0]]} wins! 🎨`
                : "It's a tie! ✨"
              : "Nice air doodles! ✨"}
          </h1>
          <div className="ps-score-strip">
            {sorted.map((pid, i) => (
              <div key={pid} className="ps-score-chip">
                <Avatar name={g.names[pid] ?? "P"} paint={paints.get(pid)} size={26} />
                <span>{i === 0 && g.players.length >= 2 ? "👑 " : ""}{g.names[pid]}</span>
                <b>{g.scores[pid] ?? 0}</b>
              </div>
            ))}
          </div>
        </section>
        <div className="ps-collage-card">
          <span className="label">Words drawn</span>
          {g.history.map((h) => (
            <div key={h.round} className="ps-guess-item">
              <span><b>#{h.round + 1} {h.word}</b> · by {g.names[h.drawerId]}</span>
              <span style={{ color: h.solvedBy ? "var(--lime-ink)" : "var(--muted)", fontWeight: 900 }}>
                {h.solvedBy ? `✅ ${g.names[h.solvedBy]}` : "Unclaimed"}
              </span>
            </div>
          ))}
        </div>
        <div className="grow" />
        {room.isHost && <button className="btn btn-green" onClick={() => void rematchMut({ code: room.code })}>Play again</button>}
        <button className="btn btn-white" onClick={async () => { await leaveMut({ code: room.code }).catch(() => {}); router.push("/doodle"); }}>Back home</button>
      </main>
    );
  }

  return (
    <main className="screen tight">
      <header className="topbar">
        <button className="icon-btn" onClick={async () => { await leaveMut({ code: room.code }).catch(() => {}); router.push("/doodle"); }}>
          <Icon.Close />
        </button>
        <div style={{ flex: 1 }}>
          <span className="label" style={{ fontSize: 11.5 }}>Round {g.round + 1} of {g.rounds}</span>
          <div style={{ fontSize: 17, fontWeight: 900 }}>
            {g.phase === "reveal"
              ? `Answer: ${g.visibleWord}`
              : isDrawer
                ? `Draw: ${g.visibleWord}`
                : `${drawerName} is drawing in the air…`}
          </div>
        </div>
        {secsLeft !== null && g.phase === "drawing" && (
          <span className={`ps-timer-pill ${secsLeft <= 8 ? "urgent" : ""}`}>⏱ {secsLeft}s</span>
        )}
      </header>

      <div className="ps-mini-scores">
        {g.players.map((pid) => (
          <div key={pid} className={`ps-mini-player ${g.drawerId === pid ? "active" : ""}`}>
            <Avatar name={g.names[pid] ?? "P"} paint={paints.get(pid)} size={24} />
            <span className="ps-mini-name">{g.names[pid]}</span>
            <b>{g.scores[pid] ?? 0}</b>
          </div>
        ))}
      </div>

      {g.phase === "drawing" ? (
        isDrawer ? (
          <section className="ps-stage-col">
            <div className="ps-prompt-bar">
              <span className="ps-stepicon" style={{ background: "#ede7ff" }}>✨</span>
              <div style={{ flex: 1 }}>
                <b>Draw &ldquo;{g.visibleWord}&rdquo; in mid-air!</b>
                <small>Point index finger to draw, pinch thumb+index to lift pen (or draw by touch).</small>
              </div>
              <button type="button" className="ps-skip-btn" onClick={() => void revealMut({ code: room.code })}>Done</button>
            </div>
            <AirCanvas roundKey={`${room.gameNo}-${g.round}`} onSync={handleSync} />
          </section>
        ) : (
          <section className="ps-stage-col">
            <DoodleBoard strokes={g.strokes} />
            <form
              className="ps-guess-form"
              onSubmit={async (e) => {
                e.preventDefault();
                if (!guessText.trim()) return;
                setError("");
                try {
                  await guessMut({ code: room.code, text: guessText.trim() });
                  setGuessText("");
                  feedback.tap();
                } catch (err) {
                  setError(errorText(err));
                }
              }}
            >
              <input className="input" placeholder="Guess what they're drawing…" value={guessText} onChange={(e) => setGuessText(e.target.value)} autoFocus />
              <button className="btn btn-green btn-sm" disabled={!guessText.trim()}>Guess</button>
            </form>
          </section>
        )
      ) : (
        <section className="ps-collage-card rise">
          <div style={{ textAlign: "center" }}>
            <span className="ps-kicker" style={{ background: "#ede7ff", color: "#5e3cc4" }}>
              {g.solvedBy ? `🎉 ${g.names[g.solvedBy]} GUESSED IT!` : "ROUND COMPLETE!"}
            </span>
            <h2 className="display" style={{ margin: "6px 0 0", fontSize: 28 }}>&ldquo;{g.visibleWord}&rdquo;</h2>
          </div>
          <DoodleBoard strokes={g.strokes} />
          <button type="button" className="btn btn-green" onClick={() => void nextMut({ code: room.code })}>
            {g.round + 1 < g.rounds ? "Next round →" : "See final scores 🏆"}
          </button>
        </section>
      )}

      {g.phase === "drawing" && g.guesses.length > 0 && (
        <div className="ps-guess-list">
          <span className="label">Live guesses</span>
          {g.guesses.slice(-5).map((gs, i) => (
            <div key={`${gs.at}-${i}`} className="ps-guess-item">
              <span><b>{g.names[gs.by] ?? "P"}:</b> {gs.text}</span>
              {isDrawer && (
                <button type="button" className="ps-accept-btn" onClick={() => void acceptMut({ code: room.code, guesserId: gs.by })}>
                  ✅ Close enough!
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {error && <p role="alert" style={{ margin: 0, color: "var(--cherry-edge)", fontWeight: 800, textAlign: "center" }}>{error}</p>}
    </main>
  );
}
