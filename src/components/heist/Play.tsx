"use client";

import { useMutation } from "convex/react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../../../convex/_generated/api";
import { LEVELS } from "../../../convex/lib/heist/levels";
import { DIRS, ROLES, TICKS, actionFor, key, parseLevel, planPath, playRound, type Action, type Bust, type Event, type Pos, type Role, type Sim, type Tick } from "../../../convex/lib/heist/rules";
import { Toast } from "@/components/words/common";
import { Confetti, Icon, Mascot, Sheet } from "@/components/ui";
import { errorText } from "@/lib/errors";
import { feedback } from "@/lib/feedback";
import { ACTION_ICON, Board, ROLE_LOOK, Stars, type HeistGameView, type HeistView } from "./common";

type ToastT = { text: string; kind: "bad" | "good" | "info"; id: number } | null;
type Playback = { sim: Sim; bust: Bust | null; flash: string | null };
const TICK_MS = 520;
const levelOf = (id: string) => LEVELS.find((l) => l.id === id) ?? LEVELS[0];

const EVENT_TEXT: Record<Event["kind"], (r: Role) => string | null> = {
  pick: () => "🔓 Lock picked!",
  hack: () => "⚡ Systems down!",
  gem: (r) => `💎 ${ROLE_LOOK[r].name} grabbed the gem!`,
  coin: () => "🪙 +1 coin",
  bump: () => null,
};
const BUST_TEXT: Record<Bust["by"], string> = { guard: "A guard saw you!", camera: "Caught on camera!", laser: "You tripped a laser!" };

