"use client";

import { useMutation, useQuery } from "convex/react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { api } from "../../../convex/_generated/api";
import { ASKS, CLUE_LEN, DRAW_MS, REVEAL_MS, SKETCH_MS, WORD_LEN, isBot, resultOf, type Clue } from "../../../convex/lib/sketch/rules";
import { Countdown, TimerBar, Toast } from "@/components/words/common";
import { Confetti, Icon, Mascot, Sheet, roomPaints } from "@/components/ui";
import { errorText } from "@/lib/errors";
import { feedback } from "@/lib/feedback";
import { useNow } from "@/lib/hooks";
import { Board, DrawPad, GAME_NAME, Score, useNameOf, withArticle, type SketchGameView, type SketchView } from "./common";

type NameOf = (id?: string | null) => string;
type ToastT = { text: string; kind: "bad" | "good"; id: number } | null;

export function SketchPlay({ room }: { room: SketchView }) {
  const g = room.game!;
  const nameOf = useNameOf(room);
  const [toast, setToast] = useState<ToastT>(null);
  const oops = (e: unknown, fallback = "Not allowed") => { feedback.wrong(); setToast({ text: errorText(e, fallback), kind: "bad", id: Date.now() }); };
  const describing = g.describer === room.meId;
  const watching = !g.isPlayer;

  // Ping when the round changes over, so heads come up from the phone.
  const lastPhase = useRef(`${g.round}${g.phase}`);
  useEffect(() => {
    const key = `${g.round}${g.phase}`;
    if (key !== lastPhase.current && !g.done) {
      if (g.phase === "reveal") feedback.correct();
      else feedback.ping();
    }
    lastPhase.current = key;
  }, [g.round, g.phase, g.done]);

  return (
    <main className="screen tight sk-screen">
      <Header room={room} g={g} />
      {!g.done && (
        <div className="sk-status">
          <span className="sk-role">
            <small>ROUND {g.round + 1}/{g.rounds}{g.phase === "reveal" ? " · ANSWER" : ""}</small>
            {g.phase === "reveal"
              ? "Here's the picture!"
              : g.phase === "sketch"
                ? describing ? "Draw your secret picture" : `${nameOf(g.describer)} is drawing a secret picture`
                : watching ? `${nameOf(g.describer)} is describing` : describing ? "You describe" : `Draw what ${nameOf(g.describer)} says`}
          </span>
          <span className="sk-timer"><TimerBar deadline={g.deadline} total={g.phase === "draw" ? DRAW_MS : g.phase === "sketch" ? SKETCH_MS : REVEAL_MS} /></span>
        </div>
      )}
      {g.done ? null : g.phase === "reveal" ? (
        <Reveal key={g.round} room={room} g={g} nameOf={nameOf} />
      ) : g.phase === "sketch" ? (
        describing ? <OwnPicture key={g.round} room={room} g={g} oops={oops} /> : <Waiting name={nameOf(g.describer)} />
      ) : describing || watching ? (
        <Describe key={g.round} room={room} g={g} nameOf={nameOf} oops={oops} watching={watching} />
      ) : (
        <Draw key={g.round} room={room} g={g} nameOf={nameOf} oops={oops} />
      )}
      <Toast toast={toast} onDone={() => setToast(null)} />
      {room.startAt && !g.done && <Countdown startAt={room.startAt} label={describing ? (g.phase === "sketch" ? "You draw the first secret picture" : "You describe first") : g.solo ? `${GAME_NAME}: get your finger ready` : g.phase === "sketch" ? `${nameOf(g.describer)} draws first` : `${nameOf(g.describer)} describes first`} />}
      {g.done && <Done room={room} g={g} nameOf={nameOf} />}
    </main>
  );
}

/** Bot clues arrive on a timer; only show the ones whose time has come. */
function useShownClues(g: SketchGameView) {
  const now = useNow(500);
  return g.clues.filter((c) => c.at <= now);
}

