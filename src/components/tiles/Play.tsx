"use client";

import { useMutation, useQuery } from "convex/react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { api } from "../../../convex/_generated/api";
import { BONUS, BONUS_LABEL, CELLS, CENTER, RACK, TURN_MS, judge, rackSum } from "../../../convex/lib/tiles/rules";
import { Countdown, TimerBar, Toast } from "@/components/words/common";
import { Avatar, Confetti, FRIENDS, Icon, Mascot, Sheet, roomPaints } from "@/components/ui";
import { feedback } from "@/lib/feedback";
import { WordBook } from "./WordBook";
import { BOT, GAME_NAME, Tile, useAct, useNameOf, type Move, type TileGameView, type TileView } from "./common";

type NameOf = (id?: string | null) => string;

export function TilePlay({ room }: { room: TileView }) {
  const g = room.game!;
  const { send, toast, say, clearToast } = useAct(room.code);
  const nameOf = useNameOf(room);
  const paints = roomPaints(room.members);
  paints.set(BOT, FRIENDS[0]);
  const myTurn = g.isPlayer && g.turn === room.meId && !g.done;
  const [book, setBook] = useState<{ focus: string | null } | null>(null);
  const openBook = (focus: string | null = null) => { feedback.tap(); setBook({ focus }); };

  // Sounds and toasts for each new event.
  const seen = useRef(g.log.length);
  useEffect(() => {
    if (g.log.length < seen.current) seen.current = 0;
    for (const e of g.log.slice(seen.current)) {
      const mine = e.by === room.meId;
      if (e.kind === "play") {
        if (mine) feedback.correct();
        else { feedback.ping(); say(`${nameOf(e.by)} played ${e.words[0].toUpperCase()} for ${e.score}`, "info"); }
      } else if (e.kind === "timeout") say(mine ? "Time's up, turn passed" : `${nameOf(e.by)} ran out of time`, "info");
      else if (e.kind === "left") say(`${nameOf(e.by)} left the game`, "info");
      else if (!mine) say(e.kind === "swap" ? `${nameOf(e.by)} swapped ${e.n} tile${e.n === 1 ? "" : "s"}` : `${nameOf(e.by)} passed`, "info");
    }
    seen.current = g.log.length;
  }, [g.log]); // eslint-disable-line react-hooks/exhaustive-deps

  // A ping when it becomes your turn.
  const wasMine = useRef(myTurn);
  useEffect(() => {
    if (myTurn && !wasMine.current) feedback.ping();
    wasMine.current = myTurn;
  }, [myTurn]);

  return (
    <main className="screen tight" style={{ position: "relative" }}>
      <Header room={room} g={g} />
      <Scores room={room} g={g} paints={paints} nameOf={nameOf} />
      {/* A fresh workbench whenever your rack changes, so placed tiles never point at old letters. */}
      <Workbench key={[...g.rack].sort().join("")} room={room} g={g} myTurn={myTurn} send={send} say={say} nameOf={nameOf} openBook={openBook} />
      <Toast toast={toast} onDone={clearToast} />
      {room.startAt && !g.done && <Countdown startAt={room.startAt} label={g.turn === room.meId ? "You go first" : `${nameOf(g.turn)} goes first`} />}
      {g.done && <Done room={room} g={g} nameOf={nameOf} openBook={openBook} />}
      <div className="tt-book">
        <WordBook open={!!book} onClose={() => setBook(null)} played={g.played} lang={g.lang} nameOf={nameOf} focus={book?.focus} />
      </div>
    </main>
  );
}

