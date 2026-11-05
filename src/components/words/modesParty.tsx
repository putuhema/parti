"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useState } from "react";
import { CATEGORIES, EMOJI, PROMPTS, RIDDLES } from "../../../convex/lib/words/content";
import { Avatar, Heart, roomPaints } from "@/components/ui";
import { feedback } from "@/lib/feedback";
import { useNow } from "@/lib/hooks";
import { AnswerBox, ScoreBar, Tiles, TimerBar, WordsHeader } from "./common";
import type { ModeProps } from "./Play";

function useDraft(key: number) {
  const [d, setD] = useState({ key, t: "" });
  return [d.key === key ? d.t : "", (t: string) => setD({ key, t })] as const;
}
const say2 = (lang: string, en: string, id: string) => (lang === "id" ? id : lang === "mix" && id !== en ? `${id} · ${en}` : en);

function Reveal({ who, word, paint, delay = 0 }: { who: string; word: string; paint: { soft: string; face: string; ink: string }; delay?: number }) {
  return (
    <div className="reveal-card" style={{ background: paint.soft, border: `2px solid ${paint.face}`, animationDelay: `${delay}ms` }}>
      <span style={{ fontSize: 12, fontWeight: 900, letterSpacing: ".06em", color: paint.ink }}>{who.toUpperCase()}</span>
      <span style={{ fontSize: 22, fontWeight: 900, letterSpacing: ".04em" }}>{word ? word.toUpperCase() : "—"}</span>
    </div>
  );
}

// ---------- Chemistry ----------
export function ChemistryMode({ room, v, send, nameOf }: ModeProps) {
  const g = room.game!;
  const [text, setText] = useDraft(g.round);
  const p = PROMPTS[v.prompt];
  const opp = g.players.find((x) => x !== room.meId)!;
  const paints = roomPaints(room.members);
  const reveal = g.phase === "reveal";
  return (
    <>
      <WordsHeader room={room} right={<span style={{ fontSize: 15, fontWeight: 900, color: "var(--muted)" }}>Round {g.round + 1} of {g.rounds}</span>} />
      <section style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <span style={{ display: "flex", justifyContent: "space-between", fontSize: 15, fontWeight: 900 }}><span>Team chemistry</span><span style={{ color: "#A3247A" }}>{v.matches} matched</span></span>
        <span style={{ display: "grid", gridTemplateColumns: `repeat(${g.rounds}, minmax(0, 1fr))`, gap: 4 }} aria-hidden="true">
          {Array.from({ length: g.rounds }, (_, i) => {
            const h = [...v.history].reverse()[i] ?? (reveal && i === g.round ? { match: v.match } : null);
            return <span key={i} style={{ height: 12, borderRadius: 6, background: h ? (h.match ? "#FF86D0" : "#FFDFE0") : "var(--line)" }} />;
          })}
        </span>
      </section>
      <section className="panel" style={{ background: "#FF86D0", boxShadow: "0 5px 0 #E06BB5", alignItems: "center", textAlign: "center" }}>
        <span style={{ fontSize: 12, fontWeight: 900, letterSpacing: ".08em", color: "#5A0F44" }}>FINISH THE PHRASE · LENGKAPI</span>
        <span style={{ fontSize: 32, fontWeight: 900, color: "#fff", textShadow: "0 3px 0 #C2459A", lineHeight: 1.15 }}>{say2(room.lang, p.en, p.id)}</span>
      </section>
      {!reveal && <TimerBar deadline={g.deadline} total={25_000} />}
      {reveal ? (
        <section style={{ position: "relative", display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 10 }}>
          <Reveal who="You" word={v.mine ?? ""} paint={paints.get(room.meId)!} />
          <Reveal who={nameOf(opp)} word={v.theirs ?? ""} paint={paints.get(opp)!} delay={150} />
          <span className="stamp" style={{ position: "absolute", left: "50%", top: "50%", margin: "-24px 0 0 -70px", width: 140, height: 48, borderRadius: 14, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, fontWeight: 900, letterSpacing: ".06em", color: "#fff", background: v.match ? "var(--lime)" : "#AFAFAF", boxShadow: `0 4px 0 ${v.match ? "var(--lime-edge)" : "#8F8F8F"}`, animationDelay: "350ms" }}>{v.match ? "MATCH!" : "NO MATCH"}</span>
        </section>
      ) : v.mine ? (
        <section className="panel" style={{ background: "var(--sky-soft)", alignItems: "center" }}>
          <span className="label" style={{ color: "var(--sky-edge)" }}>You said</span>
          <span style={{ fontSize: 24, fontWeight: 900 }}>{v.mine.toUpperCase()}</span>
          <span className="wait" style={{ fontSize: 15, fontWeight: 900, color: "var(--sky-edge)" }}>{v.locked[opp] ? "Revealing…" : `Waiting for ${nameOf(opp)}…`}</span>
        </section>
      ) : (
        <>
          <AnswerBox value={text} onChange={setText} placeholder="Type what comes to mind" button="Lock" onSubmit={() => { feedback.tap(); void send("answer", { text }); }} />
          <p style={{ margin: 0, textAlign: "center", fontSize: 14, fontWeight: 800, color: v.locked[opp] ? "var(--lime-dark)" : "var(--muted)" }}>{v.locked[opp] ? `${nameOf(opp)} locked in ✓` : `${nameOf(opp)} is thinking…`} English or Indonesian both count.</p>
        </>
      )}
      {v.history.length > 0 && (
        <section className="list" aria-label="Earlier rounds">
          {v.history.slice(0, 4).map((h: any, i: number) => (
            <div key={i} className="list-row" style={{ minHeight: 44 }}>
              <span style={{ width: 88, fontSize: 13, fontWeight: 900, color: "var(--muted)" }}>{say2(room.lang === "mix" ? "id" : room.lang, PROMPTS[h.prompt].en, PROMPTS[h.prompt].id)}</span>
              <span style={{ flex: 1, fontSize: 14, fontWeight: 900 }}>{(h.answers[room.meId] ?? "—").toUpperCase()} · {(h.answers[opp] ?? "—").toUpperCase()}</span>
              <span className="chip" style={{ background: h.match ? "#FFE3F4" : "var(--mist)", color: h.match ? "#A3247A" : "var(--muted)", padding: "4px 8px", fontSize: 12 }}>{h.match ? "MATCH" : "MISS"}</span>
            </div>
          ))}
        </section>
      )}
      <div className="grow" />
      {reveal && !g.done && <button className="btn btn-green" onClick={() => void send("next")}>Next prompt</button>}
    </>
  );
}

