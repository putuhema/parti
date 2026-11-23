"use client";

import type { FunctionReturnType } from "convex/server";
import { useMutation } from "convex/react";
import { useRouter } from "next/navigation";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { api } from "../../../convex/_generated/api";
import { BOT_MS, ORBS_TO_WIN, POOL, TURN_MS, isBot, type LogItem, type Side, type Tile } from "../../../convex/lib/orb/rules";
import { TimerBar, Toast } from "@/components/words/common";
import { Confetti, Icon, Sheet } from "@/components/ui";
import { errorText } from "@/lib/errors";
import { feedback } from "@/lib/feedback";

export type OrbView = NonNullable<FunctionReturnType<typeof api.orb.view>>;
type G = NonNullable<OrbView["game"]>;
export const GAME_NAME = "Orbwick";

// Player inks: you are always plum; everyone else gets the next ink in seat order.
export type Ink = "plum" | "lagoon" | "moss" | "magenta" | "bone";
const OTHERS: Ink[] = ["lagoon", "moss", "magenta"];
function inksFor(players: string[], me: string) {
  const map = new Map<string, Ink>();
  let k = 0;
  for (const p of players) map.set(p, p === me ? "plum" : OTHERS[k++ % OTHERS.length]);
  return map;
}

// ---------- Little pieces ----------
export function OrbGlyph({ size = 40, body = "#F3EDE0", ray = "#F4C64E" }: { size?: number; body?: string; ray?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 150 150" aria-hidden="true">
      <circle cx="75" cy="75" r="70" fill={body} />
      <g fill={ray}>
        <circle cx="75" cy="75" r="20" />
        <path d="M75 22 L82 55 L68 55 Z" /><path d="M75 128 L68 95 L82 95 Z" /><path d="M22 75 L55 68 L55 82 Z" /><path d="M128 75 L95 82 L95 68 Z" />
        <path d="M38 38 L63 58 L58 63 Z" /><path d="M112 112 L87 92 L92 87 Z" /><path d="M112 38 L92 63 L87 58 Z" /><path d="M38 112 L58 87 L63 92 Z" />
      </g>
    </svg>
  );
}

function Hat({ ink }: { ink: Ink }) {
  return (
    <span className={`ow-hat ink-${ink}`} aria-hidden="true">
      <svg width="28" height="32" viewBox="0 0 160 176"><path d="M80 6 L136 176 L24 176 Z" fill="#231B1A" /><path d="M58 106 Q80 94 102 106 L108 138 Q80 150 52 138 Z" fill="#F3EDE0" /><circle cx="70" cy="120" r="7" fill="#231B1A" /><circle cx="92" cy="120" r="7" fill="#231B1A" /></svg>
    </span>
  );
}

export function Domino({ t, ink = "bone", tilt = 0, vertical, size = "md", state }: { t: Tile; ink?: Ink; tilt?: number; vertical?: boolean; size?: "sm" | "md"; state?: "selected" | "dim" | "fits" }) {
  return (
    <span className={`ow-dom ${size} ink-${ink}${vertical ? " v" : ""}${state ? ` ${state}` : ""}`} style={tilt ? { transform: `rotate(${tilt}deg)` } : undefined} aria-label={`${t[0]} and ${t[1]}`}>
      <b>{t[0]}</b><i /><b>{t[1]}</b>
    </span>
  );
}

function Pips({ n, light }: { n: number; light?: boolean }) {
  return (
    <span className="ow-pips" aria-label={`${n} of ${ORBS_TO_WIN} orbs`}>
      {Array.from({ length: ORBS_TO_WIN }, (_, i) => <span key={i} className={i < n ? "on" : light ? "off light" : "off"} />)}
    </span>
  );
}

