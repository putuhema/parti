"use client";

import { useMutation } from "convex/react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { api } from "../../../convex/_generated/api";
import { PALETTE } from "../../../convex/lib/emoji/content";
import { GAP, GUESS_LEN, HINT_MS, ROUND_MS, isEmoji } from "../../../convex/lib/emoji/rules";
import { TimerBar, Toast } from "@/components/words/common";
import { Confetti, Icon, Mascot, Sheet } from "@/components/ui";
import { errorText } from "@/lib/errors";
import { feedback } from "@/lib/feedback";
import { useNow } from "@/lib/hooks";
import { Clue, GAME_NAME, catOf, type EmojiGameView, type EmojiView } from "./common";

type Move =
  | { kind: "choose"; i: number } | { kind: "add"; emoji: string } | { kind: "back" } | { kind: "clear" }
  | { kind: "guess"; text: string } | { kind: "pass" } | { kind: "next" };
type ToastT = { text: string; kind: "bad" | "good" | "info"; id: number } | null;
type Props = { room: EmojiView; g: EmojiGameView; partnerName: string; send: (m: Move) => Promise<string | null | false> };

export function EmojiPlay({ room }: { room: EmojiView }) {
  const g = room.game!;
  const act = useMutation(api.emoji.act);
  const [toast, setToast] = useState<ToastT>(null);
  const me = room.meId;
  const partner = g.players.find((p) => p !== me) ?? g.players[1];
  const partnerName = g.names[partner] ?? "your partner";

  async function send(move: Move) {
    feedback.unlock();
    try {
      return (await act({ code: room.code, round: g.round, move })) ?? null;
    } catch (e) {
      feedback.wrong();
      setToast({ text: errorText(e, "Not allowed"), kind: "bad", id: Date.now() });
      return false;
    }
  }

  // Sounds: a ping for your turn, a cheer when it's guessed, a groan when time runs out.
  const key = `${g.round}${g.phase}`;
  const last = useRef(key);
  useEffect(() => {
    if (key === last.current || g.done) { last.current = key; return; }
    last.current = key;
    if (g.phase === "reveal") { if (g.results.at(-1)?.solved) feedback.correct(); else feedback.wrong(); }
    else feedback.ping();
  }, [key, g.done, g.phase, g.results]);

  return (
    <main className="screen tight ec-screen">
      <Header room={room} g={g} />
      {!g.done && (
        <div className="ec-hud">
          <span className="chip ec-chip">ROUND {g.round + 1}/{g.rounds}</span>
          <span className="grow" />
          <span className="chip ec-score">⭐ {g.score}</span>
        </div>
      )}
      {!g.done && g.phase === "clue" && <TimerBar deadline={g.deadline} total={ROUND_MS} />}
      {g.done ? null : !g.isPlayer ? (
        <p className="ec-wait wait">You&apos;re watching.</p>
      ) : g.phase === "pick" ? (
        g.giver === me ? <Pick room={room} g={g} partnerName={partnerName} send={send} /> : <p className="ec-wait wait">{partnerName} is choosing a secret… 🤫<br />Get ready to guess!</p>
      ) : g.phase === "clue" ? (
        g.giver === me ? <Give room={room} g={g} partnerName={partnerName} send={send} /> : <GuessIt key={g.round} room={room} g={g} partnerName={partnerName} send={send} say={(t, k) => setToast({ text: t, kind: k, id: Date.now() })} />
      ) : (
        <Reveal room={room} g={g} partnerName={partnerName} send={send} />
      )}
      <Toast toast={toast} onDone={() => setToast(null)} />
      {g.done && <Done room={room} g={g} />}
    </main>
  );
}

// ---------- Choosing the secret ----------
function Pick({ g, partnerName, send }: Props) {
  return (
    <>
      <p className="ec-step"><b>Pick your secret</b> You&apos;ll describe it to {partnerName} using only emoji.</p>
      <div className="ec-choices">
        {g.choices.map((c, i) => (
          <button key={c.text} type="button" className="ec-choice rise" style={{ animationDelay: `${i * 70}ms` }} onClick={() => { feedback.tap(); void send({ kind: "choose", i }); }}>
            <span className="cat">{catOf(c.category).icon} {catOf(c.category).name}</span>
            <b>{c.text}</b>
          </button>
        ))}
      </div>
    </>
  );
}

