"use client";

import type { FunctionReturnType } from "convex/server";
import { useMutation, useQuery } from "convex/react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { api } from "../../../convex/_generated/api";
import { TEXT_LEN, isDraw, ownerOf, stepMs } from "../../../convex/lib/chain/rules";
import { TimerBar, Toast } from "@/components/words/common";
import { Avatar, Confetti, Icon, Sheet, roomPaints } from "@/components/ui";
import { errorText } from "@/lib/errors";
import { feedback } from "@/lib/feedback";
import { Art, Pad } from "./Pad";

export type ChainView = NonNullable<FunctionReturnType<typeof api.chain.view>>;
type G = NonNullable<ChainView["game"]>;
export const GAME_NAME = "Scribble Chain";

function useNames(room: ChainView) {
  const g = room.game!;
  return (id?: string | null) => (!id ? "Someone" : id === room.meId ? "You" : g.names[id] ?? "Player");
}

export function ChainPlay({ room }: { room: ChainView }) {
  const g = room.game!;
  return (
    <main className={`screen tight sc-screen${g.phase === "play" ? "" : " replay"}`}>
      <Header room={room} />
      {g.phase === "play" ? <Step room={room} /> : <Album room={room} />}
      {g.done && <Done room={room} g={g} />}
    </main>
  );
}

// ---------- Drawing and guessing ----------
function Step({ room }: { room: ChainView }) {
  const g = room.game!;
  const name = useNames(room);
  const task = useQuery(api.chain.task, { code: room.code });
  const paints = roomPaints(g.players.map((id, seat) => ({ id, seat, isMe: id === room.meId })));
  const mine = g.submitted.includes(room.meId);
  const kind = g.step === 0 ? "Pick and draw" : isDraw(g.step) ? "Draw it!" : "Guess it!";

  return (
    <>
      <div className="sc-stepbar">
        <span className="sc-steps" aria-label={`Step ${g.step + 1} of ${g.steps}`}>
          {Array.from({ length: g.steps }, (_, i) => <i key={i} className={`${isDraw(i) ? "d" : "t"}${i < g.step ? " past" : i === g.step ? " now" : ""}`}>{isDraw(i) ? "✏️" : "💬"}</i>)}
        </span>
        <b>{kind}</b>
      </div>
      <TimerBar deadline={g.deadline} total={stepMs(g.step)} />
      {!g.isPlayer ? (
        <Waiting title="You're watching 👀" sub="This round is underway. You can play the next one!" g={g} paints={paints} />
      ) : mine ? (
        <Waiting title="Passed it on! 📨" sub={isDraw(g.step) ? "Waiting for the others to finish drawing…" : "Waiting for the others to guess…"} g={g} paints={paints} />
      ) : !task || task.step !== g.step ? (
        <p className="sc-hint" style={{ textAlign: "center" }}>Getting your page…</p>
      ) : (
        <Work key={g.step} room={room} task={task} fromName={name(task.from)} />
      )}
    </>
  );
}

type Task = NonNullable<FunctionReturnType<typeof api.chain.task>>;