// ---------- Don't Say It ----------
const WHY: Record<string, string> = { banned: "banned word!", repeat: "said before", wrong: "doesn't fit", time: "no answer" };
export function DontSayMode({ room, v, send, nameOf }: ModeProps) {
  const g = room.game!;
  const [text, setText] = useDraft(g.round);
  const c = CATEGORIES[v.cat];
  const opp = g.players.find((x) => x !== room.meId)!;
  const paints = roomPaints(room.members);
  const reveal = g.phase === "reveal";
  const bans = c.ban.filter((b, i, a) => a.indexOf(b) === i);
  return (
    <>
      <WordsHeader room={room} right={<span style={{ fontSize: 15, fontWeight: 900, color: "var(--muted)" }}>Round {g.round + 1}</span>} />
      <section style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 8 }}>
        {g.players.map((id) => (
          <div key={id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", borderRadius: 16, border: "2px solid var(--line)" }}>
            <Avatar name={room.members.find((m) => m.id === id)?.name ?? "?"} paint={paints.get(id)!} size={30} />
            <span style={{ display: "flex", flexDirection: "column", flex: 1, gap: 2 }}>
              <span style={{ fontSize: 14, fontWeight: 900 }}>{nameOf(id)}</span>
              <span style={{ display: "flex", gap: 2 }} aria-label={`${v.hearts[id]} hearts`}>{[0, 1, 2].map((k) => <Heart key={k} on={k < v.hearts[id]} size={16} />)}</span>
            </span>
            {!reveal && <span style={{ fontSize: 11, fontWeight: 900, color: v.locked[id] ? "var(--lime-dark)" : "var(--muted)" }}>{v.locked[id] ? "LOCKED ✓" : "…"}</span>}
          </div>
        ))}
      </section>
      <section className="panel" style={{ background: "var(--tangerine)", boxShadow: "0 5px 0 var(--tangerine-edge)", alignItems: "center", textAlign: "center", color: "#fff" }}>
        <span style={{ fontSize: 12, fontWeight: 900, letterSpacing: ".08em", color: "#3C2400" }}>CATEGORY · {"★".repeat(c.tier)}</span>
        <span style={{ fontSize: 28, fontWeight: 900, lineHeight: 1.1, textShadow: "0 3px 0 #C26F00" }}>{say2(room.lang, c.en, c.id)}</span>
        <span style={{ display: "flex", alignItems: "center", gap: 8, background: "#fff", color: "#B81F1F", padding: "7px 12px", borderRadius: 14, boxShadow: "0 4px 0 #E08600", fontSize: 17, fontWeight: 900 }}>
          DON&apos;T SAY: <span style={{ textDecoration: "line-through" }}>{bans.map((b) => b.toUpperCase()).join(" / ")}</span>
        </span>
        {c.tier >= 3 && <span style={{ fontSize: 13, fontWeight: 900, color: "#3C2400", background: "#FFE2B8", padding: "4px 10px", borderRadius: 10 }}>Only a few answers left. No repeats!</span>}
      </section>
      {!reveal && <TimerBar deadline={g.deadline} total={15_000} />}
      {reveal ? (
        <section style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 10 }}>
          {[room.meId, opp].map((id, k) => {
            const vd = v.verdict[id] ?? { ok: false, why: "time" };
            const ans = id === room.meId ? v.mine : v.theirs;
            return (
              <div key={id} className="reveal-card" style={{ background: vd.ok ? "#D7FFB8" : "var(--cherry-soft)", animationDelay: `${k * 150}ms` }}>
                <span style={{ fontSize: 12, fontWeight: 900, letterSpacing: ".06em", color: vd.ok ? "#2F6E00" : "#B81F1F" }}>{nameOf(id).toUpperCase()}</span>
                <span style={{ fontSize: 22, fontWeight: 900, textDecoration: vd.ok ? "none" : "line-through" }}>{ans ? ans.toUpperCase() : "—"}</span>
                <span style={{ fontSize: 13, fontWeight: 900, color: vd.ok ? "#2F6E00" : "#B81F1F" }}>{vd.ok ? "Safe ✓" : `−1 heart · ${WHY[vd.why]}`}</span>
              </div>
            );
          })}
        </section>
      ) : v.mine ? (
        <p className="wait" style={{ margin: 0, textAlign: "center", fontSize: 16, fontWeight: 900, color: "var(--sky-edge)", background: "var(--sky-soft)", padding: 14, borderRadius: 16 }}>You locked {v.mine.toUpperCase()}. Waiting for {nameOf(opp)}…</p>
      ) : (
        <AnswerBox value={text} onChange={setText} placeholder="Your secret answer" button="Lock" onSubmit={() => { feedback.tap(); void send("answer", { text }); }} />
      )}
      {v.used.length > 0 && <p style={{ margin: 0, fontSize: 13, fontWeight: 800, color: "var(--muted)", textAlign: "center" }}>You already said: {v.used.map((u: string) => u.toUpperCase()).join(", ")}</p>}
      <div className="grow" />
      {reveal && !g.done && <button className="btn btn-green" onClick={() => void send("next")}>Next category</button>}
    </>
  );
}