// ---------- The duel ----------
export function OrbPlay({ room }: { room: OrbView }) {
  const g = room.game!;
  const me = room.meId;
  const play = useMutation(api.orb.play);
  const inks = inksFor(g.players, me);
  const inkOf = (id: string) => (id ? inks.get(id) ?? "bone" : "bone");
  const name = (id: string) => (id === me ? "You" : g.names[id] ?? "Wizard");
  const myTurn = g.isPlayer && g.turn === me && !g.done;
  // Your picked tile belongs to one turn, so a new turn clears it.
  const [pick, setPick] = useState<{ turnNo: number; i: number } | null>(null);
  const sel = pick && pick.turnNo === g.turnNo ? pick.i : null;
  const setSel = (i: number | null) => setPick(i === null ? null : { turnNo: g.turnNo, i });
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<{ text: string; kind: string; id: number } | null>(null);
  const toastN = useRef(0);
  const say = (text: string, kind = "bad") => { toastN.current += 1; setToast({ text, kind, id: toastN.current }); };

  const fitsOf = (t: Tile): Side[] => {
    const out: Side[] = [];
    if (t[0] === g.ends.L || t[1] === g.ends.L) out.push("L");
    if (t[0] === g.ends.R || t[1] === g.ends.R) out.push("R");
    return out;
  };
  const selTile = sel !== null ? g.hand[sel] : undefined;
  const selFits = selTile ? fitsOf(selTile) : [];

  async function send(move: { kind: "cast"; index: number; side: Side } | { kind: "draw" }) {
    if (!myTurn || busy) return;
    setBusy(true);
    feedback.tap();
    try { await play({ code: room.code, turnNo: g.turnNo, move }); setSel(null); }
    catch (e) { feedback.wrong(); say(errorText(e, "That spell fizzled")); }
    finally { setBusy(false); }
  }
  const castOn = (side: Side) => { if (sel !== null && selFits.includes(side)) void send({ kind: "cast", index: sel, side }); };

  // Sounds for what just happened.
  const lastLog = useRef(g.log.length ? g.log[g.log.length - 1].n : -1);
  useEffect(() => {
    const l = g.log[g.log.length - 1];
    if (!l || l.n === lastLog.current) return;
    lastLog.current = l.n;
    if (l.orb) feedback.correct();
    else if (l.hex === me) feedback.wrong();
    else feedback.move();
  }, [g.log, me]);
  const wasMine = useRef(myTurn);
  useEffect(() => { if (myTurn && !wasMine.current) feedback.ping(); wasMine.current = myTurn; }, [myTurn]);

  // Keep the end that just grew in view.
  const strip = useRef<HTMLDivElement>(null);
  const firstKey = `${g.chain[0].a}${g.chain[0].b}`;
  const prevFirst = useRef(firstKey);
  useLayoutEffect(() => {
    const el = strip.current;
    if (!el) return;
    const grewLeft = prevFirst.current !== firstKey;
    prevFirst.current = firstKey;
    el.scrollTo({ left: grewLeft ? 0 : el.scrollWidth, behavior: "smooth" });
  }, [g.chain.length, firstKey]);

  const last = g.log[g.log.length - 1];
  const hint = g.done
    ? ""
    : !g.isPlayer
    ? "You're watching this duel."
    : myTurn
      ? g.canCast
        ? sel === null ? `Pick a tile that shows a ${g.ends.L} or a ${g.ends.R}.` : selFits.length ? `Tap a glowing end to cast it.` : "That one doesn't match either end."
        : g.bog > 0 ? "Nothing matches. Draw from the bog." : "Nothing matches and the bog is empty. Pass."
      : `${name(g.turn)} ${isBot(g.turn) ? "is muttering a spell… 🤖" : "is choosing a tile…"}`;

  return (
    <main className={`screen tight ow-screen ow-play${myTurn ? " myturn" : ""}`}>
      <Header room={room} />

      <div className="ow-players">
        {g.players.map((p) => (
          <span key={p} className={`ow-pl ink-${inkOf(p)}${g.turn === p && !g.done ? " turn" : ""}`}>
            <Hat ink={inkOf(p)} />
            <span className="ow-plname">
              <b>{p === me ? "You" : g.names[p]}</b>
              <small>{g.counts[p]} {g.counts[p] === 1 ? "tile" : "tiles"}</small>
            </span>
            <Pips n={g.orbs[p] ?? 0} light={g.turn === p && !g.done} />
          </span>
        ))}
      </div>

      <section className="ow-table" aria-label="The table">
        <div className="ow-tablehead">
          <h2>{g.done ? "The duel is over." : myTurn ? "Your move." : `${name(g.turn)}'s move.`}</h2>
          <p aria-live="polite">{hint}</p>
        </div>

        <div className="ow-chain" ref={strip}>
          <div className="ow-chainrow">
            <button className={`ow-end${myTurn && selFits.includes("L") ? " hot" : ""}`} disabled={!myTurn || !selFits.includes("L")} onClick={() => castOn("L")} aria-label={`Cast on the left end, ${g.ends.L}`}>{g.ends.L}</button>
            {g.chain.map((c, i) => (
              <Domino key={i} t={[c.a, c.b]} ink={inkOf(c.by)} size="sm" vertical={c.a === c.b} />
            ))}
            <button className={`ow-end${myTurn && selFits.includes("R") ? " hot" : ""}`} disabled={!myTurn || !selFits.includes("R")} onClick={() => castOn("R")} aria-label={`Cast on the right end, ${g.ends.R}`}>{g.ends.R}</button>
          </div>
        </div>

        <div className="ow-pool">
          <span className="ow-orbs">
            {Array.from({ length: POOL }, (_, i) => i < g.pool ? <OrbGlyph key={i} size={30} body="#D23A8C" ray="#F3EDE0" /> : <span key={i} className="ow-orbgone" />)}
          </span>
          <span className="ow-poolnote"><b>Orb pool · {g.pool} left</b>Cast a double to claim one.</span>
        </div>

        {last && <p className="ow-log"><LogLine l={last} name={name} inkOf={inkOf} /></p>}
      </section>

      {!g.done && (myTurn ? <TimerBar deadline={g.deadline} total={TURN_MS} /> : !isBot(g.turn) ? <TimerBar deadline={g.deadline} total={TURN_MS} /> : <TimerBar deadline={g.deadline} total={BOT_MS} />)}

      {g.isPlayer && (
        <section className="ow-dock" aria-label="Your hand">
          <span className="ow-leaf a" /><span className="ow-leaf b" /><span className="ow-leaf c" />
          <div className="ow-dockhead">
            <span>Your hand · {g.hand.length}</span>
            <span>Bog · {g.bog}</span>
          </div>
          <div className="ow-hand">
            {g.hand.map((t, i) => {
              const ok = fitsOf(t).length > 0;
              return (
                <button key={`${t[0]}${t[1]}${i}`} className="ow-handbtn" disabled={!myTurn} onClick={() => { feedback.tap(); setSel(sel === i ? null : i); }} aria-pressed={sel === i}>
                  <Domino t={t} state={sel === i ? "selected" : myTurn && !ok ? "dim" : undefined} />
                  <small>{myTurn && !ok ? "No match" : t[0] === t[1] ? "Double ✶" : t[0] + t[1] === 7 ? "Hex 7" : " "}</small>
                </button>
              );
            })}
          </div>
          <div className="ow-actions">
            {selFits.length === 2 ? (
              <>
                <button className="ow-btn cast" disabled={!myTurn || busy} onClick={() => castOn("L")}>← Cast left</button>
                <button className="ow-btn cast" disabled={!myTurn || busy} onClick={() => castOn("R")}>Cast right →</button>
              </>
            ) : (
              <button className="ow-btn cast" disabled={!myTurn || busy || selFits.length === 0} onClick={() => castOn(selFits[0])}>{selTile ? `Cast ${selTile[0]}|${selTile[1]}` : "Cast"}</button>
            )}
            <button className="ow-btn ghost" disabled={!myTurn || busy || (g.bog === 0 && g.canCast)} onClick={() => void send({ kind: "draw" })}>{g.bog > 0 ? "Draw from bog" : "Pass"}</button>
          </div>
        </section>
      )}

      <Toast toast={toast} onDone={() => setToast(null)} />
      {g.done && <Done room={room} g={g} name={name} inkOf={inkOf} />}
    </main>
  );
}