export function HeistPlay({ room }: { room: HeistView }) {
  const g = room.game!;
  const lv = useMemo(() => parseLevel(levelOf(g.level)), [g.level]);
  const plan = useMutation(api.heist.plan);
  const ping = useMutation(api.heist.ping);
  const mine = ROLES.filter((r) => g.roles[r] === room.meId);
  const solo = g.roles.cat === g.roles.hacker;
  const partnerRole = ROLES.find((r) => !mine.includes(r)) ?? null;
  const partnerName = partnerRole ? g.names[g.roles[partnerRole]] ?? "your partner" : "";

  const [role, setRole] = useState<Role>(mine[0] ?? "cat");
  const [drafts, setDrafts] = useState<Record<Role, Action[]>>(g.plans);
  const [seenRounds, setSeenRounds] = useState(g.rounds);
  if (seenRounds !== g.rounds) { setSeenRounds(g.rounds); setDrafts(g.plans); }
  const [preview, setPreview] = useState(0);
  const [pingMode, setPingMode] = useState(false);
  const [toast, setToast] = useState<ToastT>(null);
  const [intro, setIntro] = useState(g.rounds === 0 && !g.last);
  const say = (text: string, kind: "bad" | "good" | "info" = "info") => setToast({ text, kind, id: Date.now() + Math.random() });
  const oops = (e: unknown) => { feedback.wrong(); say(errorText(e, "Not allowed"), "bad"); };

  // ---------- Playback of the round that just resolved ----------
  const [play, setPlay] = useState<Playback | null>(null);
  const lastN = useRef(g.last?.n ?? 0);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => {
    const last = g.last;
    if (!last || last.n <= lastN.current) return;
    lastN.current = last.n;
    if (!last.ticks.length) return;
    void (async () => {
      setPreview(0);
      setPlay({ sim: last.start as Sim, bust: null, flash: null });
      for (const t of last.ticks as Tick[]) {
        await new Promise((r) => setTimeout(r, TICK_MS));
        if (!alive.current) return;
        setPlay({ sim: t.sim, bust: t.bust, flash: t.bust ? "bust" : null });
        for (const e of t.events) {
          const text = EVENT_TEXT[e.kind](e.role);
          if (text) { say(text, "good"); feedback.correct(); }
        }
        if (!t.bust) feedback.tap();
        if (t.bust) {
          feedback.wrong();
          await new Promise((r) => setTimeout(r, 1900));
          break;
        }
      }
      await new Promise((r) => setTimeout(r, 350));
      if (alive.current) setPlay(null);
    })();
  }, [g.last?.n]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---------- Planning ----------
  const planOf = (r: Role) => (mine.includes(r) ? drafts[r] : g.plans[r]);
  const plans = { cat: planOf("cat"), hacker: planOf("hacker") };
  const busy = !!play || !!g.done;
  const locked = g.locked[role];

  // Where the planner stands after their draft, and which doors they've opened on the way.
  function stateAfter(r: Role, actions: Action[]) {
    const path = planPath(lv, g.sim, r, actions);
    const open = [...g.sim.open];
    let at: Pos = g.sim[r];
    actions.forEach((a, i) => {
      if (r === "cat" && a !== "wait" && a !== "hack") {
        const to = { x: at.x + DIRS[a].x, y: at.y + DIRS[a].y };
        if (lv.grid[to.y]?.[to.x] === "D" && !open.includes(key(to))) open.push(key(to));
      }
      at = path[i];
    });
    return { at, open };
  }
  const here = stateAfter(role, drafts[role]);
  const canAdd = !busy && !locked && !pingMode && mine.includes(role) && drafts[role].length < TICKS;
  const targets: Pos[] = canAdd
    ? [here.at, ...Object.values(DIRS).map((d) => ({ x: here.at.x + d.x, y: here.at.y + d.y }))].filter((p) => actionFor(lv, g.sim, role, here.at, here.open, p) !== null)
    : [];

  function send(r: Role, actions: Action[], lock: boolean) {
    return plan({ code: room.code, rounds: g.rounds, role: r, actions, lock });
  }
  function setDraft(r: Role, actions: Action[]) {
    setDrafts((d) => ({ ...d, [r]: actions }));
    void send(r, actions, false).catch(oops);
  }
  function tap(p: Pos) {
    if (busy) return;
    if (pingMode) {
      feedback.tap();
      void ping({ code: room.code, x: p.x, y: p.y }).catch(oops);
      setPingMode(false);
      return;
    }
    if (!canAdd) return;
    const a = actionFor(lv, g.sim, role, here.at, here.open, p);
    if (!a) return;
    feedback.tap();
    setDraft(role, [...drafts[role], a]);
  }
  async function lockIn() {
    feedback.unlock();
    feedback.tap();
    try {
      if (solo) {
        // Alone, one button sends both thieves.
        await send("cat", drafts.cat, true);
        await send("hacker", drafts.hacker, true);
      } else await send(role, drafts[role], !locked);
    } catch (e) { oops(e); }
  }

  // ---------- What the board shows ----------
  const previewTicks = preview ? playRound(lv, g.sim, plans) : [];
  const previewSim = preview ? (previewTicks[Math.min(preview, previewTicks.length) - 1]?.sim ?? g.sim) : null;
  const shown: Sim = play?.sim ?? previewSim ?? (g.sim as Sim);
  const marks = busy ? [] : ROLES.flatMap((r) => planPath(lv, g.sim, r, plans[r]).map((pos, i) => ({ pos, role: r, step: i + 1, ghost: !mine.includes(r) || (solo && r !== role) })));
  const pings = busy ? [] : g.pings.map((p) => ({ ...p, mine: p.by === room.meId }));
  const partnerLocked = partnerRole ? g.locked[partnerRole] : false;
  const lv0 = levelOf(g.level);

  // A ping from your partner gets a buzz.
  const lastPing = useRef(g.pings.at(-1)?.n ?? 0);
  useEffect(() => {
    const p = g.pings.at(-1);
    if (p && p.n > lastPing.current && p.by !== room.meId) feedback.ping();
    lastPing.current = p?.n ?? lastPing.current;
  }, [g.pings, room.meId]);

  return (
    <main className={`screen tight hz-screen${play?.flash === "bust" ? " busted" : ""}`}>
      <Header room={room} g={g} name={lv0.name} />
      <div className="hz-hud">
        <span className="chip hz-chip">ROUND {g.round + 1} · PAR {lv0.par}</span>
        {shown.hack > 0 && <span className="chip hz-hack">⚡ HACKED · {shown.hack}</span>}
        <span className="grow" />
        <span className="chip hz-chip">🪙 {shown.coins.length}/{lv.coins.length}</span>
        {shown.gem ? <span className="chip hz-gemchip">💎 GOT IT</span> : null}
      </div>

      <Board lv={lv} sim={shown} marks={marks} pings={pings} targets={targets} bust={play?.bust?.at ?? null} onTap={tap}>
        {play?.bust && (
          <div className="hz-busted" role="alert">
            <b>BUSTED!</b>
            <span>{BUST_TEXT[play.bust.by]} Back to the start.</span>
          </div>
        )}
      </Board>

      {!g.done && (
        <>
          <div className="hz-preview" role="group" aria-label="Preview steps">
            <span className="label">Preview</span>
            {[0, 1, 2, 3].map((k) => (
              <button key={k} type="button" className="hz-pbtn" aria-pressed={preview === k} disabled={busy} onClick={() => { feedback.tap(); setPreview(k); }}>{k === 0 ? "Now" : `Step ${k}`}</button>
            ))}
          </div>

          <section className="hz-planner">
            <div className="hz-roles">
              {ROLES.map((r) => {
                const isMine = mine.includes(r);
                return (
                  <button key={r} type="button" className={`hz-role ${r}`} aria-pressed={role === r} disabled={!isMine} onClick={() => { feedback.tap(); setRole(r); }}>
                    <span className="ico">{ROLE_LOOK[r].icon}</span>
                    <span className="who">
                      <b>{isMine ? (solo ? ROLE_LOOK[r].name : `You · ${ROLE_LOOK[r].name}`) : `${partnerName} · ${ROLE_LOOK[r].name}`}</b>
                      <span className="slots">
                        {Array.from({ length: TICKS }, (_, i) => <i key={i}>{plans[r][i] ? ACTION_ICON[plans[r][i]] : ""}</i>)}
                        {g.locked[r] && <em>✓</em>}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
            <p className="hz-hint">
              {play ? "Watch it play out…" : pingMode ? "Tap a tile to ping it 📍" : locked && !solo ? (partnerLocked ? "Go!" : `Locked in. Waiting for ${partnerName}…`)
                : drafts[role].length >= TICKS ? "That's 3 moves. Lock in when ready." : `${ROLE_LOOK[role].name}: tap a glowing tile to move, or yourself to wait. ${role === "hacker" ? "Tap a 🖥️ next to you to hack." : "Walk into a 🚪 to pick it."}`}
            </p>
            <div className="hz-actions">
              <button className="btn btn-white btn-sm" aria-label="Undo" disabled={busy || locked || !drafts[role].length} onClick={() => { feedback.tap(); setDraft(role, drafts[role].slice(0, -1)); }}><Icon.Undo /></button>
              <button className={`btn btn-white btn-sm${pingMode ? " on" : ""}`} aria-label="Ping a tile" aria-pressed={pingMode} disabled={busy || solo} onClick={() => { feedback.tap(); setPingMode(!pingMode); }}>📍</button>
              <button className={`btn ${locked && !solo ? "btn-white" : "btn-green"}`} disabled={busy} onClick={lockIn}>
                {solo ? "Go!" : locked ? "Unlock" : partnerLocked ? "Lock in · go!" : "Lock in"}
              </button>
            </div>
          </section>
        </>
      )}

      <Toast toast={toast} onDone={() => setToast(null)} />
      {intro && !g.done && <Intro name={lv0.name} text={lv0.intro} roles={g.roles} names={g.names} meId={room.meId} solo={solo} onGo={() => { feedback.unlock(); feedback.tap(); setIntro(false); }} />}
      {g.done && !play && <Done room={room} g={g} />}
    </main>
  );
}

function Intro({ name, text, roles, names, meId, solo, onGo }: { name: string; text: string; roles: Record<Role, string>; names: Record<string, string>; meId: string; solo: boolean; onGo: () => void }) {
  return (
    <div className="overlay hz-intro">
      <span className="label">Tonight&apos;s job</span>
      <h2>{name}</h2>
      <p>{text}</p>
      <div className="hz-crew">
        {ROLES.map((r) => (
          <div key={r} className={`hz-crewcard ${r}`}>
            <span className="ico">{ROLE_LOOK[r].icon}</span>
            <b>{ROLE_LOOK[r].name}{!solo && ` · ${roles[r] === meId ? "you" : names[roles[r]] ?? "partner"}`}</b>
            <span>{ROLE_LOOK[r].power}</span>
          </div>
        ))}
      </div>
      <button className="btn btn-green" style={{ maxWidth: 380 }} onClick={onGo}>Let&apos;s go</button>
    </div>
  );
}

function Header({ room, g, name }: { room: HeistView; g: HeistGameView; name: string }) {
  const router = useRouter();
  const leave = useMutation(api.heist.leave);
  const restart = useMutation(api.heist.restart);
  const [ask, setAsk] = useState(false);
  const [help, setHelp] = useState(false);
  const go = async () => { await leave({ code: room.code }).catch(() => {}); router.push("/heist"); };
  return (
    <>
      <header className="topbar" style={{ gap: 6, minHeight: 44 }}>
        <button className="icon-btn" aria-label="Leave heist" onClick={() => { feedback.tap(); if (g.done) void go(); else setAsk(true); }}><Icon.Close /></button>
        <span className="hz-title">{name}</span>
        <span className="grow" />
        <button className="icon-btn" aria-label="How to play" onClick={() => { feedback.tap(); setHelp(true); }}><span className="hz-q">?</span></button>
        {!g.done && <button className="icon-btn" aria-label="Restart heist" onClick={() => { feedback.tap(); void restart({ code: room.code }); }}><span className="hz-q">↺</span></button>}
      </header>
      <Sheet open={ask} onClose={() => setAsk(false)} label="Leave heist">
        <h2 style={{ margin: 0, fontSize: 24, fontWeight: 900, textAlign: "center" }}>Abandon the heist?</h2>
        <p style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "var(--muted)", textAlign: "center" }}>It ends for the whole crew.</p>
        <button className="btn btn-green" onClick={() => setAsk(false)}>Stay</button>
        <button className="btn btn-white" style={{ color: "var(--cherry-edge)" }} onClick={go}>Leave</button>
      </Sheet>
      <Sheet open={help} onClose={() => setHelp(false)} label="How to play">
        <h2 style={{ margin: 0, fontSize: 22, fontWeight: 900, textAlign: "center" }}>How it works</h2>
        <ul className="hz-legend">
          <li><span>🐈‍⬛ 🧑‍💻</span>Plan up to 3 moves each, then lock in. Moves happen at the same time, step by step.</li>
          <li><span>👮</span>Guards walk the same route every time and see 3 tiles ahead in a cone (the gold tiles).</li>
          <li><span>📹</span>Cameras watch the red tiles, until the Hacker hacks a 🖥️ terminal.</li>
          <li><span className="hz-lasericon" />Lasers bust anyone crossing, unless systems are hacked. A hack lasts 6 steps.</li>
          <li><span>🚪</span>Locked doors: only the Cat can pick them (walk into it). They block sight while shut.</li>
          <li><span>🪴</span>Hide behind plants: guards can&apos;t see you there, but don&apos;t let one walk into you.</li>
          <li><span>💎 🚐</span>Grab the gem, then both thieves meet at the van.</li>
          <li><span>★</span>Stars: escape, collect every 🪙, and finish within par rounds.</li>
        </ul>
        <button className="btn btn-white" onClick={() => setHelp(false)}>Got it</button>
      </Sheet>
    </>
  );
}

function Done({ room, g }: { room: HeistView; g: HeistGameView }) {
  const router = useRouter();
  const start = useMutation(api.heist.start);
  const toLobby = useMutation(api.heist.toLobby);
  const leave = useMutation(api.heist.leave);
  const d = g.done!;
  const won = "stars" in d;
  const got = won ? [d.stars.escaped, d.stars.coins, d.stars.par].filter(Boolean).length : 0;
  const idx = LEVELS.findIndex((l) => l.id === g.level);
  const next = LEVELS[idx + 1];
  const played = useRef(false);
  useEffect(() => {
    if (played.current) return;
    played.current = true;
    if (won) feedback.win(); else feedback.wrong();
  }, [won]);
  return (
    <div className="overlay hz-done">
      {won && <Confetti />}
      {won ? (
        <>
          <span className="hz-van" aria-hidden="true">🚐💨</span>
          <h2>Clean getaway!</h2>
          <Stars got={got} size={48} />
          <ul className="hz-starlist">
            <li className="on">★ Escaped with the gem</li>
            <li className={d.stars.coins ? "on" : ""}>★ Every coin</li>
            <li className={d.stars.par ? "on" : ""}>★ Within par ({d.rounds}/{levelOf(g.level).par} rounds)</li>
          </ul>
          <p className="hz-donesub">{d.busts === 0 ? "Never spotted. Ghosts." : `Busted ${d.busts} ${d.busts === 1 ? "time" : "times"} along the way.`}</p>
        </>
      ) : (
        <>
          <Mascot size={88} mood="wow" />
          <h2>Your partner left</h2>
        </>
      )}
      {room.isHost && next && won && <button className="btn btn-green" style={{ maxWidth: 380 }} onClick={() => { feedback.tap(); void start({ code: room.code, level: next.id }); }}>Next heist: {next.name}</button>}
      {room.isHost && <button className={`btn ${next && won ? "btn-white" : "btn-green"}`} style={{ maxWidth: 380 }} onClick={() => { feedback.tap(); void start({ code: room.code, level: g.level }); }}>{won ? "Try for more stars" : "Play again"}</button>}
      {!room.isHost && <p className="wait" style={{ margin: 0, fontWeight: 900, color: "var(--muted)" }}>Waiting for the host…</p>}
      <button className="btn btn-white" style={{ maxWidth: 380 }} onClick={() => { feedback.tap(); void toLobby({ code: room.code }); }}>Pick a heist</button>
      <button className="btn btn-ghost" style={{ maxWidth: 380 }} onClick={async () => { await leave({ code: room.code }).catch(() => {}); router.push("/heist"); }}>Leave</button>
    </div>
  );
}