// ---------- Spy Word ----------
export function SpyMode({ room, v, send, say, nameOf }: ModeProps) {
  const g = room.game!;
  const [clue, setClue] = useDraft(g.seq);
  const [n, setN] = useState(1);
  const now = useNow(1000);
  const giver = v.giver === room.meId;
  const guesser = !giver;
  const left = g.deadline ? Math.max(0, Math.ceil((g.deadline - now) / 1000)) : 0;
  const maxN = Math.max(1, Math.min(3, v.partnerLeft));
  const partner = g.players.find((x) => x !== room.meId)!;
  return (
    <>
      <WordsHeader room={room} right={<span style={{ fontSize: 17, fontWeight: 900, fontVariantNumeric: "tabular-nums", color: left < 30 ? "var(--cherry-edge)" : "var(--muted)" }}>{Math.floor(left / 60)}:{String(left % 60).padStart(2, "0")}</span>} />
      <section style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ flex: 1, display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={{ fontSize: 13, fontWeight: 900, letterSpacing: ".04em", color: "var(--lime-dark)" }}>TEAM FOUND {v.found.length} OF 6</span>
          <span style={{ display: "grid", gridTemplateColumns: "repeat(6, minmax(0, 1fr))", gap: 4 }}>{Array.from({ length: 6 }, (_, i) => <span key={i} style={{ height: 10, borderRadius: 5, background: i < v.found.length ? "var(--lime)" : "var(--line)" }} />)}</span>
        </span>
        <span style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
          <span style={{ fontSize: 13, fontWeight: 900, letterSpacing: ".04em", color: "#B81F1F" }}>MISSES</span>
          <span style={{ display: "flex", gap: 4 }} aria-label={`${v.misses} of 3 misses`}>{[0, 1, 2].map((i) => <span key={i} style={{ width: 22, height: 22, borderRadius: 7, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 900, background: i < v.misses ? "var(--cherry)" : "#F0F0F0", color: i < v.misses ? "#fff" : "#CFCFCF" }}>✕</span>)}</span>
        </span>
      </section>
      <section className="panel" style={{ background: "#2B70C9", boxShadow: "0 5px 0 #1F57A0", color: "#fff", flexDirection: "row", alignItems: "center", gap: 12, minHeight: 74 }}>
        {v.clue ? (
          <>
            <span style={{ display: "flex", flexDirection: "column", flex: 1 }}>
              <span style={{ fontSize: 12, fontWeight: 900, letterSpacing: ".08em" }}>{giver ? "YOUR CLUE" : `${nameOf(v.giver).toUpperCase()}'S CLUE`}</span>
              <span style={{ fontSize: 26, fontWeight: 900, letterSpacing: ".04em" }}>{v.clue.word.toUpperCase()} · {v.clue.n}</span>
            </span>
            <span style={{ fontSize: 13, fontWeight: 900, background: "#fff", color: "#1F57A0", padding: "6px 10px", borderRadius: 10 }}>{v.clue.left} left</span>
          </>
        ) : (
          <span className={giver ? undefined : "wait"} style={{ fontSize: 17, fontWeight: 900 }}>{giver ? `Give ${nameOf(partner)} a one-word clue` : `Waiting for ${nameOf(v.giver)}'s clue…`}</span>
        )}
      </section>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 7 }} role="grid" aria-label="Word grid">
        {v.words.map((w: string, i: number) => {
          const found = v.found.includes(i), wrong = v.wrong.includes(i), mine = v.partnerTargets.includes(i) && !found;
          const can = guesser && g.phase === "guess" && !found && !wrong;
          return (
            <button key={i} className="wcard" disabled={!can} aria-label={`${w}${found ? ", found" : wrong ? ", miss" : ""}${mine ? ", your friend's target" : ""}`} onClick={async () => { const r = await send("tap", { n: i }); if (r?.hit) { feedback.correct(); say("Found it!", "good"); } else if (r) { feedback.wrong(); say("Miss!", "bad"); } }}
              style={found ? { background: "var(--lime)", borderColor: "var(--lime)", color: "#fff", boxShadow: "0 4px 0 var(--lime-edge)" } : wrong ? { background: "#F0F0F0", borderColor: "#F0F0F0", color: "#AFAFAF", boxShadow: "none", textDecoration: "line-through" } : { fontSize: w.length > 7 ? 11 : 13 }}>
              {w}
              {mine && <span style={{ position: "absolute", right: 5, top: 5, width: 9, height: 9, borderRadius: 5, background: "var(--tangerine)" }} />}
            </button>
          );
        })}
      </div>
      <p style={{ margin: 0, textAlign: "center", fontSize: 13, fontWeight: 800, color: "var(--muted)" }}>Orange dots = words {nameOf(partner)} must find. You can&apos;t see your own!</p>
      <div className="grow" />
      {giver && g.phase === "clue" && (
        <>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <span className="label">Words</span>
            {[1, 2, 3].map((k) => <button key={k} className="seg" style={{ flex: 1 }} disabled={k > maxN} aria-pressed={Math.min(n, maxN) === k} onClick={() => setN(k)}>{k}</button>)}
          </div>
          <AnswerBox value={clue} onChange={setClue} placeholder="One-word clue" button="Send" onSubmit={() => { feedback.tap(); void send("clue", { text: clue, n: Math.min(n, maxN) }); }} />
        </>
      )}
      {guesser && g.phase === "guess" && <button className="btn btn-white" onClick={() => void send("end")}>End turn</button>}
      {giver && g.phase === "guess" && <p className="wait" style={{ margin: 0, textAlign: "center", fontSize: 16, fontWeight: 900, color: "var(--muted)" }}>{nameOf(partner)} is guessing…</p>}
    </>
  );
}