// ---------- Giving the clue ----------
function Give({ g, partnerName, send }: Props) {
  const [tab, setTab] = useState(0);
  const [typed, setTyped] = useState("");
  const add = (e: string) => { feedback.tap(); void send({ kind: "add", emoji: e }); };
  // Emoji from the phone's own keyboard: add each one, drop anything else.
  function fromKeyboard(v: string) {
    const parts = [...new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(v)].map((s) => s.segment).filter(isEmoji);
    for (const e of parts) add(e);
    setTyped("");
  }
  const lastGuess = g.guesses.at(-1);
  return (
    <>
      <div className="ec-secret"><span>{catOf(g.category).icon} Your secret</span><b>{g.answer?.text}</b></div>
      <Clue clue={g.clue} big empty="Tap emoji below to build your clue" />
      <div className="ec-feed" aria-live="polite">
        {g.guesses.length === 0 ? <span className="wait">{partnerName}&apos;s guesses will appear here</span> : g.guesses.slice(-4).map((x, i) => (
          <span key={i} className={`ec-g${x.close ? " close" : ""}${x === lastGuess ? " new" : ""}`}>{x.close ? "🔥 " : ""}{x.text}</span>
        ))}
      </div>
      <div className="ec-tools">
        <button type="button" className="btn btn-white btn-sm" onClick={() => { feedback.tap(); void send({ kind: "add", emoji: GAP }); }}>␣ Next word</button>
        <button type="button" className="btn btn-white btn-sm" aria-label="Delete last emoji" disabled={!g.clue.length} onClick={() => { feedback.tap(); void send({ kind: "back" }); }}>⌫</button>
        <input className="input ec-kbd" value={typed} onChange={(e) => fromKeyboard(e.target.value)} placeholder="⌨️ 😀" aria-label="Type emoji from your keyboard" />
      </div>
      <div className="ec-tabs" role="tablist">
        {PALETTE.map((t, i) => (
          <button key={t.name} type="button" role="tab" aria-selected={tab === i} aria-label={t.name} onClick={() => { feedback.tap(); setTab(i); }}>{t.icon}</button>
        ))}
      </div>
      <div className="ec-palette">
        {PALETTE[tab].emojis.map((e) => (
          <button key={e} type="button" className="ec-key" onClick={() => add(e)} aria-label={`Add ${e}`}>{e}</button>
        ))}
      </div>
      <button type="button" className="btn btn-ghost btn-sm" style={{ alignSelf: "center" }} onClick={() => { feedback.tap(); void send({ kind: "pass" }); }}>Too hard? Skip this one</button>
    </>
  );
}

// ---------- Guessing ----------
function GuessIt({ g, partnerName, send, say }: Props & { say: (t: string, k: "bad" | "good" | "info") => void }) {
  const [text, setText] = useState("");
  const [shake, setShake] = useState(0);
  const now = useNow(500);
  const showHint = g.startedAt !== null && now - g.startedAt >= HINT_MS;
  const feed = useRef<HTMLDivElement>(null);
  useEffect(() => { feed.current?.scrollTo({ top: feed.current.scrollHeight }); }, [g.guesses.length]);
  // A tick when the clue grows.
  const n = useRef(g.clue.length);
  useEffect(() => {
    if (g.clue.length > n.current) feedback.tick();
    n.current = g.clue.length;
  }, [g.clue.length]);

  async function go(e: React.FormEvent) {
    e.preventDefault();
    const t = text.trim();
    if (!t) return;
    setText("");
    const v = await send({ kind: "guess", text: t });
    if (v === "close") { feedback.tap(); say("🔥 So close!", "info"); }
    else if (v === "wrong") { feedback.wrong(); setShake((s) => s + 1); }
  }
  return (
    <>
      <p className="ec-step"><b>What is {partnerName} describing?</b> {catOf(g.category).icon} {catOf(g.category).name} · {g.words} {g.words === 1 ? "word" : "words"}</p>
      <Clue clue={g.clue} big empty={`${partnerName} is thinking…`} />
      {showHint && g.hint && <p className="ec-hint pop">💡 {g.hint}</p>}
      <div ref={feed} className="ec-feed mine">
        {g.guesses.map((x, i) => <span key={i} className={`ec-g${x.close ? " close" : " wrong"}`}>{x.close ? "🔥" : "✗"} {x.text}</span>)}
      </div>
      <div className="grow" />
      <form key={shake} className={`ec-guess${shake ? " shake" : ""}`} onSubmit={go}>
        <input className="input" value={text} maxLength={GUESS_LEN} onChange={(e) => setText(e.target.value)} placeholder="Type your guess…" aria-label="Your guess" autoComplete="off" autoFocus enterKeyHint="send" />
        <button className="btn btn-green btn-sm" disabled={!text.trim()}>Guess</button>
      </form>
      <button type="button" className="btn btn-ghost btn-sm" style={{ alignSelf: "center" }} onClick={() => { feedback.tap(); void send({ kind: "pass" }); }}>No idea, skip</button>
    </>
  );
}

