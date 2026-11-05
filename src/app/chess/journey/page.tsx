"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import type { Card } from "../../../../convex/lib/chess";
import { Piece } from "@/components/chess/Board";
import { JourneyBattle, effectiveRating, type BattleEnd } from "@/components/chess/JourneyBattle";
import { JourneyMap, NodeGlyph } from "@/components/chess/JourneyMap";
import { Confetti, Heart, Hearts, Icon, Mascot, Sheet } from "@/components/ui";
import { feedback } from "@/lib/feedback";
import {
  ACTS,
  CARD_INFO,
  CARD_KEYS,
  NODE_INFO,
  RELICS,
  TRAIT_INFO,
  TWIST_INFO,
  applyReward,
  battleFor,
  canTake,
  eventFor,
  loadBest,
  loadRun,
  newRun,
  nextAct,
  nodeById,
  pick,
  reachable,
  rewardLabel,
  rewardsFor,
  rng,
  saveBest,
  saveRun,
  shopFor,
  type Battle,
  type Best,
  type MapNode,
  type Reward,
  type Run,
} from "@/lib/journey";
import { loadSkill, rank, rate, saveSkill, type Skill } from "@/lib/skill";

type Pending =
  | { t: "battle"; node: MapNode; battle: Battle; tries: number; note?: string; ambush?: boolean }
  | { t: "reward"; options: Reward[]; title: string; lines: string[] }
  | { t: "shop"; seed: number; bought: number[] }
  | { t: "event"; seed: number; result?: string }
  | { t: "rest" }
  | { t: "actdone"; lines: string[] }
  | { t: "over" }
  | { t: "won" };

type Saved = Run & { pending?: Pending | null };

// ---------- Small pieces ----------
function Coin({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="10" fill="#FFC800" stroke="#E5A800" strokeWidth="2.5" />
      <path d="M12 7 v10 M9.5 9.5 h4 a1.5 1.5 0 0 1 0 3 h-3 a1.5 1.5 0 0 0 0 3 h4" stroke="#B88600" strokeWidth="1.8" fill="none" strokeLinecap="round" />
    </svg>
  );
}

