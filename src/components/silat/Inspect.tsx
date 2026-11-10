"use client";

// "What is this?" panels: a card's full details, and an enemy's type, moves and what it's about to do.
import type { ReactNode } from "react";
import { TYPE_COLORS } from "@/components/silat/SilatCard";
import { CARDS, STYLES, cardCost, typeOf, type CardType } from "@/lib/silat/cards";
import { RANGKAI } from "@/lib/silat/rangkai";
import {
  HEAVY_RING_OUT, HEAVY_SLIDE, PIECE, TRAITS, chargeEnd, intentValid, isGuarded, isHeavy, jabChance, kitOf, kitPlan, moveDef, moveText,
  occName, occupant, reactionHit, sqName, unitHit, unitName, variantOf, type Fight, type Kind, type Unit,
} from "@/lib/silat/rules";

const TYPE_INFO: Record<CardType, [string, string]> = {
  Serang: ["Attack", "Hurts or shoves enemies. Paired with a move card, it can capture: knock a piece out and land on its square."],
  Gerak: ["Move", "Moves you. Enemies that cover the square you land on get a jab at you (red dots show where)."],
  Tangkis: ["Defence", "Protects you during the enemy turn. You can also ready one with Siap: it goes off on the first attack."],
  Jurus: ["Power", "Lasts for the rest of this fight."],
  Siasat: ["Tactic", "Bends the rules: your deck, your hand, your dice."],
};
const MARKS: [string, string, string][] = [["you", "#1cb0f6", "you"], ["hit", "#ff4b4b", "hits"], ["push", "#ffb3b3", "pushes to"], ["go", "#58cc02", "you move"], ["guard", "#a8e06a", "guards"]];

const PIECE_HOW: Record<Kind, string> = {
  p: "Walks down the board towards your side (2 squares on its first move) and strikes the two squares diagonally ahead of it. If it reaches your back row it becomes a Queen.",
  n: "Jumps in an L, over anything, and strikes any square one L-jump away. It can't strike the squares right beside it.",
  b: "Slides along diagonals. With a clear diagonal to you it charges, hitting the first thing in its way.",
  r: "Slides in straight lines. With a clear line to you it charges, hitting the first thing in its way.",
  q: "Slides in any direction. With a clear line to you it charges, hitting the first thing in its way.",
  k: "Steps one square at a time and strikes any square next to it.",
};
const DIR_NAMES = ["up", "up-right", "right", "down-right", "down", "down-left", "left", "up-left"];
const ORD = (n: number) => `${n}${n === 1 ? "st" : n === 2 ? "nd" : n === 3 ? "rd" : "th"}`;

const Tag = ({ children, bg = "rgba(255,255,255,.16)", ink = "#fff" }: { children: ReactNode; bg?: string; ink?: string }) => (
  <span className="tag" style={{ background: bg, color: ink }}>{children}</span>
);

/** Everything about one card. `fight` is the board the cost is worked out on (the combo preview). */
export function CardInfo({ id, fight, note }: { id: string; fight: Fight; note?: string }) {
  const c = CARDS[id];
  if (!c) return null;
  const t = TYPE_COLORS[c.type];
  const cost = cardCost(fight, id);
  const linkName = (l: string) => (l === "step" ? "your free step" : l.startsWith("type:") ? `any ${TYPE_INFO[l.slice(5) as CardType]?.[0].toLowerCase() ?? l.slice(5)}` : CARDS[l]?.name ?? l);
  const combos = RANGKAI.filter((r) => r.seq.some((l) => l === id || l === `type:${typeOf(id)}`));
  const marks = MARKS.filter(([m]) => m === "you" || Object.values(c.pattern).includes(m as never));
  return (
    <>
      <div className="head">
        <span className="gem" style={cost < c.cost ? { background: "#58CC02" } : undefined}>{cost}</span>
        <b className="name">{c.name}</b>
        <Tag bg={t.soft} ink={t.ink}>{c.type} · {TYPE_INFO[c.type][0]}</Tag>
        {c.rare && <Tag bg="#FFC800" ink="#5C4200">Rare</Tag>}
        {c.style && <Tag bg={STYLES[c.style].color}>{STYLES[c.style].name}</Tag>}
      </div>
      <p className="main">{c.text}</p>
      {note && <p className="warn">{note}</p>}
      <div className="row">
        <span className="pat" aria-hidden="true">
          {Array.from({ length: 25 }, (_, i) => <i key={i} style={{ background: i === 12 ? "#1cb0f6" : MARKS.find(([m]) => m === c.pattern[i])?.[1] }} />)}
        </span>
        <div className="col">
          {marks.length > 1 && (
            <span className="legend">{marks.map(([m, color, label]) => <span key={m}><i style={{ background: color }} />{label}</span>)}</span>
          )}
          <span>
            Costs {cost} Tenaga{cost !== c.cost ? ` (normally ${c.cost})` : ""}. {TYPE_INFO[c.type][1]}
            {c.self ? " No target: tapping it adds it straight to your combo." : ""}
            {c.exhaust ? " Exhaust: once played, it is gone for the rest of the fight." : ""}
          </span>
        </div>
      </div>
      {combos.map((r) => (
        <p key={r.id} className="line"><b style={{ color: r.color === "#3C3C3C" ? "#fff" : r.color }}>✦ {r.name}</b> ({r.seq.map(linkName).join(" → ")}): {r.text}</p>
      ))}
    </>
  );
}

