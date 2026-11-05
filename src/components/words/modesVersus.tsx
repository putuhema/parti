"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useState } from "react";
import { Avatar, Icon, roomPaints } from "@/components/ui";
import { feedback } from "@/lib/feedback";
import { AnswerBox, Keyboard, ScoreBar, Tiles, TimerBar, WordsHeader } from "./common";
import type { ModeProps } from "./Play";

const ALPHA = "abcdefghijklmnopqrstuvwxyz".split("");

/** Local draft text that resets whenever the game moves on. */
function useDraft(seq: number) {
  const [d, setD] = useState({ seq, t: "" });
  const t = d.seq === seq ? d.t : "";
  return [t, (v: string) => setD({ seq, t: v })] as const;
}

// ---------- Word Chain ----------
export function ChainMode({ room, v, send, say, nameOf }: ModeProps) {
  const g = room.game!;
  const myTurn = v.turn === room.meId && !g.done;
  const cur = v.rows.find((r: any) => r.current);
  const hidden = cur ? (cur.text.match(/_/g) ?? []).length : 0;
  const [typed, setTyped] = useDraft(g.seq);
  const prev = v.rows[v.rows.findIndex((r: any) => r.current) - 1]?.text ?? "";
  const ev = v.event;
  const evText = !ev ? "" : ev.type === "solved" ? `${nameOf(ev.by)} got ${ev.word.toUpperCase()} +${ev.pts}` : ev.type === "miss" ? `${nameOf(ev.by)} tried ${ev.guess.toUpperCase()}. A letter opens!` : ev.type === "pass" ? `${nameOf(ev.by)} opened a letter` : `Nobody got ${ev.word.toUpperCase()}`;
  const evKind = ev?.type === "solved" ? { background: "#D7FFB8", color: "#2F6E00" } : ev?.type === "miss" ? { background: "var(--cherry-soft)", color: "#B81F1F" } : { background: "var(--mist)", color: "var(--ink)" };
  const tone = (by: string | null) => (by === "given" ? "given" : by === room.meId ? "me" : by === "nobody" ? "dim" : by ? "them" : "dim");

  async function check() {
    if (typed.length < hidden) { say("Fill every box first"); return; }
    let k = 0;
    const full = cur.text.split("").map((ch: string) => (ch === "_" ? typed[k++] : ch)).join("");
    const r = await send("guess", { text: full });
    if (r?.correct) { feedback.clear(); say(`+${r.points}!`, "good"); } else if (r) feedback.wrong();
  }

  return (
    <>
      <WordsHeader room={room} right={<span style={{ fontSize: 15, fontWeight: 900, color: "var(--muted)" }}>Chain {g.round + 1} of {g.rounds}</span>} />
      <ScoreBar room={room} highlight={v.turn} label={(id) => (id === v.turn && !g.done ? (id === room.meId ? "YOUR TURN" : "THEIR TURN") : "")} />
      <ol style={{ listStyle: "none", margin: "4px 0 0", padding: 0, display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }} aria-label="Word chain">
        {v.rows.map((r: any, i: number) => (
          <li key={i} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
            {i > 0 && <svg width="16" height="12" viewBox="0 0 24 20" aria-hidden="true"><path d="M8 2 v6 M16 2 v6 M5 8 h14 l-7 9z" fill={r.by || r.current ? "#AFAFAF" : "#E5E5E5"} /></svg>}
            <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <Tiles text={r.text} size={r.text.length > 8 ? 30 : 34} tone={r.current ? "plain" : (tone(r.by) as any)} typed={r.current && myTurn ? typed : ""} />
              {r.by && r.by !== "given" && <span style={{ fontSize: 11, fontWeight: 900, padding: "3px 6px", borderRadius: 7, background: r.by === room.meId ? "var(--sky-soft)" : r.by === "nobody" ? "var(--mist)" : "#FFF0DB", color: r.by === room.meId ? "var(--sky-edge)" : r.by === "nobody" ? "var(--muted)" : "#9A5200" }}>{r.by === "nobody" ? "—" : nameOf(r.by)}</span>}
            </span>
          </li>
        ))}
      </ol>
      <p style={{ margin: 0, textAlign: "center", fontSize: 15, fontWeight: 900, padding: "8px 12px", borderRadius: 14, ...(evText ? evKind : { background: "var(--mist)" }) }} aria-live="polite">
        {evText ? evText + " · " : ""}{g.done ? "" : myTurn ? `Your turn: what comes after ${prev.toUpperCase()}?` : `${nameOf(v.turn)} is thinking…`}
      </p>
      <div className="grow" />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1.4fr", gap: 10 }}>
        <button className="btn btn-white" style={{ color: "var(--sun-ink)", fontSize: 15 }} disabled={!myTurn} onClick={() => { feedback.tap(); void send("pass"); }}><Icon.Bulb size={18} />Open a letter</button>
        <button className="btn btn-green" style={{ fontSize: 16 }} disabled={!myTurn} onClick={check}>Check</button>
      </div>
      <Keyboard disabled={!myTurn} onKey={(l) => { if (typed.length < hidden) setTyped(typed + l); }} onDelete={() => setTyped(typed.slice(0, -1))} onEnter={check} />
    </>
  );
}

