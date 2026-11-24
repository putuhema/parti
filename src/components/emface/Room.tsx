"use client";

import { useMutation } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { EXPRESSION_BY_ID } from "../../../convex/lib/face/expressions";
import {
  FACE_HYPE,
  FACE_MAX,
  FACE_RATING,
  FACE_ROUNDS,
  FACE_TIMERS,
  computeFaceTurnScore,
  type FaceRatingKind,
} from "../../../convex/lib/face/rules";
import { InviteFriends } from "@/components/InviteFriends";
import { Avatar, Icon, roomPaints } from "@/components/ui";
import { errorText } from "@/lib/errors";
import { feedback } from "@/lib/feedback";
import { useNow } from "@/lib/hooks";
import { FaceCamera } from "./FaceCamera";

export type EmFaceView = NonNullable<FunctionReturnType<typeof api.emface.view>>;

export function EmFaceLobby({ room }: { room: EmFaceView }) {
  const router = useRouter();
  const start = useMutation(api.emface.start);
  const settings = useMutation(api.emface.settings);
  const leave = useMutation(api.emface.leave);
  const now = useNow(5000);
  const [copied, setCopied] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState("");
  const paints = roomPaints(room.members);

  async function share() {
    feedback.tap();
    const url = `${location.origin}/emface/room/${room.code}`;
    const text = `Match goofy emojis with me in Emoji Face Match! Code ${room.code}`;
    try {
      if (navigator.share) await navigator.share({ title: "pums party", text, url });
      else {
        await navigator.clipboard.writeText(`${text} ${url}`);
        setCopied(true);
        setTimeout(() => setCopied(false), 1800);
      }
    } catch {}
  }

  return (
    <main className="screen tight">
      <header className="topbar">
        <button className="icon-btn" aria-label="Leave" onClick={async () => { await leave({ code: room.code }).catch(() => {}); router.push("/emface"); }}>
          <Icon.Close />
        </button>
        <span style={{ display: "flex", flexDirection: "column", flex: 1 }}>
          <span className="label" style={{ fontSize: 12 }}>Room code</span>
          <span style={{ fontSize: 22, fontWeight: 900, letterSpacing: ".14em" }}>{room.code}</span>
        </span>
        <button className="icon-btn" style={{ border: "2px solid var(--line)", boxShadow: "0 3px 0 var(--line)" }} onClick={share} aria-label="Share">
          <Icon.Share size={18} />
        </button>
      </header>

      <section className="rise ef-hero">
        <span className="ps-kicker">1–{FACE_MAX} PLAYERS · LIVE FACE TRACKING</span>
        <h1 className="display" style={{ margin: 0, fontSize: 30 }}>Emoji Face Match</h1>
        <p style={{ margin: 0, fontSize: 14, fontWeight: 700, opacity: 0.92 }}>
          Make the exact emoji face on camera — zero standing up required!
        </p>
      </section>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <section style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span className="label">Emojis</span>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6 }}>
            {FACE_ROUNDS.map((r) => (
              <button key={r} type="button" className="seg" aria-pressed={room.rounds === r} disabled={!room.isHost} style={{ minHeight: 44 }} onClick={() => void settings({ code: room.code, rounds: r })}>
                {r}
              </button>
            ))}
          </div>
        </section>
        <section style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span className="label">Turn timer</span>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6 }}>
            {FACE_TIMERS.map((t) => (
              <button key={t} type="button" className="seg" aria-pressed={room.turnSec === t} disabled={!room.isHost} style={{ minHeight: 44 }} onClick={() => void settings({ code: room.code, turnSec: t })}>
                {t}s
              </button>
            ))}
          </div>
        </section>
      </div>

      <section style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <span className="label">Players ({room.members.length}/{FACE_MAX})</span>
          {copied && <span style={{ fontSize: 13, fontWeight: 900, color: "var(--lime-ink)" }}>Link copied!</span>}
        </div>
        {room.members.map((m) => (
          <div key={m.id} className="row-card" style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <Avatar name={m.name} paint={paints.get(m.id)} size={38} />
            <span style={{ flex: 1, fontWeight: 900 }}>{m.name} {m.isMe && <span style={{ color: "var(--muted)" }}>(you)</span>}</span>
            {m.isHost && <span className="pill" style={{ background: "var(--sun-soft)", color: "var(--sun-ink)" }}>Host</span>}
            {now - m.lastSeen > 40_000 && !m.isMe && <span className="pill">Away</span>}
          </div>
        ))}
      </section>

      <InviteFriends kind="emface" code={room.code} />

      <div className="grow" />
      {error && <p role="alert" style={{ margin: 0, color: "var(--cherry-edge)", fontWeight: 800, textAlign: "center" }}>{error}</p>}
      {room.isHost ? (
        <button
          className="btn btn-green"
          disabled={starting}
          onClick={async () => {
            feedback.unlock();
            feedback.tap();
            setStarting(true);
            try {
              await start({ code: room.code });
            } catch (e) {
              setError(errorText(e));
              setStarting(false);
            }
          }}
        >
          {starting ? "Starting…" : room.members.length === 1 ? "Start solo practice" : `Start with ${room.members.length} players`}
        </button>
      ) : (
        <p style={{ margin: 0, textAlign: "center", fontWeight: 800, color: "var(--muted)" }}>Waiting for host…</p>
      )}
    </main>
  );
}