function Work({ room, task, fromName }: { room: ChainView; task: Task; fromName: string }) {
  const g = room.game!;
  const submit = useMutation(api.chain.submit);
  const [strokes, setStrokes] = useState<number[][]>([]);
  const [text, setText] = useState("");
  const [phrase, setPhrase] = useState<string | null>(null);
  const [own, setOwn] = useState(false);
  const [sending, setSending] = useState(false);
  const [toast, setToast] = useState<{ text: string; kind: string; id: number } | null>(null);
  const latest = useRef({ strokes, text, phrase });
  useEffect(() => { latest.current = { strokes, text, phrase }; }, [strokes, text, phrase]);
  const sent = useRef(false);

  async function send() {
    if (sent.current) return;
    sent.current = true;
    setSending(true);
    const l = latest.current;
    try {
      if (task.step === 0) await submit({ code: room.code, step: 0, text: l.phrase || task.choices![0], strokes: l.strokes });
      else if (isDraw(task.step)) await submit({ code: room.code, step: task.step, strokes: l.strokes });
      else await submit({ code: room.code, step: task.step, text: l.text });
      feedback.correct();
    } catch (e) {
      sent.current = false;
      setSending(false);
      feedback.wrong();
      setToast({ text: errorText(e, "Couldn't send"), kind: "bad", id: Date.now() });
    }
  }

  // Time's up: hand in whatever is there.
  const deadline = g.deadline;
  useEffect(() => {
    if (!deadline) return;
    const t = setTimeout(() => void send(), Math.max(0, deadline - Date.now() - 400));
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deadline]);

  const toastEl = <Toast toast={toast} onDone={() => setToast(null)} />;

  if (task.step === 0 && !phrase) {
    return (
      <section className="sc-work rise">
        <h2 className="sc-title">Pick your secret phrase 🤫</h2>
        <p className="sc-hint">You&apos;ll draw it, then it goes down the chain. Nobody else sees it until the end.</p>
        <div className="sc-choices">
          {task.choices!.map((c) => <button key={c} type="button" className="sc-choice" onClick={() => { feedback.tap(); setPhrase(c); }}>{c}</button>)}
        </div>
        {own ? (
          <form className="sc-guess" onSubmit={(e) => { e.preventDefault(); if (text.trim()) { feedback.tap(); setPhrase(text.trim()); setText(""); } }}>
            <input className="input" autoFocus maxLength={TEXT_LEN} value={text} onChange={(e) => setText(e.target.value)} placeholder="a cat running a bakery" />
            <button className="btn btn-green btn-sm" disabled={!text.trim()}>Use it</button>
          </form>
        ) : (
          <button type="button" className="btn btn-white btn-sm" style={{ alignSelf: "center" }} onClick={() => { feedback.tap(); setOwn(true); }}>✏️ Write my own</button>
        )}
        {toastEl}
      </section>
    );
  }

  if (isDraw(task.step)) {
    const what = task.step === 0 ? phrase! : task.text!;
    return (
      <section className="sc-work">
        <p className="sc-prompt">
          {task.step === 0 ? "Draw your phrase:" : <>{fromName} guessed:</>} <b>{what}</b>
          {task.step === 0 && <button type="button" className="sc-link" onClick={() => { feedback.tap(); setPhrase(null); }}>change</button>}
        </p>
        <Pad strokes={strokes} onChange={setStrokes} disabled={sending} />
        <button className="btn btn-green" disabled={sending} onClick={() => { feedback.tap(); void send(); }}>{strokes.length ? "Done, pass it on ➜" : "Pass it on blank 😅"}</button>
        {toastEl}
      </section>
    );
  }

  return (
    <section className="sc-work">
      <p className="sc-prompt">{fromName} drew this. What is it?</p>
      <Art strokes={task.strokes ?? []} label={`${fromName}'s drawing`} className="sc-big" />
      <form className="sc-guess" onSubmit={(e) => { e.preventDefault(); feedback.tap(); void send(); }}>
        <input className="input" autoFocus maxLength={TEXT_LEN} value={text} onChange={(e) => setText(e.target.value)} placeholder="a dog eating spaghetti?" disabled={sending} />
        <button className="btn btn-green btn-sm" disabled={sending || !text.trim()}>Send</button>
      </form>
      {toastEl}
    </section>
  );
}

function Waiting({ title, sub, g, paints }: { title: string; sub: string; g: G; paints: ReturnType<typeof roomPaints> }) {
  return (
    <section className="sc-waiting rise">
      <span className="sc-bigemoji bob">✏️</span>
      <h2>{title}</h2>
      <p>{sub}</p>
      <div className="sc-who">
        {g.players.filter((p) => !g.gone.includes(p)).map((p) => (
          <span key={p} className={g.submitted.includes(p) ? "in" : ""}>
            <Avatar name={g.names[p] ?? "?"} paint={paints.get(p)} size={40} />
            <small>{g.submitted.includes(p) ? "✓" : "…"}</small>
          </span>
        ))}
      </div>
    </section>
  );
}

// ---------- The replay ----------
function Album({ room }: { room: ChainView }) {
  const g = room.game!;
  const name = useNames(room);
  const data = useQuery(api.chain.album, { code: room.code });
  const next = useMutation(api.chain.next);
  const love = useMutation(api.chain.love);
  const paints = roomPaints(g.players.map((id, seat) => ({ id, seat, isMe: id === room.meId })));
  const end = useRef<HTMLDivElement>(null);
  const count = data?.entries.length ?? 0;
  const chain = data?.chain ?? g.album.chain;
  const complete = g.phase === "album" && g.album.shown >= g.steps;
  const last = g.album.chain >= g.players.length - 1;

  useEffect(() => {
    if (!count) return;
    end.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    feedback.ping();
  }, [count, chain]);
  const verdictPlayed = useRef(-1);
  useEffect(() => {
    if (!complete || verdictPlayed.current === chain) return;
    verdictPlayed.current = chain;
    if (g.survived[chain]) feedback.win(); else feedback.wrong();
  }, [complete, chain, g.survived]);

  const nextLabel = !complete ? (isDraw(g.album.shown) ? "Show the drawing ✏️" : "Show the guess 💬") : last ? "See the awards 🏆" : "Next chain ➜";
  const starter = ownerOf(g, chain, 0);

  return (
    <>
      <div className="sc-stepbar">
        <span className="chip chip-mist">CHAIN {chain + 1} / {g.players.length}</span>
        <b>{starter === room.meId ? "Your chain" : `${name(starter)}'s chain`}</b>
      </div>
      <div className="sc-feed">
        {data?.entries.map((e) => {
          const k = `${chain}:${e.step}`;
          const fans = g.likes[k] ?? [];
          const loved = fans.includes(room.meId);
          const mine = e.by === room.meId;
          return (
            <div key={k} className={`sc-entry pop ${isDraw(e.step) ? "draw" : "text"}`}>
              <span className="sc-by"><Avatar name={g.names[e.by] ?? "?"} paint={paints.get(e.by)} size={28} /><b>{name(e.by)}</b>{e.step === 0 ? " wrote" : isDraw(e.step) ? " drew" : " guessed"}</span>
              {e.step === 0 && <p className="sc-phrase">“{e.text}”</p>}
              {isDraw(e.step) ? (
                <Art strokes={e.strokes ?? []} label={`${name(e.by)}'s drawing`} />
              ) : (
                <p className="sc-bubble">
                  {e.text}
                  {g.nailed[k] && <span className="sc-nailed">✨ Nailed it</span>}
                </p>
              )}
              <button type="button" className={`sc-love${loved ? " on" : ""}`} disabled={mine || !g.isPlayer || g.phase !== "album"} aria-pressed={loved} aria-label={loved ? "Unlove" : "Love this"}
                onClick={() => { feedback.tap(); void love({ code: room.code, chain, step: e.step }).catch(() => {}); }}>
                {loved ? "❤️" : "🤍"} {fans.length || ""}
              </button>
            </div>
          );
        })}
        {complete && (
          <p className={`sc-verdict pop ${g.survived[chain] ? "good" : "bad"}`}>{g.survived[chain] ? "🎉 It made it all the way!" : "💥 Lost in translation!"}</p>
        )}
        <div ref={end} />
      </div>
      {g.phase === "album" && (
        <button className="btn btn-green" disabled={!room.isMember} onClick={() => { feedback.tap(); void next({ code: room.code, chain: g.album.chain, shown: g.album.shown }); }}>{nextLabel}</button>
      )}
    </>
  );
}

