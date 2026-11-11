"use client";

import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { api } from "../../../convex/_generated/api";
import { Game } from "@/components/Game";
import { Avatar, Confetti, Icon, Mascot, TopBar, formatTime, paintFor } from "@/components/ui";
import { errorText } from "@/lib/errors";
import { feedback } from "@/lib/feedback";
import { useNow } from "@/lib/hooks";
import { useIdentity } from "@/lib/identity";
import { useTrickCredit } from "@/lib/useTrickCredit";

type Daily = NonNullable<FunctionReturnType<typeof api.daily.today>>;
const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
const DAYS = ["M", "T", "W", "T", "F", "S", "S"];

export default function DailyPage() {
  const daily = useQuery(api.daily.today, {});
  if (!daily) return <main className="screen" style={{ alignItems: "center", justifyContent: "center" }}><Mascot size={80} className="bob" /></main>;
  if (!daily.run) return <Intro daily={daily} />;
  if (daily.run.timeMs === undefined) return daily.puzzle ? <Play daily={daily} /> : null;
  return <Result daily={daily} />;
}

function share(text: string) {
  const url = location.origin + "/daily";
  if (navigator.share) return navigator.share({ title: "Parti", text, url }).catch(() => {});
  return navigator.clipboard?.writeText(`${text} ${url}`).catch(() => {});
}

function Intro({ daily }: { daily: Daily }) {
  const { me } = useIdentity();
  const start = useMutation(api.daily.start);
  const now = useNow(1000);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [nudged, setNudged] = useState<Record<string, boolean>>({});
  const d = new Date(daily.date + "T00:00:00Z");
  const left = Math.max(0, daily.nextAt - now);
  const hh = Math.floor(left / 3_600_000), mm = Math.floor((left % 3_600_000) / 60_000), ss = Math.floor((left % 60_000) / 1000);
  const pad = (n: number) => String(n).padStart(2, "0");

  return (
    <main className="screen">
      <TopBar
        back="/sudoku"
        title="Daily Duel"
        right={<span className="stat-pill" style={{ color: "var(--tangerine-ink)" }} aria-label={`${daily.streak} day streak`}><Icon.Flame size={20} className="flick" />{daily.streak}</span>}
      />

      <section style={{ display: "flex", gap: 14, alignItems: "center", padding: 16, borderRadius: 20, background: "var(--sun-soft)", border: "2px solid var(--sun-line)" }}>
        <div style={{ width: 80, flexShrink: 0, borderRadius: 16, overflow: "hidden", background: "#fff", boxShadow: "0 4px 0 var(--sun-edge)", display: "flex", flexDirection: "column", alignItems: "center" }}>
          <span style={{ alignSelf: "stretch", textAlign: "center", background: "var(--cherry-edge)", color: "#fff", fontSize: 13, fontWeight: 900, letterSpacing: ".08em", padding: "4px 0" }}>{MONTHS[d.getUTCMonth()]}</span>
          <span style={{ fontSize: 38, fontWeight: 900, lineHeight: 1, padding: "8px 0 10px" }}>{d.getUTCDate()}</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={{ fontSize: 13, fontWeight: 900, letterSpacing: ".06em", color: "var(--sun-ink)" }}>PUZZLE #{daily.number} · {daily.difficulty.toUpperCase()}</span>
          <span style={{ fontSize: 20, fontWeight: 900, lineHeight: 1.2 }}>Same board for everyone. One try. Fastest wins.</span>
        </div>
      </section>

      <section style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 4px" }}>
        <span style={{ fontSize: 15, fontWeight: 800, color: "var(--muted)" }}>New duel in</span>
        <span style={{ fontSize: 20, fontWeight: 900, fontVariantNumeric: "tabular-nums" }}>{pad(hh)}:{pad(mm)}:{pad(ss)}</span>
      </section>

      <WeekRow week={daily.week} />

      <section style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <h2 className="label">Friends today</h2>
        <div className="list">
          {daily.friends.length === 0 && (
            <div className="list-row" style={{ color: "var(--muted)", fontWeight: 700 }}>Play a room game with friends and they&apos;ll show up here.</div>
          )}
          {daily.friends.slice(0, 5).map((f) => (
            <div key={f.id} className="list-row">
              <Avatar name={f.name} paint={paintFor(f.id)} size={36} />
              <span style={{ flex: 1, fontSize: 17, fontWeight: 900 }}>{f.name}</span>
              {f.timeMs !== undefined ? (
                <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 17, fontWeight: 900, color: "var(--lime-dark)" }}>{formatTime(f.timeMs)}<Icon.Check /></span>
              ) : f.playing ? (
                <span style={{ fontSize: 14, fontWeight: 800, color: "var(--muted)" }}>Playing…</span>
              ) : (
                <button
                  className="btn btn-white btn-sm"
                  style={{ minHeight: 36, color: nudged[f.id] ? "var(--muted)" : "var(--tangerine-ink)" }}
                  onClick={() => { feedback.tap(); setNudged((n) => ({ ...n, [f.id]: true })); void share(`${f.name}, today's Daily Duel is waiting for you!`); }}
                >
                  {nudged[f.id] ? "Nudged!" : "Nudge"}
                </button>
              )}
            </div>
          ))}
          <div className="list-row me">
            <Avatar name={me.name} paint={paintFor("", true)} size={36} />
            <span style={{ flex: 1, fontSize: 17, fontWeight: 900 }}>You</span>
            <span style={{ fontSize: 14, fontWeight: 800, color: "var(--sky-edge)" }}>Your turn</span>
          </div>
        </div>
      </section>

      <section style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {["1 TRY", "NO HINTS", `+${daily.penaltyMs / 1000}s PER MISTAKE`, "CLOCK STARTS ON PLAY"].map((c) => <span key={c} className="chip chip-mist">{c}</span>)}
      </section>

      <div className="grow" />
      {error && <p role="alert" style={{ margin: 0, color: "var(--cherry-edge)", fontWeight: 800, textAlign: "center" }}>{error}</p>}
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <button
          className="btn btn-green"
          disabled={busy}
          onClick={async () => {
            feedback.unlock();
            feedback.go();
            setBusy(true);
            try { await start({}); } catch (e) { setError(errorText(e)); setBusy(false); }
          }}
        >
          Play today&apos;s duel
        </button>
        <Link href="/leaderboard" className="btn btn-white">Leaderboard</Link>
      </div>
    </main>
  );
}