function ClueList({ clues, nameOf, empty }: { clues: Clue[]; nameOf: NameOf; empty: string }) {
  const end = useRef<HTMLLIElement>(null);
  useEffect(() => { end.current?.scrollIntoView({ block: "nearest", behavior: "smooth" }); }, [clues.length]);
  return (
    <ol className="sk-clues" aria-live="polite" aria-label="Clues">
      {clues.length === 0 && <li className="sk-clue empty wait">{empty}</li>}
      {clues.map((c, i) => (
        <li key={i} className={`sk-clue${c.ask ? " ask" : ""}${i === clues.length - 1 ? " new" : ""}`}>
          {c.ask && <b>{nameOf(c.by)}: </b>}
          {c.text}
        </li>
      ))}
      <li ref={end} aria-hidden="true" style={{ height: 0, listStyle: "none" }} />
    </ol>
  );
}

// ---------- Describer (and anyone watching) ----------
function Describe({ room, g, nameOf, oops, watching }: { room: SketchView; g: SketchGameView; nameOf: NameOf; oops: (e: unknown) => void; watching: boolean }) {
  const say = useMutation(api.sketch.say);
  const drawings = useQuery(api.sketch.drawings, { code: room.code, round: g.round });
  const clues = useShownClues(g);
  const [text, setText] = useState("");
  const paints = roomPaints(g.everyone.map((id, seat) => ({ id, seat, isMe: id === room.meId })));
  const [big, setBig] = useState<string | null>(null);

  // Asks from drawers ping the describer.
  const asks = clues.filter((c) => c.ask).length;
  const lastAsks = useRef(asks);
  useEffect(() => {
    if (asks > lastAsks.current) feedback.tick();
    lastAsks.current = asks;
  }, [asks]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const t = text.trim();
    if (!t) return;
    feedback.tap();
    setText("");
    try { await say({ code: room.code, text: t }); } catch (err) { setText(t); oops(err); }
  }

  return (
    <>
      {g.picture?.word && (
        <p className="sk-word">{watching ? <>It&apos;s {withArticle(g.picture.word)}</> : <>It&apos;s <b>{withArticle(g.picture.word)}</b>. Don&apos;t say it!</>}</p>
      )}
      <section className="sk-main">
        <Board picture={g.picture?.lines} label={g.picture?.word ? `The secret picture: ${withArticle(g.picture.word)}` : "The secret picture"} className="secret" />
        {!watching && <span className="sk-tag">SECRET · ONLY YOU CAN SEE THIS</span>}
      </section>
      <section className="sk-thumbs" aria-label="Live drawings">
        {g.drawers.map((p) => (
          <button key={p} type="button" className="sk-thumb" onClick={() => { feedback.tap(); setBig(p); }} aria-label={`${nameOf(p)}'s drawing so far`}>
            <Board strokes={drawings?.[p] ?? []} color={paints.get(p)?.face} label="" />
            <span className="nm">{g.finished.includes(p) && "✓ "}{nameOf(p)}</span>
          </button>
        ))}
      </section>
      <ClueList clues={clues} nameOf={nameOf} empty={watching ? "Waiting for the first clue…" : "Describe it without saying what it is: the shapes, how big, and where they go."} />
      {!watching && (
        <form className="sk-say" onSubmit={send}>
          <input className="input" value={text} maxLength={CLUE_LEN} onChange={(e) => setText(e.target.value)} placeholder="e.g. a big circle in the middle" aria-label="Type a clue" autoComplete="off" enterKeyHint="send" />
          <button className="btn btn-green btn-sm" disabled={!text.trim()}>Send</button>
        </form>
      )}
      <Sheet open={big !== null} onClose={() => setBig(null)} label="Drawing">
        <h2 style={{ margin: 0, fontSize: 22, fontWeight: 900, textAlign: "center" }}>{nameOf(big)}&apos;s drawing</h2>
        <Board strokes={(big && drawings?.[big]) || []} color={big ? paints.get(big)?.face : undefined} picture={g.picture?.lines} ghost label={`${nameOf(big)}'s drawing over the picture`} className="sheet" />
        <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: "var(--muted)", textAlign: "center" }}>The picture is shown faintly underneath. Only you can see it.</p>
        <button className="btn btn-white" onClick={() => setBig(null)}>Close</button>
      </Sheet>
    </>
  );
}

