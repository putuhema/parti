"use client";

import type { FunctionReturnType } from "convex/server";
import { useMutation } from "convex/react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { api } from "../../../convex/_generated/api";
import { BOT_MS, ORBS_TO_WIN, POOL, TURN_MS, isBot, type LogItem, type Side, type Tile } from "../../../convex/lib/orb/rules";
import { TimerBar, Toast } from "@/components/words/common";
import { ChainCanvas, type EndRects } from "./ChainCanvas";
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

const tileKey = (t: Tile) => `${Math.min(t[0], t[1])}-${Math.max(t[0], t[1])}`;
const reduced = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

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

export function Domino({ t, ink = "bone", tilt = 0, vertical, size = "md", state, className = "", children }: { t: Tile; ink?: Ink; tilt?: number; vertical?: boolean; size?: "sm" | "md"; state?: "selected" | "dim" | "lifted"; className?: string; children?: React.ReactNode }) {
  return (
    <span className={`ow-dom ${size} ink-${ink}${vertical ? " v" : ""}${state ? ` ${state}` : ""} ${className}`} style={tilt ? { transform: `rotate(${tilt}deg)` } : undefined} aria-label={`${t[0]} and ${t[1]}`}>
      <b>{t[0]}</b><i /><b>{t[1]}</b>
      {children}
    </span>
  );
}


