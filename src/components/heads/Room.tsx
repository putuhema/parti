"use client";

import { useMutation } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../../../convex/_generated/api";
import {
  HEADS_DECKS,
  HEADS_DECK_META,
  HEADS_MAX,
  HEADS_ROUNDS,
  HEADS_TIMERS,
  type HeadsDeck,
} from "../../../convex/lib/heads/rules";
import { InviteFriends } from "@/components/InviteFriends";
import { Avatar, Icon, roomPaints } from "@/components/ui";
import { feedback } from "@/lib/feedback";
import { useNow } from "@/lib/hooks";

export type HeadsView = NonNullable<FunctionReturnType<typeof api.heads.view>>;

export function HeadsLobby({ room }: { room: HeadsView }) {
  const router = useRouter();
  const start = useMutation(api.heads.start);
  const settings = useMutation(api.heads.settings);
  const leave = useMutation(api.heads.leave);
  const [copied, setCopied] = useState(false);
  const [starting, setStarting] = useState(false);
  const paints = roomPaints(room.members);

  async function share() {
    feedback.tap();
    const url = `${location.origin}/heads/room/${room.code}`;
    try {
      if (navigator.share) await navigator.share({ title: "pums party", text: `Play Heads Up! with me! Code ${room.code}`, url });
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
        <button className="icon-btn" onClick={async () => { await leave({ code: room.code }).catch(() => {}); router.push("/heads"); }}>
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

      <section className="rise hu-hero">
        <span className="ps-kicker">TILT OR REMOTE CLUES · FOREHEAD CHARADES</span>
        <h1 className="display" style={{ margin: 0, fontSize: 30 }}>Heads Up!</h1>
        <p style={{ margin: 0, fontSize: 14, fontWeight: 700, opacity: 0.92 }}>
          Tilt down to score, tilt up to pass — or hide your screen while your LDR partner gives live clues!
        </p>
      </section>

      <section style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <span className="label">Card deck</span>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          {HEADS_DECKS.map((d) => (
            <button
              key={d}
              type="button"
              className="seg"
              aria-pressed={room.deck === d}
              disabled={!room.isHost}
              style={{ minHeight: 46 }}
              onClick={() => void settings({ code: room.code, deck: d as HeadsDeck })}
            >
              {HEADS_DECK_META[d].emoji} {HEADS_DECK_META[d].label}
            </button>
          ))}
        </div>
      </section>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <section style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span className="label">Rounds</span>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6 }}>
            {HEADS_ROUNDS.map((r) => (
              <button key={r} type="button" className="seg" aria-pressed={room.rounds === r} disabled={!room.isHost} style={{ minHeight: 44 }} onClick={() => void settings({ code: room.code, rounds: r })}>
                {r}
              </button>
            ))}
          </div>
        </section>
        <section style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span className="label">Round clock</span>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6 }}>
            {HEADS_TIMERS.map((t) => (
              <button key={t} type="button" className="seg" aria-pressed={room.roundSec === t} disabled={!room.isHost} style={{ minHeight: 44 }} onClick={() => void settings({ code: room.code, roundSec: t })}>
                {t}s
              </button>
            ))}
          </div>
        </section>
      </div>

      <section style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <span className="label">Players ({room.members.length}/{HEADS_MAX})</span>
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

      <InviteFriends kind="heads" code={room.code} />
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
          {starting ? "Shuffling deck…" : `Start Heads Up! (${room.members.length}p)`}
        </button>
      ) : (
        <p style={{ margin: 0, textAlign: "center", fontWeight: 800, color: "var(--muted)" }}>Waiting for host…</p>
      )}
    </main>
  );
}