function LogLine({ l, name, inkOf }: { l: LogItem; name: (id: string) => string; inkOf: (id: string) => Ink }) {
  const who = <b className={`tx-${inkOf(l.who)}`}>{name(l.who)}</b>;
  if (l.kind === "draw") return <>{who} drew from the bog.</>;
  if (l.kind === "pass") return <>{who} couldn&apos;t cast and passed.</>;
  const t = l.tile!;
  return (
    <>
      {who} cast {t[0]}|{t[1]}
      {l.orb ? ", a double! Claimed an orb. 🔮" : "."}
      {l.hex ? <> Lucky seven: <b className={`tx-${inkOf(l.hex)}`}>{name(l.hex)}</b> drew a tile.</> : null}
    </>
  );
}

function Header({ room }: { room: OrbView }) {
  const router = useRouter();
  const leave = useMutation(api.orb.leave);
  const g = room.game!;
  const [ask, setAsk] = useState(false);
  const go = async () => { await leave({ code: room.code }).catch(() => {}); router.push("/orb"); };
  return (
    <>
      <header className="topbar" style={{ gap: 8, minHeight: 44 }}>
        <button className="icon-btn" aria-label="Leave duel" onClick={() => { feedback.tap(); if (g.done || !g.isPlayer) void go(); else setAsk(true); }}><Icon.Close /></button>
        <span className="ow-wordmark xs"><OrbGlyph size={24} body="#231B1A" /><span>rbwick</span></span>
        <span className="grow" />
        <span className="ow-chip">Turn {g.turnNo + 1}</span>
      </header>
      <Sheet open={ask} onClose={() => setAsk(false)} label="Leave duel">
        <h2 style={{ margin: 0, fontSize: 24, fontWeight: 900, textAlign: "center" }}>Abandon the duel?</h2>
        <p style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "var(--muted)", textAlign: "center" }}>A bot wizard will take your seat and your tiles.</p>
        <button className="btn btn-green" onClick={() => setAsk(false)}>Stay</button>
        <button className="btn btn-white" style={{ color: "var(--cherry-edge)" }} onClick={go}>Leave</button>
      </Sheet>
    </>
  );
}