// ---------- Odd One Out ----------
export function OddMode({ room, v, send, say, nameOf }: ModeProps) {
  const g = room.game!;
  const maker = v.maker === room.meId;
  const other = g.players.find((x) => x !== room.meId)!;
  const [words, setWords] = useState(["", "", "", ""]);
  const [oddI, setOddI] = useState(3);
  const [link, setLink] = useState("");
  const s = v.set;
  return (
    <>
      <WordsHeader room={room} right={<span style={{ fontSize: 15, fontWeight: 900, color: "var(--muted)" }}>Round {g.round + 1} of {g.rounds}</span>} />
      <ScoreBar room={room} highlight={maker ? other : room.meId} />
      {g.phase === "make" && (maker ? (
        <section style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 900 }}>Make a set for {nameOf(other)}</h1>
          <button className="btn btn-green" onClick={() => { feedback.tap(); void send("ready"); }}>Use a ready-made set</button>
          <span className="label" style={{ textAlign: "center" }}>or make your own · tap the odd one</span>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 8 }}>
            {words.map((w, i) => (
              <div key={i} style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <button className="wkey" style={{ width: 40, minHeight: 40, flexShrink: 0, ...(oddI === i ? { background: "var(--cherry)", borderColor: "var(--cherry)", color: "#fff" } : {}) }} aria-pressed={oddI === i} aria-label={`Mark word ${i + 1} as odd`} onClick={() => setOddI(i)}>{oddI === i ? "!" : i + 1}</button>
                <input className="input" style={{ minHeight: 44, fontSize: 16, padding: "0 10px", textTransform: "uppercase", background: "#fff" }} value={w} placeholder={`Word ${i + 1}`} aria-label={`Word ${i + 1}`} onChange={(e) => setWords(words.map((x, k) => (k === i ? e.target.value.replace(/[^a-zA-Z ]/g, "").slice(0, 16) : x)))} />
              </div>
            ))}
          </div>
          <input className="input" style={{ minHeight: 48, fontSize: 16, background: "#fff" }} value={link} placeholder="What links the other three?" aria-label="The link" onChange={(e) => setLink(e.target.value.slice(0, 40))} />
          <button className="btn btn-white" onClick={() => void send("custom", { list: words, n: oddI, text: link })}>Send my set</button>
        </section>
      ) : (
        <p className="wait" style={{ margin: "30px 0", textAlign: "center", fontSize: 17, fontWeight: 900, color: "var(--muted)" }}>{nameOf(other)} is making a set for you…</p>
      ))}
      {s && g.phase !== "make" && (
        <>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 900 }}>{maker ? `${nameOf(other)} is finding the odd one` : g.phase === "guess" ? "Which one doesn't belong?" : g.phase === "link" ? "What links the other three?" : "Here's the answer"}</h1>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 10 }}>
            {s.words.map((w: string, i: number) => {
              const isOdd = s.odd === i, picked = v.picked.includes(i);
              const known = s.odd !== null;
              return (
                <button key={i} className={`wcard${isOdd && known && g.phase !== "guess" ? " pop" : ""}`} style={{ minHeight: 92, fontSize: 19, ...(known && isOdd ? { background: "var(--cherry)", borderColor: "var(--cherry)", color: "#fff", boxShadow: "0 4px 0 var(--cherry-edge)" } : known && g.phase !== "guess" ? { background: "#D7FFB8", borderColor: "#A5ED6E", color: "#2F6E00", boxShadow: "0 4px 0 #A5ED6E" } : picked ? { opacity: 0.5, textDecoration: "line-through" } : {}) }} disabled={maker || g.phase !== "guess" || picked} onClick={async () => { const r = await send("tap", { n: i }); if (r?.hit) { feedback.correct(); say("Odd one found!", "good"); } else if (r) { feedback.wrong(); say("That one fits!", "bad"); } }}>{w}</button>
              );
            })}
          </div>
          {(g.phase === "link" || g.phase === "reveal") && (
            <section style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {s.options.map((o: string, i: number) => {
                const right = s.linkIdx === i, chosen = v.linkPick === i;
                return (
                  <button key={i} className="card" style={{ padding: "12px 14px", fontSize: 16, fontWeight: 900, ...(right ? { background: "#D7FFB8", borderColor: "var(--lime)", boxShadow: "0 4px 0 var(--lime)" } : chosen ? { background: "var(--cherry-soft)", borderColor: "var(--cherry)", boxShadow: "0 4px 0 var(--cherry)" } : {}) }} disabled={maker || g.phase !== "link"} onClick={async () => { const r = await send("link", { n: i }); if (r?.right) { feedback.clear(); say("Same wavelength! +2", "good"); } else if (r) feedback.wrong(); }}>{o}</button>
                );
              })}
            </section>
          )}
          {maker && g.phase !== "reveal" && <p style={{ margin: 0, textAlign: "center", fontSize: 14, fontWeight: 800, color: "var(--muted)" }}>Your link: {s.link}</p>}
          {g.phase === "reveal" && <p style={{ margin: 0, textAlign: "center", fontSize: 16, fontWeight: 900, padding: "8px 12px", borderRadius: 12, background: "var(--sun-soft)", color: "var(--sun-ink)" }}>{maker ? nameOf(other) : "You"} scored +{v.pts}</p>}
        </>
      )}
      <div className="grow" />
      {g.phase === "reveal" && !g.done && <button className="btn btn-green" onClick={() => void send("next")}>Next set</button>}
    </>
  );
}