export function EmFacePlay({ room }: { room: EmFaceView }) {
  const router = useRouter();
  const genUpload = useMutation(api.emface.generateUploadUrl);
  const snapMut = useMutation(api.emface.snap);
  const skipMut = useMutation(api.emface.skip);
  const rateMut = useMutation(api.emface.rate);
  const reactMut = useMutation(api.emface.react);
  const nextMut = useMutation(api.emface.next);
  const rematchMut = useMutation(api.emface.rematch);
  const leaveMut = useMutation(api.emface.leave);

  const now = useNow(250);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const g = room.game!;
  const paints = roomPaints(room.members);

  const countingDown = room.startAt !== null && now < room.startAt - 80;
  const countNum = room.startAt ? Math.max(1, Math.ceil((room.startAt - now) / 900)) : 0;
  const expr = EXPRESSION_BY_ID[g.currentTurn.exprId];
  const isMyTurn = g.currentTurn.playerId === room.meId;
  const activeName = g.names[g.currentTurn.playerId] ?? "Player";
  const visibleDeadline = g.phase === "posing" && g.deadline ? g.deadline - 4500 : g.deadline;
  const secsLeft = visibleDeadline && !countingDown ? Math.max(0, Math.ceil((visibleDeadline - now) / 1000)) : null;

  async function onCapture(blob: Blob, aiScore?: number) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const url = await genUpload({ code: room.code });
      const res = await fetch(url, { method: "POST", headers: { "Content-Type": blob.type || "image/jpeg" }, body: blob });
      const { storageId } = (await res.json()) as { storageId: Id<"_storage"> };
      await snapMut({ code: room.code, storageId, aiScore });
      feedback.correct();
    } catch (e) {
      setError(errorText(e, "Upload failed"));
    } finally {
      setBusy(false);
    }
  }

  if (g.done) {
    const sorted = [...g.players].sort((a, b) => (g.scores[b] ?? 0) - (g.scores[a] ?? 0));
    return (
      <main className="screen tight">
        <header className="topbar">
          <button className="icon-btn" onClick={async () => { await leaveMut({ code: room.code }).catch(() => {}); router.push("/emface"); }}>
            <Icon.Close />
          </button>
          <span style={{ flex: 1, fontWeight: 900, fontSize: 18 }}>Emoji Face Recap</span>
          <span className="pill" style={{ background: "var(--sun-soft)", color: "var(--sun-ink)" }}>😄 {g.done.syncPct}%</span>
        </header>

        <section className="rise ef-hero">
          <span className="ps-kicker">ALL FACES SNAPPED!</span>
          <h1 className="display" style={{ margin: 0, fontSize: 30 }}>
            {g.players.length >= 2
              ? g.done.winners.length === 1
                ? `${g.names[g.done.winners[0]]} wins! 🏆`
                : "It's a tie! 💞"
              : `${g.done.syncPct}% Avg Match!`}
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

        <section style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {g.history.map((h) => {
            const ex = EXPRESSION_BY_ID[h.exprId];
            return (
              <div key={h.round} className="ps-collage-card">
                <div className="ps-collage-head">
                  <span style={{ fontSize: 34 }}>{ex?.emoji ?? "😄"}</span>
                  <div>
                    <b>#{h.round + 1} {ex?.name}</b>
                    <small>{ex?.cue}</small>
                  </div>
                </div>
                <div className="ps-collage-grid" style={{ gridTemplateColumns: `repeat(${Math.min(2, h.results.length)}, 1fr)` }}>
                  {h.results.map((r) => {
                    const snap = g.snaps[`${h.round}:${r.playerId}`];
                    return (
                      <div key={r.playerId} className="ps-polaroid mini">
                        {snap?.url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={snap.url} alt={`${g.names[r.playerId]} face`} style={{ aspectRatio: "1 / 1" }} />
                        ) : (
                          <div className="ps-polaroid-empty" style={{ aspectRatio: "1 / 1" }}>Skipped</div>
                        )}
                        <div className="ps-polaroid-foot">
                          <span>{g.names[r.playerId]}</span>
                          <b>{r.totalScore} pts</b>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </section>

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {room.isHost && <button className="btn btn-green" onClick={() => void rematchMut({ code: room.code })}>Play again</button>}
          <button className="btn btn-white" onClick={async () => { await leaveMut({ code: room.code }).catch(() => {}); router.push("/emface"); }}>Back home</button>
        </div>
      </main>
    );
  }

  const snap = g.snaps[`${g.round}:${g.currentTurn.playerId}`];
  const liveScore = computeFaceTurnScore(g.currentTurn);
  const myRating = g.currentTurn.ratings[room.meId];
  const latest = g.history[g.history.length - 1];
  const latestExpr = latest ? EXPRESSION_BY_ID[latest.exprId] : undefined;

  return (
    <main className="screen tight">
      <header className="topbar">
        <button className="icon-btn" onClick={async () => { await leaveMut({ code: room.code }).catch(() => {}); router.push("/emface"); }}>
          <Icon.Close />
        </button>
        <div style={{ flex: 1 }}>
          <span className="label" style={{ fontSize: 11.5 }}>Emoji {g.round + 1} of {g.rounds}</span>
          <div style={{ fontSize: 17, fontWeight: 900 }}>{expr?.emoji} {expr?.name}</div>
        </div>
        {secsLeft !== null && g.phase === "posing" && (
          <span className={`ps-timer-pill ${secsLeft <= 4 ? "urgent" : ""}`}>⏱ {secsLeft}s</span>
        )}
      </header>

      <div className="ps-mini-scores">
        {g.players.map((pid) => (
          <div key={pid} className={`ps-mini-player ${g.phase !== "roundSummary" && g.currentTurn.playerId === pid ? "active" : ""}`}>
            <Avatar name={g.names[pid] ?? "P"} paint={paints.get(pid)} size={24} />
            <span className="ps-mini-name">{g.names[pid]}</span>
            <b>{g.scores[pid] ?? 0}</b>
          </div>
        ))}
      </div>

      {countingDown && (
        <section className="ps-countdown-card">
          <span style={{ fontSize: 72 }}>{expr?.emoji}</span>
          <span className="ps-kicker">GET YOUR FACE READY!</span>
          <h2 className="display" style={{ margin: 0, fontSize: 48 }}>{countNum}</h2>
          <p style={{ margin: 0, fontWeight: 800, color: "var(--muted)" }}>First up: <b>{activeName}</b></p>
        </section>
      )}

      {!countingDown && g.phase === "posing" && expr && (
        isMyTurn ? (
          <section className="ps-stage-col">
            <div className="ps-prompt-bar">
              <span style={{ fontSize: 38 }}>{expr.emoji}</span>
              <div style={{ flex: 1 }}>
                <b>Match: {expr.name}</b>
                <small>{expr.cue}</small>
              </div>
              <button type="button" className="ps-skip-btn" onClick={() => void skipMut({ code: room.code })}>Skip</button>
            </div>
            {g.hype.length > 0 && (
              <div className="ps-hype-bar">
                {g.hype.slice(-5).map((h, i) => <span key={`${h.at}-${i}`} className="ps-hype-bubble">{h.emoji}</span>)}
              </div>
            )}
            <FaceCamera expr={expr} turnKey={`${g.round}-${g.turnIndex}`} busy={busy} secsLeft={secsLeft} onCapture={onCapture} />
          </section>
        ) : (
          <section className="ps-wait-card">
            <span className="ps-kicker">WATCHING {activeName.toUpperCase()}</span>
            <span style={{ fontSize: 84 }}>{expr.emoji}</span>
            <h2 className="display" style={{ margin: 0, fontSize: 24 }}>{expr.name}</h2>
            <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: "var(--muted)", textAlign: "center" }}>{expr.cue}</p>
            <div className="ps-hype-box">
              <span className="label" style={{ textAlign: "center" }}>Send live hype!</span>
              <div className="ps-emoji-row">
                {FACE_HYPE.map((em) => (
                  <button key={em} type="button" className="ps-emoji-btn" onClick={() => void reactMut({ code: room.code, emoji: em })}>{em}</button>
                ))}
              </div>
            </div>
          </section>
        )
      )}

      {!countingDown && g.phase === "reveal" && expr && (
        <section className="ps-reveal-col">
          <div className="ps-reveal-grid">
            <div className="ps-polaroid target">
              <div className="ps-polaroid-art"><span style={{ fontSize: 72 }}>{expr.emoji}</span></div>
              <div className="ps-polaroid-foot"><span>Target</span><b>{expr.name}</b></div>
            </div>
            <div className="ps-polaroid snap">
              {snap?.url && !g.currentTurn.skipped ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={snap.url} alt={`${activeName} face`} style={{ aspectRatio: "1 / 1" }} />
              ) : (
                <div className="ps-polaroid-empty" style={{ aspectRatio: "1 / 1" }}>Skipped 😅</div>
              )}
              {g.currentTurn.aiScore !== undefined && !g.currentTurn.skipped && (
                <span className="ps-ai-badge">🤖 {g.currentTurn.aiScore}%</span>
              )}
              {g.currentTurn.reactions.length > 0 && (
                <div className="ps-stamp-row">
                  {g.currentTurn.reactions.slice(-6).map((r, i) => <span key={`${r.at}-${i}`} className="ps-stamp">{r.emoji}</span>)}
                </div>
              )}
              <div className="ps-polaroid-foot"><span>{activeName}</span><b>+{liveScore.totalScore}</b></div>
            </div>
          </div>

          {!isMyTurn && !g.currentTurn.skipped && (
            <div className="ps-rate-card">
              <span className="label" style={{ textAlign: "center" }}>Rate {activeName}&apos;s face!</span>
              <div className="ps-rate-row">
                {(["nailed", "close", "chaotic"] as const).map((k) => (
                  <button key={k} type="button" className={`ps-rate-btn ${myRating?.kind === k ? "on" : ""}`} onClick={() => void rateMut({ code: room.code, kind: k as FaceRatingKind })}>
                    <span style={{ fontSize: 22 }}>{FACE_RATING[k].emoji}</span>
                    <b>{FACE_RATING[k].label}</b>
                    <small>+{FACE_RATING[k].score}</small>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="ps-emoji-row">
            {FACE_HYPE.map((em) => (
              <button key={em} type="button" className="ps-emoji-btn" onClick={() => void reactMut({ code: room.code, emoji: em })}>{em}</button>
            ))}
          </div>

          <button type="button" className="btn btn-green" onClick={() => void nextMut({ code: room.code })}>Continue →</button>
        </section>
      )}

      {!countingDown && g.phase === "roundSummary" && latest && (
        <section className="ps-collage-card rise">
          <div className="ps-collage-head">
            <span style={{ fontSize: 38 }}>{latestExpr?.emoji}</span>
            <div>
              <b>{latestExpr?.name}</b>
              <small>Who pulled off the best face?</small>
            </div>
          </div>
          <div className="ps-collage-grid" style={{ gridTemplateColumns: `repeat(${Math.min(2, latest.results.length)}, 1fr)` }}>
            {latest.results.map((r) => {
              const s = g.snaps[`${latest.round}:${r.playerId}`];
              return (
                <div key={r.playerId} className="ps-polaroid">
                  {s?.url && !r.skipped ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={s.url} alt={`${g.names[r.playerId]} face`} style={{ aspectRatio: "1 / 1" }} />
                  ) : (
                    <div className="ps-polaroid-empty" style={{ aspectRatio: "1 / 1" }}>Skipped</div>
                  )}
                  <div className="ps-polaroid-foot"><span>{g.names[r.playerId]}</span><b>+{r.totalScore}</b></div>
                </div>
              );
            })}
          </div>
          <button type="button" className="btn btn-green" onClick={() => void nextMut({ code: room.code })}>
            {g.round + 1 < g.rounds ? "Next emoji →" : "See final recap 🏆"}
          </button>
        </section>
      )}

      {error && <p role="alert" style={{ margin: 0, color: "var(--cherry-edge)", fontWeight: 800, textAlign: "center" }}>{error}</p>}
    </main>
  );
}
