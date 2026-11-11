"use client";

import { useMutation } from "convex/react";
import Link from "next/link";
import { useState } from "react";
import { api } from "../../../convex/_generated/api";
import { ShellPage } from "@/components/shell";
import { Avatar, Icon, ME, Sheet } from "@/components/ui";
import { errorText } from "@/lib/errors";
import { feedback } from "@/lib/feedback";
import { authClient } from "@/lib/auth-client";
import { useIdentity } from "@/lib/identity";

export default function MePage() {
  const { me } = useIdentity();
  const rename = useMutation(api.players.rename);
  const [muted, setMuted] = useState(feedback.isMuted());
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(me.name);
  const [error, setError] = useState("");

  const stats = [
    { label: "Day streak", value: me.streak, icon: <Icon.Flame size={22} />, color: "var(--tangerine-ink)" },
    { label: "Wins", value: me.wins, icon: <Icon.Trophy size={22} />, color: "var(--sun-ink)" },
    { label: "League", value: me.tierName, icon: <Icon.Crown size={22} />, color: "var(--grape-ink)" },
    { label: "XP this week", value: me.weekXp.toLocaleString(), icon: <Icon.Bolt size={20} color="#1899D6" />, color: "var(--sky-edge)" },
  ];

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    try {
      await rename({ name });
      feedback.correct();
      setEditing(false);
    } catch (err) {
      feedback.wrong();
      setError(errorText(err, "Couldn't save"));
    }
  }

  return (
    <ShellPage tab="me">
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, marginTop: 8 }}>
        <Avatar name={me.name} paint={ME} size={92} />
        <h1 className="display" style={{ margin: 0, fontSize: 32 }}>{me.name}</h1>
        <button className="btn btn-sm btn-white" style={{ color: "var(--plum)" }} onClick={() => { feedback.tap(); setName(me.name); setEditing(true); }}>Change name</button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 12 }}>
        {stats.map((s) => (
          <div key={s.label} style={{ display: "flex", flexDirection: "column", gap: 4, padding: "14px 16px", borderRadius: 22, background: "#fff", boxShadow: "0 3px 0 var(--cream-3)" }}>
            <span style={{ display: "flex", alignItems: "center", gap: 6, color: s.color }}>{s.icon}<span style={{ fontSize: 24, fontWeight: 900 }}>{s.value}</span></span>
            <span style={{ fontSize: 13, fontWeight: 800, color: "var(--plum-soft)" }}>{s.label}</span>
          </div>
        ))}
      </div>

      <Account />

      <Link href="/leaderboard" className="pill-btn" onClick={() => feedback.tap()} style={{ fontSize: 18 }}>
        <Icon.Trophy /> Leaderboard
      </Link>
      <button
        className="pill-btn"
        style={{ fontSize: 18 }}
        aria-pressed={!muted}
        onClick={() => { feedback.setMuted(!muted); setMuted(!muted); if (muted) feedback.tap(); }}
      >
        <Icon.Sound muted={muted} /> {muted ? "Sound off" : "Sound on"}
      </button>

      <Sheet open={editing} onClose={() => setEditing(false)} label="Change your name">
        <form onSubmit={save} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <h2 style={{ margin: 0, fontSize: 24, fontWeight: 900, textAlign: "center" }}>Your name</h2>
          <label htmlFor="myname" className="label" style={{ textAlign: "center" }}>What should friends call you?</label>
          <input id="myname" className="input" autoFocus autoComplete="nickname" maxLength={16} value={name} onChange={(e) => { setName(e.target.value); setError(""); }} style={{ fontSize: 20 }} />
          {error && <p role="alert" style={{ margin: 0, color: "var(--cherry-edge)", fontWeight: 800, textAlign: "center" }}>{error}</p>}
          <button className="btn btn-green" disabled={!name.trim()}>Save</button>
        </form>
      </Sheet>
    </ShellPage>
  );
}

type Mode = "create" | "signin";

