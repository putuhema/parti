"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { Piece } from "@/components/chess/Board";
import { ShellPage, SilatKing } from "@/components/shell";
import { Icon } from "@/components/ui";
import { Gem } from "@/components/trivia/common";
import { feedback } from "@/lib/feedback";
import { useIdentity } from "@/lib/identity";

type Game = { href: string; name: string; sub: string; face: string; edge: string; ink: string; tag?: string; art: ReactNode };

const GAMES: Game[] = [
  {
    href: "/sudoku",
    name: "Sudoku",
    sub: "Race, co-op, daily",
    face: "#1CB0F6",
    edge: "#1478A8",
    ink: "#1478A8",
    art: (
      <span style={{ display: "grid", gridTemplateColumns: "repeat(3, 25px)", gap: 4, transform: "rotate(-6deg)" }} aria-hidden="true">
        {["5", "", "3", "", "7", "", "9", "", "1"].map((d, i) => (
          <span key={i} style={{ width: 25, height: 25, borderRadius: 7, background: i === 4 ? "#FFC800" : "#fff", color: "#1478A8", fontSize: 15, fontWeight: 900, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 3px 0 rgba(0,0,0,.12)" }}>{d}</span>
        ))}
      </span>
    ),
  },
  {
    href: "/chess",
    name: "Chess",
    sub: "Learn, play, variants",
    face: "#58CC02",
    edge: "#46A302",
    ink: "#2F6E00",
    art: (
      <span style={{ position: "relative", width: 96, height: 96 }} aria-hidden="true">
        <Piece code="n" size={78} style={{ position: "absolute", left: 0, top: 6, transform: "rotate(-8deg)" }} />
        <Piece code="Q" size={64} style={{ position: "absolute", right: -6, top: 22 }} />
      </span>
    ),
  },
  {
    href: "/words",
    name: "Words",
    sub: "10 games for two",
    face: "#CE82FF",
    edge: "#A568CC",
    ink: "#8A4FB5",
    art: (
      <span style={{ display: "flex", gap: 5 }} aria-hidden="true">
        {["K", "A", "T", "A"].map((l, i) => (
          <span key={i} style={{ width: 32, height: 38, borderRadius: 9, background: "#fff", color: "#8A4FB5", fontSize: 20, fontWeight: 900, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 3px 0 rgba(0,0,0,.14)", transform: `translateY(${i % 2 ? 6 : -4}px) rotate(${i % 2 ? 6 : -6}deg)` }}>{l}</span>
        ))}
      </span>
    ),
  },
  {
    href: "/silat",
    name: "Raja Silat",
    sub: "Kick, don't capture",
    face: "#E5383B",
    edge: "#A52126",
    ink: "#A52126",
    art: <SilatKing size={92} band="#FFC800" bandInk="#8E5A00" />,
  },
  {
    href: "/trivia",
    name: "Quiz Loop",
    sub: "Trivia board game",
    face: "#4A3F55",
    edge: "#2F2838",
    ink: "#4A3F55",
    tag: "NEW",
    art: (
      <span style={{ position: "relative", width: 96, height: 90 }} aria-hidden="true">
        {[[0, 30, 40, -14], [3, 26, 6, 10], [5, 50, 22, 2]].map(([cat, x, y, rot]) => (
          <span key={cat} style={{ position: "absolute", left: x - 18, top: y, transform: `rotate(${rot}deg)`, filter: "drop-shadow(0 3px 0 rgba(0,0,0,.25))" }}><Gem cat={cat} size={cat === 5 ? 56 : 44} /></span>
        ))}
      </span>
    ),
  },
  {
    href: "/buzz",
    name: "Buzz Board",
    sub: "Race-to-answer quiz",
    face: "#2B70C9",
    edge: "#1F57A0",
    ink: "#1F57A0",
    tag: "NEW",
    art: (
      <span style={{ display: "grid", gridTemplateColumns: "repeat(3, 28px)", gap: 4, transform: "rotate(-5deg)" }} aria-hidden="true">
        {["100", "200", "🔥", "300", "", "400"].map((t, i) => (
          <span key={i} style={{ height: 24, borderRadius: 6, background: t ? (t === "🔥" ? "#FFC800" : "#fff") : "rgba(255,255,255,.25)", color: "#1F57A0", fontSize: 11, fontWeight: 900, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 3px 0 rgba(0,0,0,.14)" }}>{t}</span>
        ))}
      </span>
    ),
  },
];

export default function Home() {
  const { me } = useIdentity();
  return (
    <ShellPage
      tab="games"
      gap={18}
      right={
        <>
          <span className="stat-pill" style={{ color: "var(--tangerine-ink)", borderColor: "var(--cream-3)", background: "#fff" }} aria-label={`${me.streak} day streak`}>
            <Icon.Flame size={20} className={me.streak ? "flick" : undefined} />{me.streak}
          </span>
          <span className="stat-pill" style={{ color: "var(--sun-ink)", borderColor: "var(--cream-3)", background: "#fff" }} aria-label={`${me.wins} wins`}>
            <Icon.Trophy />{me.wins}
          </span>
        </>
      }
    >
      <h1 className="display" style={{ margin: "6px 4px 0", fontSize: 26 }}>Hey {me.name}, pick a game</h1>
      <div className="game-grid">
        {GAMES.map((g) => (
          <Link
            key={g.href}
            href={g.href}
            className="game-tile"
            style={{ background: g.face, boxShadow: `0 6px 0 ${g.edge}` }}
            onClick={() => { feedback.unlock(); feedback.tap(); }}
          >
            {g.tag && <span className="tag" style={{ color: g.ink }}>{g.tag}</span>}
            <span className="art">{g.art}</span>
            <span className="name">{g.name}</span>
            <span className="sub">{g.sub}</span>
          </Link>
        ))}
      </div>
    </ShellPage>
  );
}