// ---------- Secret word setup (Hangman, Guess My Word) ----------
const HINTS = ["Food", "Animal", "Place", "Thing", "Nature", "Action"];
function SecretSetup({ v, send, nameOf, room, min, max, hints }: ModeProps & { min: number; max: number; hints: boolean }) {
  const [word, setWord] = useState("");
  const [hint, setHint] = useState("");
  const opp = room.game!.players.find((p) => p !== room.meId);
  if (v.mySecret) {
    return (
      <section className="panel" style={{ background: "var(--sky-soft)", alignItems: "center", textAlign: "center" }}>
        <span className="label" style={{ color: "var(--sky-edge)" }}>Your secret word</span>
        <Tiles text={v.mySecret} tone="me" />
        <p className="wait" style={{ margin: 0, fontSize: 16, fontWeight: 900, color: "var(--sky-edge)" }}>{v.oppReady ? "Starting…" : `Waiting for ${nameOf(opp)} to pick…`}</p>
      </section>
    );
  }
  return (
    <section style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <h1 style={{ margin: 0, fontSize: 24, fontWeight: 900 }}>Pick a secret word</h1>
      <p style={{ margin: 0, fontSize: 15, fontWeight: 700, color: "var(--muted)" }}>{min} to {max} letters, a real word in {room.lang === "id" ? "Indonesian" : room.lang === "mix" ? "English or Indonesian" : "English"}. {nameOf(opp)} will try to crack it!</p>
      <AnswerBox value={word} onChange={setWord} placeholder="Secret word" button="Lock" onSubmit={async () => { const r = await send("secret", { text: word, list: hint ? [hint] : [] }); if (r) feedback.correct(); }} />
      {hints && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }} role="group" aria-label="Give a hint (optional)">
          <span className="label" style={{ width: "100%" }}>Hint for them (optional)</span>
          {HINTS.map((h) => <button key={h} className="seg" style={{ padding: "0 12px", minHeight: 40 }} aria-pressed={hint === h} onClick={() => setHint(hint === h ? "" : h)}>{h}</button>)}
        </div>
      )}
    </section>
  );
}