function Scores({ room, g, paints, nameOf }: { room: TileView; g: TileGameView; paints: ReturnType<typeof roomPaints>; nameOf: NameOf }) {
  return (
    <section className="tt-scores" style={{ gridTemplateColumns: `repeat(${g.players.length}, minmax(0, 1fr))` }}>
      {g.players.map((p) => {
        const on = g.turn === p && !g.done;
        const paint = paints.get(p);
        const gone = g.gone.includes(p);
        return (
          <div key={p} className="tt-score" style={{ borderColor: on ? paint?.face : "var(--line)", boxShadow: on ? `0 0 0 3px ${paint?.soft}` : "none", opacity: gone ? 0.45 : 1 }} aria-current={on ? "true" : undefined}>
            <Avatar name={nameOf(p)} paint={paint} size={22} />
            <span style={{ flex: 1, minWidth: 0, fontSize: 12, fontWeight: 900, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p === room.meId ? "You" : nameOf(p)}</span>
            <span key={g.scores[p]} className="pop" style={{ fontSize: 16, fontWeight: 900, fontVariantNumeric: "tabular-nums" }}>{g.scores[p]}</span>
          </div>
        );
      })}
    </section>
  );
}

function Workbench({ room, g, myTurn, send, say, nameOf, openBook }: { room: TileView; g: TileGameView; myTurn: boolean; send: (m: Move) => Promise<boolean>; say: (t: string, k?: "good" | "bad" | "info") => void; nameOf: NameOf; openBook: (focus?: string | null) => void }) {
  const [order, setOrder] = useState<string[]>(g.rack);
  const [placed, setPlaced] = useState<Record<number, number>>({}); // square -> rack slot
  const [sel, setSel] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [swapOpen, setSwapOpen] = useState(false);
  const [passOpen, setPassOpen] = useState(false);

  // Someone else may have played onto a square you were using; those tiles go back.
  const live = Object.entries(placed).filter(([sq]) => !g.board[+sq]).map(([sq, slot]) => ({ i: +sq, slot }));
  const used = new Set(live.map((p) => p.slot));
  const tiles = live.map((p) => ({ i: p.i, l: order[p.slot] }));
  const at = new Map(live.map((p) => [p.i, order[p.slot]]));
  const verdict = tiles.length ? judge(g.board, tiles, g.lang) : null;
  const words = verdict?.ok ? verdict.words.map((w) => w.word) : [];
  const valid = useQuery(api.tiles.check, words.length ? { code: room.code, words } : "skip");
  const allReal = !!valid && valid.length === words.length && valid.every(Boolean);
  const lastSet = new Set(g.last);
  const canPlay = myTurn && !busy && verdict?.ok && allReal;

  function tapRack(slot: number) {
    if (used.has(slot)) return;
    feedback.unlock();
    feedback.tap();
    setSel(sel === slot ? null : slot);
  }

  function tapSquare(i: number) {
    if (g.done || !g.isPlayer) return;
    if (at.has(i)) {
      feedback.tap();
      const next = { ...placed };
      delete next[i];
      setPlaced(next);
      return;
    }
    if (g.board[i]) return;
    if (sel === null) {
      // No tile picked: take the first one left on the rack.
      const first = order.findIndex((_, k) => !used.has(k));
      if (first < 0) return;
      feedback.tap();
      setPlaced({ ...placed, [i]: first });
      return;
    }
    feedback.tap();
    setPlaced({ ...placed, [i]: sel });
    setSel(null);
  }

  function recall() {
    feedback.tap();
    setPlaced({});
    setSel(null);
  }

  function shuffle() {
    feedback.tap();
    // Only the tiles still on the rack move; placed tiles keep their letters.
    const free = order.map((_, k) => k).filter((k) => !used.has(k));
    const letters = free.map((k) => order[k]);
    for (let a = letters.length - 1; a > 0; a--) {
      const b = Math.floor(Math.random() * (a + 1));
      [letters[a], letters[b]] = [letters[b], letters[a]];
    }
    const next = [...order];
    free.forEach((k, n) => (next[k] = letters[n]));
    setOrder(next);
    setSel(null);
  }

  async function run(move: Move) {
    if (busy) return;
    feedback.unlock();
    setBusy(true);
    setSwapOpen(false);
    setPassOpen(false);
    const ok = await send(move);
    setBusy(false);
    if (ok && move.kind === "play") say(`+${verdict?.ok ? verdict.score : 0}`, "good");
  }

  return (
    <>
      <LastEvent g={g} me={room.meId} nameOf={nameOf} openBook={openBook} />

      <div className="tt-board" role="grid" aria-label="Board">
        {Array.from({ length: CELLS }, (_, i) => {
          const fixed = g.board[i];
          const mine = at.get(i);
          const b = BONUS[i];
          const label = i === CENTER ? "start square" : b ? BONUS_LABEL[b] : "empty";
          return (
            <button key={i} type="button" className={`tt-sq${b ? " " + b : ""}${lastSet.has(i) ? " last" : ""}`} onClick={() => tapSquare(i)}
              aria-label={fixed ? fixed.toUpperCase() : mine ? `${mine.toUpperCase()}, placed, tap to take back` : label}>
              {fixed ? <Tile l={fixed} lang={g.lang} /> : mine ? <Tile l={mine} lang={g.lang} className="pending" /> : b && <span className="tt-bonus">{BONUS_LABEL[b]}</span>}
            </button>
          );
        })}
      </div>

      <Preview verdict={verdict} words={words} valid={valid} />

      {g.isPlayer && (
        <div className="tt-rackrow">
          <button type="button" className="icon-btn tt-tool" aria-label="Take back placed tiles" disabled={!live.length} onClick={recall}>↩</button>
          <div className="tt-rack" role="group" aria-label="Your tiles">
            {order.map((l, k) => (
              <button key={k} type="button" className={`tt-slot${sel === k ? " sel" : ""}`} disabled={used.has(k)} onClick={() => tapRack(k)} aria-label={`${l.toUpperCase()}${used.has(k) ? ", placed" : ""}`} aria-pressed={sel === k}>
                {!used.has(k) && <Tile l={l} lang={g.lang} />}
              </button>
            ))}
            {Array.from({ length: Math.max(0, RACK - order.length) }, (_, k) => <span key={`e${k}`} className="tt-slot" />)}
          </div>
          <button type="button" className="icon-btn tt-tool" aria-label="Shuffle your tiles" onClick={shuffle}>⇄</button>
        </div>
      )}

      <div className="grow" />
      <section className="bz-actions" aria-live="polite">
        {myTurn ? (
          <div style={{ display: "grid", gridTemplateColumns: "1.8fr 1fr 1fr", gap: 8 }}>
            <button className="btn btn-green" style={{ whiteSpace: "nowrap", padding: "0 8px" }} disabled={!canPlay} onClick={() => run({ kind: "play", tiles })}>
              {verdict?.ok ? `Play +${verdict.score}` : "Play"}
            </button>
            <button className="btn btn-white" style={{ padding: "0 6px" }} disabled={busy || g.bagCount < RACK} onClick={() => { feedback.tap(); setSwapOpen(true); }}>Swap</button>
            <button className="btn btn-white" style={{ padding: "0 6px" }} disabled={busy} onClick={() => { feedback.tap(); setPassOpen(true); }}>Pass</button>
          </div>
        ) : !g.done && (
          <p className="wait" style={{ margin: 0, textAlign: "center", fontSize: 17, fontWeight: 900, color: "var(--muted)", minHeight: 54, display: "flex", alignItems: "center", justifyContent: "center" }}>
            {g.turn === BOT ? "Bot is thinking…" : `${nameOf(g.turn)} is playing…`}
          </p>
        )}
        {!g.done && g.turn !== BOT && <TimerBar deadline={g.deadline} total={TURN_MS} />}
      </section>

      <SwapSheet open={swapOpen} onClose={() => setSwapOpen(false)} rack={order} g={g} busy={busy} onSwap={(letters) => run({ kind: "swap", letters })} />

      <Sheet open={passOpen} onClose={() => setPassOpen(false)} label="Pass your turn">
        <h2 style={{ margin: 0, fontSize: 24, fontWeight: 900, textAlign: "center" }}>Pass this turn?</h2>
        <p style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "var(--muted)", textAlign: "center" }}>If everyone passes or swaps twice in a row, the game ends.</p>
        <button className="btn btn-green" disabled={busy} onClick={() => run({ kind: "pass" })}>Pass</button>
        <button className="btn btn-white" onClick={() => setPassOpen(false)}>Keep playing</button>
      </Sheet>
    </>
  );
}

