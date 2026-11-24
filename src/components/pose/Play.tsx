"use client";

import { useMutation } from "convex/react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { POSE_BY_ID } from "../../../convex/lib/pose/poses";
import {
  HYPE_EMOJIS,
  RATING_SCORE,
  computeTurnScore,
  type RatingKind,
} from "../../../convex/lib/pose/rules";
import { Avatar, Icon, roomPaints } from "@/components/ui";
import { errorText } from "@/lib/errors";
import { feedback } from "@/lib/feedback";
import { useNow } from "@/lib/hooks";
import { CameraStage } from "./CameraStage";
import { PoseFigure } from "./PoseFigure";
import { GAME_NAME, type PoseView } from "./common";

export function PosePlay({ room }: { room: PoseView }) {
  const router = useRouter();
  const generateUploadUrl = useMutation(api.pose.generateUploadUrl);
  const submitSnap = useMutation(api.pose.snap);
  const skipTurn = useMutation(api.pose.skip);
  const rateSnap = useMutation(api.pose.rate);
  const reactMut = useMutation(api.pose.react);
  const nextMut = useMutation(api.pose.next);
  const rematchMut = useMutation(api.pose.rematch);
  const leaveMut = useMutation(api.pose.leave);

  const now = useNow(250);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [downloading, setDownloading] = useState(false);

  const g = room.game!;
  const paints = roomPaints(room.members);

  // Start countdown
  const countingDown = room.startAt !== null && now < room.startAt - 80;
  const countNum = room.startAt ? Math.max(1, Math.ceil((room.startAt - now) / 900)) : 0;

  const currentPose = POSE_BY_ID[g.currentTurn.poseId];
  const isMyTurn = g.currentTurn.playerId === room.meId;
  const activeName = g.names[g.currentTurn.playerId] ?? "Player";

  // Visible turn countdown (exclude the 4.5s server upload grace buffer)
  const visibleDeadline = g.phase === "posing" && g.deadline ? g.deadline - 4500 : g.deadline;
  const secsLeft =
    visibleDeadline && !countingDown ? Math.max(0, Math.ceil((visibleDeadline - now) / 1000)) : null;

  useEffect(() => {
    setError("");
  }, [g.seq]);

  async function handleCapture(blob: Blob, aiScore?: number) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const uploadUrl = await generateUploadUrl({ code: room.code });
      const res = await fetch(uploadUrl, {
        method: "POST",
        headers: { "Content-Type": blob.type || "image/jpeg" },
        body: blob,
      });
      if (!res.ok) throw new Error("Upload failed");
      const { storageId } = (await res.json()) as { storageId: Id<"_storage"> };
      await submitSnap({ code: room.code, storageId, aiScore });
      feedback.correct();
    } catch (e) {
      setError(errorText(e, "Couldn't upload photo"));
      feedback.wrong();
    } finally {
      setBusy(false);
    }
  }

  async function handleSkip() {
    if (busy) return;
    feedback.tap();
    setBusy(true);
    try {
      await skipTurn({ code: room.code });
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  async function handleRate(kind: RatingKind) {
    feedback.tap();
    try {
      await rateSnap({ code: room.code, kind });
      feedback.correct();
    } catch (e) {
      setError(errorText(e));
    }
  }

  async function handleReact(emoji: string) {
    feedback.tap();
    try {
      await reactMut({ code: room.code, emoji });
    } catch {}
  }

  async function handleNext() {
    if (busy) return;
    feedback.tap();
    setBusy(true);
    try {
      await nextMut({ code: room.code });
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  async function downloadPhotobooth() {
    if (downloading) return;
    setDownloading(true);
    try {
      const rounds = g.history;
      const cols = Math.max(1, g.players.length);
      const cellW = 240;
      const cellH = 310;
      const pad = 28;
      const headerH = 92;
      const rowLabelH = 44;
      const gap = 16;

      const width = pad * 2 + cols * cellW + (cols - 1) * gap;
      const height = headerH + rounds.length * (rowLabelH + cellH + 22) + pad;

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      // Warm cream background
      ctx.fillStyle = "#FFF8EE";
      ctx.fillRect(0, 0, width, height);

      // Header
      ctx.fillStyle = "#34283E";
      ctx.font = "900 30px system-ui, -apple-system, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(`📸 ${GAME_NAME} Strip`, width / 2, 46);
      ctx.fillStyle = "#E0485C";
      ctx.font = "800 16px system-ui, -apple-system, sans-serif";
      ctx.fillText(
        g.done ? `💞 ${g.done.coupleSync}% Sync · ${rounds.length} Poses · pums party` : "pums party",
        width / 2,
        74,
      );

      const loadImg = (url: string) =>
        new Promise<HTMLImageElement | null>((resolve) => {
          const im = new Image();
          im.crossOrigin = "anonymous";
          im.onload = () => resolve(im);
          im.onerror = () => resolve(null);
          im.src = url;
        });

      let y = headerH;
      for (const h of rounds) {
        const pose = POSE_BY_ID[h.poseId];
        ctx.fillStyle = "#34283E";
        ctx.font = "800 18px system-ui, -apple-system, sans-serif";
        ctx.textAlign = "left";
        ctx.fillText(`#${h.round + 1} ${pose?.emoji ?? "✨"} ${pose?.name ?? h.poseId}`, pad, y + 28);
        y += rowLabelH;

        for (let c = 0; c < g.players.length; c++) {
          const pid = g.players[c];
          const x = pad + c * (cellW + gap);
          // Polaroid frame
          ctx.fillStyle = "#FFFFFF";
          ctx.strokeStyle = "#EADFD0";
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.roundRect(x, y, cellW, cellH, 16);
          ctx.fill();
          ctx.stroke();

          const snap = g.snaps[`${h.round}:${pid}`];
          const res = h.results.find((r) => r.playerId === pid);
          if (snap?.url) {
            const im = await loadImg(snap.url);
            if (im) {
              ctx.save();
              ctx.beginPath();
              ctx.roundRect(x + 10, y + 10, cellW - 20, cellH - 58, 10);
              ctx.clip();
              ctx.drawImage(im, x + 10, y + 10, cellW - 20, cellH - 58);
              ctx.restore();
            }
          } else {
            ctx.fillStyle = "#F4ECE0";
            ctx.fillRect(x + 10, y + 10, cellW - 20, cellH - 58);
            ctx.fillStyle = "#9A8BA3";
            ctx.font = "700 15px system-ui, sans-serif";
            ctx.textAlign = "center";
            ctx.fillText("Skipped", x + cellW / 2, y + 130);
          }

          ctx.fillStyle = "#34283E";
          ctx.font = "800 15px system-ui, sans-serif";
          ctx.textAlign = "left";
          ctx.fillText(g.names[pid] ?? "Player", x + 14, y + cellH - 18);
          ctx.fillStyle = "#E0485C";
          ctx.textAlign = "right";
          ctx.fillText(`${res?.totalScore ?? 0} pts`, x + cellW - 14, y + cellH - 18);
        }
        y += cellH + 22;
      }

      const dataUrl = canvas.toDataURL("image/png");
      const a = document.createElement("a");
      a.href = dataUrl;
      a.download = `pose-match-${room.code.toLowerCase()}.png`;
      a.click();
      feedback.correct();
    } finally {
      setDownloading(false);
    }
  }

  // ---------- FINISHED SCREEN ----------
  if (g.done) {
    const sorted = [...g.players].sort((a, b) => (g.scores[b] ?? 0) - (g.scores[a] ?? 0));
    const multi = g.players.length >= 2;
    return (
      <main className="screen tight">
        <header className="topbar">
          <button
            className="icon-btn"
            aria-label="Leave room"
            onClick={async () => {
              await leaveMut({ code: room.code }).catch(() => {});
              router.push("/pose");
            }}
          >
            <Icon.Close />
          </button>
          <span style={{ flex: 1, fontWeight: 900, fontSize: 18 }}>Photobooth Recap</span>
          <span className="pill" style={{ background: "var(--cherry-soft)", color: "var(--cherry-edge)" }}>
            💞 {g.done.coupleSync}% Sync
          </span>
        </header>

        <section className="rise ps-finish-hero">
          <span className="ps-kicker">{multi ? "COUPLE & SQUAD RECAP" : "SOLO PRACTICE COMPLETE"}</span>
          <h1 className="display" style={{ margin: 0, fontSize: 32, lineHeight: 1.05 }}>
            {multi
              ? g.done.winners.length === 1
                ? `${g.names[g.done.winners[0]]} wins! 🏆`
                : "It's a tie! 💞"
              : `${g.done.coupleSync}% Avg Match!`}
          </h1>
          <div className="ps-score-strip">
            {sorted.map((pid, idx) => (
              <div key={pid} className="ps-score-chip">
                <Avatar name={g.names[pid] ?? "P"} paint={paints.get(pid)} size={28} />
                <span>{idx === 0 && multi ? "👑 " : ""}{g.names[pid]}</span>
                <b>{g.scores[pid] ?? 0}</b>
              </div>
            ))}
          </div>
        </section>

        <button
          type="button"
          className="btn btn-sun"
          disabled={downloading}
          onClick={downloadPhotobooth}
        >
          {downloading ? "Building photobooth strip…" : "📸 Save Photobooth Strip"}
        </button>

        {/* Full Scrapbook */}
        <section style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <span className="label">Your {g.history.length} matched poses</span>
          {g.history.map((h) => {
            const pose = POSE_BY_ID[h.poseId];
            return (
              <div key={h.round} className="ps-collage-card">
                <div className="ps-collage-head">
                  {pose && <PoseFigure pose={pose} variant="mini" />}
                  <div style={{ flex: 1 }}>
                    <b>#{h.round + 1} {pose?.name ?? h.poseId}</b>
                    <small>{pose?.emoji} {pose?.cue}</small>
                  </div>
                </div>
                <div className="ps-collage-grid" style={{ gridTemplateColumns: `repeat(${Math.min(2, h.results.length)}, 1fr)` }}>
                  {h.results.map((r) => {
                    const snap = g.snaps[`${h.round}:${r.playerId}`];
                    return (
                      <div key={r.playerId} className="ps-polaroid mini">
                        {snap?.url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={snap.url} alt={`${g.names[r.playerId]} matching ${pose?.name ?? "pose"}`} />
                        ) : (
                          <div className="ps-polaroid-empty">Skipped 😅</div>
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

        <div style={{ display: "flex", flexDirection: "column", gap: 10, paddingBottom: 12 }}>
          {room.isHost && (
            <button
              className="btn btn-green"
              onClick={() => {
                feedback.tap();
                void rematchMut({ code: room.code });
              }}
            >
              Play again
            </button>
          )}
          <button
            className="btn btn-white"
            onClick={async () => {
              await leaveMut({ code: room.code }).catch(() => {});
              router.push("/pose");
            }}
          >
            Back to Pose Match
          </button>
        </div>
      </main>
    );
  }

  // ---------- PLAYING ----------
  const currentSnap = g.snaps[`${g.round}:${g.currentTurn.playerId}`];
  const myRating = g.currentTurn.ratings[room.meId];
  const liveScore = computeTurnScore(g.currentTurn);
  const latestSummary = g.history[g.history.length - 1];
  const summaryPose = latestSummary ? POSE_BY_ID[latestSummary.poseId] : undefined;

  return (
    <main className="screen tight">
      {/* Top Bar */}
      <header className="topbar">
        <button
          className="icon-btn"
          aria-label="Leave game"
          onClick={async () => {
            await leaveMut({ code: room.code }).catch(() => {});
            router.push("/pose");
          }}
        >
          <Icon.Close />
        </button>
        <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
          <span className="label" style={{ fontSize: 11.5 }}>
            Pose {g.round + 1} of {g.rounds}
          </span>
          <span style={{ fontSize: 17, fontWeight: 900 }}>
            {currentPose ? `${currentPose.emoji} ${currentPose.name}` : GAME_NAME}
          </span>
        </div>
        {secsLeft !== null && g.phase === "posing" && (
          <span className={`ps-timer-pill ${secsLeft <= 4 ? "urgent" : ""}`}>
            ⏱ {secsLeft}s
          </span>
        )}
      </header>

      {/* Score Strip */}
      <div className="ps-mini-scores">
        {g.players.map((pid) => {
          const active = g.phase !== "roundSummary" && g.currentTurn.playerId === pid;
          return (
            <div key={pid} className={`ps-mini-player ${active ? "active" : ""}`}>
              <Avatar name={g.names[pid] ?? "P"} paint={paints.get(pid)} size={24} />
              <span className="ps-mini-name">{g.names[pid]}</span>
              <b>{g.scores[pid] ?? 0}</b>
            </div>
          );
        })}
      </div>

      {/* Start Countdown */}
      {countingDown && (
        <section className="ps-countdown-card">
          {currentPose && <PoseFigure pose={currentPose} variant="card" />}
          <span className="ps-kicker">GET READY TO POSE!</span>
          <h2 className="display" style={{ margin: 0, fontSize: 48 }}>{countNum}</h2>
          <p style={{ margin: 0, fontWeight: 800, color: "var(--muted)" }}>
            First up: <b>{activeName}</b>
          </p>
        </section>
      )}

      {/* PHASE 1: POSING */}
      {!countingDown && g.phase === "posing" && currentPose && (
        <>
          {isMyTurn ? (
            <section className="ps-stage-col">
              <div className="ps-prompt-bar">
                <PoseFigure pose={currentPose} variant="mini" />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <b>Your turn! {currentPose.name}</b>
                  <small>{currentPose.cue}</small>
                </div>
                <button
                  type="button"
                  className="ps-skip-btn"
                  disabled={busy}
                  onClick={handleSkip}
                >
                  Skip
                </button>
              </div>

              {/* Floating live hype from partner */}
              {g.hype.length > 0 && (
                <div className="ps-hype-bar" aria-live="polite">
                  {g.hype.slice(-5).map((h, i) => (
                    <span key={`${h.at}-${i}`} className="ps-hype-bubble">
                      {h.emoji}
                    </span>
                  ))}
                </div>
              )}

              <CameraStage
                pose={currentPose}
                busy={busy}
                secsLeft={secsLeft}
                onCapture={handleCapture}
              />
            </section>
          ) : (
            <section className="ps-wait-card">
              <span className="ps-kicker">WATCHING {activeName.toUpperCase()} POSE</span>
              <div className="ps-target-big">
                <PoseFigure pose={currentPose} variant="card" />
              </div>
              <h2 className="display" style={{ margin: 0, fontSize: 24 }}>{currentPose.emoji} {currentPose.name}</h2>
              <p style={{ margin: 0, fontSize: 14.5, fontWeight: 700, color: "var(--muted)", textAlign: "center" }}>
                {currentPose.cue}
              </p>

              <div className="ps-hype-box">
                <span className="label" style={{ textAlign: "center" }}>Send live hype to {activeName}!</span>
                <div className="ps-emoji-row">
                  {HYPE_EMOJIS.map((em) => (
                    <button
                      key={em}
                      type="button"
                      className="ps-emoji-btn"
                      onClick={() => handleReact(em)}
                    >
                      {em}
                    </button>
                  ))}
                </div>
              </div>
            </section>
          )}
        </>
      )}

      {/* PHASE 2: REVEAL & PARTNER RATING */}
      {!countingDown && g.phase === "reveal" && currentPose && (
        <section className="ps-reveal-col">
          <div className="ps-reveal-grid">
            <div className="ps-polaroid target">
              <div className="ps-polaroid-art">
                <PoseFigure pose={currentPose} variant="card" />
              </div>
              <div className="ps-polaroid-foot">
                <span>Target</span>
                <b>{currentPose.emoji}</b>
              </div>
            </div>

            <div className="ps-polaroid snap">
              {currentSnap?.url && !g.currentTurn.skipped ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={currentSnap.url} alt={`${activeName} pose snap`} />
              ) : (
                <div className="ps-polaroid-empty">
                  {g.currentTurn.skipped ? "Skipped 😅" : "Loading photo…"}
                </div>
              )}
              {g.currentTurn.aiScore !== undefined && !g.currentTurn.skipped && (
                <span className="ps-ai-badge">🤖 {g.currentTurn.aiScore}%</span>
              )}
              {g.currentTurn.reactions.length > 0 && (
                <div className="ps-stamp-row">
                  {g.currentTurn.reactions.slice(-6).map((r, i) => (
                    <span key={`${r.at}-${i}`} className="ps-stamp">{r.emoji}</span>
                  ))}
                </div>
              )}
              <div className="ps-polaroid-foot">
                <span>{activeName}</span>
                <b>+{liveScore.totalScore} pts</b>
              </div>
            </div>
          </div>

          {/* Partner rating */}
          {!isMyTurn && !g.currentTurn.skipped && g.isPlayer && (
            <div className="ps-rate-card">
              <span className="label" style={{ textAlign: "center" }}>
                {myRating ? "Your verdict (tap to change)" : `Rate ${activeName}'s pose!`}
              </span>
              <div className="ps-rate-row">
                {(["nailed", "close", "chaotic"] as const).map((k) => {
                  const meta = RATING_SCORE[k];
                  const picked = myRating?.kind === k;
                  return (
                    <button
                      key={k}
                      type="button"
                      className={`ps-rate-btn ${picked ? "on" : ""}`}
                      onClick={() => handleRate(k)}
                    >
                      <span style={{ fontSize: 22 }}>{meta.emoji}</span>
                      <b>{meta.label}</b>
                      <small>+{meta.score}</small>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Quick reaction stamps */}
          {!g.currentTurn.skipped && (
            <div className="ps-emoji-row">
              {HYPE_EMOJIS.map((em) => (
                <button
                  key={em}
                  type="button"
                  className="ps-emoji-btn"
                  onClick={() => handleReact(em)}
                >
                  {em}
                </button>
              ))}
            </div>
          )}

          <button
            type="button"
            className="btn btn-green"
            disabled={busy}
            onClick={handleNext}
          >
            {g.turnIndex + 1 < g.players.length - g.out.length
              ? `Next: ${g.names[g.players.filter((p) => !g.out.includes(p))[g.turnIndex + 1]]}'s turn →`
              : g.players.length >= 2
                ? "See side-by-side collage ✨"
                : g.round + 1 < g.rounds
                  ? "Next pose →"
                  : "Finish & view strip 🏆"}
          </button>
        </section>
      )}

      {/* PHASE 3: ROUND SUMMARY COLLAGE */}
      {!countingDown && g.phase === "roundSummary" && latestSummary && summaryPose && (
        <section className="ps-collage-card rise">
          <div className="ps-collage-head">
            <PoseFigure pose={summaryPose} variant="mini" />
            <div style={{ flex: 1 }}>
              <b>Pose #{latestSummary.round + 1}: {summaryPose.name}</b>
              <small>Who matched it best?</small>
            </div>
          </div>

          <div
            className="ps-collage-grid"
            style={{ gridTemplateColumns: `repeat(${Math.min(2, latestSummary.results.length)}, 1fr)` }}
          >
            {latestSummary.results.map((r) => {
              const snap = g.snaps[`${latestSummary.round}:${r.playerId}`];
              const maxScore = Math.max(...latestSummary.results.map((x) => x.totalScore));
              const best = r.totalScore === maxScore && maxScore > 0;
              return (
                <div key={r.playerId} className={`ps-polaroid ${best ? "winner" : ""}`}>
                  {snap?.url && !r.skipped ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={snap.url} alt={`${g.names[r.playerId]} pose`} />
                  ) : (
                    <div className="ps-polaroid-empty">Skipped 😅</div>
                  )}
                  {best && <span className="ps-best-badge">👑 Best!</span>}
                  <div className="ps-polaroid-foot">
                    <span>{g.names[r.playerId]}</span>
                    <b>+{r.totalScore}</b>
                  </div>
                </div>
              );
            })}
          </div>

          <button
            type="button"
            className="btn btn-green"
            disabled={busy}
            onClick={handleNext}
          >
            {g.round + 1 < g.rounds ? `Next pose (${g.round + 2}/${g.rounds}) →` : "See final photobooth strip 🏆"}
          </button>
        </section>
      )}

      {error && (
        <p role="alert" style={{ margin: 0, color: "var(--cherry-edge)", fontWeight: 800, textAlign: "center" }}>
          {error}
        </p>
      )}
    </main>
  );
}