function Done({ room, g, name, inkOf }: { room: OrbView; g: G; name: (id: string) => string; inkOf: (id: string) => Ink }) {
  const router = useRouter();
  const rematch = useMutation(api.orb.rematch);
  const leave = useMutation(api.orb.leave);
  const winner = g.done?.winner ?? null;
  const iWon = winner === room.meId;
  const played = useRef(false);
  useEffect(() => {
    if (played.current) return;
    played.current = true;
    if (iWon) feedback.win(); else feedback.wrong();
  }, [iWon]);
  const reveal = g.reveal ?? {};
  const order = [...g.players].sort((a, b) => (a === winner ? -1 : b === winner ? 1 : 0) || (g.orbs[b] ?? 0) - (g.orbs[a] ?? 0) || (reveal[a] ?? 0) - (reveal[b] ?? 0));
  const why = g.done?.reason === "orbs" ? `held ${ORBS_TO_WIN} orbs` : g.done?.reason === "empty" ? "cast their last tile" : g.done?.reason === "blocked" ? "led when the chain locked" : "";
  return (
    <div className="overlay ow-done">
      {iWon && <Confetti />}
      <OrbGlyph size={84} body="#D23A8C" ray="#F3EDE0" />
      <h2>{winner ? (iWon ? "You win the duel!" : `${name(winner)} wins the duel!`) : "Duel abandoned"}</h2>
      {winner && <p className="ow-why">{iWon ? "You" : name(winner)} {why}.</p>}
      <div className="list" style={{ width: "100%", maxWidth: 360 }}>
        {order.map((p, i) => (
          <div key={p} className={`list-row${p === room.meId ? " me" : ""}`}>
            <span style={{ width: 28, fontSize: 18, fontWeight: 900 }}>{i === 0 && winner ? "🏆" : `#${i + 1}`}</span>
            <span className={`ow-dot ink-${inkOf(p)}`} />
            <span style={{ flex: 1, fontSize: 17, fontWeight: 900 }}>{name(p)}</span>
            <span style={{ fontSize: 14, fontWeight: 800, color: "var(--muted)" }}>🔮 {g.orbs[p] ?? 0} · {reveal[p] ?? 0} pips</span>
          </div>
        ))}
      </div>
      <button className="btn btn-green" style={{ maxWidth: 380 }} onClick={() => { feedback.tap(); void rematch({ code: room.code }); }}>Play again</button>
      <button className="btn btn-ghost" style={{ maxWidth: 380 }} onClick={async () => { await leave({ code: room.code }).catch(() => {}); router.push("/orb"); }}>Back home</button>
    </div>
  );
}