/** The words your tiles make, whether each is real, and the score you'd get. */
function Preview({ verdict, words, valid }: { verdict: ReturnType<typeof judge> | null; words: string[]; valid: boolean[] | undefined }) {
  if (!verdict) return <p className="tt-preview" style={{ color: "var(--muted)" }}>Tap a tile, then a square. Tap a placed tile to take it back.</p>;
  if (!verdict.ok) return <p className="tt-preview" style={{ color: "var(--cherry-edge)" }}>{verdict.error}</p>;
  return (
    <p className="tt-preview">
      <span style={{ display: "flex", flexWrap: "wrap", gap: 4, minWidth: 0 }}>
        {verdict.words.map((w, k) => {
          const ok = valid?.[k];
          return (
            <span key={w.cells.join()} className={`tt-word${ok === false ? " bad" : ok ? " good" : ""}`}>
              {words[k].toUpperCase()} {ok === false ? "✗" : ok ? `${w.score}` : "…"}
            </span>
          );
        })}
        {verdict.bonus > 0 && <span className="tt-word good">ALL 6 +{verdict.bonus}</span>}
      </span>
      <span className="tt-total">+{verdict.score}</span>
    </p>
  );
}

function SwapSheet({ open, onClose, rack, g, busy, onSwap }: { open: boolean; onClose: () => void; rack: string[]; g: TileGameView; busy: boolean; onSwap: (letters: string[]) => void }) {
  const [pick, setPick] = useState<number[]>([]);
  return (
    <Sheet open={open} onClose={() => { setPick([]); onClose(); }} label="Swap tiles">
      <h2 style={{ margin: 0, fontSize: 24, fontWeight: 900, textAlign: "center" }}>Swap tiles</h2>
      <p style={{ margin: 0, fontSize: 15, fontWeight: 700, color: "var(--muted)", textAlign: "center" }}>Pick the tiles to put back. You draw new ones and your turn ends.</p>
      <div className="tt-rack" style={{ alignSelf: "center" }}>
        {rack.map((l, k) => (
          <button key={k} type="button" className={`tt-slot${pick.includes(k) ? " sel" : ""}`} aria-pressed={pick.includes(k)} onClick={() => { feedback.tap(); setPick(pick.includes(k) ? pick.filter((x) => x !== k) : [...pick, k]); }}>
            <Tile l={l} lang={g.lang} />
          </button>
        ))}
      </div>
      <button className="btn btn-green" disabled={busy || pick.length === 0} onClick={() => { const letters = pick.map((k) => rack[k]); setPick([]); onSwap(letters); }}>
        {pick.length ? `Swap ${pick.length} tile${pick.length === 1 ? "" : "s"}` : "Pick tiles"}
      </button>
      <button className="btn btn-white" onClick={() => setPick(rack.map((_, k) => k))}>Pick all</button>
    </Sheet>
  );
}

