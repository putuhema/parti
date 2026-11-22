"use client";

import type { FunctionReturnType } from "convex/server";
import { useMutation } from "convex/react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { api } from "../../../convex/_generated/api";
import { microOf } from "../../../convex/lib/party/rules";
import { BOARD, COLS, GEM_COST, ITEMS, MAX_ITEMS, MOVE_MS_PER_STEP, ROWS, cellOf, isBot, type ItemId, type LogEntry } from "../../../convex/lib/island/rules";
import { Intro } from "@/components/party/Play";
import { MicroGame } from "@/components/party/Micro";
import { TimerBar, Toast } from "@/components/words/common";
import { Confetti, Icon, Sheet, roomPaints, type Paint } from "@/components/ui";
import { errorText } from "@/lib/errors";
import { feedback } from "@/lib/feedback";
import { useNow } from "@/lib/hooks";

export type IslandView = NonNullable<FunctionReturnType<typeof api.island.view>>;
type G = NonNullable<IslandView["game"]>;
type Move = { kind: "roll"; item: ItemId | null } | { kind: "shrine"; buy: boolean } | { kind: "shop"; item: ItemId | null } | { kind: "mini"; round: number; score: number };
export const GAME_NAME = "Lucky Island";

const SPACE: Record<string, { icon: string; cls: string }> = { blue: { icon: "+3", cls: "blue" }, red: { icon: "−3", cls: "red" }, event: { icon: "❓", cls: "event" }, shop: { icon: "🛍️", cls: "shop" } };
const BOT_FACE: Record<string, string> = { bot1: "🐵", bot2: "🐧", bot3: "🐼" };
const vars = (p?: Paint) => (p ? ({ "--face": p.face, "--edge": p.edge, "--soft": p.soft } as CSSProperties) : undefined);

