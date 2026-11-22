"use client";

import { useMutation } from "convex/react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { api } from "../../../convex/_generated/api";
import { LINE_MAX, uses, words } from "../../../convex/lib/story/rules";
import { Toast } from "@/components/words/common";
import { Confetti, Icon, Mascot, Sheet } from "@/components/ui";
import { errorText } from "@/lib/errors";
import { feedback } from "@/lib/feedback";
import { GAME_NAME, LineText, StoryPaper, inkVar, type StoryGameView, type StoryView } from "./common";

type ToastT = { text: string; kind: "bad" | "good"; id: number } | null;

export function StoryPlay({ room }: { room: StoryView }) {
  const g = room.game!;
  const me = room.meId;
  const partner = g.players.find((p) => p !== me) ?? g.players[1];
  const partnerName = g.names[partner] ?? "your partner";
  const [toast, setToast] = useState<ToastT>(null);
  const oops = (e: unknown) => { feedback.wrong(); setToast({ text: errorText(e, "Not allowed"), kind: "bad", id: Date.now() }); };

  // Sounds: a ping when it's your move, a cheer or a gasp on the reveal.
  const key = `${g.lines.length}${g.phase}`;
  const last = useRef(key);
  useEffect(() => {
    if (key === last.current || g.done) { last.current = key; return; }
    last.current = key;
    const line = g.lines.at(-1);
    if (g.phase === "reveal" && line) {
      const iWon = (line.spotted && line.by !== me) || (!line.spotted && line.by === me);
      if (iWon) feedback.correct(); else feedback.wrong();
    } else if ((g.phase === "write" && g.writer === me) || (g.phase === "spot" && g.reader === me)) feedback.ping();
  }, [key, g.done, g.phase, g.writer, g.reader, g.lines, me]);

  const paper = useRef<HTMLDivElement>(null);
  useEffect(() => { paper.current?.scrollTo({ top: paper.current.scrollHeight, behavior: "smooth" }); }, [g.lines.length, g.phase]);

  return (
    <main className="screen tight st-screen">
      <Header room={room} g={g} />
      {!g.done && (
        <div className="st-hud">
          <span className="chip st-chip">LINE {Math.min(g.lines.length + (g.phase === "write" ? 1 : 0), g.total)}/{g.total}</span>
          <span className="grow" />
          {g.players.map((p, i) => (
            <span key={p} className="chip st-score" style={inkVar(i)}>{p === me ? "You" : g.names[p]} {g.scores[p].sneaks + g.scores[p].spots}</span>
          ))}
        </div>
      )}
      <div ref={paper} className="st-scroll">
        <StoryPaper starter={g.starter} lines={g.lines} players={g.players} names={g.names} meId={me} hideLast={g.phase !== "write"} />
      </div>
      {g.done ? null : !g.isPlayer ? (
        <p className="st-wait wait">You&apos;re reading along.</p>
      ) : g.phase === "write" ? (
        g.writer === me ? <Write key={g.lines.length} room={room} g={g} partnerName={partnerName} oops={oops} /> : <Waiting text={`${partnerName} is writing the next line… Get ready to spot the secret word 🔍`} />
      ) : g.phase === "spot" ? (
        <Spot key={g.lines.length} room={room} g={g} partnerName={partnerName} oops={oops} />
      ) : (
        <Reveal room={room} g={g} partnerName={partnerName} oops={oops} />
      )}
      <Toast toast={toast} onDone={() => setToast(null)} />
      {g.done && <Done room={room} g={g} />}
    </main>
  );
}

function Waiting({ text }: { text: string }) {
  return <p className="st-waiting wait">{text}</p>;
}