function LastEvent({ g, me, nameOf, openBook }: { g: TileGameView; me: string; nameOf: NameOf; openBook: (focus?: string | null) => void }) {
  const e = [...g.log].reverse().find((x) => x.kind === "play" || x.kind === "swap" || x.kind === "pass" || x.kind === "timeout");
  const side = (
    <span style={{ display: "flex", gap: 4, flexShrink: 0 }}>
      <button type="button" className="tt-bag tt-bookbtn" onClick={() => openBook()} aria-label="Words played and their meanings">📖 {new Set(g.played.map((p) => p.w)).size}</button>
      <span className="tt-bag" aria-label={`${g.bagCount} tiles in the bag`}>👜 {g.bagCount}</span>
    </span>
  );
  if (!e) return <div className="tt-last" style={{ color: "var(--muted)" }}><span>First word goes through the ★</span>{side}</div>;
  const who = e.by === me ? "You" : nameOf(e.by);
  const text =
    e.kind === "play" ? (
      <>
        <b>{who}</b> played{" "}
        {e.words.map((w, k) => (
          <span key={w + k}>
            {k > 0 && ", "}
            <button type="button" className="tt-wordlink" onClick={() => openBook(w)} aria-label={`${w.toUpperCase()}, see what it means`}>{w.toUpperCase()}</button>
          </span>
        ))}{" "}
        · <b>+{e.score}</b>
      </>
    )
    : e.kind === "swap" ? <><b>{who}</b> swapped {e.n} tile{e.n === 1 ? "" : "s"}</>
    : e.kind === "timeout" ? <><b>{who}</b> ran out of time</>
    : <><b>{who}</b> passed</>;
  return <div key={e.at} className="tt-last rise"><span style={{ minWidth: 0 }}>{text}</span>{side}</div>;
}