// ---------- Hangman Duel ----------
const BALLOON = ["#FF4B4B", "#1CB0F6", "#FFC800", "#58CC02", "#CE82FF", "#FF9600"];
function Balloons({ lives, size = 30 }: { lives: number; size?: number }) {
  return (
    <span style={{ display: "flex", gap: 4, alignItems: "flex-end" }} role="img" aria-label={`${lives} of 6 balloons left`}>
      {BALLOON.map((c, i) => (
        <svg key={i} className={i < lives ? "bob" : undefined} style={{ animationDelay: `${i * 150}ms` }} width={size} height={size * 1.45} viewBox="0 0 30 44" aria-hidden="true">
          {i < lives ? (
            <>
              <path d="M15 2 a11 12 0 0 1 11 12 c0 8 -6 13 -11 14 c-5 -1 -11 -6 -11 -14 a11 12 0 0 1 11 -12z M13 28 h4 l-2 3z" fill={c} />
              <path d="M15 31 q-3 6 0 12" stroke="#CFCFCF" strokeWidth="1.6" fill="none" />
              <path d="M10 9 q3 -4 7 -3" stroke="rgba(255,255,255,.7)" strokeWidth="2.4" fill="none" strokeLinecap="round" />
            </>
          ) : (
            <path d="M15 14 l2 5 5 -2 -3 5 5 3 -6 1 1 6 -4 -4 -4 4 1 -6 -6 -1 5 -3 -3 -5 5 2z" fill="#E5E5E5" />
          )}
        </svg>
      ))}
    </span>
  );
}

export function HangmanMode(p: ModeProps) {
  const { room, v, send, say, nameOf } = p;
  const g = room.game!;
  const opp = g.players.find((x) => x !== room.meId);
  const [word, setWord] = useState("");
  const [guessing, setGuessing] = useState(false);
  if (g.phase === "setup") return <><WordsHeader room={room} /><SecretSetup {...p} min={4} max={10} hints /></>;
  const out = v.myLives <= 0;
  const state: Record<string, "good" | "bad"> = {};
  v.myFound.forEach((l: string) => (state[l] = "good"));
  v.myWrong.forEach((l: string) => (state[l] = "bad"));
  return (
    <>
      <WordsHeader room={room} />
      <section className="panel" style={{ border: "2px solid var(--sky-line)", boxShadow: "0 0 0 3px var(--sky-soft)", alignItems: "center" }}>
        <span style={{ display: "flex", justifyContent: "space-between", alignSelf: "stretch", alignItems: "center" }}>
          <span className="label" style={{ color: "var(--sky-edge)" }}>Crack {nameOf(opp)}&apos;s word</span>
          {v.oppHint && <span className="chip chip-sun">HINT: {v.oppHint.toUpperCase()}</span>}
        </span>
        <Tiles text={v.oppWord ?? v.target} size={v.target.length > 8 ? 30 : 38} tone="me" />
        <Balloons lives={v.myLives} />
      </section>
      <section className="panel" style={{ background: "#FFF0DB", flexDirection: "row", alignItems: "center", gap: 10, padding: "10px 14px" }}>
        <Avatar name={nameOf(opp)} paint={roomPaints(room.members).get(opp!)} size={34} />
        <span style={{ display: "flex", flexDirection: "column", gap: 4, flex: 1, minWidth: 0 }}>
          <span style={{ fontSize: 12, fontWeight: 900, letterSpacing: ".04em", color: "#9A5200" }}>{nameOf(opp).toUpperCase()} IS CRACKING YOURS</span>
          <Tiles text={v.mineSeen} size={24} tone="them" />
        </span>
        <span style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
          <span style={{ fontSize: 20, fontWeight: 900, color: "#9A5200" }}>{v.oppLives}</span>
          <span style={{ fontSize: 11, fontWeight: 900, color: "#9A5200" }}>BALLOONS</span>
        </span>
      </section>
      <p style={{ margin: 0, textAlign: "center", fontSize: 16, fontWeight: 900 }}>{out ? `Out of balloons! Hoping ${nameOf(opp)} runs out too…` : "Guess a letter"}</p>
      <div className="grow" />
      {guessing ? (
        <AnswerBox value={word} onChange={setWord} placeholder="The whole word" button="Guess" disabled={out} onSubmit={async () => { const r = await send("word", { text: word }); setWord(""); setGuessing(false); if (r && !r.hit) say("Not it! −1 balloon", "bad"); }} />
      ) : (
        <button className="btn btn-white" disabled={out} onClick={() => setGuessing(true)}>I know it! Guess the word</button>
      )}
      <Keyboard state={state} disabled={out || !!g.done} onKey={async (l) => { const r = await send("letter", { text: l }); if (r?.hit) feedback.correct(); else if (r) { feedback.wrong(); say("Pop! Not in the word", "bad"); } }} />
    </>
  );
}

