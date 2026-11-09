"use client";

import { useMutation, useQuery } from "convex/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "../../../convex/_generated/api";
import { Icon, Mascot, Sheet, formatTime } from "@/components/ui";
import { errorText } from "@/lib/errors";
import { feedback } from "@/lib/feedback";
import { useIdentity } from "@/lib/identity";
import { ShellPage } from "@/components/shell";

const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

export default function Home() {
  const { token, me } = useIdentity();
  const router = useRouter();
  const daily = useQuery(api.daily.today, { token });
  const createRoom = useMutation(api.rooms.create);
  const joinRoom = useMutation(api.chess.joinAny);
  const [joinOpen, setJoinOpen] = useState(false);
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [muted, setMuted] = useState(feedback.isMuted());

  async function create(mode: "race" | "coop") {
    if (busy) return;
    feedback.unlock();
    feedback.tap();
    setBusy(true);
    try {
      const c = await createRoom({ token, mode, difficulty: "medium" });
      router.push(`/room/${c}`);
    } finally {
      setBusy(false);
    }
  }

  async function join(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    try {
      const path = await joinRoom({ token, code: code.trim().toUpperCase() });
      feedback.correct();
      router.push(path);
    } catch (err) {
      feedback.wrong();
      setError(errorText(err, "Couldn't join"));
    }
  }

  const d = daily ? new Date(daily.date + "T00:00:00Z") : null;
  const bestFriend = daily?.friends.find((f) => f.timeMs !== undefined);
  const dailyLine = !daily
    ? "Today's puzzle is ready"
    : daily.run?.timeMs !== undefined
      ? `Done in ${formatTime(daily.run.timeMs)} · see how you rank`
      : bestFriend
        ? `${bestFriend.name} did it in ${formatTime(bestFriend.timeMs!)}. Beat them!`
        : "Same puzzle for everyone. One try.";

  return (
    <ShellPage
      tab="games"
      right={
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span className="stat-pill" style={{ color: "var(--tangerine-ink)" }} aria-label={`${me.streak} day streak`}>
            <Icon.Flame size={20} className={me.streak ? "flick" : undefined} />{me.streak}
          </span>
          <span className="stat-pill" style={{ color: "var(--sun-ink)" }} aria-label={`${me.wins} wins`}>
            <Icon.Trophy />{me.wins}
          </span>
          <button
            className="icon-btn"
            style={{ width: 36 }}
            aria-label={muted ? "Turn sound on" : "Mute sound"}
            onClick={() => { feedback.setMuted(!muted); setMuted(!muted); if (muted) feedback.tap(); }}
          >
            <Icon.Sound muted={muted} />
          </button>
        </div>
      }
    >
      <h1 className="display" style={{ margin: "2px 4px 0", fontSize: 30 }}>Sudoku</h1>

      <section style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <Mascot size={84} className="bob" />
        <div style={{ border: "2px solid var(--line)", borderRadius: 18, padding: "14px 16px", fontSize: 18, fontWeight: 800, lineHeight: 1.3 }}>
          Hey {me.name}! Ready to puzzle? Grab a friend and let&apos;s go!
        </div>
      </section>

      <Link
        href="/daily"
        className="card"
        onClick={() => feedback.tap()}
        style={{ background: "var(--sun-soft)", borderColor: "var(--sun-line)", boxShadow: "0 4px 0 #FFD84D", padding: "12px 16px" }}
      >
        <span style={{ width: 48, flexShrink: 0, borderRadius: 12, overflow: "hidden", background: "#fff", boxShadow: "0 3px 0 var(--sun-edge)", display: "flex", flexDirection: "column", alignItems: "center" }}>
          <span style={{ alignSelf: "stretch", textAlign: "center", background: "var(--cherry)", color: "#fff", fontSize: 10, fontWeight: 900, letterSpacing: ".08em", padding: "2px 0" }}>
            {d ? MONTHS[d.getUTCMonth()] : "TODAY"}
          </span>
          <span style={{ fontSize: 22, fontWeight: 900, lineHeight: 1, padding: "4px 0 6px" }}>{d ? d.getUTCDate() : "·"}</span>
        </span>
        <span className="col">
          <span style={{ fontSize: 18, fontWeight: 900 }}>Daily Duel</span>
          <span style={{ fontSize: 14, fontWeight: 700, color: "var(--sun-ink)" }}>{dailyLine}</span>
        </span>
        {daily && daily.run?.timeMs === undefined ? (
          <span style={{ fontSize: 13, fontWeight: 900, color: "#fff", background: "var(--cherry-edge)", padding: "6px 10px", borderRadius: 10 }}>NEW</span>
        ) : (
          <Icon.Check size={20} />
        )}
      </Link>

      <h2 className="label" style={{ marginTop: 4 }}>Play with friends</h2>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <button className="card" onClick={() => create("race")} disabled={busy}>
          <span className="tile-icon" style={{ background: "var(--sky)", boxShadow: "0 4px 0 var(--sky-btn)" }}><Icon.Bolt size={30} /></span>
          <span className="col">
            <span className="title">Race</span>
            <span className="sub">Same board for everyone. First to finish wins.</span>
          </span>
          <Icon.Chevron />
        </button>
        <button className="card" onClick={() => create("coop")} disabled={busy}>
          <span className="tile-icon" style={{ background: "var(--grape)", boxShadow: "0 4px 0 var(--grape-edge)" }}><Icon.People size={32} /></span>
          <span className="col">
            <span className="title">Co-op</span>
            <span className="sub">One shared board. Fill it in together.</span>
          </span>
          <Icon.Chevron />
        </button>
        <Link href="/solo" className="card" style={{ padding: "12px 16px" }} onClick={() => feedback.tap()}>
          <span style={{ width: 40, height: 40, borderRadius: 12, background: "var(--mist)", border: "2px solid var(--line)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <Icon.Grid />
          </span>
          <span style={{ flex: 1, fontSize: 17, fontWeight: 800 }}>Practice solo</span>
          <Icon.Chevron />
        </Link>
      </div>

      <div className="grow" />
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <Link href="/leaderboard" className="btn btn-white" onClick={() => feedback.tap()}>Leaderboard</Link>
        <button className="btn btn-green" onClick={() => { feedback.unlock(); feedback.tap(); setJoinOpen(true); }}>Join with code</button>
      </div>

      <Sheet open={joinOpen} onClose={() => setJoinOpen(false)} label="Join a room">
        <form onSubmit={join} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <h2 style={{ margin: 0, fontSize: 24, fontWeight: 900, textAlign: "center" }}>Join a room</h2>
          <label htmlFor="code" className="label" style={{ textAlign: "center" }}>Enter the 4-character code</label>
          <input
            id="code"
            className="input code"
            autoFocus
            autoCapitalize="characters"
            autoComplete="off"
            maxLength={4}
            value={code}
            onChange={(e) => { setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "")); setError(""); }}
            placeholder="K7Q2"
          />
          {error && <p role="alert" style={{ margin: 0, color: "var(--cherry-edge)", fontWeight: 800, textAlign: "center" }}>{error}</p>}
          <button className="btn btn-green" disabled={code.length !== 4}>Join</button>
        </form>
      </Sheet>
    </ShellPage>
  );
}