function WeekRow({ week }: { week: Daily["week"] }) {
  return (
    <section style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <h2 className="label">This week</h2>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))", gap: 6 }}>
        {week.map((d, i) => (
          <div key={d.date} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 900, color: "var(--muted)" }}>{DAYS[i]}</span>
            <span
              aria-label={`${d.date}: ${d.done ? "played" : d.future ? "upcoming" : "missed"}`}
              style={{
                width: 40, height: 40, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center",
                ...(d.done
                  ? { background: "var(--tangerine)", boxShadow: "0 3px 0 var(--tangerine-edge)" }
                  : d.today
                    ? { background: "#fff", border: "3px dashed var(--tangerine)" }
                    : { background: "var(--mist)", border: "2px solid var(--line)" }),
              }}
            >
              {d.done && (
                <svg width="16" height="20" viewBox="0 0 18 22" aria-hidden="true"><path d="M9 1 C10 6 16 8 16 14 A7 7 0 0 1 2 14 C2 10 5 9 5 5 C7 7 8 8 9 1Z" fill="#fff" /></svg>
              )}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

function Play({ daily }: { daily: Daily }) {
  const place = useMutation(api.daily.place);
  const now = useNow(1000);
  const run = daily.run!;
  const credit = useTrickCredit();
  const before = run.values;
  const onPlace = useCallback(async (cell: number, digit: number) => {
    const r = await place({ cell, digit });
    if (r.correct) credit(before, cell, digit);
    return r;
  }, [place, credit, before]);
  const elapsed = now - run.startedAt + run.mistakes * daily.penaltyMs;
  return (
    <main className="screen tight">
      <TopBar
        back="/sudoku"
        title={<span className="chip chip-sun">DAILY #{daily.number} · {daily.difficulty.toUpperCase()}</span>}
        right={
          <span style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
            <span style={{ fontSize: 18, fontWeight: 900, fontVariantNumeric: "tabular-nums" }}>{formatTime(elapsed)}</span>
            {run.mistakes > 0 && <span style={{ fontSize: 12, fontWeight: 900, color: "var(--cherry-edge)" }}>+{(run.mistakes * daily.penaltyMs) / 1000}s</span>}
          </span>
        }
      />
      <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: "var(--muted)", textAlign: "center" }}>The clock keeps running if you leave. Go go go!</p>
      <Game puzzle={daily.puzzle!} values={run.values} onPlace={onPlace} hints={null} />
    </main>
  );
}