// ---------- Drawer ----------
function Draw({ room, g, nameOf, oops }: { room: SketchView; g: SketchGameView; nameOf: NameOf; oops: (e: unknown) => void }) {
  const save = useMutation(api.sketch.draw);
  const finish = useMutation(api.sketch.finishDrawing);
  const say = useMutation(api.sketch.say);
  const mine = useQuery(api.sketch.drawings, { code: room.code, round: g.round });
  const clues = useShownClues(g);
  const [strokes, setStrokes] = useState<number[][]>([]);
  const [loaded, setLoaded] = useState(false);
  // Back after a reload? Pick the drawing up where you left it.
  if (!loaded && mine !== undefined) {
    setLoaded(true);
    if (mine?.[room.meId]?.length) setStrokes(mine[room.meId]);
  }
  const done = g.finished.includes(room.meId);
  const asked = useRef(0);

  // A new clue gets a little tick so you look up.
  const count = clues.filter((c) => !c.ask).length;
  const lastCount = useRef(count);
  useEffect(() => {
    if (count > lastCount.current) feedback.tick();
    lastCount.current = count;
  }, [count]);

  function change(next: number[][]) {
    setStrokes(next);
    void save({ code: room.code, round: g.round, strokes: next }).catch(oops);
  }
  async function toggleDone() {
    feedback.tap();
    try {
      if (!done) await save({ code: room.code, round: g.round, strokes });
      await finish({ code: room.code, round: g.round, done: !done });
    } catch (e) { oops(e); }
  }
  async function ask(t: string, t0: number) {
    if (t0 - asked.current < 3000) return;
    feedback.tap();
    asked.current = t0;
    try { await say({ code: room.code, text: t }); } catch (e) { oops(e); }
  }

  const others = g.drawers.filter((p) => p !== room.meId);
  return (
    <>
      <ClueList clues={clues} nameOf={nameOf} empty={isBot(g.describer ?? "") ? `${nameOf(g.describer)} is looking at the picture…` : `Listen to ${nameOf(g.describer)}, or wait for typed clues…`} />
      <section className="sk-main">
        <DrawPad strokes={strokes} onChange={change} disabled={done} />
        {done && <span className="sk-tag good">DONE · WAITING FOR {others.filter((p) => !g.finished.includes(p)).length ? "THE OTHERS" : "THE ANSWER"}</span>}
      </section>
      <div className="sk-tools">
        <button className="btn btn-white btn-sm" disabled={done || !strokes.length} onClick={() => { feedback.tap(); change(strokes.slice(0, -1)); }}><Icon.Undo /> Undo</button>
        <button className="btn btn-white btn-sm" disabled={done || !strokes.length} onClick={() => { feedback.tap(); change([]); }}><Icon.Erase /> Clear</button>
        <span className="grow" />
        <button className={`btn btn-sm ${done ? "btn-white" : "btn-green"}`} onClick={toggleDone}>{done ? "Keep drawing" : <><Icon.Check /> Done</>}</button>
      </div>
      {!g.solo && (
        <div className="sk-asks" aria-label="Ask the describer">
          {ASKS.map((t) => <button key={t} type="button" className="sk-ask" onClick={(e) => ask(t, e.timeStamp)}>{t}</button>)}
        </div>
      )}
    </>
  );
}

// ---------- The answer ----------
function Reveal({ room, g, nameOf }: { room: SketchView; g: SketchGameView; nameOf: NameOf }) {
  const next = useMutation(api.sketch.next);
  const drawings = useQuery(api.sketch.drawings, { code: room.code, round: g.round });
  const res = resultOf(g, g.round);
  const paints = roomPaints(g.everyone.map((id, seat) => ({ id, seat, isMe: id === room.meId })));
  if (!res) return null;
  const ranked = Object.entries(res.scores).sort((a, b) => b[1] - a[1]);
  const mine = res.scores[room.meId];
  return (
    <>
      {res.picture.word && <p className="sk-word big rise">It was {withArticle(res.picture.word)}!</p>}
      <section className="sk-main small">
        <Board picture={res.picture.lines} label={res.picture.word ? `The picture: ${withArticle(res.picture.word)}` : "The picture"} className="secret" />
      </section>
      <p className="sk-verdict rise">
        {mine !== undefined ? <>Your match: <Score n={mine} big /></> : res.describerScore !== null && res.describer === room.meId ? <>Your describing earned <Score n={res.describerScore} big /></> : `${nameOf(res.describer)} described`}
      </p>
      <section className="sk-results">
        {ranked.map(([p, s], i) => (
          <div key={p} className="sk-result rise" style={{ animationDelay: `${i * 80}ms` }}>
            <Board picture={res.picture.lines} ghost strokes={drawings?.[p] ?? []} color={paints.get(p)?.face} label={`${nameOf(p)}'s drawing, ${s}% match`} />
            <span className="nm">{nameOf(p)}</span>
            <Score n={s} />
          </div>
        ))}
        {res.describerScore !== null && (
          <div className="sk-result describer rise" style={{ animationDelay: `${ranked.length * 80}ms` }}>
            <span className="sk-mic" aria-hidden="true">🗣️</span>
            <span className="nm">{nameOf(res.describer)} described</span>
            <Score n={res.describerScore} />
          </div>
        )}
      </section>
      {room.isHost && g.isPlayer && <button className="btn btn-white btn-sm" style={{ alignSelf: "center" }} onClick={() => { feedback.tap(); void next({ code: room.code, round: g.round }); }}>{g.round + 1 >= g.rounds ? "See results" : "Next round"} →</button>}
    </>
  );
}