// ---------- Writing your line ----------
function Write({ room, g, partnerName, oops }: { room: StoryView; g: StoryGameView; partnerName: string; oops: (e: unknown) => void }) {
  const write = useMutation(api.story.write);
  const [secret, setSecret] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const has = !!secret && uses(text, secret);
  const ok = has && text.trim().length >= 8;
  async function go(e: React.FormEvent) {
    e.preventDefault();
    if (!ok || !secret) return;
    feedback.tap();
    setSending(true);
    try { await write({ code: room.code, line: g.lines.length, text, secret }); } catch (err) { oops(err); setSending(false); }
  }
  return (
    <form className="st-write rise" onSubmit={go}>
      {g.twist && <p className="st-twist big pop">⚡ Twist! {g.twist} <small>Your line has to deal with it.</small></p>}
      <span className="label">Pick your secret word</span>
      <div className="st-offers">
        {g.offers.map((w) => (
          <button key={w} type="button" className="st-offer" aria-pressed={secret === w} onClick={() => { feedback.tap(); setSecret(w); }}>{w}</button>
        ))}
      </div>
      <textarea className="input st-input" rows={2} maxLength={LINE_MAX} value={text} onChange={(e) => setText(e.target.value)} placeholder={secret ? `Continue the story and hide “${secret}” in it…` : "First pick a secret word above"} disabled={!secret} aria-label="Your line" />
      <p className={`st-check${has ? " ok" : ""}`}>
        {!secret ? `🤫 ${partnerName} will try to spot it. Pick the one you can hide best.` : has ? `✓ “${secret}” is in. Tip: add another odd word as a decoy!` : `Use “${secret}” somewhere in your line.`}
      </p>
      <button className="btn btn-green" disabled={!ok || sending}>Sneak it in</button>
    </form>
  );
}

// ---------- Spotting the secret ----------
function Spot({ room, g, partnerName, oops }: { room: StoryView; g: StoryGameView; partnerName: string; oops: (e: unknown) => void }) {
  const spot = useMutation(api.story.spot);
  const line = g.lines.at(-1)!;
  const [pick, setPick] = useState<number | null>(null);
  const [sending, setSending] = useState(false);
  const mineToSpot = g.reader === room.meId;
  const writerIdx = g.players.indexOf(line.by);
  async function go() {
    if (pick === null) return;
    feedback.tap();
    setSending(true);
    try { await spot({ code: room.code, line: g.lines.length, word: pick }); } catch (e) { oops(e); setSending(false); }
  }
  return (
    <section className="st-spot rise">
      {line.twist && <p className="st-twist">⚡ {line.twist}</p>}
      <span className="label">{mineToSpot ? `${partnerName}'s new line: tap the secret word` : `${partnerName} is hunting for your secret word… 🤫`}</span>
      <p className="st-bigline" style={inkVar(writerIdx)}>
        <LineText line={{ ...line, guess: null }} showSecret={!mineToSpot} onTap={mineToSpot && !sending ? (w) => { feedback.tap(); setPick(w); } : undefined} picked={pick} />
      </p>
      {mineToSpot && (
        <button className="btn btn-green" disabled={pick === null || sending} onClick={go}>
          {pick === null ? "Tap a word" : `It's “${words(line.text)[pick]}”!`}
        </button>
      )}
    </section>
  );
}

// ---------- The reveal ----------
function Reveal({ room, g, partnerName, oops }: { room: StoryView; g: StoryGameView; partnerName: string; oops: (e: unknown) => void }) {
  const next = useMutation(api.story.next);
  const line = g.lines.at(-1)!;
  const me = room.meId;
  const ready = g.ready.includes(me);
  const mine = line.by === me;
  const guessed = line.guess !== null ? words(line.text)[line.guess] : "";
  const title = line.spotted ? (mine ? `${partnerName} spotted it! 🔍` : "You spotted it! 🔍") : mine ? "Sneaked past! 🥷" : `${partnerName} sneaked it past you! 🥷`;
  const good = (line.spotted && !mine) || (!line.spotted && mine);
  return (
    <section className="st-reveal rise">
      <p className={`st-verdict pop${good ? " good" : ""}`}>{title}</p>
      <p className="st-bigline" style={inkVar(g.players.indexOf(line.by))}>
        <LineText line={line} showSecret />
      </p>
      <p className="st-explain">
        The secret was <b>“{line.secret}”</b>.{!line.spotted && guessed ? ` ${mine ? partnerName : "You"} guessed “${guessed}”.` : ""} +1 {line.spotted ? (mine ? partnerName : "you") : mine ? "you" : partnerName}
      </p>
      <button className={`btn ${ready ? "btn-white" : "btn-green"}`} disabled={ready} onClick={() => { feedback.tap(); void next({ code: room.code, line: g.lines.length }).catch(oops); }}>
        {ready ? `Waiting for ${partnerName}…` : g.lines.length >= g.total ? "Read our story" : "Keep writing"}
      </button>
    </section>
  );
}