function Result({ daily }: { daily: Daily }) {
  const run = daily.run!;
  const rank = daily.rank;
  const [fresh] = useState(() => !!run.finishedAt && Date.now() - run.finishedAt < 15_000);
  useEffect(() => { if (fresh) feedback.win(); }, [fresh]);
  const order = run.boxOrder;
  const boxes = Array.from({ length: 9 }, (_, b) => {
    const k = order.indexOf(b);
    return k < 0 ? 2 : k < 3 ? 0 : k < 6 ? 1 : 2;
  });
  const face = ["var(--lime)", "var(--sun)", "var(--tangerine)"], edge = ["var(--lime-edge)", "var(--sun-edge)", "var(--tangerine-edge)"];
  const played = daily.friends.filter((f) => f.timeMs !== undefined);
  // "Top X%" only reads well with a crowd; with a few players just show the rank.
  const pct = rank && rank.worldTotal >= 10 && rank.world > 1 ? Math.max(1, Math.round((rank.world / rank.worldTotal) * 100)) : null;
  const shareText = `Parti Sudoku Daily #${daily.number} · ${formatTime(run.timeMs!)} · ${daily.streak}-day streak${rank ? ` · #${rank.friends} of friends` : ""}`;

  return (
    <main className="screen">
      {fresh && <Confetti />}
      <TopBar back="/sudoku" title="" />
      <section style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 6 }}>
          <Icon.Flame size={92} className="grow-up" />
          <span className="rise" style={{ fontSize: 72, fontWeight: 900, lineHeight: 0.9, color: "var(--tangerine-ink)" }}>{daily.streak}</span>
        </div>
        <h1 style={{ margin: "10px 0 0", fontSize: 32, fontWeight: 900 }}>Duel done!</h1>
        <p style={{ margin: 0, fontSize: 17, fontWeight: 700, color: "var(--muted)" }}>{daily.streak}-day streak. Come back tomorrow.</p>
      </section>

      <section className="rise" style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 10 }}>
        <div style={{ borderRadius: 18, padding: 14, background: "var(--sky-soft)", border: "2px solid var(--sky-line)", display: "flex", flexDirection: "column", gap: 2, color: "var(--sky-edge)" }}>
          <span style={{ fontSize: 12, fontWeight: 900, letterSpacing: ".06em" }}>FRIENDS</span>
          <span style={{ fontSize: 34, fontWeight: 900 }}>#{rank?.friends ?? 1}</span>
          <span style={{ fontSize: 14, fontWeight: 700 }}>of {rank?.friendsTotal ?? 1} today</span>
        </div>
        <div style={{ borderRadius: 18, padding: 14, background: "var(--grape-soft)", border: "2px solid #DDB3FF", display: "flex", flexDirection: "column", gap: 2, color: "var(--grape-ink)" }}>
          <span style={{ fontSize: 12, fontWeight: 900, letterSpacing: ".06em" }}>WORLDWIDE</span>
          <span style={{ fontSize: 34, fontWeight: 900 }}>{pct ? `Top ${pct}%` : `#${rank?.world ?? 1}`}</span>
          <span style={{ fontSize: 14, fontWeight: 700 }}>#{(rank?.world ?? 1).toLocaleString()} of {(rank?.worldTotal ?? 1).toLocaleString()}</span>
        </div>
      </section>

      <section className="rise" style={{ display: "flex", flexDirection: "column", gap: 8, animationDelay: "120ms" }}>
        <Line label="Your time" value={formatTime(run.timeMs!)} />
        <Line label="Mistakes" value={`${run.mistakes}${run.mistakes ? ` · +${(run.mistakes * daily.penaltyMs) / 1000}s` : ""}`} />
        {played.slice(0, 3).map((f) => {
          const diff = f.timeMs! - run.timeMs!;
          return <Line key={f.id} label={`vs ${f.name}`} value={diff >= 0 ? `${formatTime(diff)} ahead` : `${formatTime(-diff)} behind`} color={diff >= 0 ? "var(--lime-dark)" : "var(--cherry-edge)"} />;
        })}
      </section>

      <section className="rise" style={{ border: "2px solid var(--line)", borderRadius: 20, padding: 16, display: "flex", gap: 16, alignItems: "center", animationDelay: "240ms" }}>
        <div role="img" aria-label="Share card: each square is one box of the board, colored by the order you cleared it" style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 4, width: 84, flexShrink: 0 }}>
          {boxes.map((k, i) => <span key={i} style={{ aspectRatio: "1 / 1", borderRadius: 6, background: face[k], boxShadow: `inset 0 -3px 0 ${edge[k]}` }} />)}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={{ fontSize: 16, fontWeight: 900, color: "var(--lime-dark)" }}>Parti · Sudoku</span>
          <span style={{ fontSize: 15, fontWeight: 800 }}>Daily #{daily.number} · {formatTime(run.timeMs!)}</span>
          <span style={{ fontSize: 12, fontWeight: 700, color: "var(--muted)" }}>Green boxes you cleared first, orange last</span>
        </div>
      </section>

      <div className="grow" />
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <button className="btn btn-blue" onClick={() => { feedback.tap(); void share(shareText); }}><Icon.Share color="#fff" size={18} /> Share result</button>
        <Link href="/leaderboard" className="btn btn-white">See leaderboard</Link>
      </div>
    </main>
  );
}

function Line({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 17, fontWeight: 800 }}>
      <span style={{ color: "var(--muted)" }}>{label}</span>
      <span style={{ fontWeight: 900, color }}>{value}</span>
    </div>
  );
}