export function IslandPlay({ room }: { room: IslandView }) {
  const g = room.game!;
  const me = room.meId;
  const act = useMutation(api.island.act);
  const now = useNow(100);
  const [toast, setToast] = useState<{ text: string; kind: string; id: number } | null>(null);
  const toastN = useRef(0);
  const name = (id?: string | null) => (!id ? "Someone" : id === me ? "You" : g.names[id] ?? "Player");
  const paints = roomPaints(g.players.map((id, seat) => ({ id, seat, isMe: id === me })));
  const face = (p: string) => (isBot(p) ? BOT_FACE[p] ?? "🤖" : (g.names[p] ?? "?").slice(0, 1).toUpperCase());

  async function send(move: Move) {
    feedback.unlock();
    try { await act({ code: room.code, seq: g.seq, move }); }
    catch (e) { feedback.wrong(); toastN.current += 1; setToast({ text: errorText(e, "Not allowed"), kind: "bad", id: toastN.current }); }
  }

  // ---------- Token hops ----------
  // The server moves tokens instantly; here they hop one space at a time along the path.
  const [hop, setHop] = useState<{ who: string; at: number } | null>(null);
  const lastN = useRef(g.lastMove?.n ?? 0);
  useEffect(() => {
    const m = g.lastMove;
    if (!m || m.n <= lastN.current || !m.path.length) return;
    lastN.current = m.n;
    const from = (m.path[0] - 1 + BOARD.length) % BOARD.length;
    const timers = [setTimeout(() => setHop({ who: m.who, at: from }), 0)];
    m.path.forEach((at, k) => timers.push(setTimeout(() => {
      setHop({ who: m.who, at });
      if (m.who === me) feedback.tap(); else feedback.tick();
    }, (k + 1) * MOVE_MS_PER_STEP)));
    timers.push(setTimeout(() => setHop(null), (m.path.length + 1) * MOVE_MS_PER_STEP));
    return () => timers.forEach(clearTimeout);
  }, [g.lastMove, me]);
  const hopping = hop?.who ?? null;
  const shown: Record<string, number> = hop ? { ...g.pos, [hop.who]: hop.at } : g.pos;

  // ---------- Sounds for news ----------
  const lastLog = useRef(g.log.at(-1)?.n ?? 0);
  const latest = g.log.at(-1);
  useEffect(() => {
    if (!latest || latest.n <= lastLog.current) return;
    lastLog.current = latest.n;
    if (latest.who !== me && latest.other !== me) return;
    if (latest.tone === "gem") feedback.win();
    else if (latest.tone === "good") feedback.correct();
    else if (latest.tone === "bad") feedback.wrong();
  }, [latest, me]);
  const lastTurn = useRef(g.turn);
  useEffect(() => {
    if (g.turn !== lastTurn.current && g.turn === me && g.phase === "roll") feedback.ping();
    lastTurn.current = g.turn;
  }, [g.turn, g.phase, me]);

  // ---------- Minigame ----------
  const [miniDone, setMiniDone] = useState<{ round: number; score: number } | null>(null);
  const round = g.round;
  const onMini = useCallback((score: number) => {
    setMiniDone({ round, score });
    void act({ code: room.code, seq: g.seq, move: { kind: "mini", round, score } }).catch(() => {});
  }, [round, room.code, g.seq, act]);

  const inMini = g.phase === "mini" && g.mini;
  if (inMini && g.isPlayer && !g.done) {
    const started = now >= g.mini!.startAt;
    const submitted = g.mini!.done.includes(me) || miniDone?.round === g.round;
    return (
      <main className="screen tight li-screen">
        <Header room={room} g={g} />
        <p className="li-minititle">🏝️ Round {g.round} minigame · 1st wins 10 🪙</p>
        {!started ? <Intro micro={g.mini!.micro} left={g.mini!.startAt - now} best={null} />
          : !submitted ? <MicroGame key={`${g.round}`} id={g.mini!.micro} seed={g.mini!.seed} onDone={onMini} />
          : (
            <section className="pb-waiting rise">
              <span className="pb-bigicon">{microOf(g.mini!.micro).icon}</span>
              <p>Your score: <b>{miniDone?.round === g.round ? miniDone.score : "…"}</b></p>
              <p className="wait">Waiting for everyone…</p>
            </section>
          )}
      </main>
    );
  }

  const mine = g.turn === me;
  const busy = !!hopping;
  const myItems = g.items[me] ?? [];
  return (
    <main className="screen tight li-screen">
      <Header room={room} g={g} />
      <div className="li-wrap">
        <div className="li-board">
          {BOARD.map((s, i) => {
            const { col, row } = cellOf(i);
            const shrine = g.shrine === i;
            return (
              <span key={i} className={`li-space ${SPACE[s].cls}${shrine ? " shrine" : ""}${i === 0 ? " start" : ""}`} style={{ gridColumn: col + 1, gridRow: row + 1 }}>
                {shrine ? "💎" : SPACE[s].icon}
              </span>
            );
          })}
          <section className="li-panel">
            <div className="li-scores">
              {g.players.map((p) => (
                <div key={p} className={`li-score${g.turn === p && g.phase !== "miniReveal" ? " on" : ""}${p === me ? " me" : ""}`} style={vars(paints.get(p))}>
                  <span className="dot">{face(p)}</span>
                  <span className="nm">{name(p)}</span>
                  <span className="st"><b>💎{g.gems[p]}</b> <b key={g.coins[p]} className="pop">🪙{g.coins[p]}</b></span>
                </div>
              ))}
            </div>
            <p className="li-meta">ROUND {g.round}/{g.maxRounds} · 💎 costs {GEM_COST}</p>
            {hopping && g.lastMove?.dice.length ? (
              <p className="li-banner info"><b>{name(hopping)}</b> rolled {g.lastMove.dice.join(" + ")} 🎲</p>
            ) : <Banner entry={latest} name={name} />}
            <div className="li-actions">
              {g.done ? null : g.phase === "miniReveal" ? (
                <MiniResults g={g} name={name} />
              ) : busy ? (
                <p className="li-wait">🏃 {name(hopping)} {hopping === me ? "are" : "is"} moving…</p>
              ) : mine && g.phase === "roll" ? (
                <RollBox items={myItems} onRoll={(item) => { feedback.tap(); void send({ kind: "roll", item }); }} deadline={g.deadline} />
              ) : g.phase === "shrine" && g.pending?.who === me ? (
                <div className="li-choice">
                  <p>💎 The Gem Shrine! Buy a gem for {GEM_COST} 🪙?</p>
                  <div className="row">
                    <button className="btn btn-green" onClick={() => { feedback.tap(); void send({ kind: "shrine", buy: true }); }}>Buy 💎</button>
                    <button className="btn btn-white" onClick={() => { feedback.tap(); void send({ kind: "shrine", buy: false }); }}>Skip</button>
                  </div>
                </div>
              ) : mine && g.phase === "shop" ? (
                <div className="li-choice">
                  <p>🛍️ Shop! {myItems.length >= MAX_ITEMS ? "Your bag is full." : "Buy something?"}</p>
                  <div className="row">
                    {(Object.keys(ITEMS) as ItemId[]).map((k) => (
                      <button key={k} className="btn btn-white btn-sm" disabled={g.coins[me] < ITEMS[k].cost || myItems.length >= MAX_ITEMS} onClick={() => { feedback.tap(); void send({ kind: "shop", item: k }); }}>
                        {ITEMS[k].icon} {ITEMS[k].cost}🪙
                      </button>
                    ))}
                    <button className="btn btn-ghost btn-sm" onClick={() => { feedback.tap(); void send({ kind: "shop", item: null }); }}>Leave</button>
                  </div>
                </div>
              ) : (
                <p className="li-wait wait">{g.phase === "shrine" ? `${name(g.pending?.who)} is at the Gem Shrine…` : g.phase === "shop" ? `${name(g.turn)} is shopping…` : `${name(g.turn)}'s turn${isBot(g.turn) ? " 🤖" : ""}…`}</p>
              )}
            </div>
          </section>
          <div className="li-tokens" aria-hidden="true">
            {g.players.map((p, k) => {
              const at = shown[p] ?? 0;
              const { col, row } = cellOf(at);
              const mates = g.players.filter((x) => (shown[x] ?? 0) === at);
              const j = mates.indexOf(p);
              return (
                <span key={p} className={`li-token${hopping === p ? " hop" : ""}${g.turn === p ? " on" : ""}`} style={{ ...vars(paints.get(p)), left: `${((col + 0.5) / COLS) * 100}%`, top: `${((row + 0.5) / ROWS) * 100}%`, transform: `translate(calc(-50% + ${(j - (mates.length - 1) / 2) * 30}%), calc(-62% + ${k * 0}px))` }}>
                  {face(p)}
                </span>
              );
            })}
          </div>
        </div>
      </div>
      {myItems.length > 0 && !g.done && <p className="li-bag">Your bag: {myItems.map((i) => ITEMS[i].icon).join("  ")}</p>}
      <Toast toast={toast} onDone={() => setToast(null)} />
      {g.done && <Done room={room} g={g} name={name} face={face} />}
    </main>
  );
}