// ---------- Emoji Riddle ----------
export function EmojiMode({ room, v, send, say, nameOf }: ModeProps) {
  const g = room.game!;
  const [text, setText] = useDraft(g.seq);
  const [tab, setTab] = useState(0);
  const describer = v.describer === room.meId;
  const partner = g.players.find((x) => x !== room.meId)!;
  const playing = g.phase === "play" && !g.done;
  const r = v.riddle !== null && v.riddle !== undefined ? RIDDLES[v.riddle] : null;
  const answer = r ? (room.lang === "id" ? r.id : room.lang === "mix" ? `${r.id} / ${r.en}` : r.en) : "";
  const ptsNow = Math.max(1, 5 - v.emoji.length);
  const cat = v.cat ? (room.lang === "id" ? v.cat.id : v.cat.en) : "";
  return (
    <>
      <WordsHeader room={room} right={<span style={{ fontSize: 15, fontWeight: 900, color: "var(--muted)" }}>Round {g.round + 1} of {g.rounds}</span>} />
      <section style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ display: "flex", flexDirection: "column" }}>
          <span style={{ fontSize: 12, fontWeight: 900, letterSpacing: ".04em", color: "#5B3CC4" }}>TEAM SCORE</span>
          <span style={{ fontSize: 26, fontWeight: 900 }}>{v.total}</span>
        </span>
        {playing && (
          <span style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
            <span style={{ fontSize: 12, fontWeight: 900, letterSpacing: ".04em", color: "var(--muted)" }}>GUESS NOW FOR</span>
            <span style={{ display: "flex", gap: 4 }}>{[4, 3, 2, 1].map((p) => <span key={p} style={{ width: 28, height: 28, borderRadius: 9, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 900, ...(p === ptsNow ? { background: "#9069FF", color: "#fff", boxShadow: "0 3px 0 #6F4BDB" } : p > ptsNow ? { background: "#F0F0F0", color: "#CFCFCF" } : { background: "#EEE8FF", color: "#5B3CC4" }) }}>{p}</span>)}</span>
          </span>
        )}
      </section>
      {playing && <TimerBar deadline={g.deadline} total={90_000} />}
      <section className="panel" style={{ background: "#9069FF", boxShadow: "0 6px 0 #6F4BDB", alignItems: "center", color: "#fff" }}>
        <span style={{ fontSize: 13, fontWeight: 900, letterSpacing: ".04em" }}>{describer ? (playing ? `DESCRIBE THIS FOR ${nameOf(partner).toUpperCase()}` : "THE WORD WAS") : playing ? `${nameOf(v.describer).toUpperCase()} IS DESCRIBING` : "THE WORD WAS"}</span>
        {(describer || !playing) && r && <span style={{ fontSize: 28, fontWeight: 900, textAlign: "center", textTransform: "uppercase" }}>{answer}</span>}
        <span style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "center", minHeight: 56 }} role="img" aria-label={`Emoji clue: ${v.emoji.join(" ")}`}>
          {v.emoji.length === 0 && <span className="wait" style={{ fontSize: 15, fontWeight: 800, alignSelf: "center" }}>{describer ? "Tap emoji below" : "Waiting for the first emoji…"}</span>}
          {v.emoji.map((e: string, i: number) => <span key={i} className="pop" style={{ width: 52, height: 52, borderRadius: 16, background: "#fff", boxShadow: "0 4px 0 #C9B8FF", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 30 }}>{e}</span>)}
        </span>
        <span style={{ fontSize: 12, fontWeight: 900, letterSpacing: ".04em", background: "#fff", color: "#5B3CC4", padding: "5px 10px", borderRadius: 10 }}>{cat.toUpperCase()}</span>
      </section>
      {!describer && playing && <div style={{ display: "flex", justifyContent: "center" }}><Tiles text={v.pattern.map((n: number) => "_".repeat(n)).join(" ")} size={24} /></div>}
      {!playing && !g.done && <p style={{ margin: 0, textAlign: "center", fontSize: 17, fontWeight: 900, padding: "10px 12px", borderRadius: 14, background: v.solved ? "#D7FFB8" : "var(--mist)", color: v.solved ? "#2F6E00" : "var(--ink)" }}>{v.solved ? `Solved with ${v.history[0]?.emoji.length ?? v.emoji.length} emoji! +${v.pts}` : "Not this time"}</p>}
      {v.guesses.length > 0 && <p style={{ margin: 0, textAlign: "center", fontSize: 14, fontWeight: 800, color: "var(--muted)" }}>Guesses: {v.guesses.map((x: any) => `${x.text.toUpperCase()}${x.ok ? " ✓" : ""}`).join(", ")}</p>}
      <div className="grow" />
      {describer && playing && (
        <section style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ display: "flex", gap: 6, overflowX: "auto" }} role="tablist" aria-label="Emoji groups">
            {EMOJI.map((e, i) => <button key={e.group} className="seg" role="tab" aria-selected={tab === i} aria-pressed={tab === i} style={{ padding: "0 12px", minHeight: 38, flexShrink: 0 }} onClick={() => setTab(i)}>{e.group}</button>)}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))", gap: 6 }}>
            {EMOJI[tab].list.map((e) => <button key={e} className="emo-key" aria-label={`Add ${e}`} onClick={() => { feedback.tap(); void send("emoji", { text: e }); }}>{e}</button>)}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 8 }}>
            <button className="btn btn-white" style={{ fontSize: 15 }} disabled={!v.emoji.length} onClick={() => void send("undo")}>Undo emoji</button>
            <button className="btn btn-white" style={{ fontSize: 15, color: "var(--muted)" }} onClick={() => void send("skip")}>Skip word</button>
          </div>
        </section>
      )}
      {!describer && playing && (
        <AnswerBox value={text} onChange={setText} placeholder="Your guess" button="Guess" onSubmit={async () => { const res = await send("guess", { text }); if (res && res.ok === false) say("Not it, keep guessing!", "bad"); }} />
      )}
      {!playing && !g.done && <button className="btn btn-green" onClick={() => void send("next")}>Next round</button>}
    </>
  );
}