// ---------- Chrome ----------
function Header({ room }: { room: ChainView }) {
  const router = useRouter();
  const leave = useMutation(api.chain.leave);
  const g = room.game!;
  const [ask, setAsk] = useState(false);
  const go = async () => { await leave({ code: room.code }).catch(() => {}); router.push("/chain"); };
  return (
    <>
      <header className="topbar" style={{ gap: 8, minHeight: 44 }}>
        <button className="icon-btn" aria-label="Leave game" onClick={() => { feedback.tap(); if (g.done || !g.isPlayer) void go(); else setAsk(true); }}><Icon.Close /></button>
        <span className="chip sc-chip">✏️ {GAME_NAME.toUpperCase()}</span>
        <span className="grow" />
        <span className="chip chip-mist">{room.code}</span>
      </header>
      <Sheet open={ask} onClose={() => setAsk(false)} label="Leave game">
        <h2 style={{ margin: 0, fontSize: 24, fontWeight: 900, textAlign: "center" }}>Leave the chain?</h2>
        <p style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "var(--muted)", textAlign: "center" }}>Your turns will be passed on blank.</p>
        <button className="btn btn-green" onClick={() => setAsk(false)}>Stay</button>
        <button className="btn btn-white" style={{ color: "var(--cherry-edge)" }} onClick={go}>Leave</button>
      </Sheet>
    </>
  );
}

function Done({ room, g }: { room: ChainView; g: G }) {
  const router = useRouter();
  const rematch = useMutation(api.chain.rematch);
  const leave = useMutation(api.chain.leave);
  const name = useNames(room);
  const played = useRef(false);
  const ended = g.done?.reason === "end";
  useEffect(() => {
    if (played.current) return;
    played.current = true;
    if (ended) feedback.win();
  }, [ended]);
  const guesses = g.players.length * g.drawings;
  const made = Object.values(g.survived).filter(Boolean).length;
  const awards = g.done?.awards ?? [];
  const team = awards.find((a) => a.kind === "team")?.n ?? 0;
  const list = (who: string[]) => who.map(name).join(" & ");

  return (
    <div className="overlay sc-done">
      {ended && <Confetti />}
      <span className="sc-bigemoji">{ended ? "🖼️" : "👋"}</span>
      <h2>{ended ? "What a gallery!" : "Not enough players left"}</h2>
      {ended && (
        <div className="sc-awards">
          <div className="sc-award team"><span>🤝</span><b>{team} of {guesses} guesses nailed</b><small>{made} of {g.players.length} {g.players.length === 1 ? "chain" : "chains"} made it all the way</small></div>
          {awards.filter((a) => a.kind !== "team").map((a) => (
            <div key={a.kind} className="sc-award"><span>{a.kind === "artist" ? "🎨" : "😂"}</span><b>{a.kind === "artist" ? "Best artist" : "Best guesser"}: {list(a.who)}</b><small>{a.n} ❤️</small></div>
          ))}
          {awards.length === 1 && <p className="sc-hint" style={{ textAlign: "center" }}>Tap 🤍 on favourites in the replay to crown a best artist next time.</p>}
        </div>
      )}
      <button className="btn btn-green" style={{ maxWidth: 380 }} onClick={() => { feedback.tap(); void rematch({ code: room.code }); }}>Play again</button>
      <button className="btn btn-ghost" style={{ maxWidth: 380 }} onClick={async () => { await leave({ code: room.code }).catch(() => {}); router.push("/chain"); }}>Back home</button>
    </div>
  );
}