export function HeadsPlay({ room }: { room: HeadsView }) {
  const router = useRouter();
  const beginRound = useMutation(api.heads.beginRound);
  const mark = useMutation(api.heads.mark);
  const finishRound = useMutation(api.heads.finishRound);
  const next = useMutation(api.heads.next);
  const rematchMut = useMutation(api.heads.rematch);
  const leaveMut = useMutation(api.heads.leave);

  const now = useNow(200);
  const [tiltOn, setTiltOn] = useState(false);
  const [hideCard, setHideCard] = useState(false);
  const [flashKind, setFlashKind] = useState<"got" | "pass" | null>(null);
  const cooldownRef = useRef(0);
  const neutralRef = useRef(true);

  const g = room.game!;
  const paints = roomPaints(room.members);
  const isGuesser = g.guesserId === room.meId;
  const guesserName = g.names[g.guesserId] ?? "Player";
  const secsLeft = g.deadline ? Math.max(0, Math.ceil((g.deadline - now) / 1000)) : null;

  const triggerMark = useCallback(
    (outcome: "got" | "pass") => {
      const t = Date.now();
      if (t - cooldownRef.current < 700) return;
      cooldownRef.current = t;
      setFlashKind(outcome);
      if (outcome === "got") feedback.correct();
      else feedback.tap();
      setTimeout(() => setFlashKind(null), 420);
      void mark({ code: room.code, outcome });
    },
    [mark, room.code],
  );

  // DeviceOrientation tilt detection when Guesser enables tilt mode
  useEffect(() => {
    if (!tiltOn || !isGuesser || g.phase !== "active") return;
    const onOrient = (e: DeviceOrientationEvent) => {
      const beta = e.beta; // front-back tilt (-180..180); upright forehead ~85..95
      if (beta === null) return;
      if (beta > 60 && beta < 120) {
        neutralRef.current = true;
        return;
      }
      if (!neutralRef.current) return;
      if (beta <= 42) {
        // Tilted forward/down -> GOT IT!
        neutralRef.current = false;
        triggerMark("got");
      } else if (beta >= 135) {
        // Tilted backward/up -> PASS!
        neutralRef.current = false;
        triggerMark("pass");
      }
    };
    window.addEventListener("deviceorientation", onOrient);
    return () => window.removeEventListener("deviceorientation", onOrient);
  }, [tiltOn, isGuesser, g.phase, triggerMark]);

  async function enableTilt() {
    feedback.tap();
    const DOE = DeviceOrientationEvent as unknown as { requestPermission?: () => Promise<"granted" | "denied"> };
    if (typeof DOE?.requestPermission === "function") {
      try {
        const res = await DOE.requestPermission();
        if (res === "granted") setTiltOn(true);
      } catch {}
    } else {
      setTiltOn((v) => !v);
    }
  }

  if (g.done) {
    const sorted = [...g.players].sort((a, b) => (g.scores[b] ?? 0) - (g.scores[a] ?? 0));
    return (
      <main className="screen tight">
        <header className="topbar">
          <button className="icon-btn" onClick={async () => { await leaveMut({ code: room.code }).catch(() => {}); router.push("/heads"); }}>
            <Icon.Close />
          </button>
          <span style={{ flex: 1, fontWeight: 900, fontSize: 18 }}>Heads Up! Results</span>
        </header>
        <section className="rise hu-hero">
          <span className="ps-kicker">ALL ROUNDS COMPLETE</span>
          <h1 className="display" style={{ margin: 0, fontSize: 30 }}>
            {g.players.length >= 2
              ? g.done.winners.length === 1
                ? `${g.names[g.done.winners[0]]} wins! 🏆`
                : "It's a tie! 💞"
              : `${g.done.totalGot} Cards Guessed!`}
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
        <div className="grow" />
        {room.isHost && <button className="btn btn-green" onClick={() => void rematchMut({ code: room.code })}>Play again</button>}
        <button className="btn btn-white" onClick={async () => { await leaveMut({ code: room.code }).catch(() => {}); router.push("/heads"); }}>Back home</button>
      </main>
    );
  }

  const latest = g.history[g.history.length - 1];

  return (
    <main className="screen tight">
      <header className="topbar">
        <button className="icon-btn" onClick={async () => { await leaveMut({ code: room.code }).catch(() => {}); router.push("/heads"); }}>
          <Icon.Close />
        </button>
        <div style={{ flex: 1 }}>
          <span className="label" style={{ fontSize: 11.5 }}>Round {g.round + 1} of {g.rounds} · {HEADS_DECK_META[g.deck].emoji} {HEADS_DECK_META[g.deck].label}</span>
          <div style={{ fontSize: 17, fontWeight: 900 }}>{guesserName} is guessing</div>
        </div>
        {secsLeft !== null && g.phase === "active" && (
          <span className={`ps-timer-pill ${secsLeft <= 10 ? "urgent" : ""}`}>⏱ {secsLeft}s</span>
        )}
      </header>

      <div className="ps-mini-scores">
        {g.players.map((pid) => (
          <div key={pid} className={`ps-mini-player ${g.guesserId === pid ? "active" : ""}`}>
            <Avatar name={g.names[pid] ?? "P"} paint={paints.get(pid)} size={24} />
            <span className="ps-mini-name">{g.names[pid]}</span>
            <b>{g.scores[pid] ?? 0}</b>
          </div>
        ))}
      </div>

      {g.phase === "ready" && (
        <section className="ps-wait-card rise">
          <span className="ps-kicker">ROUND {g.round + 1} READY</span>
          <span style={{ fontSize: 64 }}>🗣️</span>
          <h2 className="display" style={{ margin: 0, fontSize: 26, textAlign: "center" }}>
            {isGuesser ? "Your turn to guess!" : `Give clues to ${guesserName}!`}
          </h2>
          <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: "var(--muted)", textAlign: "center" }}>
            {isGuesser
              ? "Hold your phone up to your forehead — or tap 'Hide my screen' if your partner is giving clues on their own device!"
              : "You'll see the secret words live on your screen. Act, describe, or hum clues — no saying the word!"}
          </p>

          {isGuesser && (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center" }}>
              <button type="button" className={`ps-ctrl-btn ${tiltOn ? "on" : ""}`} onClick={enableTilt}>
                {tiltOn ? "📱 Tilt ON ✓" : "📱 Enable Tilt"}
              </button>
              <button type="button" className="ps-ctrl-btn" onClick={() => setHideCard((h) => !h)}>
                {hideCard ? "🙈 Screen Hidden (LDR)" : "👁️ Forehead Mode"}
              </button>
            </div>
          )}

          <button type="button" className="btn btn-green" style={{ width: "100%" }} onClick={() => void beginRound({ code: room.code })}>
            Start {g.roundSec}s Round!
          </button>
        </section>
      )}

      {g.phase === "active" && (
        <section className="ps-stage-col" style={{ flex: 1 }}>
          <div className={`hu-card ${flashKind ?? ""}`}>
            <span className="ps-kicker" style={{ background: "rgba(255,255,255,.22)" }}>
              {isGuesser ? (hideCard ? "LDR MODE · LISTEN TO PARTNER" : "HOLD TO FOREHEAD") : `CLUE FOR ${guesserName.toUpperCase()}`}
            </span>
            <h2 className="display hu-word">
              {isGuesser && hideCard ? "🤫 ???" : g.currentCard}
            </h2>
            <span style={{ fontSize: 14, fontWeight: 800, opacity: 0.88 }}>
              Got {g.roundLog.filter((c) => c.outcome === "got").length} · Passed {g.roundLog.filter((c) => c.outcome === "pass").length}
            </span>
          </div>

          <div className="hu-actions">
            <button type="button" className="hu-btn pass" onClick={() => triggerMark("pass")}>
              ⏭️ Pass
            </button>
            <button type="button" className="hu-btn got" onClick={() => triggerMark("got")}>
              ✅ Got it!
            </button>
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            {isGuesser ? (
              <button type="button" className="ps-skip-btn" onClick={() => setHideCard((h) => !h)}>
                {hideCard ? "👁️ Show card" : "🙈 Hide card (LDR)"}
              </button>
            ) : <span />}
            <button type="button" className="ps-skip-btn" onClick={() => void finishRound({ code: room.code })}>
              End round early
            </button>
          </div>
        </section>
      )}

      {g.phase === "summary" && latest && (
        <section className="ps-collage-card rise">
          <div style={{ textAlign: "center" }}>
            <span className="ps-kicker" style={{ background: "var(--sun-soft)", color: "var(--sun-ink)" }}>
              TIME&apos;S UP!
            </span>
            <h2 className="display" style={{ margin: "6px 0 0", fontSize: 28 }}>
              {g.names[latest.guesserId]} scored {latest.got}! 🎉
            </h2>
          </div>
          <div className="ps-guess-list" style={{ maxHeight: 240, overflowY: "auto" }}>
            {latest.log.length === 0 ? (
              <span style={{ textAlign: "center", color: "var(--muted)", fontWeight: 800 }}>No cards played</span>
            ) : (
              latest.log.map((c, i) => (
                <div key={i} className="ps-guess-item">
                  <span>{c.word}</span>
                  <span style={{ fontWeight: 900, color: c.outcome === "got" ? "var(--lime-ink)" : "var(--muted)" }}>
                    {c.outcome === "got" ? "✅ Got it" : "⏭️ Pass"}
                  </span>
                </div>
              ))
            )}
          </div>
          <button type="button" className="btn btn-green" onClick={() => void next({ code: room.code })}>
            {g.round + 1 < g.rounds ? "Next guesser →" : "See final results 🏆"}
          </button>
        </section>
      )}
    </main>
  );
}
