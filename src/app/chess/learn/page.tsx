"use client";

import Link from "next/link";
import { Fragment } from "react";
import { Piece } from "@/components/chess/Board";
import { BotFace } from "@/components/chess/bits";
import { Icon, Mascot, TopBar } from "@/components/ui";
import { feedback } from "@/lib/feedback";
import { useIdentity } from "@/lib/identity";
import { LESSONS, UNITS } from "@/lib/lessons";

const OFFSETS = [0, -50, -80, -50, 0, 30, 45, 30];

function LessonIcon({ icon, color }: { icon: string; color: string }) {
  if (icon.length === 1) return <Piece code={icon.toUpperCase()} size={40} flat={color} />;
  const paths: Record<string, string> = {
    board: "M6 6 h14 v14 h-14z M20 20 h14 v14 h-14z",
    trophy: "M12 6 h16 v8 a8 8 0 0 1 -16 0z M18 26 h4 v4 h-4z M12 31 h16 v4 h-16z",
    check: "M21 4 L10 22 h8 l-2 14 14 -20 h-9z",
    shield: "M20 5 L33 10 V20 C33 28 27 33 20 36 C13 33 7 28 7 20 V10z",
    crown: "M6 14 l7 7 7 -12 7 12 7 -7 -3 18 H9z",
    castle: "M10 8 h5 v4 h3 v-4 h4 v4 h3 v-4 h5 v10 h-20z M12 18 h16 l1 16 h-18z",
  };
  return <svg width="40" height="40" viewBox="0 0 40 40" aria-hidden="true"><path d={paths[icon]} fill={color} /></svg>;
}

export default function LearnPage() {
  const { me } = useIdentity();
  const stars = me.chessLessons;
  const firstOpen = LESSONS.findIndex((l) => !(stars[l.id] > 0));
  const xp = LESSONS.reduce((n, l) => n + (stars[l.id] ?? 0), 0);

  return (
    <main className="screen tight">
      <TopBar back="/chess" title="Learn chess" right={<span className="stat-pill" style={{ color: "var(--sun-ink)" }} aria-label={`${xp} stars`}><svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2 l3 6.5 7 .8 -5.2 4.8 1.4 7 -6.2 -3.6 -6.2 3.6 1.4 -7 L2 9.3 l7 -.8z" fill="#FFC800" /></svg>{xp}</span>} />
      {UNITS.map((u) => {
        const lessons = LESSONS.filter((l) => l.unit === u.n);
        return (
          <Fragment key={u.n}>
            <section style={{ borderRadius: 20, background: u.n === 1 ? "var(--lime-dark)" : "#8A4FB5", boxShadow: `0 5px 0 ${u.n === 1 ? "#2F6E00" : "#6E3C94"}`, padding: "14px 16px", color: "#fff", display: "flex", flexDirection: "column", gap: 2, marginTop: u.n === 1 ? 0 : 18 }}>
              <span style={{ fontSize: 13, fontWeight: 900, letterSpacing: ".08em" }}>UNIT {u.n}</span>
              <span style={{ fontSize: 20, fontWeight: 900 }}>{u.name}</span>
              <span style={{ fontSize: 15, fontWeight: 700 }}>{u.sub}</span>
            </section>
            <ol className="path" aria-label={`Unit ${u.n} lessons`}>
              {lessons.map((l, i) => {
                const idx = LESSONS.indexOf(l);
                const st = stars[l.id] ?? 0;
                const state = st > 0 ? "done" : idx === firstOpen ? "current" : idx < firstOpen || firstOpen < 0 ? "done" : "locked";
                const size = state === "current" ? 76 : 68;
                const left = `calc(50% + ${OFFSETS[i % OFFSETS.length] * 0.9}px - ${size / 2}px)`;
                const face = state === "done" ? { background: "var(--sun)", boxShadow: "0 6px 0 var(--sun-edge)" } : state === "current" ? { background: "var(--lime)", boxShadow: "0 6px 0 var(--lime-edge)" } : { background: "#E5E5E5", boxShadow: "0 6px 0 #CFCFCF" };
                const node = (
                  <span className={`path-node${state === "current" ? " current" : ""}`} style={{ width: size, height: size - 6, ...face }}>
                    <LessonIcon icon={l.icon} color={state === "locked" ? "#AFAFAF" : "#fff"} />
                  </span>
                );
                return (
                  <li key={l.id} style={{ paddingLeft: left }}>
                    {state === "current" && <span className="path-bubble bob" style={{ left: `calc(50% + ${OFFSETS[i % OFFSETS.length] * 0.9}px - 32px)` }}>START</span>}
                    {state === "locked" ? (
                      <span aria-label={`${l.name}, locked`}>{node}</span>
                    ) : (
                      <Link href={`/chess/learn/${l.id}`} aria-label={`${l.name}${st ? `, ${st} stars` : ", start"}`} onClick={() => { feedback.unlock(); feedback.tap(); }}>{node}</Link>
                    )}
                    <span style={{ display: "flex", flexDirection: "column", gap: 1, minWidth: 0 }}>
                      <span style={{ fontSize: 16, fontWeight: 900, color: state === "locked" ? "var(--muted)" : "var(--ink)" }}>{l.name}</span>
                      <span style={{ fontSize: 13, fontWeight: 700, color: "var(--muted)", display: "flex", alignItems: "center", gap: 2 }}>
                        {st > 0 ? [1, 2, 3].map((k) => <svg key={k} width="13" height="13" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2 l3 6.5 7 .8 -5.2 4.8 1.4 7 -6.2 -3.6 -6.2 3.6 1.4 -7 L2 9.3 l7 -.8z" fill={k <= st ? "#FFC800" : "#E5E5E5"} /></svg>) : l.sub}
                      </span>
                    </span>
                  </li>
                );
              })}
            </ol>
          </Fragment>
        );
      })}
      <Link href="/chess/bot" className="card" style={{ marginTop: 14 }} onClick={() => feedback.tap()}>
        <BotFace size={48} />
        <span className="col">
          <span className="title">Bot battle</span>
          <span className="sub">Use what you learned against Bolt.</span>
        </span>
        <Icon.Chevron />
      </Link>
      <div style={{ display: "flex", justifyContent: "center", padding: "6px 0 10px" }}><Mascot size={64} className="bob" /></div>
    </main>
  );
}