// ---------- Draw-your-own: the describer sketches the secret picture ----------
function OwnPicture({ room, g, oops }: { room: SketchView; g: SketchGameView; oops: (e: unknown) => void }) {
  const save = useMutation(api.sketch.draw);
  const ready = useMutation(api.sketch.pictureReady);
  const mine = useQuery(api.sketch.drawings, { code: room.code, round: g.round });
  const [strokes, setStrokes] = useState<number[][]>([]);
  const [word, setWord] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [sending, setSending] = useState(false);
  if (!loaded && mine !== undefined) {
    setLoaded(true);
    if (mine?.[room.meId]?.length) setStrokes(mine[room.meId]);
  }
  function change(next: number[][]) {
    setStrokes(next);
    void save({ code: room.code, round: g.round, strokes: next }).catch(oops);
  }
  async function go() {
    feedback.tap();
    setSending(true);
    try {
      await save({ code: room.code, round: g.round, strokes });
      await ready({ code: room.code, round: g.round, word });
    } catch (e) { oops(e); setSending(false); }
  }
  return (
    <>
      <p className="sk-hint">Draw something simple: a cat, a car, a rocket… The others won&apos;t see it. Then you&apos;ll describe it.</p>
      <section className="sk-main">
        <DrawPad strokes={strokes} onChange={change} disabled={sending} label="Your secret picture. Draw with your finger." />
        <span className="sk-tag">SECRET · ONLY YOU CAN SEE THIS</span>
      </section>
      <div className="sk-tools">
        <button className="btn btn-white btn-sm" disabled={sending || !strokes.length} onClick={() => { feedback.tap(); change(strokes.slice(0, -1)); }}><Icon.Undo /> Undo</button>
        <button className="btn btn-white btn-sm" disabled={sending || !strokes.length} onClick={() => { feedback.tap(); change([]); }}><Icon.Erase /> Clear</button>
      </div>
      <form className="sk-say" onSubmit={(e) => { e.preventDefault(); if (strokes.length) void go(); }}>
        <input className="input" value={word} maxLength={WORD_LEN} onChange={(e) => setWord(e.target.value)} placeholder="What is it? (optional)" aria-label="What is your picture? Optional" autoComplete="off" />
        <button className="btn btn-green btn-sm" disabled={sending || !strokes.length}>Ready</button>
      </form>
    </>
  );
}

function Waiting({ name }: { name: string }) {
  return (
    <section className="sk-waiting">
      <Mascot size={84} className="bob" />
      <p className="wait">{name} is drawing something secret.<br />Get your finger ready!</p>
    </section>
  );
}

