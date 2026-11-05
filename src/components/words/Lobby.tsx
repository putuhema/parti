"use client";

import { useMutation } from "convex/react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "../../../convex/_generated/api";
import { Avatar, Icon, roomPaints } from "@/components/ui";
import { errorText } from "@/lib/errors";
import { feedback } from "@/lib/feedback";
import { useIdentity } from "@/lib/identity";
import { ModeChip, WORD_MODES, wordMode, type WMode, type WordsView } from "./common";

export function WordsLobby({ room }: { room: WordsView }) {
  const { token } = useIdentity();
  const router = useRouter();
  const settings = useMutation(api.words.settings);
  const start = useMutation(api.words.start);
  const leave = useMutation(api.words.leave);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [starting, setStarting] = useState(false);
  const host = room.isHost;
  const mode = wordMode(room.mode);
  const paints = roomPaints(room.members);
  const ready = room.members.length >= 2;

  const set = (patch: { mode?: WMode; lang?: "en" | "id" | "mix" }) => {
    if (!host) return;
    feedback.tap();
    void settings({ token, code: room.code, ...patch }).catch((e) => setError(errorText(e)));
  };

  async function share() {
    feedback.tap();
    const url = `${location.origin}/words/room/${room.code}`;
    const text = `Play ${mode.en[0]} with me on Parti! Code ${room.code}`;
    try {
      if (navigator.share) await navigator.share({ title: "Parti", text, url });
      else {
        await navigator.clipboard.writeText(`${text} ${url}`);
        setCopied(true);
        setTimeout(() => setCopied(false), 1800);
      }
    } catch {}
  }

  async function go() {
    feedback.unlock();
    setStarting(true);
    setError("");
    try {
      await start({ token, code: room.code });
    } catch (e) {
      setError(errorText(e));
      setStarting(false);
    }
  }

  return (
    <main className="screen tight">
      <header className="topbar">
        <button className="icon-btn" aria-label="Leave room" onClick={async () => { await leave({ token, code: room.code }).catch(() => {}); router.push("/words"); }}><Icon.Close /></button>
        <span style={{ display: "flex", flexDirection: "column", flex: 1 }}>
          <span className="label" style={{ fontSize: 12 }}>Room code</span>
          <span style={{ fontSize: 22, fontWeight: 900, letterSpacing: ".14em" }}>{room.code}</span>
        </span>
        <span style={{ display: "flex", alignItems: "center" }} aria-label={`In the room: ${room.members.map((m) => m.name).join(", ")}`}>
          {room.members.map((m, i) => <Avatar key={m.id} name={m.name} paint={paints.get(m.id)!} size={36} style={{ border: "2px solid #fff", boxShadow: "none", marginLeft: i ? -10 : 0, opacity: m.online ? 1 : 0.4 }} />)}
        </span>
        <button className="icon-btn" style={{ border: "2px solid var(--line)", boxShadow: "0 3px 0 var(--line)" }} aria-label={copied ? "Link copied" : "Share invite link"} onClick={share}><Icon.Share size={18} /></button>
      </header>

      <h1 style={{ margin: 0, fontSize: 24, fontWeight: 900 }}>{host ? "Pick a word game" : `${room.members.find((m) => m.isHost)?.name ?? "Host"} is picking`}</h1>

      <div className="mode-grid" role="radiogroup" aria-label="Word game">
        {WORD_MODES.map((m) => {
          const on = m.id === room.mode;
          return (
            <button key={m.id} className="mode-tile" role="radio" aria-checked={on} disabled={!host} onClick={() => set({ mode: m.id })} style={{ minHeight: 52, ...(on ? { background: m.soft, borderColor: m.edge, boxShadow: `0 4px 0 ${m.edge}` } : {}) }}>
              <ModeChip mode={m} size={30} />
              <span className="nm" style={{ fontSize: 14 }}>{m.en[0]}</span>
            </button>
          );
        })}
      </div>

      <section className="rise" key={room.mode} style={{ borderRadius: 18, background: mode.soft, padding: "12px 14px", display: "flex", flexDirection: "column", gap: 4 }} aria-live="polite">
        <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 18, fontWeight: 900 }}>{mode.en[0]}</span>
          <span style={{ fontSize: 12, fontWeight: 900, letterSpacing: ".06em", color: mode.ink }}>{mode.coop ? "CO-OP" : mode.id === "scramble" ? "2–4 PLAYERS" : "1 VS 1"}</span>
        </span>
        <span style={{ fontSize: 15, fontWeight: 700, lineHeight: 1.4, color: mode.ink }}>{mode.rule}</span>
      </section>

      <section style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <span className="label">Words in</span>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 8 }}>
          {([["en", "English"], ["id", "Indonesia"], ["mix", "Both"]] as const).map(([l, label]) => (
            <button key={l} className="seg" aria-pressed={room.lang === l} disabled={!host} onClick={() => set({ lang: l })}>{label}</button>
          ))}
        </div>
      </section>

      <div className="grow" />
      {error && <p role="alert" style={{ margin: 0, color: "var(--cherry-edge)", fontWeight: 800, textAlign: "center" }}>{error}</p>}
      {host ? (
        <button className="btn btn-green" onClick={go} disabled={!ready || starting}>{ready ? `Start ${mode.en[0]}` : "Waiting for a friend…"}</button>
      ) : (
        <p className="wait" style={{ margin: 0, textAlign: "center", fontSize: 17, fontWeight: 900, color: "var(--muted)", minHeight: 54, display: "flex", alignItems: "center", justifyContent: "center" }}>Waiting for the host to start</p>
      )}
      {!ready && host && <button className="btn btn-white btn-sm" style={{ alignSelf: "center" }} onClick={share}><Icon.Share /> {copied ? "Link copied!" : "Invite a friend"}</button>}
    </main>
  );
}