// ---------- Guess My Word ----------
export function GuessMode(p: ModeProps) {
  const { room, v, send, say, nameOf } = p;
  const g = room.game!;
  const opp = g.players.find((x) => x !== room.meId);
  const [word, setWord] = useState("");
  if (g.phase === "setup") return <><WordsHeader room={room} /><SecretSetup {...p} min={4} max={8} hints={false} /></>;
  const myTurn = v.turn === room.meId && !g.done;
  const asked = new Map<string, any>(v.asked.map((q: any) => [q.letter, q]));
  const yes = v.asked.filter((q: any) => q.inTheirs).map((q: any) => q.letter.toUpperCase());
  const no = v.asked.filter((q: any) => !q.inTheirs).map((q: any) => q.letter.toUpperCase());
  const known = v.asked.filter((q: any) => q.inMine).length;
  const last = v.log[0];
  let lastText = "";
  if (last?.type === "guess") lastText = `${nameOf(last.by)} guessed ${last.word.toUpperCase()} ✗`;
  else if (last?.type === "ask") {
    const q = asked.get(last.letter);
    const L = last.letter.toUpperCase();
    lastText = last.by === room.meId
      ? `You asked ${L}: ${q.inTheirs ? `${nameOf(opp)}'s word has it ✓` : `not in ${nameOf(opp)}'s word`}${q.inMine ? ". Yours has it too, so they know" : ""}`
      : `${nameOf(last.by)} asked ${L}: your word ${q.inMine ? "has it" : "doesn't have it"}. Theirs ${q.inTheirs ? "has it ✓" : "doesn't"}`;
  }
  return (
    <>
      <WordsHeader room={room} right={<span style={{ fontSize: 15, fontWeight: 900, color: myTurn ? "var(--lime-dark)" : "var(--muted)" }}>{myTurn ? "Your turn" : `${nameOf(v.turn)}'s turn`}</span>} />
      <section className="panel" style={{ background: "#D6FAF6", alignItems: "center" }}>
        <span className="label" style={{ color: "#0B6B61" }}>{nameOf(opp)}&apos;s secret word · {v.oppLength} letters</span>
        <span style={{ display: "flex", gap: 6 }}>{Array.from({ length: v.oppLength }, (_, i) => <span key={i} className="wtile" style={{ width: 40, height: 46, fontSize: 22, background: "#fff", color: "#1CC6B4", boxShadow: "0 4px 0 #8BE8DE" }}>{v.oppWord ? v.oppWord[i].toUpperCase() : "?"}</span>)}</span>
        <span style={{ fontSize: 14, fontWeight: 800, color: "#0B6B61" }}>Has: <b>{yes.join(" ") || "—"}</b> · Doesn&apos;t have: <b>{no.join(" ") || "—"}</b></span>
      </section>
      <section className="panel" style={{ background: "#FFF0DB", flexDirection: "row", alignItems: "center", padding: "10px 14px" }}>
        <span style={{ fontSize: 13, fontWeight: 900, letterSpacing: ".04em", color: "#9A5200", flex: 1 }}>YOUR WORD</span>
        <span className="wtiles">{(v.mySecret as string).split("").map((ch, i) => { const k = asked.get(ch)?.inMine; return <span key={i} className="wtile" style={{ width: 26, height: 30, fontSize: 15, background: k ? "#FF9600" : "#fff", color: k ? "#fff" : "#9A5200" }}>{ch.toUpperCase()}</span>; })}</span>
        <span style={{ fontSize: 12, fontWeight: 800, color: "#9A5200", maxWidth: 76, lineHeight: 1.2, textAlign: "right" }}>{nameOf(opp)} knows {known} letter{known === 1 ? "" : "s"}</span>
      </section>
      {lastText && <p style={{ margin: 0, padding: "8px 12px", borderRadius: 14, background: "var(--mist)", fontSize: 15, fontWeight: 800, textAlign: "center" }} aria-live="polite">{lastText}</p>}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))", gap: 6 }} aria-label="Ask about a letter">
        {ALPHA.map((l) => {
          const q = asked.get(l);
          return (
            <button key={l} className="wkey" style={{ position: "relative", ...(q ? (q.inTheirs ? { background: "#1CC6B4", borderColor: "#1CC6B4", color: "#fff", boxShadow: "0 3px 0 #14A394" } : { background: "#E5E5E5", borderColor: "#E5E5E5", color: "#9A9A9A", boxShadow: "none" }) : {}) }} disabled={!myTurn || !!q} aria-label={`${l.toUpperCase()}${q ? (q.inTheirs ? ", in their word" : ", not in their word") + (q.inMine ? ", in yours" : "") : ", ask"}`} onClick={() => { feedback.tap(); void send("ask", { text: l }); }}>
              {l.toUpperCase()}
              {q?.inMine && <span style={{ position: "absolute", right: 3, top: 3, width: 8, height: 8, borderRadius: 4, background: "#FF9600" }} />}
            </button>
          );
        })}
      </div>
      <div className="grow" />
      <AnswerBox value={word} onChange={setWord} placeholder={myTurn ? "Guess their word" : "Wait for your turn"} button="Guess" disabled={!myTurn} onSubmit={async () => { const r = await send("word", { text: word }); setWord(""); if (r && !r.ok) say("Not it! Turn passes", "bad"); }} />
    </>
  );
}