function Header({ room, g }: { room: SketchView; g: SketchGameView }) {
  const router = useRouter();
  const leave = useMutation(api.sketch.leave);
  const [ask, setAsk] = useState(false);
  const go = async () => { await leave({ code: room.code }).catch(() => {}); router.push("/sketch"); };
  return (
    <>
      <header className="topbar" style={{ gap: 8, minHeight: 44 }}>
        <button className="icon-btn" aria-label="Leave game" onClick={() => { feedback.tap(); if (g.done || !g.isPlayer) void go(); else setAsk(true); }}><Icon.Close /></button>
        <span className="chip chip-grape">{GAME_NAME.toUpperCase()}</span>
        <span className="grow" />
        <span className="chip chip-mist" aria-label={`Room code ${room.code}`}>{room.code}</span>
      </header>
      <Sheet open={ask} onClose={() => setAsk(false)} label="Leave game">
        <h2 style={{ margin: 0, fontSize: 24, fontWeight: 900, textAlign: "center" }}>Leave this game?</h2>
        <p style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "var(--muted)", textAlign: "center" }}>{g.solo || g.players.length <= 2 ? "The game ends." : "The others play on without you."}</p>
        <button className="btn btn-green" onClick={() => setAsk(false)}>Keep playing</button>
        <button className="btn btn-white" style={{ color: "var(--cherry-edge)" }} onClick={go}>Leave</button>
      </Sheet>
    </>
  );
}

function Done({ room, g, nameOf }: { room: SketchView; g: SketchGameView; nameOf: NameOf }) {
  const router = useRouter();
  const rematch = useMutation(api.sketch.rematch);
  const leave = useMutation(api.sketch.leave);
  const d = g.done!;
  const rounds = Math.max(1, g.history.length);
  const myAvg = Math.round((g.totals[room.meId] ?? 0) / Math.max(1, g.solo ? rounds : g.history.filter((h) => h.scores[room.meId] !== undefined || h.describer === room.meId).length));
  const iWon = g.solo ? myAvg >= 60 : d.winners.includes(room.meId);
  const played = useRef(false);
  useEffect(() => {
    if (played.current) return;
    played.current = true;
    if (iWon) feedback.win(); else feedback.wrong();
  }, [iWon]);
  const ranked = [...g.everyone].sort((a, b) => (g.totals[b] ?? 0) - (g.totals[a] ?? 0));
  const title = g.solo ? (myAvg >= 80 ? "Sharp eyes!" : myAvg >= 60 ? "Nice drawing!" : "Keep sketching!") : iWon ? (d.winners.length > 1 ? "It's a tie!" : "You win!") : d.winners.length === 1 ? `${nameOf(d.winners[0])} wins` : "Game over";
  const sub = d.reason === "left" ? "Too many players left the game." : g.solo ? `Your average match over ${rounds} pictures: ${myAvg}%` : "Points from your drawings plus your describing:";
  return (
    <div className="overlay">
      {iWon && <Confetti />}
      <Mascot size={88} mood={iWon ? "joy" : "wow"} className={iWon ? "jump" : undefined} />
      <h2 style={{ margin: 0, fontSize: 34, fontWeight: 900, textAlign: "center", color: iWon ? "var(--lime-dark)" : "var(--tangerine-ink)" }}>{title}</h2>
      <p style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "var(--muted)", textAlign: "center" }}>{sub}</p>
      {g.solo ? (
        <div className="sk-recap">
          {g.history.map((h, i) => (
            <span key={i} className="sk-recapcell"><Board picture={h.picture.lines} label={h.picture.word || `Picture ${i + 1}`} /><Score n={h.scores[room.meId] ?? 0} /></span>
          ))}
        </div>
      ) : (
        <div className="list" style={{ width: "100%", maxWidth: 360 }}>
          {ranked.map((p) => (
            <div key={p} className={`list-row${p === room.meId ? " me" : ""}`}>
              <span style={{ flex: 1, minWidth: 0, fontSize: 17, fontWeight: 900, opacity: g.players.includes(p) ? 1 : 0.5 }}>{nameOf(p)}{d.winners.includes(p) && " 👑"}</span>
              <span style={{ fontSize: 20, fontWeight: 900, fontVariantNumeric: "tabular-nums" }}>{g.totals[p] ?? 0}</span>
            </div>
          ))}
        </div>
      )}
      {room.isHost ? (
        <button className="btn btn-green" style={{ maxWidth: 380 }} onClick={() => { feedback.tap(); void rematch({ code: room.code }); }}>Play again</button>
      ) : (
        <p className="wait" style={{ margin: 0, fontWeight: 900, color: "var(--muted)" }}>Waiting for the host…</p>
      )}
      <button className="btn btn-white" style={{ maxWidth: 380 }} onClick={async () => { await leave({ code: room.code }).catch(() => {}); router.push("/sketch"); }}>Back home</button>
    </div>
  );
}
