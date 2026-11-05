"use client";

import Link from "next/link";
import { useState } from "react";
import type { Card } from "../../../../convex/lib/chess";
import { Piece } from "@/components/chess/Board";
import { JourneyBattle, type BattleEnd } from "@/components/chess/JourneyBattle";
import { Confetti, Heart, Hearts, Icon, Mascot, Sheet } from "@/components/ui";
import { feedback } from "@/lib/feedback";
import {
  CARD_INFO,
  FLOORS,
  NODE_INFO,
  RELICS,
  TWIST_INFO,
  applyReward,
  battleFor,
  loadBest,
  loadRun,
  mysteryFor,
  newRun,
  rewardLabel,
  rewardsFor,
  saveBest,
  saveRun,
  type Best,
  type MapNode,
  type Reward,
  type Run,
} from "@/lib/journey";

type Pending =
  | { t: "battle"; node: MapNode; tries: number }
  | { t: "reward"; options: Reward[]; title: string }
  | { t: "rest" }
  | { t: "note"; title: string; text: string }
  | { t: "over" }
  | { t: "won" };

type Saved = Run & { pending?: Pending | null };

function NodeIcon({ kind, size = 40 }: { kind: MapNode["kind"]; size?: number }) {
  const n = NODE_INFO[kind];
  return (
    <span style={{ width: size, height: size, borderRadius: size / 3, background: n.face, boxShadow: `0 3px 0 ${n.edge}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
      <svg width={size * 0.58} height={size * 0.58} viewBox="0 0 24 24" aria-hidden="true"><path d={n.icon} stroke="#fff" strokeWidth="2.4" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>
    </span>
  );
}

function RewardIcon({ r }: { r: Reward }) {
  const box = (bg: string, edge: string, child: React.ReactNode) => (
    <span style={{ width: 48, height: 48, borderRadius: 16, background: bg, boxShadow: `0 3px 0 ${edge}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{child}</span>
  );
  if (r.t === "recruit") return box("#DDF4FF", "#84D8FF", <Piece code={r.piece.toUpperCase()} size={38} />);
  if (r.t === "pawns") return box("#DDF4FF", "#84D8FF", <><Piece code="P" size={28} style={{ marginRight: -10 }} /><Piece code="P" size={28} /></>);
  if (r.t === "upgrade") return box("#D7FFB8", "#A5ED6E", <svg width="26" height="26" viewBox="0 0 24 24"><path d="M12 20 V5 M5 11 L12 4 L19 11" stroke="#46A302" strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>);
  if (r.t === "heal") return box("#FFDFE0", "#FFB2B2", <Heart on size={28} />);
  if (r.t === "card") {
    const c = CARD_INFO[r.card];
    return box(c.face, c.edge, <svg width="26" height="26" viewBox="0 0 24 24"><path d={c.icon} stroke="#fff" strokeWidth="2.6" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>);
  }
  const rel = RELICS[r.id];
  return box(rel.color, "rgba(0,0,0,.25)", <span style={{ color: "#fff", fontSize: 22, fontWeight: 900 }}>{rel.name[0]}</span>);
}

function Army({ army, size = 30 }: { army: string; size?: number }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(8, minmax(0, 1fr))", borderRadius: 12, overflow: "hidden", border: "2px solid var(--line)" }} aria-label="Your army">
      {army.split("").map((c, i) => (
        <span key={i} style={{ aspectRatio: "1", display: "flex", alignItems: "center", justifyContent: "center", background: ((i >> 3) + (i & 7)) % 2 ? "#E8F5DA" : "#fff" }}>
          {c !== "." && <Piece code={c} size={size} />}
        </span>
      ))}
    </div>
  );
}

export default function JourneyPage() {
  // This page only renders in the browser (behind the identity splash), so reading storage here is safe.
  const [run, setRun] = useState<Saved | null>(() => loadRun() as Saved | null);
  const [best, setBest] = useState<Best>(loadBest);
  const [quit, setQuit] = useState(false);

  function update(next: Saved | null) {
    setRun(next);
    saveRun(next);
  }

  function record(r: Run, cleared: boolean) {
    const b = { floor: Math.max(best.floor, r.floor + 1), clears: best.clears + (cleared ? 1 : 0), runs: best.runs + 1 };
    setBest(b);
    saveBest(b);
  }

  function start() {
    feedback.unlock();
    feedback.go();
    update({ ...newRun(), pending: null });
  }

  function choose(idx: number) {
    if (!run) return;
    feedback.tap();
    const node = run.map[run.floor][idx];
    const r: Saved = { ...run, picked: [...run.picked, idx] };
    if (node.kind === "battle" || node.kind === "elite" || node.kind === "boss") r.pending = { t: "battle", node, tries: 0 };
    else if (node.kind === "treasure") r.pending = { t: "reward", options: rewardsFor(r, "treasure"), title: "You found a treasure chest!" };
    else if (node.kind === "rest") r.pending = { t: "rest" };
    else {
      const m = mysteryFor(r);
      const after = m.apply(r) as Saved;
      update({ ...after, pending: { t: "note", title: m.title, text: m.text } });
      return;
    }
    update(r);
  }

  function nextFloor(r: Saved) {
    update({ ...r, floor: r.floor + 1, pending: null });
  }

  function endBattle(res: BattleEnd, myMoves: number) {
    if (!run || run.pending?.t !== "battle") return;
    const node = run.pending.node;
    if (res === "win") {
      let r: Saved = { ...run, wins: run.wins + 1 };
      if (r.relics.includes("vampire") && myMoves < 25 && r.hearts < r.maxHearts) r = { ...r, hearts: r.hearts + 1 };
      if (node.kind === "boss") {
        feedback.win();
        record(r, true);
        update({ ...r, pending: { t: "won" } });
        return;
      }
      update({ ...r, pending: { t: "reward", options: rewardsFor(r, node.kind), title: node.kind === "elite" ? "Elite defeated! Pick a rare reward" : "Pick a reward" } });
      return;
    }
    if (res === "draw") { nextFloor(run); return; }
    const hearts = run.hearts - 1;
    if (hearts <= 0) {
      record(run, false);
      update({ ...run, hearts: 0, pending: { t: "over" } });
      return;
    }
    update({ ...run, hearts, pending: { t: "battle", node, tries: run.pending.tries + 1 } });
  }

  function take(rw: Reward) {
    if (!run) return;
    feedback.correct();
    nextFloor(applyReward(run, rw) as Saved);
  }

  // ---------- Battle ----------
  if (run?.pending?.t === "battle") {
    const node = run.pending.node;
    return (
      <JourneyBattle
        key={`${run.floor}-${run.pending.tries}`}
        battle={battleFor(run, node)}
        cards={run.cards}
        hearts={run.hearts}
        maxHearts={run.maxHearts}
        boss={node.kind === "boss"}
        onEnd={endBattle}
      />
    );
  }

  // ---------- Start ----------
  if (!run || run.pending?.t === "over" || run.pending?.t === "won") {
    const over = run?.pending?.t === "over";
    const won = run?.pending?.t === "won";
    return (
      <main className="screen" style={{ gap: 14, position: "relative" }}>
        {won && <Confetti />}
        <header className="topbar">
          <Link href="/chess" className="icon-btn" aria-label="Back"><Icon.Back /></Link>
          <span className="chip" style={{ background: "#F3E2FF", color: "#8A4FB5" }}>CHESS JOURNEY</span>
        </header>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, textAlign: "center", paddingTop: 8 }}>
          <Mascot size={110} mood={won ? "joy" : over ? "wow" : "happy"} className={won ? "jump" : "bob"} />
          <h1 style={{ margin: 0, fontSize: 32, fontWeight: 900, color: won ? "var(--lime-dark)" : over ? "var(--tangerine-ink)" : "var(--ink)" }}>
            {won ? "Journey complete!" : over ? "Your journey ends" : "Chess Journey"}
          </h1>
          <p style={{ margin: 0, fontSize: 17, fontWeight: 700, color: "var(--muted)", maxWidth: 340 }}>
            {won ? `You beat King Bolt with ${run!.wins} wins and ${run!.relics.length} relics.` : over ? `You reached floor ${run!.floor + 1} of ${FLOORS}. Every run is different. Try again!` : `Start with a small army. Fight ${FLOORS} floors of bots, pick rewards, collect relics, and take down King Bolt.`}
          </p>
        </div>
        {(over || won) && run && (
          <section style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <h2 className="label">Final army</h2>
            <Army army={run.army} />
          </section>
        )}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 8 }}>
          {[["Best floor", best.floor ? `${best.floor}/${FLOORS}` : "–"], ["Clears", String(best.clears)], ["Runs", String(best.runs)]].map(([k, v]) => (
            <div key={k} style={{ border: "2px solid var(--line)", borderRadius: 16, padding: "10px 8px", textAlign: "center" }}>
              <div style={{ fontSize: 22, fontWeight: 900 }}>{v}</div>
              <div style={{ fontSize: 12, fontWeight: 800, color: "var(--muted)", letterSpacing: ".05em" }}>{k.toUpperCase()}</div>
            </div>
          ))}
        </div>
        {!run && (
          <section style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {(["battle", "elite", "treasure", "rest", "mystery"] as const).map((k) => (
              <div key={k} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <NodeIcon kind={k} size={34} />
                <span style={{ fontSize: 15, fontWeight: 800 }}>{NODE_INFO[k].name} <span style={{ color: "var(--muted)", fontWeight: 700 }}>· {NODE_INFO[k].sub}</span></span>
              </div>
            ))}
          </section>
        )}
        <div className="grow" />
        <button className="btn btn-green" onClick={start}>{run ? "New journey" : "Start journey"}</button>
        {run && <Link href="/chess" className="btn btn-white" onClick={() => update(null)}>Back home</Link>}
      </main>
    );
  }

  // ---------- Map and between-battle screens ----------
  const p = run.pending;
  const choices = run.map[run.floor] ?? [];

  return (
    <main className="screen" style={{ gap: 12, position: "relative" }}>
      <header className="topbar" style={{ gap: 8 }}>
        <Link href="/chess" className="icon-btn" aria-label="Leave (your run is saved)"><Icon.Close /></Link>
        <span className="chip" style={{ background: "#F3E2FF", color: "#8A4FB5" }}>FLOOR {run.floor + 1} / {FLOORS}</span>
        <span className="grow" />
        <Hearts left={run.hearts} total={run.maxHearts} size={20} />
      </header>

      <div style={{ display: "flex", alignItems: "center", gap: 4 }} aria-label={`Floor ${run.floor + 1} of ${FLOORS}`}>
        {run.map.map((f, i) => (
          <span key={i} style={{ flex: 1, display: "flex", alignItems: "center", gap: 4 }}>
            <span style={{ width: i === FLOORS - 1 ? 26 : 18, height: i === FLOORS - 1 ? 26 : 18, borderRadius: 9, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", background: i < run.floor ? NODE_INFO[f[run.picked[i]]?.kind ?? "battle"].face : i === run.floor ? "var(--lime)" : "var(--line)", boxShadow: i === run.floor ? "0 0 0 4px #D7FFB8" : undefined }}>
              {i === FLOORS - 1 && <Icon.Crown size={16} />}
            </span>
            {i < FLOORS - 1 && <span style={{ flex: 1, height: 4, borderRadius: 2, background: i < run.floor ? "#A5ED6E" : "var(--line)" }} />}
          </span>
        ))}
      </div>

      {!p && (
        <>
          <h2 style={{ margin: "4px 0 0", fontSize: 22, fontWeight: 900 }}>{choices.length > 1 ? "Choose your path" : choices[0]?.kind === "boss" ? "The throne room" : "The road begins"}</h2>
          <section style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {choices.map((n, i) => {
              const info = NODE_INFO[n.kind];
              const tw = TWIST_INFO[n.twist];
              return (
                <button key={i} className="card" onClick={() => choose(i)} style={{ padding: "12px 14px", gap: 12 }}>
                  <NodeIcon kind={n.kind} size={44} />
                  <span className="col">
                    <span className="title" style={{ fontSize: 18 }}>{info.name}{tw && <span style={{ marginLeft: 8, fontSize: 12, fontWeight: 900, letterSpacing: ".05em", padding: "3px 8px", borderRadius: 8, background: "#FFF0DB", color: "#9A5200", verticalAlign: "middle" }}>{tw.name.toUpperCase()}</span>}</span>
                    <span className="sub" style={{ fontSize: 14 }}>{tw ? tw.text : info.sub}</span>
                  </span>
                  <Icon.Chevron />
                </button>
              );
            })}
          </section>
        </>
      )}

      {p?.t === "reward" && (
        <>
          <h2 style={{ margin: "4px 0 0", fontSize: 22, fontWeight: 900 }}>{p.title}</h2>
          <section style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {p.options.map((o, i) => {
              const l = rewardLabel(o);
              return (
                <button key={i} className="card rise" onClick={() => take(o)} style={{ padding: "12px 14px", gap: 12, animationDelay: `${i * 70}ms` }}>
                  <RewardIcon r={o} />
                  <span className="col"><span className="title" style={{ fontSize: 18 }}>{l.title}</span><span className="sub" style={{ fontSize: 14 }}>{l.text}</span></span>
                </button>
              );
            })}
          </section>
          <button className="btn btn-ghost" onClick={() => nextFloor(run)}>Skip</button>
        </>
      )}

      {p?.t === "rest" && (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <NodeIcon kind="rest" size={48} />
            <span><h2 style={{ margin: 0, fontSize: 22, fontWeight: 900 }}>A warm campfire</h2><span style={{ fontSize: 15, fontWeight: 700, color: "var(--muted)" }}>Pick one thing to do before moving on.</span></span>
          </div>
          <section style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {([{ t: "heal" }, { t: "upgrade" }, { t: "card", card: (["shield", "freeze", "swap", "rocket"] as Card[])[run.floor % 4] }] as Reward[]).map((o, i) => {
              const l = rewardLabel(o);
              const disabled = o.t === "heal" && run.hearts >= run.maxHearts;
              return (
                <button key={i} className="card" disabled={disabled} onClick={() => take(o)} style={{ padding: "12px 14px", gap: 12, opacity: disabled ? 0.5 : 1 }}>
                  <RewardIcon r={o} />
                  <span className="col"><span className="title" style={{ fontSize: 18 }}>{o.t === "heal" ? "Rest" : o.t === "upgrade" ? "Train" : `Craft a ${l.title}`}</span><span className="sub" style={{ fontSize: 14 }}>{disabled ? "You're already at full health." : l.text}</span></span>
                </button>
              );
            })}
          </section>
        </>
      )}

      {p?.t === "note" && (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, textAlign: "center", padding: "12px 0" }}>
          <NodeIcon kind="mystery" size={64} />
          <h2 style={{ margin: 0, fontSize: 26, fontWeight: 900 }}>{p.title}</h2>
          <p style={{ margin: 0, fontSize: 17, fontWeight: 700, color: "var(--muted)" }}>{p.text}</p>
          <button className="btn btn-green" style={{ width: "100%" }} onClick={() => { feedback.tap(); nextFloor(run); }}>Continue</button>
        </div>
      )}

      <section style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 4 }}>
        <h2 className="label">Your army</h2>
        <Army army={run.army} />
      </section>

      <section style={{ display: "flex", flexWrap: "wrap", gap: 6 }} aria-label="Cards">
        {(Object.keys(CARD_INFO) as Card[]).filter((c) => run.cards[c] > 0).map((c) => (
          <span key={c} style={{ display: "flex", alignItems: "center", gap: 6, padding: "5px 10px 5px 6px", borderRadius: 12, background: CARD_INFO[c].face, color: "#fff", fontSize: 14, fontWeight: 900, boxShadow: `0 3px 0 ${CARD_INFO[c].edge}` }}>
            <svg width="16" height="16" viewBox="0 0 24 24"><path d={CARD_INFO[c].icon} stroke="#fff" strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>
            {CARD_INFO[c].name} ×{run.cards[c]}
          </span>
        ))}
      </section>

      {run.relics.length > 0 && (
        <section style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <h2 className="label">Relics</h2>
          {run.relics.map((id, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ width: 28, height: 28, borderRadius: 10, background: RELICS[id].color, color: "#fff", fontWeight: 900, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{RELICS[id].name[0]}</span>
              <span style={{ fontSize: 14, fontWeight: 800 }}>{RELICS[id].name} <span style={{ color: "var(--muted)", fontWeight: 700 }}>· {RELICS[id].text}</span></span>
            </div>
          ))}
        </section>
      )}

      <div className="grow" />
      <button className="btn btn-ghost" style={{ color: "var(--cherry-edge)" }} onClick={() => setQuit(true)}>Abandon run</button>

      <Sheet open={quit} onClose={() => setQuit(false)} label="Abandon run">
        <h2 style={{ margin: 0, fontSize: 24, fontWeight: 900, textAlign: "center" }}>Abandon this journey?</h2>
        <p style={{ margin: 0, textAlign: "center", fontWeight: 700, color: "var(--muted)" }}>Your run is saved if you just leave. Abandoning ends it for good.</p>
        <button className="btn btn-green" onClick={() => setQuit(false)}>Keep going</button>
        <button className="btn btn-white" style={{ color: "var(--cherry-edge)" }} onClick={() => { setQuit(false); record(run, false); update({ ...run, pending: { t: "over" } }); }}>Abandon</button>
      </Sheet>
    </main>
  );
}