// ---------- Letter Pair ----------
function BigLetter({ l, mine, label }: { l: string | null; mine: boolean; label: string }) {
  return (
    <span style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
      <span className="pop" style={{ width: 66, height: 74, borderRadius: 18, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 42, fontWeight: 900, color: "#fff", background: mine ? "var(--sky)" : "var(--tangerine)", boxShadow: `0 5px 0 ${mine ? "var(--sky-btn)" : "var(--tangerine-edge)"}` }}>{l ? l.toUpperCase() : "?"}</span>
      <span style={{ fontSize: 12, fontWeight: 900, letterSpacing: ".04em", color: "var(--muted)" }}>{label}</span>
    </span>
  );
}

export function PairMode({ room, v, send, say, nameOf }: ModeProps) {
  const g = room.game!;
  const [word, setWord] = useDraft(g.round * 100 + (g.phase === "race" ? 1 : 0));
  const role = v.firstBy === room.meId ? "first" : v.lastBy === room.meId ? "last" : null;
  const myPick = role === "first" ? v.first : role === "last" ? v.last : null;
  const mine = v.answers[room.meId];
  return (
    <>
      <WordsHeader room={room} right={<span style={{ fontSize: 15, fontWeight: 900, color: "var(--muted)" }}>Round {g.round + 1} of {g.rounds}</span>} />
      <ScoreBar room={room} />
      <section style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 14, paddingTop: 4 }}>
        <BigLetter l={v.first} mine={v.firstBy === room.meId} label={`START · ${nameOf(v.firstBy).toUpperCase()}`} />
        <span style={{ display: "flex", gap: 6, paddingBottom: 22 }} aria-hidden="true">{[0, 1, 2].map((k) => <span key={k} style={{ width: 10, height: 10, borderRadius: 5, background: "var(--line)" }} />)}</span>
        <BigLetter l={v.last} mine={v.lastBy === room.meId} label={`END · ${nameOf(v.lastBy).toUpperCase()}`} />
      </section>
      {v.note && <p style={{ margin: 0, textAlign: "center", fontSize: 14, fontWeight: 800, color: "var(--sun-ink)", background: "var(--sun-soft)", padding: "8px 12px", borderRadius: 12 }}>{v.note}</p>}
      {g.phase === "pick" && (
        role && !myPick ? (
          <>
            <p style={{ margin: 0, textAlign: "center", fontSize: 17, fontWeight: 900 }}>Pick the {role === "first" ? "FIRST" : "LAST"} letter</p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))", gap: 6 }}>
              {ALPHA.map((l) => <button key={l} className="wkey" onClick={() => { feedback.tap(); void send("pick", { text: l }); }}>{l.toUpperCase()}</button>)}
            </div>
          </>
        ) : (
          <p className="wait" style={{ margin: 0, textAlign: "center", fontSize: 16, fontWeight: 900, color: "var(--muted)" }}>Waiting for {nameOf(v.picked.first ? v.lastBy : v.firstBy)} to pick…</p>
        )
      )}
      {g.phase === "race" && <TimerBar deadline={g.deadline} total={21500} />}
      {g.phase !== "pick" && (
        <section style={{ display: "grid", gridTemplateColumns: `repeat(${g.players.length}, minmax(0, 1fr))`, gap: 8 }}>
          {g.players.map((id) => {
            const a = v.answers[id];
            return (
              <div key={id} className="reveal-card" style={{ background: id === room.meId ? "var(--sky-soft)" : "#FFF0DB" }}>
                <span style={{ fontSize: 12, fontWeight: 900, letterSpacing: ".04em", color: id === room.meId ? "var(--sky-edge)" : "#9A5200" }}>{nameOf(id).toUpperCase()}</span>
                <span style={{ fontSize: 20, fontWeight: 900, letterSpacing: ".05em" }}>{a ? (a.word ? a.word.toUpperCase() : "✓ Found one!") : g.phase === "race" ? "…" : "—"}</span>
                <span style={{ fontSize: 13, fontWeight: 900, color: id === room.meId ? "var(--sky-edge)" : "#9A5200" }}>{a ? `+${a.pts}${a.pts === 3 ? " · first" : ""}` : ""}</span>
              </div>
            );
          })}
        </section>
      )}
      {g.phase === "reveal" && v.examples.length > 0 && <p style={{ margin: 0, textAlign: "center", fontSize: 14, fontWeight: 800, color: "var(--muted)" }}>Other words: {v.examples.map((w: string) => w.toUpperCase()).join(", ")}</p>}
      <div className="grow" />
      {g.phase === "race" && !mine && (
        <>
          <div style={{ minHeight: 60, borderRadius: 18, border: "2px solid var(--line)", background: "var(--mist)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 32, fontWeight: 900, letterSpacing: ".12em" }} aria-live="polite">
            {(v.first + word).toUpperCase()}<span style={{ color: "#CFCFCF" }}>…{v.last.toUpperCase()}</span>
          </div>
          <Keyboard onKey={(l) => setWord(word + l)} onDelete={() => setWord(word.slice(0, -1))} onEnter={async () => { const r = await send("word", { text: v.first + word }); if (r?.pts) { feedback.clear(); say(r.pts === 3 ? "First! +3" : "+1", "good"); } }} />
        </>
      )}
      {g.phase === "reveal" && <TimerBar deadline={g.deadline} total={5000} />}
    </>
  );
}

