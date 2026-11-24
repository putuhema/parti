"use client";

import { useMutation } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { SPLIT_BY_ID, SPLIT_MAX, SPLIT_ROUNDS } from "../../../convex/lib/split/rules";
import { InviteFriends } from "@/components/InviteFriends";
import { Avatar, Icon, roomPaints } from "@/components/ui";
import { errorText } from "@/lib/errors";
import { feedback } from "@/lib/feedback";
import { SplitCamera } from "./SplitCamera";

export type SplitView = NonNullable<FunctionReturnType<typeof api.split.view>>;
const REACTS = ["💞", "😍", "😂", "🔥", "🫶", "✨"] as const;

export function SplitLobby({ room }: { room: SplitView }) {
  const router = useRouter();
  const start = useMutation(api.split.start);
  const settings = useMutation(api.split.settings);
  const leave = useMutation(api.split.leave);
  const [copied, setCopied] = useState(false);
  const [starting, setStarting] = useState(false);
  const paints = roomPaints(room.members);

  async function share() {
    feedback.tap();
    const url = `${location.origin}/split/room/${room.code}`;
    try {
      if (navigator.share) await navigator.share({ title: "pums party", text: `Take stitched couple photos with me in Split Photobooth! Code ${room.code}`, url });
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
        <button className="icon-btn" onClick={async () => { await leave({ code: room.code }).catch(() => {}); router.push("/split"); }}>
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

      <section className="rise sp-hero">
        <span className="ps-kicker">2-PLAYER LDR CO-OP PHOTOBOOTH</span>
        <h1 className="display" style={{ margin: 0, fontSize: 30 }}>Split Photobooth</h1>
        <p style={{ margin: 0, fontSize: 14, fontWeight: 700, opacity: 0.92 }}>
          Snap the left half, line up the right half against your partner&apos;s photo, and stitch them seamlessly together!
        </p>
      </section>

      <section style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <span className="label">Photos in strip</span>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
          {SPLIT_ROUNDS.map((r) => (
            <button key={r} type="button" className="seg" aria-pressed={room.rounds === r} disabled={!room.isHost} style={{ minHeight: 46 }} onClick={() => void settings({ code: room.code, rounds: r })}>
              {r} photos
            </button>
          ))}
        </div>
      </section>

      <section style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <span className="label">Couple ({room.members.length}/{SPLIT_MAX})</span>
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

      <InviteFriends kind="split" code={room.code} />
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
          {starting ? "Opening photobooth…" : room.members.length === 1 ? "Test solo (both halves)" : "Start couple photobooth 💞"}
        </button>
      ) : (
        <p style={{ margin: 0, textAlign: "center", fontWeight: 800, color: "var(--muted)" }}>Waiting for host…</p>
      )}
    </main>
  );
}