/** What an enemy is, what it can do, and what it's about to do this enemy turn. */
export function UnitInfo({ fight: s, unit: u }: { fight: Fight; unit: Unit }) {
  const piece = PIECE[u.kind];
  const variant = variantOf(u);
  const kit = kitOf(u);
  const plan = kitPlan(u);
  const name = unitName(u);
  const hit = unitHit(u);
  const acting = s.status === "play" || s.status === "enemy" ? s.intents.filter((it) => intentValid(s, it)) : [];
  const it = acting.find((x) => x.id === u.id);
  const ord = it ? s.intents.indexOf(it) + 1 : 0;
  const special = it?.type === "special" ? moveDef(it.move) : undefined;
  const specialHit = special?.damage !== undefined ? special.damage + (u.empower ?? 0) : hit;
  const moves = plan?.list ?? variant?.moves ?? [];
  const recharge = (id: string) => Math.max(0, (u.cd?.[id] ?? 0) - s.turn);

  let now: [string, string, string]; // title, text, colour
  if (!it) {
    now = u.locked > 0
      ? ["Locked", "It can't act this turn.", "#8C8C8C"]
      : ["Waiting", `No action this turn. Only the ${s.limit} closest regular enemies act each turn, but any enemy you hurt will act next turn.`, "#8C8C8C"];
  } else if (it.type === "strike") {
    const who = it.target === s.hero.sq ? "you" : sqName(s, it.target);
    now = ["Strike", `Hits ${who} for ${hit}. A strike re-aims as you move: get out of its reach, Block it, or shove the piece away.`, "#FF4B4B"];
  } else if (it.type === "charge") {
    const end = chargeEnd(s, it);
    const o = end !== null ? occupant(s, end) : null;
    now = ["Charge", `Rushes ${DIR_NAMES[it.dir]} and hits the first thing in its way for ${hit}${o ? ` (right now: ${o.t === "hero" ? "you" : occName(o)})` : " (right now: nothing)"}. It's locked in and can't turn: step aside and it flies past, or into its own pieces.`, "#FF4B4B"];
  } else if (it.type === "slam") {
    now = ["Hantam (slam)", `Hits ${sqName(s, it.center)} and every square around it for ${hit}. It's locked onto that area: walk out of the red squares or Block.`, "#FF4B4B"];
  } else if (it.type === "move") {
    now = ["Move", `Goes to ${sqName(s, it.to)}. No attack this turn, but it re-plans as you move.`, "#8C8C8C"];
  } else {
    const attacks = special && ["kick", "beam", "whirl", "pounce", "slam"].includes(special.kind);
    now = [special?.name ?? "Special move", `${moveText(it.move)}${attacks ? ` Hits for ${specialHit}.` : ""}`, attacks ? "#FF4B4B" : "#8A4FB5"];
  }

  return (
    <>
      <div className="head">
        <b className="name">{name}</b>
        <Tag>{name === piece.name ? "Chess piece" : piece.name}</Tag>
        {u.boss && <Tag bg="#B81F1F">Boss{kit ? ` · ${kit.name}` : ""}{u.phase ? " · Phase 2" : ""}</Tag>}
        {!u.boss && !!u.traits?.length && <Tag bg="#FF9600">Elite</Tag>}
        {!u.boss && u.target && <Tag bg="#FFC800" ink="#5C4200">★ Leader</Tag>}
        {isHeavy(u) && <Tag>Heavy</Tag>}
      </div>
      <p className="stats">
        <span>HP <b>{u.hp}/{u.max}</b></span>
        <span>Hits <b>{hit}</b>{u.empower ? ` (+${u.empower} commanded)` : ""}</span>
        <span>Jab <b>{reactionHit(u)}</b> · {Math.round(jabChance(s) * 100)}%</span>
        {!!u.block && <span>Shield <b>{u.block}</b></span>}
      </p>
      <p className="now" style={{ borderColor: now[2] }}>
        <b style={{ color: now[2] === "#8C8C8C" ? "#D0D0D0" : now[2] === "#8A4FB5" ? "#CE82FF" : "#FF8A8A" }}>
          {it ? `Acts ${ORD(ord)} · ` : ""}{now[0]}
        </b>
        {now[1]}
      </p>
      <p className="line"><b>{piece.name}.</b> {PIECE_HOW[u.kind]} Step onto a square it covers and it jabs you.</p>
      {u.target && <p className="line"><b>{u.boss ? "Boss" : "Leader"}.</b> {s.gate !== undefined ? "It holds the key: knock it out to open the gate." : "Knock it out to win the fight."}</p>}
      {isHeavy(u) && <p className="line"><b>Heavy.</b> Pushes move it at most {HEAVY_SLIDE} square{HEAVY_SLIDE === 1 ? "" : "s"}, and off the edge it takes {HEAVY_RING_OUT} damage instead of being knocked out.</p>}
      {isGuarded(s, u) && <p className="line"><b>Guarded.</b> An ally covers its square (blue shield): it only budges 1 square and cannot be thrown off the board.</p>}
      {moves.length > 0 && (
        <>
          <p className="sub">{plan ? `Moveset${u.phase ? " (phase 2)" : ""}: it cycles through these` : "Signature moves"}</p>
          {moves.map((id, i) => (
            <p key={i} className="line">
              <b style={{ color: plan && i === plan.at ? "#FFC800" : undefined }}>{plan && i === plan.at ? "▸ " : ""}{moveDef(id)?.name}</b>
              {recharge(id) > 0 ? ` (ready in ${recharge(id)})` : ""}: {moveText(id)}
            </p>
          ))}
          {kit?.phase2?.length && !u.phase ? <p className="line dim">Below half HP it switches to: {kit.phase2.map((id) => moveDef(id)?.name).join(", ")}.</p> : null}
        </>
      )}
      {!!u.traits?.length && (
        <>
          <p className="sub">Powers</p>
          {u.traits.map((t) => <p key={t} className="line"><b>{TRAITS[t].name}</b>: {TRAITS[t].text}</p>)}
        </>
      )}
    </>
  );
}
