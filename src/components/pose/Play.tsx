"use client";

import { useMutation } from "convex/react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { POSE_BY_ID, type PoseJoints } from "../../../convex/lib/pose/poses";
import {
  HYPE_EMOJIS,
  MODE_META,
  RATING_SCORE,
  TELEPHONE_STEPS,
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
  const submitGuess = useMutation(api.pose.guess);
  const acceptGuess = useMutation(api.pose.acceptGuess);
  const revealMut = useMutation(api.pose.reveal);
  const skipTurn = useMutation(api.pose.skip);
  const rateSnap = useMutation(api.pose.rate);
  const reactMut = useMutation(api.pose.react);
  const nextMut = useMutation(api.pose.next);
  const rematchMut = useMutation(api.pose.rematch);
  const leaveMut = useMutation(api.pose.leave);

  const now = useNow(250);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [guessText, setGuessText] = useState("");
  const [downloading, setDownloading] = useState(false);

  const g = room.game!;
  const modeMeta = MODE_META[g.mode];
  const paints = roomPaints(room.members);

  const countingDown = room.startAt !== null && now < room.startAt - 80;
  const countNum = room.startAt ? Math.max(1, Math.ceil((room.startAt - now) / 900)) : 0;

  const currentPose = g.mode === "classic" ? POSE_BY_ID[g.currentTurn.poseId] ?? null : null;
  const isMyTurn = g.currentTurn.playerId === room.meId;
  const activeName = g.names[g.currentTurn.playerId] ?? "Player";
  const leaderName = g.leaderId ? g.names[g.leaderId] ?? "Leader" : "Leader";

  const visibleDeadline = g.phase === "posing" && g.deadline ? g.deadline - 4500 : g.deadline;
  const secsLeft =
    visibleDeadline && !countingDown ? Math.max(0, Math.ceil((visibleDeadline - now) / 1000)) : null;

  useEffect(() => {
    setError("");
    setGuessText("");
  }, [g.seq]);

  async function handleCapture(blob: Blob, aiScore?: number, joints?: PoseJoints) {
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
      await submitSnap({ code: room.code, storageId, aiScore, joints });
      feedback.correct();
    } catch (e) {
      setError(errorText(e, "Couldn't upload photo"));
      feedback.wrong();
    } finally {
      setBusy(false);
    }
  }

  async function handleGuessSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!guessText.trim() || busy) return;
    feedback.tap();
    setBusy(true);
    setError("");
    try {
      await submitGuess({ code: room.code, text: guessText.trim() });
      setGuessText("");
      feedback.correct();
    } catch (err) {
      setError(errorText(err));
      feedback.wrong();
    } finally {
      setBusy(false);
    }
  }

  async function handleAcceptGuess(guesserId: string) {
    if (busy) return;
    feedback.correct();
    setBusy(true);
    try {
      await acceptGuess({ code: room.code, guesserId });
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleReveal() {
    if (busy) return;
    feedback.tap();
    setBusy(true);
    try {
      await revealMut({ code: room.code });
    } catch (err) {
      setError(errorText(err));
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
      const cols = Math.max(1, Math.min(2, g.players.length));
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

      ctx.fillStyle = "#FFF8EE";
      ctx.fillRect(0, 0, width, height);

      ctx.fillStyle = "#34283E";
      ctx.font = "900 28px system-ui, -apple-system, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(`${modeMeta.emoji} ${GAME_NAME}: ${modeMeta.label}`, width / 2, 46);
      ctx.fillStyle = "#E0485C";
      ctx.font = "800 16px system-ui, -apple-system, sans-serif";
      ctx.fillText(
        g.done ? `💞 ${g.done.coupleSync}% Sync · ${rounds.length} Rounds · pums party` : "pums party",
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
        const title =
          g.mode === "classic"
            ? `#${h.round + 1} ${pose?.emoji ?? "✨"} ${pose?.name ?? h.poseId}`
            : g.mode === "copycat"
              ? `#${h.round + 1} 🪞 ${g.names[h.leaderId ?? ""] ?? "Leader"}'s Pose`
              : `#${h.round + 1} ${modeMeta.emoji} "${h.prompt ?? ""}"`;
        ctx.fillStyle = "#34283E";
        ctx.font = "800 17px system-ui, -apple-system, sans-serif";
        ctx.textAlign = "left";
        ctx.fillText(title, pad, y + 28);
        y += rowLabelH;

        const cells: { label: string; sub: string; url: string | null }[] =
          g.mode === "telephone" && h.chain
            ? h.chain
                .filter((c) => c.kind === "pose")
                .slice(0, 2)
                .map((c) => ({
                  label: g.names[c.playerId] ?? "Player",
                  sub: c.prompt ?? "",
                  url: c.snapKey ? g.snaps[c.snapKey]?.url ?? null : null,
                }))
            : g.players.slice(0, cols).map((pid) => {
                const res = h.results.find((r) => r.playerId === pid);
                return {
                  label: g.names[pid] ?? "Player",
                  sub: `${res?.totalScore ?? 0} pts`,
                  url: g.snaps[`${h.round}:${pid}`]?.url ?? null,
                };
              });

        for (let c = 0; c < cells.length; c++) {
          const item = cells[c];
          const x = pad + c * (cellW + gap);
          ctx.fillStyle = "#FFFFFF";
          ctx.strokeStyle = "#EADFD0";
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.roundRect(x, y, cellW, cellH, 16);
          ctx.fill();
          ctx.stroke();

          if (item.url) {
            const im = await loadImg(item.url);
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
            ctx.fillText("No photo", x + cellW / 2, y + 130);
          }

          ctx.fillStyle = "#34283E";
          ctx.font = "800 14px system-ui, sans-serif";
          ctx.textAlign = "left";
          ctx.fillText(item.label, x + 14, y + cellH - 18);
          ctx.fillStyle = "#E0485C";
          ctx.textAlign = "right";
          ctx.fillText(item.sub.slice(0, 18), x + cellW - 14, y + cellH - 18);
        }
        y += cellH + 22;
      }

      const dataUrl = canvas.toDataURL("image/png");
      const a = document.createElement("a");
      a.href = dataUrl;
      a.download = `pose-match-${g.mode}-${room.code.toLowerCase()}.png`;
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
          <span className="ps-kicker">{modeMeta.emoji} {modeMeta.label.toUpperCase()} COMPLETE</span>
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

        <button type="button" className="btn btn-sun" disabled={downloading} onClick={downloadPhotobooth}>
          {downloading ? "Building photobooth strip…" : "📸 Save Photobooth Strip"}
        </button>

        <section style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <span className="label">Your {g.history.length} rounds</span>
          {g.history.map((h) => {
            const pose = POSE_BY_ID[h.poseId];
            if (g.mode === "telephone" && h.chain) {
              return (
                <div key={h.round} className="ps-collage-card">
                  <div className="ps-collage-head">
                    <span className="ps-stepicon">🎭</span>
                    <div style={{ flex: 1 }}>
                      <b>Round #{h.round + 1}: &ldquo;{h.prompt}&rdquo;</b>
                      <small>How the pose drifted down the chain</small>
                    </div>
                  </div>
                  <TelephoneTimeline chain={h.chain} names={g.names} snaps={g.snaps} />
                </div>
              );
            }
            return (
              <div key={h.round} className="ps-collage-card">
                <div className="ps-collage-head">
                  {pose ? <PoseFigure pose={pose} variant="mini" /> : <span className="ps-stepicon">{modeMeta.emoji}</span>}
                  <div style={{ flex: 1 }}>
                    <b>
                      #{h.round + 1}{" "}
                      {pose ? pose.name : g.mode === "copycat" ? `${g.names[h.leaderId ?? ""] ?? "Leader"}'s Custom Pose` : `"${h.prompt ?? ""}"`}
                    </b>
                    <small>{pose ? `${pose.emoji} ${pose.cue}` : modeMeta.label}</small>
                  </div>
                </div>
                <div
                  className="ps-collage-grid"
                  style={{
                    gridTemplateColumns: `repeat(${Math.min(2, g.mode === "secret" ? 1 : Math.max(1, h.results.length))}, 1fr)`,
                  }}
                >
                  {(g.mode === "secret" ? h.results.filter((r) => r.role === "act") : h.results).map((r) => {
                    const snap = g.snaps[`${h.round}:${r.playerId}`];
                    return (
                      <div key={r.playerId} className="ps-polaroid mini">
                        {snap?.url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={snap.url} alt={`${g.names[r.playerId]} pose`} />
                        ) : (
                          <div className="ps-polaroid-empty">Skipped 😅</div>
                        )}
                        <div className="ps-polaroid-foot">
                          <span>{r.role === "lead" ? "🪞 " : ""}{g.names[r.playerId]}</span>
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
  const leaderSnap = g.leaderId ? g.snaps[`${g.round}:${g.leaderId}`] : undefined;
  const myRating = g.currentTurn.ratings[room.meId];
  const liveScore = computeTurnScore(g.currentTurn);
  const latestSummary = g.history[g.history.length - 1];
  const summaryPose = latestSummary ? POSE_BY_ID[latestSummary.poseId] : undefined;

  const headerTitle =
    g.mode === "classic" && currentPose
      ? `${currentPose.emoji} ${currentPose.name}`
      : `${modeMeta.emoji} ${modeMeta.label}`;

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
            Round {g.round + 1} of {g.rounds}
            {g.mode === "telephone" && g.phase !== "chainReveal" ? ` · Step ${g.chainStep + 1}/${TELEPHONE_STEPS}` : ""}
          </span>
          <span style={{ fontSize: 17, fontWeight: 900 }}>{headerTitle}</span>
        </div>
        {secsLeft !== null && (g.phase === "posing" || g.phase === "guessing") && (
          <span className={`ps-timer-pill ${secsLeft <= 4 ? "urgent" : ""}`}>⏱ {secsLeft}s</span>
        )}
      </header>

      {/* Score Strip */}
      <div className="ps-mini-scores">
        {g.players.map((pid) => {
          const active = g.phase !== "roundSummary" && g.phase !== "chainReveal" && g.currentTurn.playerId === pid;
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
          {currentPose ? (
            <PoseFigure pose={currentPose} variant="card" />
          ) : (
            <span style={{ fontSize: 64 }}>{modeMeta.emoji}</span>
          )}
          <span className="ps-kicker">GET READY FOR {modeMeta.label.toUpperCase()}!</span>
          <h2 className="display" style={{ margin: 0, fontSize: 48 }}>{countNum}</h2>
          <p style={{ margin: 0, fontWeight: 800, color: "var(--muted)" }}>
            First up: <b>{activeName}</b>
          </p>
        </section>
      )}

      {/* PHASE 1: POSING (All 4 Modes) */}
      {!countingDown && g.phase === "posing" && (
        <>
          {isMyTurn ? (
            <section className="ps-stage-col">
              {/* Mode-specific Prompt Bar */}
              <div className="ps-prompt-bar">
                {g.mode === "classic" && currentPose && <PoseFigure pose={currentPose} variant="mini" />}
                {g.mode === "copycat" && g.currentTurn.role === "copy" && leaderSnap?.url && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={leaderSnap.url} alt="Leader pose" className="ps-thumb-mini" />
                )}
                {(g.mode === "secret" || g.mode === "telephone" || (g.mode === "copycat" && g.currentTurn.role === "lead")) && (
                  <span className="ps-stepicon">{modeMeta.emoji}</span>
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  {g.mode === "classic" && currentPose && (
                    <>
                      <b>Your turn! {currentPose.name}</b>
                      <small>{currentPose.cue}</small>
                    </>
                  )}
                  {g.mode === "copycat" && g.currentTurn.role === "lead" && (
                    <>
                      <b>Invent ANY pose!</b>
                      <small>Strike something funny or tricky — your partner has to mirror it!</small>
                    </>
                  )}
                  {g.mode === "copycat" && g.currentTurn.role === "copy" && (
                    <>
                      <b>Mirror {leaderName}&apos;s pose!</b>
                      <small>Match their exact silhouette on camera.</small>
                    </>
                  )}
                  {g.mode === "secret" && (
                    <>
                      <b>Secret: &ldquo;{g.visiblePrompt}&rdquo;</b>
                      <small>Act it out in 1 frozen photo — no words!</small>
                    </>
                  )}
                  {g.mode === "telephone" && (
                    <>
                      <b>Pose: &ldquo;{g.visiblePrompt}&rdquo;</b>
                      <small>Only your skeleton gets passed to the next player!</small>
                    </>
                  )}
                </div>
                <button type="button" className="ps-skip-btn" disabled={busy} onClick={handleSkip}>
                  Skip
                </button>
              </div>

              {g.hype.length > 0 && (
                <div className="ps-hype-bar" aria-live="polite">
                  {g.hype.slice(-5).map((h, i) => (
                    <span key={`${h.at}-${i}`} className="ps-hype-bubble">{h.emoji}</span>
                  ))}
                </div>
              )}

              <CameraStage
                pose={currentPose}
                targetJoints={g.mode === "copycat" && g.currentTurn.role === "copy" ? g.leaderJoints : null}
                turnKey={`${g.round}-${g.turnIndex}-${g.chainStep}-${g.currentTurn.playerId}`}
                busy={busy}
                secsLeft={secsLeft}
                onCapture={handleCapture}
              />
            </section>
          ) : (
            <section className="ps-wait-card">
              <span className="ps-kicker">WATCHING {activeName.toUpperCase()} POSE</span>
              {g.mode === "classic" && currentPose ? (
                <>
                  <div className="ps-target-big"><PoseFigure pose={currentPose} variant="card" /></div>
                  <h2 className="display" style={{ margin: 0, fontSize: 24 }}>{currentPose.emoji} {currentPose.name}</h2>
                  <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: "var(--muted)", textAlign: "center" }}>
                    {currentPose.cue}
                  </p>
                </>
              ) : g.mode === "copycat" && g.currentTurn.role === "copy" && leaderSnap?.url ? (
                <>
                  <div className="ps-polaroid" style={{ width: 170 }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={leaderSnap.url} alt="Leader pose" />
                  </div>
                  <h2 className="display" style={{ margin: 0, fontSize: 22 }}>
                    {activeName} is mirroring {leaderName}!
                  </h2>
                </>
              ) : (
                <>
                  <span style={{ fontSize: 64 }}>{modeMeta.emoji}</span>
                  <h2 className="display" style={{ margin: 0, fontSize: 22 }}>
                    {g.mode === "copycat"
                      ? `${activeName} is inventing a pose…`
                      : g.mode === "secret"
                        ? `${activeName} is acting out a secret prompt…`
                        : `${activeName} is striking a secret pose…`}
                  </h2>
                  <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: "var(--muted)", textAlign: "center" }}>
                    Get ready — your turn is up next!
                  </p>
                </>
              )}

              <div className="ps-hype-box">
                <span className="label" style={{ textAlign: "center" }}>Send live hype to {activeName}!</span>
                <div className="ps-emoji-row">
                  {HYPE_EMOJIS.map((em) => (
                    <button key={em} type="button" className="ps-emoji-btn" onClick={() => handleReact(em)}>
                      {em}
                    </button>
                  ))}
                </div>
              </div>
            </section>
          )}
        </>
      )}

      {/* PHASE 2: GUESSING (Secret Prompt & Pose Telephone) */}
      {!countingDown && g.phase === "guessing" && g.mode === "secret" && (
        <section className="ps-reveal-col">
          <div className="ps-polaroid" style={{ maxWidth: 300, width: "100%", margin: "0 auto" }}>
            {currentSnap?.url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={currentSnap.url} alt={`${activeName} acting secret prompt`} />
            ) : (
              <div className="ps-polaroid-empty">Loading photo…</div>
            )}
            <div className="ps-polaroid-foot">
              <span>🕵️ {activeName}&apos;s clue</span>
              <b>{isMyTurn ? `"${g.visiblePrompt}"` : "What is it?"}</b>
            </div>
          </div>

          {!isMyTurn && g.isPlayer && (
            <form onSubmit={handleGuessSubmit} className="ps-guess-form">
              <input
                className="input"
                placeholder="Type what they're acting out…"
                value={guessText}
                maxLength={60}
                onChange={(e) => setGuessText(e.target.value)}
                autoFocus
              />
              <button className="btn btn-green btn-sm" disabled={busy || !guessText.trim()}>
                Guess
              </button>
            </form>
          )}

          {g.guesses.length > 0 && (
            <div className="ps-guess-list">
              <span className="label">Guesses</span>
              {g.guesses.map((gs, idx) => (
                <div key={`${gs.at}-${idx}`} className="ps-guess-item">
                  <span>
                    <b>{g.names[gs.by] ?? "Player"}:</b> {gs.text}
                  </span>
                  {isMyTurn && (
                    <button
                      type="button"
                      className="ps-accept-btn"
                      disabled={busy}
                      onClick={() => handleAcceptGuess(gs.by)}
                    >
                      ✅ Close enough!
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          {(isMyTurn || room.isHost) && (
            <button type="button" className="btn btn-white" disabled={busy} onClick={handleReveal}>
              Reveal Answer
            </button>
          )}
        </section>
      )}

      {!countingDown && g.phase === "guessing" && g.mode === "telephone" && (
        <section className="ps-wait-card">
          {isMyTurn ? (
            <>
              <span className="ps-kicker">DECODE THE SKELETON · STEP {g.chainStep + 1}/{TELEPHONE_STEPS}</span>
              {g.telephoneGuessTarget?.joints ? (
                <div className="ps-skeleton-mystery">
                  <PoseFigure joints={g.telephoneGuessTarget.joints} accent="#FF5B8A" variant="card" />
                </div>
              ) : g.telephoneGuessTarget?.fallbackSnapKey && g.snaps[g.telephoneGuessTarget.fallbackSnapKey]?.url ? (
                <div className="ps-polaroid" style={{ width: 190 }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={g.snaps[g.telephoneGuessTarget.fallbackSnapKey].url!}
                    alt="Blurred pose clue"
                    style={{ filter: "blur(9px) contrast(1.4)" }}
                  />
                </div>
              ) : (
                <span style={{ fontSize: 54 }}>🦴</span>
              )}
              <h2 className="display" style={{ margin: 0, fontSize: 22 }}>What pose is this?</h2>
              <p style={{ margin: 0, fontSize: 13.5, fontWeight: 700, color: "var(--muted)", textAlign: "center" }}>
                Your guess becomes the next player&apos;s prompt!
              </p>
              <form onSubmit={handleGuessSubmit} className="ps-guess-form" style={{ width: "100%" }}>
                <input
                  className="input"
                  placeholder="e.g. Dodging a bee…"
                  value={guessText}
                  maxLength={60}
                  onChange={(e) => setGuessText(e.target.value)}
                  autoFocus
                />
                <button className="btn btn-green btn-sm" disabled={busy || !guessText.trim()}>
                  Pass it on
                </button>
              </form>
            </>
          ) : (
            <>
              <span className="ps-kicker">POSE TELEPHONE · STEP {g.chainStep + 1}/{TELEPHONE_STEPS}</span>
              <span style={{ fontSize: 60 }}>🦴</span>
              <h2 className="display" style={{ margin: 0, fontSize: 22 }}>
                {activeName} is decoding the skeleton…
              </h2>
              <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: "var(--muted)", textAlign: "center" }}>
                They can only see the stick-figure joints — no photo!
              </p>
            </>
          )}
        </section>
      )}

      {/* PHASE 3: REVEAL (Classic, Copycat, Secret Prompt) */}
      {!countingDown && g.phase === "reveal" && (
        <section className="ps-reveal-col">
          {g.mode === "secret" ? (
            <div className="ps-collage-card">
              <div style={{ textAlign: "center" }}>
                <span className="ps-kicker" style={{ background: "var(--cherry-soft)", color: "var(--cherry-edge)" }}>
                  {g.solvedBy ? `🎉 ${g.names[g.solvedBy]} NAILED IT!` : "TIME'S UP — ANSWER REVEALED!"}
                </span>
                <h2 className="display" style={{ margin: "6px 0 0", fontSize: 26 }}>
                  &ldquo;{g.visiblePrompt}&rdquo;
                </h2>
              </div>
              {currentSnap?.url && (
                <div className="ps-polaroid" style={{ maxWidth: 260, width: "100%", margin: "0 auto" }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={currentSnap.url} alt={`${activeName} secret pose`} />
                  <div className="ps-polaroid-foot">
                    <span>Acted by {activeName}</span>
                    <b>{g.solvedBy ? "+95 pts" : "+45 pts"}</b>
                  </div>
                </div>
              )}
              <button type="button" className="btn btn-green" disabled={busy} onClick={handleNext}>
                {g.round + 1 < g.rounds ? `Next round (${g.round + 2}/${g.rounds}) →` : "Finish & view strip 🏆"}
              </button>
            </div>
          ) : (
            <>
              <div className="ps-reveal-grid">
                <div className="ps-polaroid target">
                  {g.mode === "copycat" && leaderSnap?.url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={leaderSnap.url} alt="Leader pose" />
                  ) : (
                    <div className="ps-polaroid-art">
                      <PoseFigure pose={currentPose} joints={g.leaderJoints} variant="card" />
                    </div>
                  )}
                  <div className="ps-polaroid-foot">
                    <span>{g.mode === "copycat" ? `🪞 ${leaderName}` : "Target"}</span>
                    <b>{currentPose?.emoji ?? "✨"}</b>
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

              {!g.currentTurn.skipped && (
                <div className="ps-emoji-row">
                  {HYPE_EMOJIS.map((em) => (
                    <button key={em} type="button" className="ps-emoji-btn" onClick={() => handleReact(em)}>
                      {em}
                    </button>
                  ))}
                </div>
              )}

              <button type="button" className="btn btn-green" disabled={busy} onClick={handleNext}>
                {g.turnIndex + 1 < g.players.length - g.out.length
                  ? "Next player →"
                  : g.players.length >= 2
                    ? "See side-by-side collage ✨"
                    : g.round + 1 < g.rounds
                      ? "Next pose →"
                      : "Finish & view strip 🏆"}
              </button>
            </>
          )}
        </section>
      )}

      {/* PHASE 4: ROUND SUMMARY COLLAGE (Classic & Copycat) */}
      {!countingDown && g.phase === "roundSummary" && latestSummary && (
        <section className="ps-collage-card rise">
          <div className="ps-collage-head">
            {summaryPose ? (
              <PoseFigure pose={summaryPose} variant="mini" />
            ) : (
              <span className="ps-stepicon">🪞</span>
            )}
            <div style={{ flex: 1 }}>
              <b>
                Round #{latestSummary.round + 1}:{" "}
                {summaryPose ? summaryPose.name : `${g.names[latestSummary.leaderId ?? ""] ?? "Leader"}'s Pose`}
              </b>
              <small>{g.mode === "copycat" ? "Original vs. Copycat!" : "Who matched it best?"}</small>
            </div>
          </div>

          <div
            className="ps-collage-grid"
            style={{ gridTemplateColumns: `repeat(${Math.min(2, latestSummary.results.length)}, 1fr)` }}
          >
            {latestSummary.results.map((r) => {
              const snap = g.snaps[`${latestSummary.round}:${r.playerId}`];
              const maxScore = Math.max(...latestSummary.results.map((x) => x.totalScore));
              const best = r.totalScore === maxScore && maxScore > 0 && r.role !== "lead";
              return (
                <div key={r.playerId} className={`ps-polaroid ${best ? "winner" : ""}`}>
                  {snap?.url && !r.skipped ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={snap.url} alt={`${g.names[r.playerId]} pose`} />
                  ) : (
                    <div className="ps-polaroid-empty">Skipped 😅</div>
                  )}
                  {r.role === "lead" && <span className="ps-ai-badge">🪞 Original</span>}
                  {best && <span className="ps-best-badge">👑 Best!</span>}
                  <div className="ps-polaroid-foot">
                    <span>{g.names[r.playerId]}</span>
                    <b>+{r.totalScore}</b>
                  </div>
                </div>
              );
            })}
          </div>

          <button type="button" className="btn btn-green" disabled={busy} onClick={handleNext}>
            {g.round + 1 < g.rounds ? `Next round (${g.round + 2}/${g.rounds}) →` : "See final photobooth strip 🏆"}
          </button>
        </section>
      )}

      {/* PHASE 5: TELEPHONE CHAIN REVEAL */}
      {!countingDown && g.phase === "chainReveal" && (
        <section className="ps-collage-card rise">
          <div className="ps-collage-head">
            <span className="ps-stepicon">🎭</span>
            <div style={{ flex: 1 }}>
              <b>Telephone Reveal!</b>
              <small>Started as: &ldquo;{g.visiblePrompt}&rdquo;</small>
            </div>
          </div>

          <TelephoneTimeline chain={g.chain} names={g.names} snaps={g.snaps} />

          <button type="button" className="btn btn-green" disabled={busy} onClick={handleNext}>
            {g.round + 1 < g.rounds ? `Next chain (${g.round + 2}/${g.rounds}) →` : "Finish & view strip 🏆"}
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

function TelephoneTimeline({
  chain,
  names,
  snaps,
}: {
  chain: {
    step: number;
    kind: "pose" | "guess";
    playerId: string;
    prompt?: string;
    guess?: string;
    snapKey?: string;
    joints?: PoseJoints;
    skipped?: boolean;
  }[];
  names: Record<string, string>;
  snaps: Record<string, { url: string | null }>;
}) {
  return (
    <div className="ps-chain-list">
      {chain.map((item) => {
        const who = names[item.playerId] ?? "Player";
        if (item.kind === "guess") {
          return (
            <div key={item.step} className="ps-chain-guess">
              <span className="ps-chain-tag">💬 {who} guessed</span>
              <b>&ldquo;{item.guess ?? "???"}&rdquo;</b>
            </div>
          );
        }
        const snap = item.snapKey ? snaps[item.snapKey] : undefined;
        return (
          <div key={item.step} className="ps-chain-pose">
            <div className="ps-chain-pose-head">
              <span className="ps-chain-tag">📸 {who} posed</span>
              <small>&ldquo;{item.prompt}&rdquo;</small>
            </div>
            <div className="ps-chain-pair">
              <div className="ps-polaroid mini">
                {snap?.url && !item.skipped ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={snap.url} alt={`${who} telephone pose`} />
                ) : (
                  <div className="ps-polaroid-empty">Skipped</div>
                )}
              </div>
              <div className="ps-polaroid mini">
                <div className="ps-polaroid-art">
                  {item.joints ? (
                    <PoseFigure joints={item.joints} accent="#FF5B8A" variant="card" />
                  ) : (
                    <span style={{ fontSize: 13, fontWeight: 800, color: "var(--muted)" }}>No skeleton</span>
                  )}
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