function Pips({ n, light, pop }: { n: number; light?: boolean; pop?: boolean }) {
  return (
    <span className="ow-pips" aria-label={`${n} of ${ORBS_TO_WIN} orbs`}>
      {Array.from({ length: ORBS_TO_WIN }, (_, i) => <span key={i === n - 1 && pop ? `p${n}` : i} className={`${i < n ? "on" : light ? "off light" : "off"}${i === n - 1 && pop ? " pop" : ""}`} />)}
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

  // A tile flying from the hand to an end while the cast is on its way.
  const [fling, setFling] = useState<{ t: Tile; turnNo: number; x: number; y: number; go: boolean } | null>(null);
  const flingId = useRef(0);
  // The canvas reports where its two open ends sit on screen.
  const endsRef = useRef<EndRects>({ L: null, R: null });

  async function send(move: { kind: "cast"; index: number; side: Side } | { kind: "draw" }) {
    if (!myTurn || busy) return;
    setBusy(true);
    feedback.tap();
    try { await play({ code: room.code, turnNo: g.turnNo, move }); setSel(null); }
    catch (e) { feedback.wrong(); say(errorText(e, "That spell fizzled")); }
    finally { setBusy(false); flingId.current += 1; setFling(null); }
  }
  /** Cast tile `i` on `side`, flinging it from (x, y) (or its hand slot) to that end. */
  function castIndex(i: number, side: Side, from?: { x: number; y: number }) {
    const t = g.hand[i];
    if (!myTurn || busy || !t || !fitsOf(t).includes(side)) return;
    const slot = handRef.current?.children[i]?.getBoundingClientRect();
    const start = from ?? (slot ? { x: slot.left + slot.width / 2, y: slot.top + 22 } : null);
    const end = endsRef.current[side];
    if (start && end && !reduced()) {
      const id = ++flingId.current;
      const turnNo = g.turnNo;
      setFling({ t, turnNo, x: start.x, y: start.y, go: false });
      // A short wind-up (the tile tucks in) before it flies to the end.
      setTimeout(() => { if (flingId.current === id) setFling({ t, turnNo, x: end.x + end.w / 2, y: end.y + end.h / 2, go: true }); }, 90);
    }
    void send({ kind: "cast", index: i, side });
  }
  const flying = fling && fling.turnNo === g.turnNo ? fling : null;
  const castOn = (side: Side) => { if (sel !== null) castIndex(sel, side); };

  // Drag a tile from your hand onto a glowing end.
  // The pointer is captured on press, so fast flicks and releases off the tile still reach these handlers.
  // The ghost moves through a ref (no re-render per pixel); React state only changes when the drag starts,
  // when the end under it changes, and when it ends. A drag belongs to one turn and dies with it.
  const handRef = useRef<HTMLDivElement>(null);
  const ghostRef = useRef<HTMLSpanElement>(null);
  const press = useRef<{ i: number; x: number; y: number; id: number; turnNo: number } | null>(null);
  const dragged = useRef(false);
  const overRef = useRef<Side | null>(null);
  const [dragState, setDrag] = useState<{ i: number; x: number; y: number; over: Side | null; turnNo: number } | null>(null);
  const drag = dragState && dragState.turnNo === g.turnNo && myTurn ? dragState : null;
  /** The end nearest the pointer, within a generous reach of the end's box (fingers cover a lot). */
  const endUnder = (x: number, y: number): Side | null => {
    let best: Side | null = null, bestD = 44;
    for (const s of ["L", "R"] as Side[]) {
      const r = endsRef.current[s];
      if (!r) continue;
      // The ghost floats just above the finger, so measure from a point a little higher.
      const px = x, py = y - 14;
      const dx = Math.max(r.x - px, 0, px - (r.x + r.w)), dy = Math.max(r.y - py, 0, py - (r.y + r.h));
      const d = Math.hypot(dx, dy);
      if (d < bestD) { bestD = d; best = s; }
    }
    return best;
  };
  const placeGhost = (x: number, y: number) => {
    const el = ghostRef.current;
    if (el) { el.style.left = `${x}px`; el.style.top = `${y}px`; }
  };
  function onDown(e: React.PointerEvent, i: number) {
    if (!myTurn || busy || e.button > 0) return;
    press.current = { i, x: e.clientX, y: e.clientY, id: e.pointerId, turnNo: g.turnNo };
    dragged.current = false;
    overRef.current = null;
    try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch { /* the pointer may already be gone */ }
  }
  function onMove(e: React.PointerEvent) {
    const p = press.current;
    if (!p || p.id !== e.pointerId) return;
    if (p.turnNo !== g.turnNo || !myTurn) { onCancel(); return; }
    if (!dragged.current) {
      if (Math.hypot(e.clientX - p.x, e.clientY - p.y) < 8) return;
      dragged.current = true;
      setSel(p.i);
      feedback.tap();
      setDrag({ i: p.i, x: e.clientX, y: e.clientY, over: null, turnNo: p.turnNo });
    }
    placeGhost(e.clientX, e.clientY);
    const over = endUnder(e.clientX, e.clientY);
    if (over !== overRef.current) {
      overRef.current = over;
      if (over && fitsOf(g.hand[p.i] ?? [-1, -1]).includes(over)) feedback.move();
      setDrag((d) => (d ? { ...d, x: e.clientX, y: e.clientY, over } : d));
    }
  }
  function onUp(e: React.PointerEvent) {
    const p = press.current;
    press.current = null;
    if (!p || p.id !== e.pointerId || !dragged.current) return;
    setDrag(null);
    overRef.current = null;
    if (p.turnNo !== g.turnNo || !myTurn) return;
    const over = endUnder(e.clientX, e.clientY);
    const t = g.hand[p.i];
    if (over && t && fitsOf(t).includes(over)) castIndex(p.i, over, { x: e.clientX, y: e.clientY });
    else if (over) { feedback.wrong(); say(`That tile doesn't match the ${over === "L" ? "left" : "right"} end`); }
  }
  function onCancel() { press.current = null; overRef.current = null; setDrag(null); }

  // What just happened, for the animations (nothing replays from before you opened the page).
  const lastN = g.log.length ? g.log[g.log.length - 1].n : -1;
  const [firstN] = useState(lastN);
  const fresh = g.log.length && lastN > firstN ? g.log[g.log.length - 1] : null;
  const newKey = fresh?.kind === "cast" && fresh.tile ? tileKey(fresh.tile) : null;

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


  const last = g.log[g.log.length - 1];
  const hint = g.done
    ? ""
    : !g.isPlayer
    ? "You're watching this duel."
    : myTurn
      ? g.canCast
        ? sel === null ? `Drag a tile that shows a ${g.ends.L} or a ${g.ends.R} onto the chain.` : selFits.length ? `Drag it onto a glowing end, or tap the end.` : "That one doesn't match either end."
        : g.bog > 0 ? "Nothing matches. Draw from the bog." : "Nothing matches and the bog is empty. Pass."
      : `${name(g.turn)} ${isBot(g.turn) ? "is muttering a spell… 🤖" : "is choosing a tile…"}`;

  return (
    <main className={`screen tight ow-screen ow-play${myTurn ? " myturn" : ""}`}>
      <Header room={room} />

      <aside className="ow-rail" aria-label="Wizards">
        <span className="ow-raillabel">Wizards</span>
        <div className="ow-players">
          {g.players.map((p) => (
            <span key={p} className={`ow-pl ink-${inkOf(p)}${g.turn === p && !g.done ? " turn" : ""}`}>
              {fresh?.hex === p ? <span key={`hex${fresh.n}`} className="ow-hexwrap"><Hat ink={inkOf(p)} /><span className="ow-hexpop">Hexed! +1</span></span> : <Hat ink={inkOf(p)} />}
              <span className="ow-plname">
                <b>{p === me ? "You" : g.names[p]}</b>
                <span className="ow-plmeta">
                  <small>{g.counts[p]} {g.counts[p] === 1 ? "tile" : "tiles"}</small>
                  <Pips n={g.orbs[p] ?? 0} light={g.turn === p && !g.done} pop={!!fresh?.orb && fresh.who === p} />
                </span>
              </span>
            </span>
          ))}
        </div>
        <p key={last?.n ?? "start"} className="ow-log"><span className="ow-loglabel">Last spell</span><span>{last ? <LogLine l={last} name={name} inkOf={inkOf} /> : "The duel begins. Match the first tile’s ends."}</span></p>
      </aside>

      <section className={`ow-table${drag ? " dragging" : ""}`} aria-label="The table">
        {fresh?.orb && <span key={`flash${fresh.n}`} className="ow-flash" aria-hidden="true" />}
        <div className="ow-tablehead">
          <h2>{g.done ? "The duel is over." : myTurn ? "Your move." : `${name(g.turn)}'s move.`}</h2>
          <p aria-live="polite">{hint}</p>
        </div>

        <ChainCanvas
          chain={g.chain}
          ends={g.ends}
          inkOf={inkOf}
          hot={myTurn ? selFits : []}
          over={drag?.over ? { side: drag.over, ok: selFits.includes(drag.over) } : null}
          fresh={newKey && fresh ? { n: fresh.n, key: newKey, orb: !!fresh.orb } : null}
          onEnd={castOn}
          endsRef={endsRef}
          label={`The chain: ${g.chain.length} ${g.chain.length === 1 ? "tile" : "tiles"}. Left end ${g.ends.L}, right end ${g.ends.R}.`}
        />

        <div className="ow-pool">
          <span className="ow-orbs">
            {Array.from({ length: POOL }, (_, i) => i < g.pool ? <OrbGlyph key={i} size={28} body="#D23A8C" ray="#F3EDE0" /> : (
              <span key={i} className="ow-orbgone">{fresh?.orb && i === g.pool && <span key={`leave${fresh.n}`} className="ow-orbleave"><OrbGlyph size={28} body="#D23A8C" ray="#F3EDE0" /></span>}</span>
            ))}
          </span>
          <span className="ow-poolnote"><b>Orb pool · {g.pool} left</b><span>{g.pool > 0 ? "Cast a double to claim one" : "All orbs claimed: empty your hand to win"}</span></span>
        </div>
      </section>

      <div className="ow-timer">{!g.done && <TimerBar deadline={g.deadline} total={isBot(g.turn) ? BOT_MS : TURN_MS} />}</div>

      {g.isPlayer && (
        <section className="ow-dock" aria-label="Your hand">
          <span className="ow-leaf a" /><span className="ow-leaf b" /><span className="ow-leaf c" />
          <div className="ow-dockhead">
            <span>Your hand <b>{g.hand.length}</b></span>
            <span className="ow-docktimer">{!g.done && <TimerBar deadline={g.deadline} total={isBot(g.turn) ? BOT_MS : TURN_MS} />}</span>
            <span>Bog <b>{g.bog}</b></span>
          </div>
          <div className="ow-hand" ref={handRef}>
            {g.hand.map((t, i) => {
              const ok = fitsOf(t).length > 0;
              const away = drag?.i === i || (flying && tileKey(flying.t) === tileKey(t));
              return (
                <button
                  key={tileKey(t)} className={`ow-handbtn${myTurn && ok ? " playable" : ""}`} disabled={!myTurn} aria-pressed={sel === i}
                  onPointerDown={(e) => onDown(e, i)} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onCancel} onLostPointerCapture={() => { if (press.current) onCancel(); }}
                  onClick={() => { if (dragged.current) { dragged.current = false; return; } feedback.tap(); setSel(sel === i ? null : i); }}
                >
                  <Domino t={t} state={away ? "lifted" : sel === i ? "selected" : myTurn && !ok ? "dim" : undefined} />
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

      {drag && g.hand[drag.i] && (
        <span ref={ghostRef} className={`ow-ghost${drag.over ? (selFits.includes(drag.over) ? " ok" : " bad") : ""}`} style={{ left: drag.x, top: drag.y }} aria-hidden="true">
          <Domino t={g.hand[drag.i]} state="selected" />
        </span>
      )}
      {flying && (
        <span className={`ow-ghost fling${flying.go ? " go" : ""}`} style={{ left: flying.x, top: flying.y }} aria-hidden="true">
          <Domino t={flying.t} />
        </span>
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