export function SplitPlay({ room }: { room: SplitView }) {
  const router = useRouter();
  const genUpload = useMutation(api.split.generateUploadUrl);
  const snapMut = useMutation(api.split.snap);
  const reactMut = useMutation(api.split.react);
  const nextMut = useMutation(api.split.next);
  const rematchMut = useMutation(api.split.rematch);
  const leaveMut = useMutation(api.split.leave);

  const [busy, setBusy] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState("");
  const g = room.game!;
  const prompt = SPLIT_BY_ID[g.promptIds[g.round]];

  async function onCapture(blob: Blob) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const url = await genUpload({ code: room.code });
      const res = await fetch(url, { method: "POST", headers: { "Content-Type": blob.type || "image/jpeg" }, body: blob });
      const { storageId } = (await res.json()) as { storageId: Id<"_storage"> };
      await snapMut({ code: room.code, storageId });
      feedback.correct();
    } catch (e) {
      setError(errorText(e, "Upload failed"));
    } finally {
      setBusy(false);
    }
  }

  async function downloadStrip() {
    if (downloading) return;
    setDownloading(true);
    try {
      const halfW = 300;
      const halfH = 450;
      const pad = 28;
      const headerH = 84;
      const captionH = 44;
      const gap = 22;
      const width = pad * 2 + halfW * 2;
      const height = headerH + g.history.length * (halfH + captionH + gap) + pad;
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      ctx.fillStyle = "#FFF8F2";
      ctx.fillRect(0, 0, width, height);
      ctx.fillStyle = "#34283E";
      ctx.font = "900 28px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("💞 Split-Screen Photobooth", width / 2, 44);
      ctx.fillStyle = "#D63366";
      ctx.font = "800 15px system-ui, sans-serif";
      ctx.fillText(`${g.players.map((p) => g.names[p]).join(" & ")} · pums party`, width / 2, 70);

      const load = (u: string) =>
        new Promise<HTMLImageElement | null>((resolve) => {
          const im = new Image();
          im.crossOrigin = "anonymous";
          im.onload = () => resolve(im);
          im.onerror = () => resolve(null);
          im.src = u;
        });

      let y = headerH;
      for (const h of g.history) {
        const pr = SPLIT_BY_ID[h.promptId];
        const lUrl = g.snaps[`${h.round}:left`];
        const rUrl = g.snaps[`${h.round}:right`];
        const [li, ri] = await Promise.all([lUrl ? load(lUrl) : null, rUrl ? load(rUrl) : null]);

        ctx.fillStyle = "#FFFFFF";
        ctx.strokeStyle = "#EADFD0";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.roundRect(pad - 8, y - 8, halfW * 2 + 16, halfH + captionH + 8, 18);
        ctx.fill();
        ctx.stroke();

        ctx.save();
        ctx.beginPath();
        ctx.roundRect(pad, y, halfW * 2, halfH, 12);
        ctx.clip();
        if (li) ctx.drawImage(li, pad, y, halfW, halfH);
        if (ri) ctx.drawImage(ri, pad + halfW, y, halfW, halfH);
        ctx.restore();

        ctx.fillStyle = "#34283E";
        ctx.font = "900 17px system-ui, sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(`${pr?.emoji ?? "💞"} ${pr?.title ?? ""}`, width / 2, y + halfH + 28);
        y += halfH + captionH + gap;
      }

      const a = document.createElement("a");
      a.href = canvas.toDataURL("image/png");
      a.download = `split-photobooth-${room.code.toLowerCase()}.png`;
      a.click();
      feedback.correct();
    } finally {
      setDownloading(false);
    }
  }

  if (g.done) {
    return (
      <main className="screen tight">
        <header className="topbar">
          <button className="icon-btn" onClick={async () => { await leaveMut({ code: room.code }).catch(() => {}); router.push("/split"); }}>
            <Icon.Close />
          </button>
          <span style={{ flex: 1, fontWeight: 900, fontSize: 18 }}>Your Couple Strip</span>
        </header>

        <section className="rise sp-hero">
          <span className="ps-kicker">STITCHED ACROSS THE MILES</span>
          <h1 className="display" style={{ margin: 0, fontSize: 30 }}>{g.history.length} Couple Photos 💞</h1>
        </section>

        <button type="button" className="btn btn-sun" disabled={downloading} onClick={downloadStrip}>
          {downloading ? "Stitching strip…" : "📸 Save Couple Photobooth Strip"}
        </button>

        <section style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {g.history.map((h) => {
            const pr = SPLIT_BY_ID[h.promptId];
            return (
              <div key={h.round} className="ps-collage-card">
                <div className="sp-stitched">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {g.snaps[`${h.round}:left`] && <img src={g.snaps[`${h.round}:left`]!} alt="Left half" />}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {g.snaps[`${h.round}:right`] && <img src={g.snaps[`${h.round}:right`]!} alt="Right half" />}
                </div>
                <div className="ps-polaroid-foot">
                  <span>{pr?.emoji} {pr?.title}</span>
                  <b style={{ color: "var(--muted)", fontSize: 12.5 }}>{g.names[h.leftPlayerId]} &amp; {g.names[h.rightPlayerId]}</b>
                </div>
              </div>
            );
          })}
        </section>

        {room.isHost && <button className="btn btn-green" onClick={() => void rematchMut({ code: room.code })}>Shoot another strip</button>}
        <button className="btn btn-white" onClick={async () => { await leaveMut({ code: room.code }).catch(() => {}); router.push("/split"); }}>Back home</button>
      </main>
    );
  }

  const activePlayerId = g.phase === "left" ? g.leftPlayerId : g.rightPlayerId;
  const isMyTurn = activePlayerId === room.meId;
  const leftUrl = g.snaps[`${g.round}:left`];
  const rightUrl = g.snaps[`${g.round}:right`];

  return (
    <main className="screen tight">
      <header className="topbar">
        <button className="icon-btn" onClick={async () => { await leaveMut({ code: room.code }).catch(() => {}); router.push("/split"); }}>
          <Icon.Close />
        </button>
        <div style={{ flex: 1 }}>
          <span className="label" style={{ fontSize: 11.5 }}>Photo {g.round + 1} of {g.rounds}</span>
          <div style={{ fontSize: 17, fontWeight: 900 }}>{prompt?.emoji} {prompt?.title}</div>
        </div>
        <span className="pill" style={{ background: "var(--cherry-soft)", color: "var(--cherry-edge)" }}>
          {g.phase === "left" ? "Left Half" : g.phase === "right" ? "Right Half" : "Stitched!"}
        </span>
      </header>

      {(g.phase === "left" || g.phase === "right") && prompt && (
        isMyTurn ? (
          <section className="ps-stage-col">
            <div className="ps-prompt-bar">
              <span className="ps-stepicon">{prompt.emoji}</span>
              <div style={{ flex: 1 }}>
                <b>Your turn ({g.phase === "left" ? "Left Half" : "Right Half"})</b>
                <small>{g.phase === "left" ? prompt.leftCue : prompt.rightCue}</small>
              </div>
            </div>
            <SplitCamera side={g.phase} leftPhotoUrl={leftUrl} busy={busy} onCapture={onCapture} />
          </section>
        ) : (
          <section className="ps-wait-card">
            <span className="ps-kicker">WAITING FOR {g.names[activePlayerId]?.toUpperCase()}</span>
            <span style={{ fontSize: 64 }}>{prompt.emoji}</span>
            <h2 className="display" style={{ margin: 0, fontSize: 24 }}>{prompt.title}</h2>
            <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: "var(--muted)", textAlign: "center" }}>
              {g.names[activePlayerId]} is snapping the {g.phase} half… get ready to line yours up!
            </p>
          </section>
        )
      )}

      {g.phase === "reveal" && prompt && (
        <section className="ps-collage-card rise">
          <div className="sp-stitched">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {leftUrl && <img src={leftUrl} alt="Left half" />}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {rightUrl && <img src={rightUrl} alt="Right half" />}
            {g.reactions.length > 0 && (
              <div className="ps-stamp-row">
                {g.reactions.slice(-6).map((r, i) => <span key={`${r.at}-${i}`} className="ps-stamp">{r.emoji}</span>)}
              </div>
            )}
          </div>
          <div className="ps-polaroid-foot">
            <span>{prompt.emoji} {prompt.title}</span>
            <b>{g.names[g.leftPlayerId]} &amp; {g.names[g.rightPlayerId]}</b>
          </div>

          <div className="ps-emoji-row">
            {REACTS.map((em) => (
              <button key={em} type="button" className="ps-emoji-btn" onClick={() => void reactMut({ code: room.code, emoji: em })}>{em}</button>
            ))}
          </div>

          <button type="button" className="btn btn-green" onClick={() => void nextMut({ code: room.code })}>
            {g.round + 1 < g.rounds ? "Next stitched photo →" : "Finish & save strip 💞"}
          </button>
        </section>
      )}

      {error && <p role="alert" style={{ margin: 0, color: "var(--cherry-edge)", fontWeight: 800, textAlign: "center" }}>{error}</p>}
    </main>
  );
}