// ---------- Header and the end ----------
function Header({ room, g }: { room: StoryView; g: StoryGameView }) {
  const router = useRouter();
  const leave = useMutation(api.story.leave);
  const [ask, setAsk] = useState(false);
  const go = async () => { await leave({ code: room.code }).catch(() => {}); router.push("/story"); };
  return (
    <>
      <header className="topbar" style={{ gap: 8, minHeight: 44 }}>
        <button className="icon-btn" aria-label="Leave game" onClick={() => { feedback.tap(); if (g.done || !g.isPlayer) void go(); else setAsk(true); }}><Icon.Close /></button>
        <span className="chip st-chip">{GAME_NAME.toUpperCase()}</span>
        <span className="grow" />
        <span className="chip chip-mist" aria-label={`Room code ${room.code}`}>{room.code}</span>
      </header>
      <Sheet open={ask} onClose={() => setAsk(false)} label="Leave game">
        <h2 style={{ margin: 0, fontSize: 24, fontWeight: 900, textAlign: "center" }}>Leave the story?</h2>
        <p style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "var(--muted)", textAlign: "center" }}>Unfinished stories aren&apos;t saved to your shelf.</p>
        <button className="btn btn-green" onClick={() => setAsk(false)}>Keep writing</button>
        <button className="btn btn-white" style={{ color: "var(--cherry-edge)" }} onClick={go}>Leave</button>
      </Sheet>
    </>
  );
}

function Done({ room, g }: { room: StoryView; g: StoryGameView }) {
  const router = useRouter();
  const rematch = useMutation(api.story.rematch);
  const leave = useMutation(api.story.leave);
  const me = room.meId;
  const left = g.done?.reason === "left";
  const pts = (p: string) => g.scores[p].sneaks + g.scores[p].spots;
  const best = Math.max(...g.players.map(pts));
  const winners = g.players.filter((p) => pts(p) === best);
  const name = (p: string) => (p === me ? "You" : g.names[p]);
  const sneakiest = [...g.players].sort((a, b) => g.scores[b].sneaks - g.scores[a].sneaks)[0];
  const sharpest = [...g.players].sort((a, b) => g.scores[b].spots - g.scores[a].spots)[0];
  const played = useRef(false);
  useEffect(() => {
    if (played.current) return;
    played.current = true;
    if (!left) feedback.win();
  }, [left]);
  return (
    <div className="overlay st-done">
      {!left && <Confetti count={40} />}
      {left ? (
        <>
          <Mascot size={84} mood="wow" />
          <h2>Your partner left</h2>
        </>
      ) : (
        <>
          <span className="label">The end</span>
          <h2>{winners.length > 1 ? "A tie! Great story 📖" : `${name(winners[0])} ${winners[0] === me ? "win" : "wins"}! 📖`}</h2>
          <div className="st-awards">
            <span><b>🥷 Sneakiest</b>{name(sneakiest)} · {g.scores[sneakiest].sneaks}</span>
            <span><b>🔍 Sharpest eye</b>{name(sharpest)} · {g.scores[sharpest].spots}</span>
          </div>
          <StoryPaper starter={g.starter} lines={g.lines} players={g.players} names={g.names} meId={me} className="st-final" />
          <p className="st-saved">📚 Saved to your Story Shelf</p>
        </>
      )}
      <button className="btn btn-green" style={{ maxWidth: 380 }} onClick={() => { feedback.tap(); void rematch({ code: room.code }); }}>Write another</button>
      <button className="btn btn-ghost" style={{ maxWidth: 380 }} onClick={async () => { await leave({ code: room.code }).catch(() => {}); router.push("/story"); }}>Back home</button>
    </div>
  );
}