/** Guest or saved account. Saving keeps your stats and friends and lets you sign in on another phone. */
function Account() {
  const { me } = useIdentity();
  const [mode, setMode] = useState<Mode | null>(null);
  const [leaving, setLeaving] = useState(false);

  if (me.account) {
    return (
      <section className="acct">
        <span className="label" style={{ color: "var(--plum-soft)" }}>Account</span>
        <span style={{ fontSize: 16, fontWeight: 800, color: "var(--plum)", overflowWrap: "anywhere" }}>Signed in as {me.account.email}</span>
        <button className="btn btn-white btn-sm" style={{ alignSelf: "flex-start" }} onClick={() => { feedback.tap(); setLeaving(true); }}>Sign out</button>
        <Sheet open={leaving} onClose={() => setLeaving(false)} label="Sign out">
          <h2 style={{ margin: 0, fontSize: 24, fontWeight: 900, textAlign: "center" }}>Sign out?</h2>
          <p style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "var(--muted)", textAlign: "center" }}>This phone starts over as a new guest. Sign back in any time to get your stats and friends back.</p>
          <button className="btn btn-green" onClick={() => setLeaving(false)}>Stay signed in</button>
          <button className="btn btn-white" style={{ color: "var(--cherry-edge)" }} onClick={() => { feedback.tap(); void authClient.signOut(); }}>Sign out</button>
        </Sheet>
      </section>
    );
  }

  return (
    <section className="acct guest">
      <span className="label" style={{ color: "var(--sun-ink)" }}>Playing as a guest</span>
      <span style={{ fontSize: 15, fontWeight: 700, color: "var(--plum)", lineHeight: 1.35 }}>Save your account to keep your stats and friends, and to play on another phone.</span>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        <button className="btn btn-green btn-sm" onClick={() => { feedback.unlock(); feedback.tap(); setMode("create"); }}>Sign up</button>
        <button className="btn btn-white btn-sm" onClick={() => { feedback.unlock(); feedback.tap(); setMode("signin"); }}>Sign in</button>
      </div>
      <Sheet open={mode !== null} onClose={() => setMode(null)} label={mode === "signin" ? "Sign in" : "Save your account"}>
        {mode && <AccountForm key={mode} mode={mode} setMode={setMode} />}
      </Sheet>
    </section>
  );
}

function AccountForm({ mode, setMode }: { mode: Mode; setMode: (m: Mode) => void }) {
  const { me } = useIdentity();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const create = mode === "create";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    const r = create
      ? await authClient.signUp.email({ email: email.trim(), password, name: me.name })
      : await authClient.signIn.email({ email: email.trim(), password });
    if (r.error) {
      feedback.wrong();
      setError(r.error.message ?? (create ? "Couldn't create the account" : "Wrong email or password"));
      setBusy(false);
      return;
    }
    feedback.correct();
    // The session switches over and the app reloads its data by itself.
  }

  return (
    <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <h2 style={{ margin: 0, fontSize: 24, fontWeight: 900, textAlign: "center" }}>{create ? "Save your account" : "Sign in"}</h2>
      <p style={{ margin: 0, fontSize: 15, fontWeight: 700, color: "var(--muted)", textAlign: "center" }}>
        {create ? `Everything you've done as ${me.name} comes with you.` : "Your account's stats and friends replace this guest's on this phone."}
      </p>
      <label htmlFor="acct-email" className="label">Email</label>
      <input id="acct-email" className="input" type="email" autoComplete="email" autoFocus required value={email} onChange={(e) => { setEmail(e.target.value); setError(""); }} />
      <label htmlFor="acct-pass" className="label">Password</label>
      <input id="acct-pass" className="input" type="password" autoComplete={create ? "new-password" : "current-password"} required minLength={8} value={password} onChange={(e) => { setPassword(e.target.value); setError(""); }} />
      {create && <span style={{ fontSize: 13, fontWeight: 700, color: "var(--muted)" }}>At least 8 characters.</span>}
      {error && <p role="alert" style={{ margin: 0, color: "var(--cherry-edge)", fontWeight: 800, textAlign: "center" }}>{error}</p>}
      <button className="btn btn-green" disabled={busy || !email.trim() || password.length < 8}>{create ? "Save account" : "Sign in"}</button>
      <button type="button" className="btn btn-white btn-sm" style={{ alignSelf: "center" }} onClick={() => setMode(create ? "signin" : "create")}>
        {create ? "I already have an account" : "Make a new account instead"}
      </button>
    </form>
  );
}