function Banner({ entry, name }: { entry?: LogEntry; name: (id?: string | null) => string }) {
  if (!entry) return <p className="li-banner">Welcome to Lucky Island! 🏝️</p>;
  const text = entry.text.replace("{other}", name(entry.other));
  return <p key={entry.n} className={`li-banner pop ${entry.tone}`}><b>{name(entry.who)}</b> {text}</p>;
}

function RollBox({ items, onRoll, deadline }: { items: ItemId[]; onRoll: (item: ItemId | null) => void; deadline: number | null }) {
  const [use, setUse] = useState<ItemId | null>(null);
  return (
    <div className="li-roll">
      {items.length > 0 && (
        <div className="li-items">
          {[...new Set(items)].map((k) => (
            <button key={k} type="button" className="li-item" aria-pressed={use === k} onClick={() => { feedback.tap(); setUse(use === k ? null : k); }}>{ITEMS[k].icon} <small>{ITEMS[k].name}</small></button>
          ))}
        </div>
      )}
      <button className="btn btn-green li-rollbtn" onClick={() => onRoll(use)}>🎲 {use === "double" ? "Roll 2 dice!" : use === "warp" ? "Warp & roll" : "Roll!"}</button>
      <TimerBar deadline={deadline} total={25_000} />
    </div>
  );
}