function Header({ room, g }: { room: TileView; g: TileGameView }) {
  const router = useRouter();
  const leave = useMutation(api.tiles.leave);
  const [ask, setAsk] = useState(false);
  const go = async () => { await leave({ code: room.code }).catch(() => {}); router.push("/tiles"); };
  return (
    <>
      <header className="topbar" style={{ gap: 8 }}>
        <button className="icon-btn" aria-label="Leave game" onClick={() => { feedback.tap(); if (g.done || !g.isPlayer) void go(); else setAsk(true); }}><Icon.Close /></button>
        <span className="chip" style={{ background: "var(--cream-2)", color: "var(--plum)" }}>{GAME_NAME.toUpperCase()} · {g.lang.toUpperCase()}{g.vsBot ? " · VS BOT" : ""}</span>
        <span className="grow" />
        <span className="chip chip-mist" aria-label={`Room code ${room.code}`}>{room.code}</span>
      </header>
      <Sheet open={ask} onClose={() => setAsk(false)} label="Leave game">
        <h2 style={{ margin: 0, fontSize: 24, fontWeight: 900, textAlign: "center" }}>Leave this game?</h2>
        <p style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "var(--muted)", textAlign: "center" }}>{g.vsBot || g.players.length - g.gone.length <= 2 ? "The game ends." : "The others play on without you."}</p>
        <button className="btn btn-green" onClick={() => setAsk(false)}>Keep playing</button>
        <button className="btn btn-white" style={{ color: "var(--cherry-edge)" }} onClick={go}>Leave</button>
      </Sheet>
    </>
  );
}

function Done({ room, g, nameOf, openBook }: { room: TileView; g: TileGameView; nameOf: NameOf; openBook: (focus?: string | null) => void }) {
  const router = useRouter();
  const rematch = useMutation(api.tiles.rematch);
  const leave = useMutation(api.tiles.leave);
  const d = g.done!;
  const iWon = g.isPlayer && d.winners.includes(room.meId);
  const played = useRef(false);
  useEffect(() => {
    if (played.current) return;
    played.current = true;
    if (iWon) feedback.win(); else feedback.wrong();
  }, [iWon]);
  const ranked = [...g.players].sort((a, b) => g.scores[b] - g.scores[a]);
  const title = iWon ? (d.winners.length > 1 ? "It's a tie!" : "You win!") : d.winners.length === 1 ? `${nameOf(d.winners[0])} wins` : "Game over";
  const sub = d.reason === "out" ? "The bag ran dry and a rack emptied." : d.reason === "stuck" ? "Everyone passed twice in a row." : "A player left the game.";
  return (
    <div className="overlay">
      {iWon && <Confetti />}
      <Mascot size={88} mood={iWon ? "joy" : "wow"} className={iWon ? "jump" : undefined} />
      <h2 style={{ margin: 0, fontSize: 34, fontWeight: 900, textAlign: "center", color: iWon ? "var(--lime-dark)" : "var(--tangerine-ink)" }}>{title}</h2>
      <p style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "var(--muted)", textAlign: "center" }}>{sub}</p>
      <div className="list" style={{ width: "100%", maxWidth: 360 }}>
        {ranked.map((p) => {
          const adj = d.adjust[p] ?? 0;
          const left = g.racks[p] ?? [];
          return (
            <div key={p} className={`list-row${p === room.meId ? " me" : ""}`}>
              <span style={{ display: "flex", flexDirection: "column", flex: 1, minWidth: 0 }}>
                <span style={{ fontSize: 17, fontWeight: 900 }}>{p === room.meId ? "You" : nameOf(p)}{d.winners.includes(p) && " 👑"}</span>
                {adj !== 0 && (
                  <span style={{ fontSize: 13, fontWeight: 700, color: "var(--muted)" }}>
                    {adj > 0 ? `+${adj} from everyone's leftover tiles` : `${left.join("").toUpperCase()} left · −${rackSum(g.lang, left)}`}
                  </span>
                )}
              </span>
              <span style={{ fontSize: 22, fontWeight: 900, fontVariantNumeric: "tabular-nums" }}>{g.scores[p]}</span>
            </div>
          );
        })}
      </div>
      <button className="btn btn-white btn-sm" onClick={() => openBook()}>📖 Words played</button>
      {room.isHost ? (
        <button className="btn btn-green" style={{ maxWidth: 380 }} onClick={() => { feedback.tap(); void rematch({ code: room.code }); }}>Play again</button>
      ) : (
        <p className="wait" style={{ margin: 0, fontWeight: 900, color: "var(--muted)" }}>Waiting for the host…</p>
      )}
      <button className="btn btn-white" style={{ maxWidth: 380 }} onClick={async () => { await leave({ code: room.code }).catch(() => {}); router.push("/tiles"); }}>Back home</button>
    </div>
  );
}
