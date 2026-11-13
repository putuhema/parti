"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { Piece } from "@/components/chess/Board";
import { ShellPage } from "@/components/shell";
import { Icon } from "@/components/ui";
import { Gem } from "@/components/trivia/common";
import { Portrait } from "@/components/faceoff/common";
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
  {
    href: "/faceoff",
    name: "Face Off",
    sub: "Guess the hidden face",
    face: "#D9489F",
    edge: "#B2347F",
    ink: "#B2347F",
    tag: "NEW",
    art: (
      <span style={{ display: "flex", gap: 6, transform: "rotate(-5deg)" }} aria-hidden="true">
        {[10, 0, 14].map((c, i) => (
          <span key={c} style={{ width: 38, borderRadius: 10, overflow: "hidden", background: "#fff", boxShadow: "0 3px 0 rgba(0,0,0,.16)", transform: `translateY(${i === 1 ? -8 : 4}px)`, opacity: i === 2 ? 0.45 : 1 }}><Portrait index={c} /></span>
        ))}
      </span>
    ),
  },
  {
    href: "/scramble",
    name: "Scramble",
    sub: "Swipe words in a grid",
    face: "#FF9600",
    edge: "#E08600",
    ink: "#9A5200",
    tag: "NEW",
    art: (
      <span style={{ display: "grid", gridTemplateColumns: "repeat(3, 26px)", gap: 4, transform: "rotate(5deg)" }} aria-hidden="true">
        {["W", "O", "R", "S", "D", "E", "T", "A", "L"].map((l, i) => (
          <span key={i} style={{ height: 26, borderRadius: 7, background: [0, 1, 2, 4].includes(i) ? "#FFC800" : "#fff", color: "#9A5200", fontSize: 14, fontWeight: 900, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 3px 0 rgba(0,0,0,.14)" }}>{l}</span>
        ))}
      </span>
    ),
  },
  {
    href: "/boom",
    name: "Juragan Nusantara",
    sub: "Buy up Indonesia, collect rent",
    face: "#C8362E",
    edge: "#9A2620",
    ink: "#9A2620",
    tag: "NEW",
    art: (
      <span style={{ display: "grid", gridTemplateColumns: "repeat(3, 28px)", gridTemplateRows: "repeat(3, 28px)", gap: 3, transform: "rotate(-6deg)" }} aria-hidden="true">
        {["#3DB6F2", "#F06CB4", "#FF9A1F", "#8B5BD6", "", "#EE4B4B", "#3DAE4A", "#F2C200", "#B0764A"].map((c, i) => (
          <span key={i} style={{ borderRadius: 7, background: c ? "#fff" : "transparent", borderTop: c ? `8px solid ${c}` : "none", fontSize: 18, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: c ? "0 3px 0 rgba(0,0,0,.2)" : "none" }}>{i === 4 ? "🎲" : i === 2 ? "🛖" : i === 6 ? "🏨" : ""}</span>
        ))}
      </span>
    ),
  },
  {
    href: "/tiles",
    name: "Tile Town",
    sub: "Cross words, score big",
    face: "#14A38B",
    edge: "#0E7D6A",
    ink: "#0E7D6A",
    tag: "NEW",
    art: (
      <span style={{ display: "grid", gridTemplateColumns: "repeat(3, 28px)", gridTemplateRows: "repeat(3, 28px)", gap: 3, transform: "rotate(-6deg)" }} aria-hidden="true">
        {["", "W", "", "T", "O", "P", "", "N", ""].map((l, i) => (
          <span key={i} style={{ borderRadius: 7, background: l ? "#F4CE78" : "rgba(255,255,255,.18)", color: "#4a3200", fontSize: 15, fontWeight: 900, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: l ? "inset 0 -3px 0 #DFB257, 0 3px 0 rgba(0,0,0,.14)" : "none" }}>{l}</span>
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