// ---------- The reveal ----------
function Reveal({ room, g, partnerName, send }: Props) {
  const r = g.results.at(-1);
  const ready = g.ready.includes(room.meId);
  if (!r) return null;
  const giverName = r.giver === room.meId ? "You" : partnerName;
  return (
    <section className="ec-reveal rise">
      <p className={`ec-verdict pop${r.solved ? " good" : ""}`}>{r.solved ? `Got it in ${Math.round((r.ms ?? 0) / 1000)}s! 🎉` : "Missed this one 😅"}</p>
      {r.solved && <span className="ec-plus">+{r.points}</span>}
      <div className="ec-answer"><span>{catOf(r.category).icon} {catOf(r.category).name}</span><b>{r.answer}</b></div>
      <span className="label">{giverName === "You" ? "Your clue" : `${giverName}'s clue`}</span>
      <Clue clue={r.clue} empty="No emoji at all!" />
      <p className="ec-talk">{r.solved ? "Which emoji gave it away?" : `${giverName === "You" ? "Explain" : "Ask them to explain"} the clue!`}</p>
      <button className={`btn ${ready ? "btn-white" : "btn-green"}`} disabled={ready} onClick={() => { feedback.tap(); void send({ kind: "next" }); }}>
        {ready ? `Waiting for ${partnerName}…` : g.round + 1 >= g.rounds ? "See our score" : "Next round"}
      </button>
    </section>
  );
}

// ---------- Header and end ----------
function Header({ room, g }: { room: EmojiView; g: EmojiGameView }) {
  const router = useRouter();
  const leave = useMutation(api.emoji.leave);
  const [ask, setAsk] = useState(false);
  const go = async () => { await leave({ code: room.code }).catch(() => {}); router.push("/emoji"); };
  return (
    <>
      <header className="topbar" style={{ gap: 8, minHeight: 44 }}>
        <button className="icon-btn" aria-label="Leave game" onClick={() => { feedback.tap(); if (g.done || !g.isPlayer) void go(); else setAsk(true); }}><Icon.Close /></button>
        <span className="chip ec-chip">{GAME_NAME.toUpperCase()}</span>
        <span className="grow" />
        <span className="chip chip-mist" aria-label={`Room code ${room.code}`}>{room.code}</span>
      </header>
      <Sheet open={ask} onClose={() => setAsk(false)} label="Leave game">
        <h2 style={{ margin: 0, fontSize: 24, fontWeight: 900, textAlign: "center" }}>Leave this game?</h2>
        <p style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "var(--muted)", textAlign: "center" }}>The game ends for both of you.</p>
        <button className="btn btn-green" onClick={() => setAsk(false)}>Keep playing</button>
        <button className="btn btn-white" style={{ color: "var(--cherry-edge)" }} onClick={go}>Leave</button>
      </Sheet>
    </>
  );
}

function Done({ room, g }: { room: EmojiView; g: EmojiGameView }) {
  const router = useRouter();
  const rematch = useMutation(api.emoji.rematch);
  const leave = useMutation(api.emoji.leave);
  const left = g.done?.reason === "left";
  const solved = g.results.filter((r) => r.solved).length;
  const newBest = !!room.best && room.best.games > 1 && g.score >= room.best.best;
  const played = useRef(false);
  useEffect(() => {
    if (played.current) return;
    played.current = true;
    if (!left) feedback.win();
  }, [left]);
  return (
    <div className="overlay ec-done">
      {!left && solved >= g.rounds / 2 && <Confetti />}
      {left ? (
        <>
          <Mascot size={84} mood="wow" />
          <h2>Your partner left</h2>
        </>
      ) : (
        <>
          <span className="ec-bigscore">⭐ {g.score}</span>
          <h2>{solved === g.rounds ? "Emoji masters! 🏆" : solved >= g.rounds / 2 ? "Great team! 🎉" : "Lost in emoji 😂"}</h2>
          <p className="ec-sub">{solved}/{g.rounds} guessed{newBest ? " · 🏆 new best!" : room.best ? ` · best ${room.best.best}` : ""}</p>
          <div className="ec-recap">
            {g.results.map((r) => (
              <div key={r.round} className={`ec-recaprow${r.solved ? " ok" : ""}`}>
                <span className="clue">{r.clue.filter((c) => c !== GAP).slice(0, 8).join("") || "—"}</span>
                <span className="ans">{r.solved ? "✓" : "✗"} {r.answer}</span>
              </div>
            ))}
          </div>
        </>
      )}
      <button className="btn btn-green" style={{ maxWidth: 380 }} onClick={() => { feedback.tap(); void rematch({ code: room.code }); }}>Play again</button>
      <button className="btn btn-ghost" style={{ maxWidth: 380 }} onClick={async () => { await leave({ code: room.code }).catch(() => {}); router.push("/emoji"); }}>Back home</button>
    </div>
  );
}