function MiniResults({ g, name }: { g: G; name: (id?: string | null) => string }) {
  const m = g.lastMini;
  if (!m) return null;
  const ranked = [...g.players].sort((a, b) => (m.scores[b] ?? 0) - (m.scores[a] ?? 0));
  return (
    <div className="li-mres">
      <p>{microOf(m.micro).icon} {microOf(m.micro).name} results</p>
      {ranked.map((p, i) => (
        <span key={p} className={i === 0 ? "win" : ""}><b>{["🥇", "🥈", "🥉", "4️⃣"][i]} {name(p)}</b><i>{m.scores[p] ?? 0}</i><em>+{m.coins[p] ?? 0}🪙</em></span>
      ))}
    </div>
  );
}

function Header({ room, g }: { room: IslandView; g: G }) {
  const router = useRouter();
  const leave = useMutation(api.island.leave);
  const [ask, setAsk] = useState(false);
  const go = async () => { await leave({ code: room.code }).catch(() => {}); router.push("/island"); };
  return (
    <>
      <header className="topbar" style={{ gap: 8, minHeight: 44 }}>
        <button className="icon-btn" aria-label="Leave game" onClick={() => { feedback.tap(); if (g.done || !g.isPlayer) void go(); else setAsk(true); }}><Icon.Close /></button>
        <span className="chip li-chip">🏝️ {GAME_NAME.toUpperCase()}</span>
        <span className="grow" />
        <span className="chip chip-mist">{room.code}</span>
      </header>
      <Sheet open={ask} onClose={() => setAsk(false)} label="Leave game">
        <h2 style={{ margin: 0, fontSize: 24, fontWeight: 900, textAlign: "center" }}>Leave the island?</h2>
        <p style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "var(--muted)", textAlign: "center" }}>A bot takes your place.</p>
        <button className="btn btn-green" onClick={() => setAsk(false)}>Stay</button>
        <button className="btn btn-white" style={{ color: "var(--cherry-edge)" }} onClick={go}>Leave</button>
      </Sheet>
    </>
  );
}

function Done({ room, g, name, face }: { room: IslandView; g: G; name: (id?: string | null) => string; face: (p: string) => string }) {
  const router = useRouter();
  const rematch = useMutation(api.island.rematch);
  const leave = useMutation(api.island.leave);
  const d = g.done!;
  const iWon = d.winners.includes(room.meId);
  const ranked = [...g.players].sort((a, b) => g.gems[b] - g.gems[a] || g.coins[b] - g.coins[a]);
  const [stage, setStage] = useState(0); // 0: bonus reveal, 1: final ranking
  useEffect(() => {
    const t = setTimeout(() => { setStage(1); if (iWon) feedback.win(); else feedback.wrong(); }, 2600);
    return () => clearTimeout(t);
  }, [iWon]);
  return (
    <div className="overlay li-done">
      {stage === 1 && iWon && <Confetti />}
      {stage === 0 ? (
        <>
          <span className="li-bigstar pop">⭐</span>
          <h2>Bonus: Minigame Star!</h2>
          <p className="li-sub">{d.bonus.length ? `${d.bonus.map(name).join(" & ")} won the most minigames: +1 💎` : "Nobody won a minigame!"}</p>
        </>
      ) : (
        <>
          <span className="li-bigstar">👑</span>
          <h2>{d.winners.length > 1 ? "It's a tie!" : iWon ? "You rule the island!" : `${name(d.winners[0])} ${isBot(d.winners[0]) ? "the bot " : ""}wins!`}</h2>
          <div className="li-final">
            {ranked.map((p, i) => (
              <div key={p} className={`li-frow${p === room.meId ? " me" : ""}`}>
                <span className="pl">{["🥇", "🥈", "🥉", "4️⃣"][i]}</span>
                <span className="f">{face(p)}</span>
                <span className="nm">{name(p)}{d.bonus.includes(p) && " ⭐"}</span>
                <span className="gm">💎 {g.gems[p]}</span>
                <span className="cn">🪙 {g.coins[p]}</span>
              </div>
            ))}
          </div>
          <button className="btn btn-green" style={{ maxWidth: 380 }} onClick={() => { feedback.tap(); void rematch({ code: room.code }); }}>Play again</button>
          <button className="btn btn-ghost" style={{ maxWidth: 380 }} onClick={async () => { await leave({ code: room.code }).catch(() => {}); router.push("/island"); }}>Back home</button>
        </>
      )}
    </div>
  );
}