function RewardIcon({ r }: { r: Reward }) {
  const box = (bg: string, edge: string, child: ReactNode) => (
    <span style={{ width: 48, height: 48, borderRadius: 16, background: bg, boxShadow: `0 3px 0 ${edge}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{child}</span>
  );
  if (r.t === "recruit") return box("#DDF4FF", "#84D8FF", <Piece code={r.piece.toUpperCase()} size={38} />);
  if (r.t === "pawns") return box("#DDF4FF", "#84D8FF", <><Piece code="P" size={28} style={{ marginRight: -10 }} /><Piece code="P" size={28} /></>);
  if (r.t === "upgrade") return box("#D7FFB8", "#A5ED6E", <svg width="26" height="26" viewBox="0 0 24 24"><path d="M12 20 V5 M5 11 L12 4 L19 11" stroke="#46A302" strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>);
  if (r.t === "heal" || r.t === "maxheart") return box("#FFDFE0", "#FFB2B2", <Heart on size={28} />);
  if (r.t === "gold") return box("#FFF4CC", "#FFE27A", <Coin size={28} />);
  if (r.t === "card") {
    const c = CARD_INFO[r.card];
    return box(c.face, c.edge, <svg width="26" height="26" viewBox="0 0 24 24"><path d={c.icon} stroke="#fff" strokeWidth="2.6" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>);
  }
  const rel = RELICS[r.id];
  return box(rel.color, "rgba(0,0,0,.25)", <span style={{ color: "#fff", fontSize: 22, fontWeight: 900 }}>{rel.name[0]}</span>);
}

function Army({ army, size = 30, enemy }: { army: string; size?: number; enemy?: boolean }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(8, minmax(0, 1fr))", borderRadius: 12, overflow: "hidden", border: "2px solid var(--line)" }} aria-label={enemy ? "Enemy army" : "Your army"}>
      {army.split("").map((c, i) => (
        <span key={i} style={{ aspectRatio: "1", display: "flex", alignItems: "center", justifyContent: "center", background: ((i >> 3) + (i & 7)) % 2 ? (enemy ? "#FFE3E3" : "#E8F5DA") : "#fff" }}>
          {c !== "." && <Piece code={c} size={size} />}
        </span>
      ))}
    </div>
  );
}

function ChoiceCard({ onClick, disabled, icon, title, text, right, delay = 0 }: { onClick: () => void; disabled?: boolean; icon: ReactNode; title: string; text: string; right?: ReactNode; delay?: number }) {
  return (
    <button className={disabled ? "card" : "card rise"} disabled={disabled} onClick={onClick} style={{ padding: "12px 14px", gap: 12, opacity: disabled ? 0.45 : 1, filter: disabled ? "grayscale(1)" : undefined, animationDelay: `${delay}ms` }}>
      {icon}
      <span className="col"><span className="title" style={{ fontSize: 17 }}>{title}</span><span className="sub" style={{ fontSize: 14 }}>{text}</span></span>
      {right}
    </button>
  );
}

const ROMAN = ["I", "II", "III"];

// ---------- Page ----------
export default function JourneyPage() {
  // This page only renders in the browser (behind the identity splash), so reading storage here is safe.
  const [run, setRun] = useState<Saved | null>(() => loadRun<Saved>());
  const [best, setBest] = useState<Best>(loadBest);
  const [skill, setSkill] = useState<Skill>(() => loadSkill("chess"));
  const [preview, setPreview] = useState<MapNode | null>(null);
  const [quit, setQuit] = useState(false);
  const [bag, setBag] = useState(false);

  function update(next: Saved | null) {
    setRun(next);
    saveRun(next);
  }

  function record(r: Run, cleared: boolean) {
    const b = { act: Math.max(best.act, r.act + 1), clears: best.clears + (cleared ? 1 : 0), runs: best.runs + 1, wins: best.wins + r.wins };
    setBest(b);
    saveBest(b);
  }

  function start() {
    feedback.unlock();
    feedback.go();
    update({ ...newRun(), pending: null });
  }

  function enter(node: MapNode) {
    if (!run) return;
    feedback.tap();
    setPreview(null);
    const r: Saved = { ...run, at: node.id, path: [...run.path, node.id] };
    if (node.kind === "battle" || node.kind === "elite" || node.kind === "boss") r.pending = { t: "battle", node, battle: battleFor(r, node, skill.rating), tries: 0 };
    else if (node.kind === "treasure") r.pending = { t: "reward", options: rewardsFor(r, "treasure", rng(node.seed)), title: "A treasure chest! Pick a relic", lines: [] };
    else if (node.kind === "rest") r.pending = { t: "rest" };
    else if (node.kind === "shop") r.pending = { t: "shop", seed: node.seed, bought: [] };
    else r.pending = { t: "event", seed: node.seed };
    update(r);
  }

  function endBattle(e: BattleEnd) {
    if (!run || run.pending?.t !== "battle") return;
    const p = run.pending;
    const { node, battle } = p;
    const score = e.result === "win" ? 1 : e.result === "draw" ? 0.5 : 0;
    const before = skill.rating;
    const sk = rate(skill, effectiveRating(battle), score, battle.weight);
    setSkill(sk);
    saveSkill("chess", sk);
    const delta = sk.rating - before;
    const ratingLine = `Rating ${sk.rating} (${delta >= 0 ? "+" : ""}${delta}) · ${rank(sk.rating)}`;

    if (e.result === "win") {
      const lines: string[] = [];
      let r: Saved = { ...run, wins: run.wins + 1 };
      let gold = battle.gold + (p.ambush ? 30 : 0);
      if (e.myMoves < 20) { gold += 10; lines.push("Quick win bonus: +10 gold"); }
      gold += r.relics.filter((x) => x === "golden").length * 12;
      r.gold += gold;
      lines.unshift(`+${gold} gold`);
      if (r.relics.includes("vampire") && e.myMoves < 20 && r.hearts < r.maxHearts) { r.hearts += 1; lines.push("Vampire Fang: +1 heart"); }
      if (r.relics.includes("recruiter")) {
        const bestCap = [...e.captured].map((c) => c.toLowerCase()).filter((c) => "qrbn".includes(c)).sort((a, b) => "qrbn".indexOf(a) - "qrbn".indexOf(b))[0] as "q" | "r" | "b" | "n" | undefined;
        if (bestCap && Math.random() < 0.5 && canTake(r, { t: "recruit", piece: bestCap })) { r = applyReward(r, { t: "recruit", piece: bestCap }) as Saved; lines.push("Recruiter's Badge: a captured piece joins you!"); }
      }
      lines.push(ratingLine);
      feedback.win();
      if (node.kind === "boss") {
        if (run.act >= ACTS.length - 1) { record(r, true); update({ ...r, pending: { t: "won" } }); return; }
        update({ ...r, pending: { t: "actdone", lines } });
        return;
      }
      update({ ...r, pending: { t: "reward", options: rewardsFor(r, node.kind), title: node.kind === "elite" ? "Elite beaten! Pick a rare reward" : "Victory! Pick a reward", lines } });
      return;
    }
    if (e.result === "draw") { update({ ...run, pending: null }); return; }

    // Loss: lose a heart and try again against a bot that has adjusted to you.
    let hearts = run.hearts - 1;
    let phoenixUsed = run.phoenixUsed;
    let note = `You lost a heart. ${ratingLine}.`;
    if (hearts <= 0 && run.relics.includes("phoenix") && !phoenixUsed) { hearts = 1; phoenixUsed = true; note = "The Phoenix Feather burns… you rise again with 1 heart!"; }
    if (hearts <= 0) {
      record(run, false);
      update({ ...run, hearts: 0, pending: { t: "over" } });
      return;
    }
    const again = battleFor(run, node, sk.rating);
    update({ ...run, hearts, phoenixUsed, pending: { ...p, battle: { ...again, rating: Math.min(again.rating, p.battle.rating) }, tries: p.tries + 1, note } });
  }

  function take(rw: Reward) {
    if (!run) return;
    feedback.correct();
    update({ ...(applyReward(run, rw) as Saved), pending: null });
  }

  // ---------- Battle ----------
  if (run?.pending?.t === "battle") {
    const p = run.pending;
    return (
      <>
        <JourneyBattle key={`${p.node.id}-${p.tries}`} battle={p.battle} cards={run.cards} hearts={run.hearts} maxHearts={run.maxHearts} boss={p.node.kind === "boss"} onEnd={endBattle} />
        {p.note && <RetryNote key={p.tries} text={p.note} />}
      </>
    );
  }

  // ---------- Start / end ----------
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
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, textAlign: "center", paddingTop: 4 }}>
          <Mascot size={100} mood={won ? "joy" : over ? "wow" : "happy"} className={won ? "jump" : "bob"} />
          <h1 style={{ margin: 0, fontSize: 30, fontWeight: 900, color: won ? "var(--lime-dark)" : over ? "var(--tangerine-ink)" : "var(--ink)" }}>
            {won ? "You beat King Bolt!" : over ? "Your journey ends" : "Chess Journey"}
          </h1>
          <p style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "var(--muted)", maxWidth: 340 }}>
            {won ? `All 3 acts cleared with ${run!.wins} wins and ${run!.relics.length} relics.` : over ? `You fell in Act ${ROMAN[run!.act]} after ${run!.wins} wins. Every run is different. Try again!` : "Cross 3 acts of branching paths. Fight bots with twisted rules, shop for pieces, collect relics, and take down King Bolt."}
          </p>
        </div>
        <section style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", borderRadius: 18, background: "#F3E2FF" }}>
          <Icon.Crown size={34} />
          <span style={{ display: "flex", flexDirection: "column", flex: 1 }}>
            <span style={{ fontSize: 18, fontWeight: 900, color: "#8A4FB5" }}>{rank(skill.rating)} · {skill.rating}</span>
            <span style={{ fontSize: 13, fontWeight: 700, color: "#8A4FB5" }}>Your chess rating. Bots adapt to it: win and they get sharper, lose and they ease off.</span>
          </span>
        </section>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 8 }}>
          {[["Best act", best.act ? `${ROMAN[Math.min(2, best.act - 1)]}` : "–"], ["Clears", String(best.clears)], ["Runs", String(best.runs)]].map(([k, v]) => (
            <div key={k} style={{ border: "2px solid var(--line)", borderRadius: 16, padding: "10px 8px", textAlign: "center" }}>
              <div style={{ fontSize: 22, fontWeight: 900 }}>{v}</div>
              <div style={{ fontSize: 12, fontWeight: 800, color: "var(--muted)", letterSpacing: ".05em" }}>{k.toUpperCase()}</div>
            </div>
          ))}
        </div>
        {(over || won) && run && (
          <section style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <h2 className="label">Final army</h2>
            <Army army={run.army} />
          </section>
        )}
        {!run && (
          <section style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 8 }}>
            {(["battle", "elite", "mystery", "shop", "treasure", "rest"] as const).map((k) => (
              <div key={k} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <NodeGlyph kind={k} size={30} />
                <span style={{ fontSize: 14, fontWeight: 800 }}>{NODE_INFO[k].name}</span>
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

  const p = run.pending;
  const act = ACTS[run.act];
  const reach = reachable(run);

  const header = (
    <header className="topbar" style={{ gap: 8 }}>
      <Link href="/chess" className="icon-btn" aria-label="Leave (your run is saved)"><Icon.Close /></Link>
      <span className="chip" style={{ background: act.soft, color: act.ink }}>ACT {ROMAN[run.act]}</span>
      <span className="grow" />
      <button className="stat-pill" style={{ color: "#B88600", background: "#fff" }} onClick={() => setBag(true)} aria-label={`${run.gold} gold. Open your bag`}><Coin />{run.gold}</button>
      <Hearts left={run.hearts} total={run.maxHearts} size={18} />
    </header>
  );

  // ---------- Between-node screens ----------
  let body: ReactNode = null;

  if (p?.t === "reward") {
    body = (
      <>
        <h2 style={{ margin: "4px 0 0", fontSize: 22, fontWeight: 900 }}>{p.title}</h2>
        {p.lines.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {p.lines.map((l) => <span key={l} className="chip chip-sun pop">{l}</span>)}
          </div>
        )}
        <section style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {p.options.map((o, i) => <ChoiceCard key={i} delay={i * 70} onClick={() => take(o)} icon={<RewardIcon r={o} />} {...rewardLabel(o)} />)}
        </section>
        <button className="btn btn-ghost" onClick={() => update({ ...run, pending: null })}>Skip</button>
      </>
    );
  } else if (p?.t === "rest") {
    const card: Card = pick(rng(run.seed + run.path.length), CARD_KEYS);
    const opts: { r: Reward; title: string }[] = [
      { r: { t: "heal", n: run.maxHearts >= 5 ? 2 : 1 }, title: "Rest" },
      { r: { t: "upgrade" }, title: "Train" },
      { r: { t: "card", card }, title: `Craft a ${CARD_INFO[card].name}` },
    ];
    body = (
      <>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <NodeGlyph kind="rest" size={52} />
          <span><h2 style={{ margin: 0, fontSize: 22, fontWeight: 900 }}>A warm campfire</h2><span style={{ fontSize: 15, fontWeight: 700, color: "var(--muted)" }}>Pick one before you move on.</span></span>
        </div>
        <section style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {opts.map((o, i) => <ChoiceCard key={i} delay={i * 70} disabled={!canTake(run, o.r)} onClick={() => take(o.r)} icon={<RewardIcon r={o.r} />} title={o.title} text={!canTake(run, o.r) && o.r.t === "heal" ? "Already at full health." : rewardLabel(o.r).text} />)}
        </section>
      </>
    );
  } else if (p?.t === "shop") {
    const items = shopFor(run, p.seed);
    body = (
      <>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <NodeGlyph kind="shop" size={52} />
          <span><h2 style={{ margin: 0, fontSize: 22, fontWeight: 900 }}>Bolt&apos;s Bazaar</h2><span style={{ fontSize: 15, fontWeight: 700, color: "var(--muted)" }}>&quot;Everything must go! Mostly to you.&quot;</span></span>
        </div>
        <section style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {items.map((it, i) => {
            const sold = p.bought.includes(i);
            const afford = run.gold >= it.price && canTake(run, it.reward);
            const l = rewardLabel(it.reward);
            return (
              <ChoiceCard
                key={i}
                delay={i * 40}
                disabled={sold || !afford}
                onClick={() => {
                  feedback.correct();
                  update({ ...(applyReward({ ...run, gold: run.gold - it.price }, it.reward) as Saved), pending: { ...p, bought: [...p.bought, i] } });
                }}
                icon={<RewardIcon r={it.reward} />}
                title={l.title}
                text={sold ? "Sold!" : l.text}
                right={<span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 16, fontWeight: 900, color: sold ? "var(--muted)" : "#B88600", flexShrink: 0 }}><Coin size={16} />{it.price}</span>}
              />
            );
          })}
        </section>
        <button className="btn btn-green" onClick={() => { feedback.tap(); update({ ...run, pending: null }); }}>Leave shop</button>
      </>
    );
  } else if (p?.t === "event") {
    const ev = eventFor(p.seed);
    body = (
      <>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, textAlign: "center", padding: "8px 0" }}>
          <NodeGlyph kind="mystery" size={60} />
          <h2 style={{ margin: 0, fontSize: 26, fontWeight: 900 }}>{ev.title}</h2>
          <p style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "var(--muted)" }}>{p.result ?? ev.text}</p>
        </div>
        {p.result ? (
          <button className="btn btn-green" onClick={() => { feedback.tap(); update({ ...run, pending: null }); }}>Continue</button>
        ) : (
          <section style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {ev.choices.map((c, i) => {
              const ok = !c.ok || c.ok(run);
              return (
                <ChoiceCard
                  key={i}
                  delay={i * 70}
                  disabled={!ok}
                  onClick={() => {
                    feedback.tap();
                    const out = c.go(run, rng(p.seed + 7));
                    if (out.fight) {
                      const node: MapNode = { ...nodeById(run, run.at!), kind: "battle", twist: pick(rng(p.seed), ["none", "hill", "threecheck", "pawnstorm"] as const), traits: [] };
                      update({ ...(out.run as Saved), pending: { t: "battle", node, battle: battleFor(out.run, node, skill.rating), tries: 0, ambush: true } });
                      return;
                    }
                    update({ ...(out.run as Saved), pending: { ...p, result: out.text } });
                  }}
                  icon={<span style={{ width: 36, height: 36, borderRadius: 12, background: "#F3E2FF", color: "#8A4FB5", fontWeight: 900, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{i + 1}</span>}
                  title={c.label}
                  text={ok ? c.hint : `${c.hint} (Not available)`}
                />
              );
            })}
          </section>
        )}
      </>
    );
  } else if (p?.t === "actdone") {
    const nextA = ACTS[run.act + 1];
    body = (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12, textAlign: "center", paddingTop: 10 }}>
        <Confetti count={40} />
        <Mascot size={100} mood="joy" className="jump" />
        <h2 style={{ margin: 0, fontSize: 28, fontWeight: 900, color: act.ink }}>Act {ROMAN[run.act]} cleared!</h2>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, justifyContent: "center" }}>
          {p.lines.map((l) => <span key={l} className="chip chip-sun">{l}</span>)}
        </div>
        <p style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "var(--muted)" }}>Next: {nextA.name}. {nextA.sub}. You heal 1 heart on the way.</p>
        <button className="btn btn-green" onClick={() => { feedback.go(); update({ ...(nextAct(run) as Saved), pending: null }); }}>Onward to Act {ROMAN[run.act + 1]}</button>
      </div>
    );
  } else {
    body = (
      <>
        <div>
          <h2 style={{ margin: 0, fontSize: 21, fontWeight: 900 }}>{act.name}</h2>
          <p style={{ margin: "2px 0 0", fontSize: 14, fontWeight: 700, color: "var(--muted)" }}>{act.sub}. Tap a glowing stop to see what&apos;s there. Paths only go forward, so plan your route.</p>
        </div>
        <JourneyMap run={run} reach={reach} onPick={(n) => { feedback.tap(); setPreview(n); }} />
      </>
    );
  }

  // Preview sheet for a map stop.
  let previewBody: ReactNode = null;
  if (preview) {
    const fights = preview.kind === "battle" || preview.kind === "elite" || preview.kind === "boss";
    const b = fights ? battleFor({ ...run, at: preview.id }, preview, skill.rating) : null;
    const tw = TWIST_INFO[preview.twist];
    previewBody = (
      <>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <NodeGlyph kind={preview.kind} size={52} />
          <span style={{ display: "flex", flexDirection: "column" }}>
            <span style={{ fontSize: 22, fontWeight: 900 }}>{preview.kind === "boss" ? act.boss : b ? b.name : NODE_INFO[preview.kind].name}</span>
            <span style={{ fontSize: 14, fontWeight: 800, color: "var(--muted)" }}>{b ? `${NODE_INFO[preview.kind].name} · ${rank(b.rating)} ${b.rating} · +${b.gold} gold` : NODE_INFO[preview.kind].sub}</span>
          </span>
        </div>
        {b && <Army army={b.fen.split(" ")[0].split("/").slice(0, 2).join("").replace(/\d/g, (d) => ".".repeat(Number(d)))} size={26} enemy />}
        {tw && <div style={{ padding: "10px 12px", borderRadius: 14, border: `2px solid ${tw.color}` }}><b style={{ color: tw.color }}>{tw.name}</b><div style={{ fontSize: 14, fontWeight: 700, color: "var(--muted)" }}>{tw.text}</div></div>}
        {preview.traits.map((t) => <div key={t} style={{ padding: "10px 12px", borderRadius: 14, border: "2px solid var(--line)" }}><b>{TRAIT_INFO[t].name}</b><div style={{ fontSize: 14, fontWeight: 700, color: "var(--muted)" }}>{TRAIT_INFO[t].text}</div></div>)}
        <button className="btn btn-green" onClick={() => enter(preview)}>{fights ? "Fight!" : "Go here"}</button>
        <button className="btn btn-white" onClick={() => setPreview(null)}>Look around</button>
      </>
    );
  }

  return (
    <main className="screen" style={{ gap: 12, position: "relative" }}>
      {header}
      {body}
      {!p && (
        <section style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <h2 className="label">Your army</h2>
          <Army army={run.army} size={28} />
        </section>
      )}
      <div className="grow" />
      {!p && <button className="btn btn-ghost" style={{ color: "var(--muted)" }} onClick={() => setBag(true)}>Cards & relics ({run.relics.length})</button>}

      <Sheet open={!!preview} onClose={() => setPreview(null)} label="Map stop">{previewBody}</Sheet>

      <Sheet open={bag} onClose={() => setBag(false)} label="Your bag">
        <h2 style={{ margin: 0, fontSize: 22, fontWeight: 900 }}>Your bag</h2>
        <div style={{ display: "flex", alignItems: "center", gap: 10, fontWeight: 900 }}>
          <Coin size={22} />{run.gold} gold · <Hearts left={run.hearts} total={run.maxHearts} size={18} /> · {rank(skill.rating)} {skill.rating}
        </div>
        <Army army={run.army} size={26} />
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {CARD_KEYS.filter((c) => run.cards[c] > 0).map((c) => (
            <span key={c} style={{ display: "flex", alignItems: "center", gap: 6, padding: "5px 10px 5px 6px", borderRadius: 12, background: CARD_INFO[c].face, color: "#fff", fontSize: 14, fontWeight: 900, boxShadow: `0 3px 0 ${CARD_INFO[c].edge}` }}>
              <svg width="16" height="16" viewBox="0 0 24 24"><path d={CARD_INFO[c].icon} stroke="#fff" strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>
              {CARD_INFO[c].name} ×{run.cards[c]}
            </span>
          ))}
        </div>
        {run.relics.length === 0 && <p style={{ margin: 0, color: "var(--muted)", fontWeight: 700 }}>No relics yet. Find them in treasure chests, elites and shops.</p>}
        {run.relics.map((id, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ width: 30, height: 30, borderRadius: 10, background: RELICS[id].color, color: "#fff", fontWeight: 900, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{RELICS[id].name[0]}</span>
            <span style={{ fontSize: 14, fontWeight: 800 }}>{RELICS[id].name} <span style={{ color: "var(--muted)", fontWeight: 700 }}>· {RELICS[id].text}</span></span>
          </div>
        ))}
        <button className="btn btn-white" style={{ color: "var(--cherry-edge)" }} onClick={() => { setBag(false); setQuit(true); }}>Abandon run</button>
      </Sheet>

      <Sheet open={quit} onClose={() => setQuit(false)} label="Abandon run">
        <h2 style={{ margin: 0, fontSize: 24, fontWeight: 900, textAlign: "center" }}>Abandon this journey?</h2>
        <p style={{ margin: 0, textAlign: "center", fontWeight: 700, color: "var(--muted)" }}>Your run is saved if you just leave. Abandoning ends it for good.</p>
        <button className="btn btn-green" onClick={() => setQuit(false)}>Keep going</button>
        <button className="btn btn-white" style={{ color: "var(--cherry-edge)" }} onClick={() => { setQuit(false); record(run, false); update({ ...run, pending: { t: "over" } }); }}>Abandon</button>
      </Sheet>
    </main>
  );
}

function RetryNote({ text }: { text: string }) {
  const [open, setOpen] = useState(true);
  if (!open) return null;
  return (
    <div role="status" onClick={() => setOpen(false)} style={{ position: "fixed", left: 16, right: 16, top: 16, zIndex: 60, padding: "12px 14px", borderRadius: 16, background: "#fff", border: "2px solid var(--line)", boxShadow: "0 6px 20px rgba(0,0,0,.12)", fontWeight: 800, textAlign: "center" }}>
      {text} The bot adjusts to you. Tap to close.
    </div>
  );
}
