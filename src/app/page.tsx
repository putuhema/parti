"use client";

import { useMutation, useQuery } from "convex/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { Piece } from "@/components/chess/Board";
import { ShellPage } from "@/components/shell";
import { Avatar, Icon, Mascot, Sheet, formatTime, paintFor, type MascotMood } from "@/components/ui";
import { Gem } from "@/components/trivia/common";
import { Portrait } from "@/components/faceoff/common";
import { errorText } from "@/lib/errors";
import { feedback } from "@/lib/feedback";
import { useIdentity } from "@/lib/identity";

type Category = "all" | "party" | "duo" | "brain" | "words";
type Game = {
  href: string;
  name: string;
  sub: string;
  face: string;
  edge: string;
  ink: string;
  cats: Exclude<Category, "all">[];
  tag?: string;
  thumb?: string;
  thumbPos?: string;
  art: ReactNode;
};

const GAMES: Game[] = [
  {
    href: "/spell",
    name: "Spellcaster",
    sub: "Trace 3D air runes & duel wizards",
    face: "#6B38E8",
    edge: "#4A1FB8",
    ink: "#3B1596",
    cats: ["duo", "party"],
    tag: "NEW",
    art: (
      <span style={{ position: "relative", width: 102, height: 88, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 36 }} aria-hidden="true">
        <span style={{ transform: "rotate(-12deg)" }}>🪄</span>
        <span style={{ transform: "translate(-4px, -10px)" }}>⚡</span>
        <span style={{ transform: "translate(-8px, 10px)", fontSize: 28 }}>🔥</span>
      </span>
    ),
  },
  {
    href: "/pose",
    name: "Pose Match",
    sub: "Strike poses on camera together",
    face: "#FF5B8A",
    edge: "#D63366",
    ink: "#B32453",
    cats: ["duo", "party"],
    tag: "NEW",
    art: (
      <span style={{ position: "relative", width: 106, height: 92, display: "flex", alignItems: "center", justifyContent: "center" }} aria-hidden="true">
        <span style={{ position: "absolute", left: 6, top: 10, width: 46, height: 58, borderRadius: 12, background: "#FFFDF8", boxShadow: "0 4px 0 rgba(0,0,0,.18)", transform: "rotate(-10deg)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", fontSize: 24 }}>🫶</span>
        <span style={{ position: "absolute", right: 6, top: 16, width: 46, height: 58, borderRadius: 12, background: "#FFFDF8", boxShadow: "0 4px 0 rgba(0,0,0,.18)", transform: "rotate(9deg)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", fontSize: 24 }}>✌️</span>
        <span style={{ position: "relative", fontSize: 30, transform: "translateY(14px)", filter: "drop-shadow(0 3px 0 rgba(0,0,0,.22))" }}>📸</span>
      </span>
    ),
  },
  {
    href: "/emface",
    name: "Emoji Face",
    sub: "Match goofy emojis with face AI",
    face: "#FFB020",
    edge: "#D98200",
    ink: "#9A5B00",
    cats: ["duo", "party"],
    tag: "NEW",
    art: (
      <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 36 }} aria-hidden="true">
        <span style={{ transform: "rotate(-10deg)" }}>😉</span>
        <span style={{ transform: "translateY(-6px) scale(1.1)" }}>🐡</span>
        <span style={{ transform: "rotate(10deg)" }}>🥺</span>
      </span>
    ),
  },
  {
    href: "/doodle",
    name: "Air Doodle",
    sub: "Draw neon in mid-air with hands",
    face: "#7C5CFF",
    edge: "#5938D6",
    ink: "#4A2BB8",
    cats: ["duo", "party"],
    tag: "NEW",
    art: (
      <span style={{ position: "relative", width: 100, height: 84, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 38 }} aria-hidden="true">
        <span style={{ transform: "rotate(-10deg)" }}>☝️</span>
        <span style={{ transform: "translate(-4px, -12px)" }}>✨</span>
      </span>
    ),
  },
  {
    href: "/split",
    name: "Split Booth",
    sub: "Stitch 2-half LDR couple photos",
    face: "#F05A9A",
    edge: "#C93A78",
    ink: "#A82A60",
    cats: ["duo"],
    tag: "NEW",
    art: (
      <span style={{ display: "flex", alignItems: "center", gap: 2 }} aria-hidden="true">
        <span style={{ width: 42, height: 58, borderRadius: "12px 0 0 12px", background: "#FFFDF8", display: "grid", placeItems: "center", fontSize: 24, boxShadow: "0 4px 0 rgba(0,0,0,.18)" }}>🫶</span>
        <span style={{ width: 42, height: 58, borderRadius: "0 12px 12px 0", background: "#FFE6F0", display: "grid", placeItems: "center", fontSize: 24, boxShadow: "0 4px 0 rgba(0,0,0,.18)" }}>💞</span>
      </span>
    ),
  },
  {
    href: "/heads",
    name: "Heads Up!",
    sub: "Forehead charades & tilt clues",
    face: "#28A6FF",
    edge: "#0F7FD6",
    ink: "#0B64AB",
    cats: ["duo", "party"],
    tag: "NEW",
    art: (
      <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 36 }} aria-hidden="true">
        <span style={{ transform: "rotate(-8deg)" }}>🗣️</span>
        <span style={{ transform: "rotate(8deg)" }}>📱</span>
      </span>
    ),
  },
  {
    href: "/risk",
    name: "Risk",
    sub: "Conquer 6 continents & clash dice",
    face: "#E0485C",
    edge: "#B2273C",
    ink: "#991E32",
    cats: ["brain", "party"],
    tag: "NEW",
    thumb: "/games/risk.jpg",
    art: (
      <span style={{ position: "relative", width: 106, height: 92, display: "flex", alignItems: "center", justifyContent: "center" }} aria-hidden="true">
        <span style={{ position: "absolute", width: 82, height: 64, borderRadius: 20, background: "linear-gradient(180deg,#8EDBFF,#4BB0EC)", boxShadow: "inset 0 2px 0 rgba(255,255,255,.65), 0 4px 0 rgba(0,0,0,.22)", transform: "rotate(-6deg)" }} />
        <span style={{ position: "absolute", left: 16, top: 22, width: 32, height: 22, borderRadius: 8, background: "#2CC770", boxShadow: "0 3px 0 #1B9B53", transform: "rotate(-6deg)" }} />
        <span style={{ position: "absolute", right: 16, top: 34, width: 34, height: 24, borderRadius: 8, background: "#FFBE3B", boxShadow: "0 3px 0 #DF8E00", transform: "rotate(5deg)" }} />
        <span style={{ position: "relative", fontSize: 34, transform: "translate(-4px, -4px) rotate(-10deg)", filter: "drop-shadow(0 3px 0 rgba(0,0,0,.25))" }}>⚔️</span>
        <span style={{ position: "absolute", right: 8, bottom: 6, width: 28, height: 28, borderRadius: 9, background: "#FFFDF8", color: "#E0485C", fontSize: 16, fontWeight: 900, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 3px 0 rgba(0,0,0,.22)", transform: "rotate(10deg)" }}>6</span>
      </span>
    ),
  },
  {
    href: "/orb",
    name: "Orbwick",
    sub: "Domino duels for wizards",
    face: "#6852A0",
    edge: "#473578",
    ink: "#56408D",
    cats: ["duo", "brain"],
    tag: "NEW",
    thumb: "/games/orb.jpg",
    art: (
      <span style={{ position: "relative", width: 104, height: 92 }} aria-hidden="true">
        <span style={{ position: "absolute", left: 4, top: 14, display: "flex", width: 72, height: 36, borderRadius: 10, background: "#FAF4EC", boxShadow: "0 3px 0 #34283E", transform: "rotate(-10deg)", alignItems: "center", justifyContent: "space-around", fontSize: 20, fontWeight: 900, color: "#34283E" }}><span>5</span><span>6</span></span>
        <span style={{ position: "absolute", left: 26, top: 48, display: "flex", width: 72, height: 36, borderRadius: 10, background: "#FFBE3B", boxShadow: "0 3px 0 #34283E", transform: "rotate(8deg)", alignItems: "center", justifyContent: "space-around", fontSize: 20, fontWeight: 900, color: "#34283E" }}><span>3</span><span>3</span></span>
        <span style={{ position: "absolute", right: 0, top: 0, width: 30, height: 30, borderRadius: "50%", background: "#F05A9A", border: "3px solid #FAF4EC" }} />
      </span>
    ),
  },
  {
    href: "/sudoku",
    name: "Sudoku",
    sub: "Race, co-op, daily",
    face: "#28A6FF",
    edge: "#0F7FD6",
    ink: "#0F7FD6",
    cats: ["brain", "duo"],
    thumb: "/games/sudoku.jpg",
    thumbPos: "50% 62%",
    art: (
      <span style={{ display: "grid", gridTemplateColumns: "repeat(3, 25px)", gap: 4, transform: "rotate(-6deg)" }} aria-hidden="true">
        {["5", "", "3", "", "7", "", "9", "", "1"].map((d, i) => (
          <span key={i} style={{ width: 25, height: 25, borderRadius: 8, background: i === 4 ? "#FFBE3B" : "#fff", color: "#0F7FD6", fontSize: 15, fontWeight: 900, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 3px 0 rgba(0,0,0,.14)" }}>{d}</span>
        ))}
      </span>
    ),
  },
  {
    href: "/chess",
    name: "Chess",
    sub: "Learn, play, variants",
    face: "#2CC770",
    edge: "#1B9B53",
    ink: "#178C49",
    cats: ["brain", "duo"],
    thumb: "/games/chess.jpg",
    thumbPos: "50% 62%",
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
    face: "#9775FF",
    edge: "#7350E0",
    ink: "#5E3CC4",
    cats: ["words", "duo"],
    thumb: "/games/words.jpg",
    art: (
      <span style={{ display: "flex", gap: 5 }} aria-hidden="true">
        {["K", "A", "T", "A"].map((l, i) => (
          <span key={i} style={{ width: 32, height: 38, borderRadius: 10, background: "#fff", color: "#5E3CC4", fontSize: 20, fontWeight: 900, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 3px 0 rgba(0,0,0,.14)", transform: `translateY(${i % 2 ? 6 : -4}px) rotate(${i % 2 ? 6 : -6}deg)` }}>{l}</span>
        ))}
      </span>
    ),
  },
  {
    href: "/trivia",
    name: "Quiz Loop",
    sub: "Trivia board game",
    face: "#504064",
    edge: "#342844",
    ink: "#4A3B5E",
    cats: ["party", "brain"],
    tag: "NEW",
    thumb: "/games/trivia.jpg",
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
    face: "#3578E5",
    edge: "#2258B5",
    ink: "#2258B5",
    cats: ["party", "brain"],
    tag: "NEW",
    thumb: "/games/buzz.jpg",
    art: (
      <span style={{ display: "grid", gridTemplateColumns: "repeat(3, 28px)", gap: 4, transform: "rotate(-5deg)" }} aria-hidden="true">
        {["100", "200", "🔥", "300", "", "400"].map((t, i) => (
          <span key={i} style={{ height: 24, borderRadius: 7, background: t ? (t === "🔥" ? "#FFBE3B" : "#fff") : "rgba(255,255,255,.25)", color: "#2258B5", fontSize: 11, fontWeight: 900, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 3px 0 rgba(0,0,0,.14)" }}>{t}</span>
        ))}
      </span>
    ),
  },
  {
    href: "/faceoff",
    name: "Face Off",
    sub: "Guess the hidden face",
    face: "#F05A9A",
    edge: "#C93A78",
    ink: "#B23069",
    cats: ["duo", "brain"],
    tag: "NEW",
    thumb: "/games/faceoff.jpg",
    art: (
      <span style={{ display: "flex", gap: 6, transform: "rotate(-5deg)" }} aria-hidden="true">
        {[10, 0, 14].map((c, i) => (
          <span key={c} style={{ width: 38, borderRadius: 11, overflow: "hidden", background: "#fff", boxShadow: "0 3px 0 rgba(0,0,0,.16)", transform: `translateY(${i === 1 ? -8 : 4}px)`, opacity: i === 2 ? 0.45 : 1 }}><Portrait index={c} /></span>
        ))}
      </span>
    ),
  },
  {
    href: "/scramble",
    name: "Scramble",
    sub: "Swipe words in a grid",
    face: "#FF8C1A",
    edge: "#D96D00",
    ink: "#9A4A00",
    cats: ["words", "brain"],
    tag: "NEW",
    thumb: "/games/scramble.jpg",
    art: (
      <span style={{ display: "grid", gridTemplateColumns: "repeat(3, 26px)", gap: 4, transform: "rotate(5deg)" }} aria-hidden="true">
        {["W", "O", "R", "S", "D", "E", "T", "A", "L"].map((l, i) => (
          <span key={i} style={{ height: 26, borderRadius: 8, background: [0, 1, 2, 4].includes(i) ? "#FFDE66" : "#fff", color: "#9A4A00", fontSize: 14, fontWeight: 900, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 3px 0 rgba(0,0,0,.14)" }}>{l}</span>
        ))}
      </span>
    ),
  },
  {
    href: "/island",
    name: "Lucky Island",
    sub: "Dice, gems and minigames",
    face: "#20BA9C",
    edge: "#138F77",
    ink: "#0E6B58",
    cats: ["party"],
    thumb: "/games/island.jpg",
    art: (
      <span style={{ position: "relative", width: 104, height: 92 }} aria-hidden="true">
        <span style={{ position: "absolute", left: 4, top: 10, width: 92, height: 68, borderRadius: "50%", background: "#F6E7B0", boxShadow: "0 4px 0 rgba(0,0,0,.18)" }} />
        <span style={{ position: "absolute", left: 14, top: 2, fontSize: 34 }}>🌴</span>
        <span style={{ position: "absolute", right: 12, top: 24, fontSize: 28 }}>💎</span>
        <span style={{ position: "absolute", left: 34, bottom: 6, fontSize: 28, transform: "rotate(-12deg)" }}>🎲</span>
      </span>
    ),
  },
  {
    href: "/chain",
    name: "Scribble Chain",
    sub: "Draw, guess, watch it drift",
    face: "#FF5B74",
    edge: "#D93852",
    ink: "#B02446",
    cats: ["party"],
    thumb: "/games/chain.jpg",
    art: (
      <span style={{ display: "flex", alignItems: "center", gap: 4, transform: "rotate(-4deg)" }} aria-hidden="true">
        <span style={{ width: 44, height: 44, borderRadius: 12, background: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28, boxShadow: "0 3px 0 rgba(0,0,0,.16)" }}>🐈</span>
        <span style={{ fontSize: 18, color: "#fff", fontWeight: 900 }}>➜</span>
        <span style={{ width: 44, height: 44, borderRadius: 12, background: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28, boxShadow: "0 3px 0 rgba(0,0,0,.16)", transform: "rotate(8deg)" }}>🥔</span>
      </span>
    ),
  },
  {
    href: "/bluff",
    name: "Bluff Bay",
    sub: "Pirate dice. Call LIAR!",
    face: "#3B72DF",
    edge: "#2855B0",
    ink: "#1E3F86",
    cats: ["party"],
    thumb: "/games/bluff.jpg",
    art: (
      <span style={{ position: "relative", width: 104, height: 92 }} aria-hidden="true">
        <span style={{ position: "absolute", left: 6, top: 8, fontSize: 40, transform: "rotate(-10deg)" }}>🎲</span>
        <span style={{ position: "absolute", right: 6, top: 18, fontSize: 34, transform: "rotate(12deg)" }}>🎲</span>
        <span style={{ position: "absolute", left: 16, bottom: 4, padding: "3px 10px", borderRadius: 999, background: "#FF5B74", color: "#fff", fontSize: 14, fontWeight: 900, boxShadow: "0 3px 0 rgba(0,0,0,.2)", transform: "rotate(-4deg)" }}>LIAR!</span>
      </span>
    ),
  },
  {
    href: "/stack",
    name: "Sky Stack",
    sub: "Tap to stack. Don't topple!",
    face: "#FFB21E",
    edge: "#DF8E00",
    ink: "#7A4A00",
    cats: ["party", "duo"],
    thumb: "/games/stack.jpg",
    art: (
      <span style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 3, width: 92 }} aria-hidden="true">
        {[[30, 44, "#FF5B74"], [18, 56, "#9775FF"], [10, 66, "#2CC770"], [4, 74, "#28A6FF"], [0, 84, "#fff"]].map(([l, w, c], i) => (
          <span key={i} style={{ marginLeft: l as number, width: w as number, height: 13, borderRadius: 5, background: c as string, boxShadow: "inset 0 -3px 0 rgba(0,0,0,.18)" }} />
        ))}
      </span>
    ),
  },
  {
    href: "/potato",
    name: "Hot Potato",
    sub: "Pass the bomb before it blows",
    face: "#FF6E24",
    edge: "#D44C08",
    ink: "#A83A00",
    cats: ["party"],
    thumb: "/games/potato.jpg",
    art: (
      <span style={{ position: "relative", width: 100, height: 90, display: "flex", alignItems: "center", justifyContent: "center" }} aria-hidden="true">
        <span style={{ position: "absolute", width: 74, height: 74, borderRadius: "50%", background: "radial-gradient(circle, rgba(255,230,120,.9), rgba(255,120,0,0) 70%)" }} />
        <span style={{ position: "relative", fontSize: 54, transform: "rotate(-12deg)" }}>💣</span>
        <span style={{ position: "absolute", right: 2, top: 4, fontSize: 24 }}>💥</span>
      </span>
    ),
  },
  {
    href: "/party",
    name: "Party Blitz",
    sub: "9 lightning-fast minigames",
    face: "#8245F5",
    edge: "#5F24CC",
    ink: "#5F24CC",
    cats: ["party"],
    thumb: "/games/party.jpg",
    art: (
      <span style={{ display: "grid", gridTemplateColumns: "repeat(3, 30px)", gap: 4, transform: "rotate(-6deg)" }} aria-hidden="true">
        {["👆", "🤠", "🎈", "🎯", "⚡", "🧠", "🔍", "🎨", "➕"].map((e, i) => (
          <span key={i} style={{ width: 30, height: 30, borderRadius: 10, background: i === 4 ? "#FFBE3B" : "#fff", boxShadow: "0 3px 0 rgba(0,0,0,.2)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 17 }}>{e}</span>
        ))}
      </span>
    ),
  },
  {
    href: "/emoji",
    name: "Emoji Charades",
    sub: "Say it only in emoji",
    face: "#FFA91F",
    edge: "#D98300",
    ink: "#8A4F00",
    cats: ["party", "words"],
    thumb: "/games/emoji.jpg",
    art: (
      <span style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }} aria-hidden="true">
        <span style={{ display: "flex", gap: 2, padding: "6px 10px", borderRadius: 14, background: "#fff", boxShadow: "0 3px 0 rgba(0,0,0,.18)", fontSize: 24, transform: "rotate(-5deg)" }}>🦁👑🌅</span>
        <span style={{ padding: "3px 10px", borderRadius: 999, background: "#fff", boxShadow: "0 3px 0 rgba(0,0,0,.18)", fontSize: 12, fontWeight: 900, color: "#8A4F00", transform: "rotate(4deg)" }}>lion king?</span>
      </span>
    ),
  },
  {
    href: "/truth",
    name: "Truth or Tale",
    sub: "Two truths, one lie, all the stories",
    face: "#9B62EB",
    edge: "#763EC4",
    ink: "#6A2FA5",
    cats: ["party", "duo"],
    thumb: "/games/truth.jpg",
    art: (
      <span style={{ display: "flex", flexDirection: "column", gap: 5, transform: "rotate(-5deg)" }} aria-hidden="true">
        {["✅", "🤥", "✅"].map((e, i) => (
          <span key={i} style={{ display: "flex", alignItems: "center", gap: 6, width: 98, height: 24, borderRadius: 9, background: i === 1 ? "#FFE48A" : "#fff", boxShadow: "0 2px 0 rgba(0,0,0,.18)", padding: "0 6px", fontSize: 14 }}>
            {e}<span style={{ flex: 1, height: 6, borderRadius: 3, background: "rgba(0,0,0,.12)" }} />
          </span>
        ))}
      </span>
    ),
  },
  {
    href: "/story",
    name: "Sneaky Story",
    sub: "Write together, hide a secret word",
    face: "#C27C3E",
    edge: "#945B24",
    ink: "#8A521C",
    cats: ["words", "party"],
    thumb: "/games/story.jpg",
    art: (
      <span style={{ position: "relative", width: 104, height: 90 }} aria-hidden="true">
        <span style={{ position: "absolute", left: 4, top: 6, width: 92, height: 72, borderRadius: 11, background: "repeating-linear-gradient(#FFFBF2 0 15px, #E9DCC4 15px 16px)", boxShadow: "0 3px 0 rgba(0,0,0,.2)", transform: "rotate(-5deg)", padding: "8px 8px", fontSize: 11, fontWeight: 900, color: "#5A3D1F", lineHeight: "16px", overflow: "hidden" }}>
          a cake shaped like a <span style={{ background: "#FFBE3B", borderRadius: 4, padding: "0 2px" }}>trombone</span>…
        </span>
        <span style={{ position: "absolute", right: 0, bottom: 0, fontSize: 32 }}>🔍</span>
      </span>
    ),
  },
  {
    href: "/brain",
    name: "Brain Swap",
    sub: "Learn a fact, teach your partner",
    face: "#1C9AF2",
    edge: "#0F76C2",
    ink: "#0B4F73",
    cats: ["duo", "brain"],
    thumb: "/games/brain.jpg",
    art: (
      <span style={{ position: "relative", width: 104, height: 90 }} aria-hidden="true">
        <span style={{ position: "absolute", left: 0, top: 8, width: 56, height: 70, borderRadius: 14, background: "#fff", boxShadow: "0 3px 0 rgba(0,0,0,.18)", transform: "rotate(-9deg)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 30 }}>🐙</span>
        <span style={{ position: "absolute", right: 0, top: 14, width: 56, height: 70, borderRadius: 14, background: "#fff", boxShadow: "0 3px 0 rgba(0,0,0,.18)", transform: "rotate(8deg)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 30 }}>🪐</span>
        <span style={{ position: "absolute", left: 32, top: 50, fontSize: 30 }}>🧠</span>
      </span>
    ),
  },
  {
    href: "/heist",
    name: "Heist Night",
    sub: "Co-op stealth for two",
    face: "#463775",
    edge: "#2D2154",
    ink: "#3B2F63",
    cats: ["duo", "brain"],
    thumb: "/games/heist.jpg",
    art: (
      <span style={{ position: "relative", width: 104, height: 92 }} aria-hidden="true">
        <span style={{ position: "absolute", left: 6, top: 30, width: 74, height: 40, background: "linear-gradient(90deg, rgba(255,200,0,.55), rgba(255,200,0,0))", clipPath: "polygon(0 40%, 100% 0, 100% 100%, 0 60%)" }} />
        <span style={{ position: "absolute", left: 0, top: 30, fontSize: 30 }}>👮</span>
        <span style={{ position: "absolute", right: 4, top: 2, fontSize: 34, filter: "drop-shadow(0 0 8px #8fe3ff)" }}>💎</span>
        <span style={{ position: "absolute", right: 30, bottom: 0, fontSize: 32 }}>🐈‍⬛</span>
        <span style={{ position: "absolute", right: 0, bottom: 4, fontSize: 28 }}>🪴</span>
      </span>
    ),
  },
  {
    href: "/sync",
    name: "In Sync",
    sub: "How well do you know each other?",
    face: "#EE5594",
    edge: "#C2336F",
    ink: "#9C2459",
    cats: ["duo", "party"],
    thumb: "/games/sync.jpg",
    art: (
      <span style={{ position: "relative", width: 100, height: 90 }} aria-hidden="true">
        <span style={{ position: "absolute", left: 0, top: 6, width: 54, height: 72, borderRadius: 14, background: "#fff", boxShadow: "0 3px 0 rgba(0,0,0,.18)", transform: "rotate(-9deg)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28 }}>🍜</span>
        <span style={{ position: "absolute", right: 0, top: 14, width: 54, height: 72, borderRadius: 14, background: "#fff", boxShadow: "0 3px 0 rgba(0,0,0,.18)", transform: "rotate(8deg)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28 }}>🍜</span>
        <span style={{ position: "absolute", left: 36, top: 52, fontSize: 28 }}>💞</span>
      </span>
    ),
  },
  {
    href: "/sketch",
    name: "Sketch Match",
    sub: "Describe it, draw it, match it",
    face: "#29B99B",
    edge: "#1A8E76",
    ink: "#167A65",
    cats: ["duo", "party"],
    thumb: "/games/sketch.jpg",
    art: (
      <span style={{ position: "relative", width: 96, height: 90 }} aria-hidden="true">
        <svg viewBox="0 0 100 100" width={70} height={70} style={{ position: "absolute", left: 0, top: 0, background: "#fff", borderRadius: 14, boxShadow: "0 3px 0 rgba(0,0,0,.18)", transform: "rotate(-8deg)" }}>
          <circle cx="36" cy="38" r="17" fill="none" stroke="#34283E" strokeWidth="6" />
          <path d="M58 82 L74 52 L90 82 Z" fill="none" stroke="#34283E" strokeWidth="6" strokeLinejoin="round" />
        </svg>
        <svg viewBox="0 0 100 100" width={58} height={58} style={{ position: "absolute", right: -4, bottom: 0, background: "#fff", borderRadius: 12, boxShadow: "0 3px 0 rgba(0,0,0,.18)", transform: "rotate(7deg)" }}>
          <path d="M20 40 C18 22 42 18 52 32 C60 46 44 58 30 54 C22 52 20 46 20 40" fill="none" stroke="#1C9AF2" strokeWidth="6" strokeLinecap="round" />
          <path d="M56 84 L72 54 L88 86 L56 84" fill="none" stroke="#1C9AF2" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
    ),
  },
  {
    href: "/boom",
    name: "Juragan Nusantara",
    sub: "Buy up Indonesia, collect rent",
    face: "#D9433B",
    edge: "#A82A23",
    ink: "#9A2620",
    cats: ["party", "brain"],
    thumb: "/games/boom.jpg",
    art: (
      <span style={{ display: "grid", gridTemplateColumns: "repeat(3, 28px)", gridTemplateRows: "repeat(3, 28px)", gap: 3, transform: "rotate(-6deg)" }} aria-hidden="true">
        {["#3DB6F2", "#F06CB4", "#FF9A1F", "#8B5BD6", "", "#EE4B4B", "#3DAE4A", "#F2C200", "#B0764A"].map((c, i) => (
          <span key={i} style={{ borderRadius: 7, background: c ? "#fff" : "transparent", borderTop: c ? `8px solid ${c}` : "none", fontSize: 18, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: c ? "0 3px 0 rgba(0,0,0,.2)" : "none" }}>{i === 4 ? "🎲" : i === 2 ? "🛖" : i === 6 ? "🏨" : ""}</span>
        ))}
      </span>
    ),
  },
  {
    href: "/ular",
    name: "Ular Tangga",
    sub: "Mystery boxes spawn snakes & ladders",
    face: "#3FA77A",
    edge: "#2B7A50",
    ink: "#1F5C3B",
    cats: ["party", "brain"],
    thumb: "/games/ular.jpg",
    art: (
      <span style={{ display: "grid", gridTemplateColumns: "repeat(3, 28px)", gridTemplateRows: "repeat(3, 28px)", gap: 3, transform: "rotate(-6deg)" }} aria-hidden="true">
        {["#1CB0F6", "#58CC02", "#FFC800", "#CE82FF", "#FF9600", "#FF4B4B", "#58CC02", "#1CB0F6", "#FFC800"].map((c, i) => (
          <span key={i} style={{ borderRadius: 7, background: "#fff", borderTop: `8px solid ${c}`, fontSize: 17, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 3px 0 rgba(0,0,0,.2)" }}>{i === 1 ? "🐍" : i === 6 ? "🪜" : i === 4 ? "❓" : ""}</span>
        ))}
      </span>
    ),
  },
  {
    href: "/tiles",
    name: "Tile Town",
    sub: "Cross words, score big",
    face: "#18AA90",
    edge: "#0F826E",
    ink: "#0E7D6A",
    cats: ["words", "brain"],
    tag: "NEW",
    thumb: "/games/tiles.jpg",
    art: (
      <span style={{ display: "grid", gridTemplateColumns: "repeat(3, 28px)", gridTemplateRows: "repeat(3, 28px)", gap: 3, transform: "rotate(-6deg)" }} aria-hidden="true">
        {["", "W", "", "T", "O", "P", "", "N", ""].map((l, i) => (
          <span key={i} style={{ borderRadius: 7, background: l ? "#FFCE5C" : "rgba(255,255,255,.18)", color: "#4a3200", fontSize: 15, fontWeight: 900, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: l ? "inset 0 -3px 0 #DF9E20, 0 3px 0 rgba(0,0,0,.14)" : "none" }}>{l}</span>
        ))}
      </span>
    ),
  },
];

const CATS: { id: Category; label: string }[] = [
  { id: "all", label: "All games" },
  { id: "party", label: "Party" },
  { id: "duo", label: "2-Player" },
  { id: "brain", label: "Brain" },
  { id: "words", label: "Words" },
];

const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
const RECENT_KEY = "pums:recent-games";
const EMPTY_RECENT = "[]";

function subscribeRecent(cb: () => void) {
  window.addEventListener("storage", cb);
  window.addEventListener("pums:recent", cb);
  return () => {
    window.removeEventListener("storage", cb);
    window.removeEventListener("pums:recent", cb);
  };
}

function getRecentSnapshot() {
  try { return localStorage.getItem(RECENT_KEY) || EMPTY_RECENT; } catch { return EMPTY_RECENT; }
}

const KUBO_REACTIONS: { mood: MascotMood; quip: string }[] = [
  { mood: "happy", quip: "Pick a game and invite a friend — rooms open in 1 tap!" },
  { mood: "joy", quip: "Yay! Let's beat your best streak today!" },
  { mood: "think", quip: "Can't decide? Hit Surprise me and I'll pick!" },
  { mood: "wow", quip: "Whoa, you found my secret bounce button!" },
];

function timeGreeting(name: string): string {
  const h = new Date().getHours();
  if (h < 12) return `Morning, ${name}!`;
  if (h < 18) return `Hey ${name}, ready to play?`;
  return `Game night, ${name}?`;
}

export default function Home() {
  const { me } = useIdentity();
  const router = useRouter();
  const daily = useQuery(api.daily.today, {});
  const invites = useQuery(api.invites.mine);
  const dismissInvite = useMutation(api.invites.dismiss);
  const joinAny = useMutation(api.chess.joinAny);

  const [cat, setCat] = useState<Category>("all");
  const recentRaw = useSyncExternalStore(subscribeRecent, getRecentSnapshot, () => EMPTY_RECENT);
  const recent = useMemo(() => {
    try {
      const parsed = JSON.parse(recentRaw);
      return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string").slice(0, 4) : [];
    } catch { return []; }
  }, [recentRaw]);
  const [tapIdx, setTapIdx] = useState(0);
  const [mood, setMood] = useState<MascotMood>("idle");
  const [nudge, setNudge] = useState(0);
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [joinOpen, setJoinOpen] = useState(false);
  const [code, setCode] = useState("");
  const [joinError, setJoinError] = useState("");
  const [joining, setJoining] = useState(false);

  useEffect(() => {
    return () => { if (resetTimer.current) clearTimeout(resetTimer.current); };
  }, []);

  function rememberGame(href: string) {
    try {
      const next = [href, ...recent.filter((h) => h !== href)].slice(0, 4);
      localStorage.setItem(RECENT_KEY, JSON.stringify(next));
      window.dispatchEvent(new Event("pums:recent"));
    } catch {}
  }

  function tapKubo() {
    feedback.unlock();
    const nextIdx = (tapIdx + 1) % KUBO_REACTIONS.length;
    const rx = KUBO_REACTIONS[nextIdx];
    setTapIdx(nextIdx);
    setMood(rx.mood);
    setNudge((n) => n + 1);
    if (rx.mood === "joy") feedback.correct();
    else feedback.tap();
    if (resetTimer.current) clearTimeout(resetTimer.current);
    resetTimer.current = setTimeout(() => setMood("idle"), 2600);
  }

  function surpriseMe() {
    feedback.unlock();
    feedback.correct();
    const pool = cat === "all" ? GAMES : GAMES.filter((g) => g.cats.includes(cat));
    const pick = pool[Math.floor(Math.random() * pool.length)] ?? GAMES[0];
    rememberGame(pick.href);
    router.push(pick.href);
  }

  async function submitJoin(e: React.FormEvent) {
    e.preventDefault();
    if (code.length !== 4 || joining) return;
    feedback.unlock();
    setJoinError("");
    setJoining(true);
    try {
      const path = await joinAny({ code });
      feedback.correct();
      setJoinOpen(false);
      router.push(path);
    } catch (err) {
      feedback.wrong();
      setJoinError(errorText(err, "Couldn't find that room"));
      setJoining(false);
    }
  }

  const visibleGames = useMemo(
    () => (cat === "all" ? GAMES : GAMES.filter((g) => g.cats.includes(cat))),
    [cat]
  );

  const recentGames = useMemo(
    () => recent.map((h) => GAMES.find((g) => g.href === h)).filter((g): g is Game => Boolean(g)),
    [recent]
  );

  const d = daily ? new Date(daily.date + "T00:00:00Z") : null;
  const bestFriend = daily?.friends.find((f) => f.timeMs !== undefined);
  const dailyDone = daily?.run?.timeMs !== undefined;
  const dailyLine = !daily
    ? "Today's Sudoku is waiting"
    : dailyDone
      ? `Solved in ${formatTime(daily.run!.timeMs!)} · see how you rank`
      : bestFriend
        ? `${bestFriend.name} finished in ${formatTime(bestFriend.timeMs!)} — beat them!`
        : "Same puzzle for everyone · 1 try";

  const activeQuip =
    tapIdx > 0
      ? KUBO_REACTIONS[tapIdx].quip
      : me.streak > 0
        ? `${me.streak}-day streak! Tap me or pick a game below.`
        : "Tap me to say hi, or pick any game to start a room!";

  return (
    <ShellPage
      tab="games"
      gap={14}
      right={
        <>
          <Link href="/leaderboard" className="stat-pill" style={{ color: "var(--tangerine-ink)" }} aria-label={`${me.streak} day streak`} onClick={() => feedback.tap()}>
            <Icon.Flame size={19} className={me.streak ? "flick" : undefined} />{me.streak}
          </Link>
          <Link href="/leaderboard" className="stat-pill" style={{ color: "var(--sun-ink)" }} aria-label={`${me.wins} wins`} onClick={() => feedback.tap()}>
            <Icon.Trophy size={19} />{me.wins}
          </Link>
        </>
      }
    >
      {/* Interactive 3D Kubo Toybox Hero */}
      <section className="toy-hero">
        <button type="button" className="toy-hero-mascot" onClick={tapKubo} aria-label="Say hi to Kubo">
          <Mascot size={78} mood={mood} nudgeSignal={nudge} />
        </button>
        <div className="toy-hero-body">
          <h1 className="toy-hero-title">{timeGreeting(me.name)}</h1>
          <p className="toy-hero-quip">{activeQuip}</p>
          <div className="toy-hero-actions">
            <button type="button" className="toy-mini-btn gold" onClick={surpriseMe}>🎲 Surprise me</button>
            <button
              type="button"
              className="toy-mini-btn"
              onClick={() => { feedback.unlock(); feedback.tap(); setJoinError(""); setCode(""); setJoinOpen(true); }}
            >
              🔑 Join code
            </button>
          </div>
        </div>
      </section>

      {/* Live Friend Invites right on Home */}
      {invites && invites.length > 0 && (
        <section style={{ display: "flex", flexDirection: "column", gap: 8 }} aria-label="Live game invites">
          {invites.map((inv) => (
            <div key={inv.id} className="rise fr-invite">
              <Avatar name={inv.from} paint={paintFor(inv.fromId)} size={38} />
              <span style={{ display: "flex", flexDirection: "column", flex: 1, minWidth: 0 }}>
                <span style={{ fontSize: 15, fontWeight: 800, lineHeight: 1.2 }}>{inv.from} invited you!</span>
                <span style={{ fontSize: 12.5, fontWeight: 700, color: "var(--sun-ink)" }}>{inv.game} · {inv.code}</span>
              </span>
              <button
                className="btn btn-green btn-sm"
                onClick={() => {
                  feedback.unlock();
                  feedback.correct();
                  void dismissInvite({ id: inv.id as Id<"invites"> }).catch(() => {});
                  router.push(inv.path);
                }}
              >
                Join
              </button>
              <button
                className="icon-btn"
                style={{ width: 34, height: 34, borderRadius: 999 }}
                aria-label={`Dismiss invite from ${inv.from}`}
                onClick={() => { feedback.tap(); void dismissInvite({ id: inv.id as Id<"invites"> }); }}
              >
                <Icon.Close size={13} />
              </button>
            </div>
          ))}
        </section>
      )}

      {/* Daily Comeback Card */}
      <Link href="/daily" className="toy-daily" onClick={() => { feedback.unlock(); feedback.tap(); }}>
        <span className="toy-cal">
          <em>{d ? MONTHS[d.getUTCMonth()] : "TODAY"}</em>
          <b>{d ? d.getUTCDate() : "·"}</b>
        </span>
        <span style={{ display: "flex", flexDirection: "column", gap: 2, flex: 1, minWidth: 0 }}>
          <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span className="display" style={{ fontSize: 18, color: "#4A2D00" }}>Daily Duel</span>
            {dailyDone && <span className="chip" style={{ background: "#2CC770", color: "#fff", padding: "2px 8px", fontSize: 10 }}>DONE</span>}
          </span>
          <span style={{ fontSize: 13, fontWeight: 700, color: "#7A4A00", lineHeight: 1.25 }}>{dailyLine}</span>
        </span>
        <Icon.Chevron size={18} color="#9A6400" />
      </Link>

      {/* Jump Back In (Recently Played) */}
      {recentGames.length > 0 && (
        <section style={{ display: "flex", flexDirection: "column", gap: 6 }} aria-label="Jump back in">
          <span className="label" style={{ paddingLeft: 4 }}>Jump back in</span>
          <div className="toy-recent">
            {recentGames.map((g) => (
              <Link
                key={g.href}
                href={g.href}
                className="toy-recent-pill"
                onClick={() => { feedback.unlock(); feedback.tap(); rememberGame(g.href); }}
              >
                <span className="toy-recent-dot" style={{ background: g.face }} />
                <span>{g.name}</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Category Filter Pills */}
      <div className="toy-cats" role="group" aria-label="Filter games by category">
        {CATS.map((c) => (
          <button
            key={c.id}
            type="button"
            className="toy-cat"
            aria-pressed={cat === c.id}
            onClick={() => { feedback.unlock(); feedback.tap(); setCat(c.id); }}
          >
            {c.label}
          </button>
        ))}
      </div>

      {/* Toybox Vinyl Game Grid */}
      <div className="game-grid">
        {visibleGames.map((g) => (
          <Link
            key={g.href}
            href={g.href}
            className={`game-tile${g.thumb ? " has-thumb" : ""}`}
            style={{ background: g.face, boxShadow: `0 5px 0 ${g.edge}, 0 12px 20px rgba(52, 40, 62, 0.14)` }}
            onClick={() => { feedback.unlock(); feedback.tap(); rememberGame(g.href); }}
          >
            {g.thumb ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={g.thumb}
                alt=""
                aria-hidden="true"
                className="thumb"
                style={g.thumbPos ? { objectPosition: g.thumbPos } : undefined}
              />
            ) : (
              <span className="art">{g.art}</span>
            )}
            {g.tag && <span className="tag" style={{ color: g.ink }}>{g.tag}</span>}
            <span className="name">{g.name}</span>
            <span className="sub">{g.sub}</span>
          </Link>
        ))}
      </div>

      {/* Quick Join-by-Code Sheet */}
      <Sheet open={joinOpen} onClose={() => setJoinOpen(false)} label="Join a room with a code">
        <form onSubmit={submitJoin} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <h2 className="display" style={{ margin: 0, fontSize: 24, textAlign: "center" }}>Join a friend&apos;s room</h2>
          <label htmlFor="home-code" className="label" style={{ textAlign: "center" }}>4-letter room code</label>
          <input
            id="home-code"
            className="input code"
            autoFocus
            autoCapitalize="characters"
            autoComplete="off"
            maxLength={4}
            placeholder="KUBO"
            value={code}
            onChange={(e) => { setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "")); setJoinError(""); }}
          />
          {joinError && <p role="alert" style={{ margin: 0, color: "var(--cherry-edge)", fontWeight: 800, textAlign: "center" }}>{joinError}</p>}
          <button className="btn btn-green" disabled={code.length !== 4 || joining}>
            {joining ? "Joining…" : "Join room"}
          </button>
        </form>
      </Sheet>
    </ShellPage>
  );
}
