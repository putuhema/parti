"use client";

import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useEffect, useRef, useState } from "react";
import { api } from "../../../../convex/_generated/api";
import { ROUND_MS, points } from "../../../../convex/lib/scramble/board";
import { GridPlay, Missed } from "@/components/scramble/Grid";
import { Countdown } from "@/components/words/common";
import { Avatar, Confetti, Mascot, TopBar, paintFor } from "@/components/ui";
import { errorText } from "@/lib/errors";
import { feedback } from "@/lib/feedback";
import { useNow } from "@/lib/hooks";

type Daily = NonNullable<FunctionReturnType<typeof api.scramble.daily>>;

/** Today's date the way the server counts it (UTC). */
const today = () => new Date().toISOString().slice(0, 10);

export default function ScrambleDaily() {
  const [date] = useState(today);
  const daily = useQuery(api.scramble.daily, { date });
  if (!daily) return <main className="screen" style={{ alignItems: "center", justifyContent: "center" }}><Mascot size={80} className="bob" /></main>;
  if (!daily.run) return <Intro daily={daily} />;
  if (!daily.run.done) return daily.grid ? <Play daily={daily} /> : null;
  return <Result daily={daily} />;
}

function Board({ daily }: { daily: Daily }) {
  if (!daily.board.length) return <p style={{ margin: 0, fontSize: 15, fontWeight: 700, color: "var(--muted)" }}>Nobody has finished today&apos;s grid yet. Be the first!</p>;
  return (
    <div className="list">
      {daily.board.map((r, i) => (
        <div key={r.id} className={`list-row${r.isMe ? " me" : ""}`}>
          <span style={{ width: 22, fontSize: 15, fontWeight: 900, color: i < 3 ? "var(--sun-ink)" : "var(--muted)" }}>{i + 1}</span>
          <Avatar name={r.name} paint={paintFor(r.id, r.isMe)} size={30} />
          <span style={{ flex: 1, fontSize: 16, fontWeight: 900 }}>{r.isMe ? `${r.name} (you)` : r.name}</span>
          <span style={{ fontSize: 13, fontWeight: 800, color: "var(--muted)" }}>{r.words} words</span>
          <span style={{ minWidth: 36, textAlign: "right", fontSize: 18, fontWeight: 900, fontVariantNumeric: "tabular-nums" }}>{r.score}</span>
        </div>
      ))}
    </div>
  );
}

function Intro({ daily }: { daily: Daily }) {
  const start = useMutation(api.scramble.dailyStart);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function go() {
    feedback.unlock();
    feedback.tap();
    setBusy(true);
    try {
      await start({});
    } catch (e) {
      setError(errorText(e));
      setBusy(false);
    }
  }
  return (
    <main className="screen">
      <TopBar back="/scramble" title="Daily grid" />
      <section className="bz-card" style={{ alignItems: "center", textAlign: "center", gap: 8 }}>
        <span style={{ fontSize: 13, fontWeight: 900, letterSpacing: ".06em", color: "var(--plum-soft)" }}>GRID #{daily.number}</span>
        <span className="display" style={{ fontSize: 26 }}>Same letters for everyone</span>
        <span style={{ fontSize: 15, fontWeight: 700, lineHeight: 1.4, color: "var(--plum)" }}>You get one try and 2 minutes. The clock starts when you tap Start, so find a quiet moment.</span>
      </section>
      <section style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <span className="label">Today&apos;s top scores</span>
        <Board daily={daily} />
      </section>
      <div className="grow" />
      {error && <p role="alert" style={{ margin: 0, color: "var(--cherry-edge)", fontWeight: 800, textAlign: "center" }}>{error}</p>}
      <button className="btn btn-green" disabled={busy} onClick={go}>Start</button>
    </main>
  );
}

function Play({ daily }: { daily: Daily }) {
  const submit = useMutation(api.scramble.dailySubmit);
  const finish = useMutation(api.scramble.dailyFinish);
  const run = daily.run!;
  const now = useNow(500);
  const over = now >= run.endsAt;
  const sent = useRef(false);
  useEffect(() => {
    if (!over || sent.current) return;
    sent.current = true;
    void finish({ date: daily.date }).catch(() => { sent.current = false; });
  }, [over, finish, daily.date]);
  return (
    <main className="screen tight" style={{ gap: 12 }}>
      <TopBar title={`Daily grid #${daily.number}`} right={<span className="chip chip-sun">{run.score} PTS</span>} />
      <GridPlay grid={daily.grid!} endsAt={run.endsAt} found={run.found} disabled={over} submit={(path) => submit({ date: daily.date, path })} />
      <Countdown startAt={run.endsAt - ROUND_MS} label={`Daily grid #${daily.number}`} />
      {over && <div className="overlay"><Mascot size={80} className="bob" /><span style={{ fontSize: 22, fontWeight: 900 }}>Time&apos;s up!</span></div>}
    </main>
  );
}

function Result({ daily }: { daily: Daily }) {
  const run = daily.run!;
  const [copied, setCopied] = useState(false);
  const longest = [...run.found].sort((a, b) => b.length - a.length)[0];
  const rank = daily.board.findIndex((r) => r.isMe);
  async function share() {
    feedback.tap();
    const text = `Scramble daily #${daily.number}: ${run.score} points, ${run.found.length} words${longest ? `, best ${longest.toUpperCase()}` : ""}. Can you beat it?`;
    const url = `${location.origin}/scramble/daily`;
    try {
      if (navigator.share) await navigator.share({ title: "pums party", text, url });
      else { await navigator.clipboard.writeText(`${text} ${url}`); setCopied(true); setTimeout(() => setCopied(false), 1800); }
    } catch {}
  }
  return (
    <main className="screen">
      <TopBar back="/scramble" title={`Daily grid #${daily.number}`} />
      {run.score > 0 && <Confetti count={40} />}
      <section className="bz-card" style={{ alignItems: "center", textAlign: "center", gap: 4 }}>
        <span className="display" style={{ fontSize: 44, lineHeight: 1, color: "var(--lime-dark)" }}>{run.score}</span>
        <span style={{ fontSize: 15, fontWeight: 800, color: "var(--plum)" }}>
          points · {run.found.length} of {daily.total} words{rank >= 0 ? ` · #${rank + 1} today` : ""}
        </span>
      </section>
      {run.found.length > 0 && (
        <section style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span className="label">Your words</span>
          <div className="sg-found">
            {[...run.found].sort((a, b) => b.length - a.length).map((w) => <span key={w} className="sg-chip">{w.toUpperCase()}<b>{points(w)}</b></span>)}
          </div>
        </section>
      )}
      <Missed words={daily.missed} total={null} title="Best words you missed" />
      <section style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <span className="label">Today&apos;s top scores</span>
        <Board daily={daily} />
      </section>
      <button className="btn btn-green" onClick={share}>{copied ? "Copied!" : "Share my score"}</button>
      <p style={{ margin: 0, textAlign: "center", fontSize: 14, fontWeight: 700, color: "var(--muted)" }}>A new grid comes out at midnight UTC.</p>
    </main>
  );
}
