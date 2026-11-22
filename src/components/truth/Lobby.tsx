"use client";

import { useMutation } from "convex/react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "../../../convex/_generated/api";
import { ROUND_CHOICES, THEMES } from "../../../convex/lib/truth/rules";
import { Avatar, Icon, roomPaints } from "@/components/ui";
import { InviteFriends } from "@/components/InviteFriends";
import { errorText } from "@/lib/errors";
import { feedback } from "@/lib/feedback";
import { useNow } from "@/lib/hooks";
import { GAME_NAME, RULE, Vault, type TruthView } from "./common";

export function TruthLobby({ room }: { room: TruthView }) {
  const router = useRouter();
  const start = useMutation(api.truth.start);
  const settings = useMutation(api.truth.settings);
  const leave = useMutation(api.truth.leave);
  const now = useNow(5000);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [starting, setStarting] = useState(false);
  const [vault, setVault] = useState(false);
  const host = room.isHost;
  const paints = roomPaints(room.members);
  const two = room.members.length === 2;
  const partner = room.members.find((m) => !m.isMe);

  function change(next: Partial<{ themes: string[]; rounds: number }>) {
    feedback.tap();
    setError("");
    void settings({ code: room.code, themes: room.themes, rounds: room.rounds, ...next }).catch((e) => setError(errorText(e)));
  }

  async function share() {
    feedback.tap();
    const url = `${location.origin}/truth/room/${room.code}`;
    const text = `Can you spot my lie? Play ${GAME_NAME} with me on pums party! Code ${room.code}`;
    try {
      if (navigator.share) await navigator.share({ title: "pums party", text, url });
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
      await start({ code: room.code });
    } catch (e) {
      setError(errorText(e));
      setStarting(false);
    }
  }

  const mix = room.themes.length === 0;
  return (
    <main className="screen tight">
      <header className="topbar">
        <button className="icon-btn" aria-label="Leave room" onClick={async () => { await leave({ code: room.code }).catch(() => {}); router.push("/truth"); }}><Icon.Close /></button>
        <span style={{ display: "flex", flexDirection: "column", flex: 1 }}>
          <span className="label" style={{ fontSize: 12 }}>Room code</span>
          <span style={{ fontSize: 22, fontWeight: 900, letterSpacing: ".14em" }}>{room.code}</span>
        </span>
        <button className="icon-btn" style={{ border: "2px solid var(--line)", boxShadow: "0 3px 0 var(--line)" }} aria-label={copied ? "Link copied" : "Share invite link"} onClick={share}><Icon.Share size={18} /></button>
      </header>

      <section className="rise tl-lobbycard">
        <span style={{ fontSize: 12, fontWeight: 900, letterSpacing: ".06em", color: "#7A3FB5" }}>FOR TWO · BEST ON A CALL</span>
        <span className="display" style={{ fontSize: 26 }}>{GAME_NAME}</span>
        <span style={{ fontSize: 15, fontWeight: 700, lineHeight: 1.4, color: "var(--plum)" }}>{RULE}</span>
      </section>

      {two && (
        <button type="button" className="tl-vaultbtn" onClick={() => { feedback.tap(); setVault(true); }}>
          <span>🔐</span>
          <span style={{ flex: 1 }}><b>The Vault</b><small>{room.vault.length ? `${room.vault.length} truths you know about each other` : "Truths you reveal get saved here"}</small></span>
          <Icon.Chevron />
        </button>
      )}

      <section style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <span className="label">Themes {mix && "· a mix of everything"}</span>
        <div className="tl-themes">
          {THEMES.map((t) => {
            const on = room.themes.includes(t.id);
            return (
              <button key={t.id} type="button" className="tl-themebtn" aria-pressed={on} disabled={!host}
                onClick={() => change({ themes: on ? room.themes.filter((x) => x !== t.id) : [...room.themes, t.id] })}>
                <span>{t.icon}</span>{t.name}
              </button>
            );
          })}
        </div>
      </section>

      <section style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <span className="label">Rounds</span>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 8 }}>
          {ROUND_CHOICES.map((n, k) => (
            <button key={n} className="seg" aria-pressed={room.rounds === n} disabled={!host} style={{ minHeight: 50, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 1 }} onClick={() => change({ rounds: n })}>
              <span>{["Quick", "Classic", "Long chat"][k]}</span>
              <span style={{ fontSize: 12, opacity: 0.75 }}>{n} rounds</span>
            </button>
          ))}
        </div>
      </section>

      <section style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <span className="label">The two of you</span>
        <div className="list">
          {room.members.map((m) => (
            <div key={m.id} className={`list-row${m.isMe ? " me" : ""}`}>
              <Avatar name={m.name} paint={paints.get(m.id)} size={36} style={{ opacity: now - m.lastSeen < 30_000 ? 1 : 0.4 }} />
              <span style={{ flex: 1, fontSize: 17, fontWeight: 900 }}>{m.isMe ? `${m.name} (you)` : m.name}</span>
              {m.isHost && <span className="chip chip-sun">HOST</span>}
            </div>
          ))}
          {!two && (
            <div className="list-row">
              <span className="avatar" aria-hidden="true" style={{ width: 36, height: 36, background: "var(--cream-2)", boxShadow: "0 3px 0 var(--cream-3)", fontSize: 18 }}>🤥</span>
              <span className="wait" style={{ flex: 1, fontSize: 16, fontWeight: 800, color: "var(--muted)" }}>Waiting for your person…</span>
            </div>
          )}
        </div>
      </section>

      {!two && <InviteFriends kind="truth" code={room.code} />}
      <div className="grow" />
      {error && <p role="alert" style={{ margin: 0, color: "var(--cherry-edge)", fontWeight: 800, textAlign: "center" }}>{error}</p>}
      {host ? (
        <button className="btn btn-green" onClick={go} disabled={starting || !two}>{two ? `Start with ${partner?.name}` : "Invite someone to start"}</button>
      ) : (
        <p className="wait" style={{ margin: 0, textAlign: "center", fontSize: 17, fontWeight: 900, color: "var(--muted)", minHeight: 54, display: "flex", alignItems: "center", justifyContent: "center" }}>Waiting for the host to start</p>
      )}
      {host && !two && <button className="btn btn-white btn-sm" style={{ alignSelf: "center" }} onClick={share}><Icon.Share /> {copied ? "Link copied!" : "Share link"}</button>}
      <Vault open={vault} onClose={() => setVault(false)} vault={room.vault} members={room.members} meId={room.meId} />
    </main>
  );
}