// ---------- Scrambled Sprint ----------
export function ScrambleMode({ room, v, send, say }: ModeProps) {
  const g = room.game!;
  const [st, setSt] = useState({ round: g.round, order: v.letters.map((_: string, i: number) => i) as number[], used: [] as number[] });
  const s = st.round === g.round && st.order.length === v.letters.length ? st : { round: g.round, order: v.letters.map((_: string, i: number) => i), used: [] as number[] };
  const set = (x: Partial<typeof s>) => setSt({ ...s, ...x });
  const word = s.used.map((i: number) => v.letters[i]).join("");
  const playing = g.phase === "play" && !g.done;
  const paints = roomPaints(room.members);
  async function submit() {
    if (word.length < 3) { say("At least 3 letters"); return; }
    const r = await send("word", { text: word });
    if (r?.pts) { feedback.clear(); say(r.main ? `The big one! +${r.pts}` : `+${r.pts}`, "good"); set({ used: [] }); }
  }
  return (
    <>
      <WordsHeader room={room} right={<span style={{ fontSize: 15, fontWeight: 900, color: "var(--muted)" }}>Word {g.round + 1} of {g.rounds}</span>} />
      <ScoreBar room={room} />
      {playing && <TimerBar deadline={g.deadline} total={60_000} />}
      <p style={{ margin: 0, textAlign: "center", fontSize: 15, fontWeight: 800, color: "var(--muted)" }}>{playing ? `Find the ${v.length}-letter word. Hidden words score too!` : `The word was ${v.answer?.toUpperCase()}`}</p>
      <div style={{ minHeight: 62, borderRadius: 18, border: "2px dashed #FF86D0", display: "flex", alignItems: "center", justifyContent: "center", gap: 5, padding: 4 }} aria-live="polite" aria-label="Your word">
        {s.used.length === 0 ? <span style={{ fontSize: 15, fontWeight: 800, color: "#AFAFAF" }}>{playing ? "Tap letters below" : ""}</span> : s.used.map((i: number, j: number) => (
          <button key={j} className="wtile pop" style={{ width: 42, height: 48, fontSize: 24, background: "#fff", color: "#B2347F", border: "2px solid #FF86D0", boxShadow: "0 3px 0 #FFB8E2", cursor: "pointer" }} aria-label={`Remove ${v.letters[i]}`} onClick={() => set({ used: s.used.filter((_: number, k: number) => k !== j) })}>{v.letters[i].toUpperCase()}</button>
        ))}
      </div>
      <div style={{ display: "flex", justifyContent: "center", gap: 6, flexWrap: "wrap" }} role="group" aria-label="Letters">
        {s.order.map((i: number) => {
          const taken = s.used.includes(i);
          return <button key={i} className="wtile" disabled={taken || !playing} style={{ width: 46, height: 54, fontSize: 27, border: 0, cursor: taken ? "default" : "pointer", background: taken ? "#F0F0F0" : "#FF86D0", color: taken ? "#F0F0F0" : "#fff", boxShadow: taken ? "none" : "0 4px 0 #E06BB5" }} onClick={() => { feedback.tap(); set({ used: [...s.used, i] }); }}>{v.letters[i].toUpperCase()}</button>;
        })}
      </div>
      {playing && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1.4fr", gap: 8 }}>
          <button className="btn btn-white" style={{ fontSize: 15, color: "var(--muted)" }} onClick={() => set({ order: [...s.order].sort(() => Math.random() - 0.5) })}>Shuffle</button>
          <button className="btn btn-white" style={{ fontSize: 15, color: "var(--muted)" }} onClick={() => set({ used: [] })}>Clear</button>
          <button className="btn" style={{ fontSize: 16, background: "#D9489F", color: "#fff", boxShadow: "0 4px 0 #B2347F" }} onClick={submit}>Submit</button>
        </div>
      )}
      <section style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <span className="label">Words · you found {v.mine.length}</span>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {v.slots.map((sl: any, k: number) => (
            <span key={k} style={{ fontSize: 14, fontWeight: 900, letterSpacing: ".04em", padding: "6px 10px", borderRadius: 10, background: sl.mine ? (sl.main ? "#FF86D0" : "#FFE8F5") : sl.text ? "var(--mist)" : sl.others ? "#FFF0DB" : "#F0F0F0", color: sl.mine ? (sl.main ? "#fff" : "#B2347F") : sl.text ? "var(--muted)" : sl.others ? "#9A5200" : "#AFAFAF" }}>
              {sl.text ? sl.text.toUpperCase() : sl.others ? `Friend found · ${sl.len}` : "?".repeat(sl.len).split("").join(" ")}
            </span>
          ))}
          {v.mine.filter((f: any) => !v.slots.some((sl: any) => sl.text === f.w)).map((f: any) => <span key={f.w} style={{ fontSize: 14, fontWeight: 900, padding: "6px 10px", borderRadius: 10, background: "#FFE8F5", color: "#B2347F" }}>{f.w.toUpperCase()} +1</span>)}
        </div>
      </section>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        {v.rivals.map((r: any) => <span key={r.id} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 800, color: "var(--muted)" }}><Avatar name={room.members.find((m) => m.id === r.id)?.name ?? "?"} paint={paints.get(r.id)} size={22} />found {r.count}</span>)}
      </div>
      <div className="grow" />
      {!playing && !g.done && <TimerBar deadline={g.deadline} total={6000} />}
    </>
  );
}
