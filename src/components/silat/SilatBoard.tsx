"use client";

import { useState, type CSSProperties } from "react";
import { Piece } from "@/components/chess/Board";
import { SilatKing } from "@/components/shell";
import { RIVE_ON, RiveDice, RiveHero } from "@/components/silat/RiveSprites";
import { Sprite, spriteFor, type Anim } from "@/components/silat/Sprite";
import type { MoveKind } from "@/lib/silat/config";
import { DIRS, TRAITS, type Scene, chargeEnd, col, intentValid, isGuarded, moveDef, moveText, occupant, row, slamArea, specialDanger, unitHit, type Fight, type Fx, type Intent, type Kind } from "@/lib/silat/rules";

const FILES = "abcdefgh";

/** Intent badge colour and icon for each kind of signature move. */
const SPECIAL_COLOR: Record<MoveKind, string> = {
  kick: "#FF4B4B", beam: "#FF4B4B", whirl: "#FF4B4B", pounce: "#FF4B4B", slam: "#FF4B4B",
  block: "#1899D6", heal: "#46A302", summon: "#8A4FB5", command: "#CE82FF", decree: "#CE82FF", curse: "#3C3C3C",
};
/** Moves that hit you (red badge with damage, red danger squares). */
const ATTACK_KINDS = new Set<MoveKind>(["kick", "beam", "whirl", "pounce", "slam"]);
const SPECIAL_ICON: Record<MoveKind, string> = {
  kick: "M2 2 L5 5 L2 8 M5 2 L8 5 L5 8",
  beam: "M5 9 V1.5 M2.5 4 L5 1.5 L7.5 4 M3.5 6.5 H6.5",
  whirl: "M8 5 A3 3 0 1 1 5 2 M5 2 L6.8 1 M5 2 L6.4 3.6",
  pounce: "M1.5 8.5 Q3 2 8.5 2 M6 1 L8.5 2 L7 4.3",
  slam: "M5 1 V3 M5 7 V9 M1 5 H3 M7 5 H9 M2 2 L3.4 3.4 M6.6 6.6 L8 8 M8 2 L6.6 3.4 M3.4 6.6 L2 8",
  block: "M5 1 L8.5 2.5 V5 C8.5 7.3 6.8 8.6 5 9.2 C3.2 8.6 1.5 7.3 1.5 5 V2.5z",
  heal: "M5 1.5 V8.5 M1.5 5 H8.5",
  summon: "M5 1.5 a1.6 1.6 0 1 1 0 3.2 a1.6 1.6 0 1 1 0 -3.2 M3 8.5 L5 4.7 L7 8.5z",
  command: "M2.5 9 V1.5 L8 3.5 L2.5 5.5",
  decree: "M1.5 7.5 L2.5 3 L5 5 L7.5 3 L8.5 7.5z",
  curse: "M2.5 2.5 L7.5 7.5 M7.5 2.5 L2.5 7.5",
};

/** Each part of the prison is a real place with a subtle grid on top, not a plain checkerboard.
 *  A faint alternating tint keeps the chess colours readable. */
const SCENES: Record<Scene, { ground: string; edge: string; line: string; tint: string; ink: string; inkAlt: string }> = {
  cell: {
    ground: "radial-gradient(circle at 18% 72%, rgba(0,0,0,.10) 0 7%, transparent 8%), radial-gradient(circle at 76% 22%, rgba(255,255,255,.10) 0 6%, transparent 7%), radial-gradient(ellipse at 50% 0%, rgba(255,240,200,.25), transparent 60%), repeating-linear-gradient(0deg, transparent 0 23px, rgba(40,42,48,.10) 23px 24px), #9CA1A8",
    edge: "#5F646B", line: "rgba(40,42,48,.30)", tint: "rgba(255,255,255,.14)", ink: "rgba(255,255,255,.75)", inkAlt: "rgba(30,32,36,.55)",
  },
  corridor: {
    ground: "radial-gradient(circle at 12% 50%, rgba(255,170,60,.28), transparent 32%), radial-gradient(circle at 88% 50%, rgba(255,170,60,.22), transparent 30%), radial-gradient(circle at 40% 80%, rgba(0,0,0,.10) 0 5%, transparent 6%), #8A8279",
    edge: "#5A534B", line: "rgba(35,28,20,.30)", tint: "rgba(255,255,255,.12)", ink: "rgba(255,245,230,.8)", inkAlt: "rgba(40,30,20,.55)",
  },
  yard: {
    ground: "radial-gradient(ellipse at 15% 20%, rgba(110,160,70,.55) 0 12%, transparent 22%), radial-gradient(ellipse at 85% 75%, rgba(110,160,70,.5) 0 10%, transparent 20%), radial-gradient(circle at 60% 40%, rgba(90,60,30,.15) 0 4%, transparent 5%), radial-gradient(circle at 30% 65%, rgba(255,255,255,.12) 0 3%, transparent 4%), #C9A87C",
    edge: "#94754F", line: "rgba(90,60,30,.25)", tint: "rgba(255,255,255,.16)", ink: "rgba(90,60,30,.7)", inkAlt: "rgba(255,250,240,.85)",
  },
  wall: {
    ground: "repeating-linear-gradient(0deg, transparent 0 15px, rgba(60,50,40,.16) 15px 17px), repeating-linear-gradient(90deg, transparent 0 31px, rgba(60,50,40,.12) 31px 33px), radial-gradient(ellipse at 70% 30%, rgba(120,170,90,.35) 0 8%, transparent 14%), #A59B8E",
    edge: "#6E655A", line: "rgba(50,40,30,.28)", tint: "rgba(255,255,255,.14)", ink: "rgba(255,250,240,.8)", inkAlt: "rgba(50,40,30,.6)",
  },
  gate: {
    ground: "radial-gradient(ellipse at 25% 15%, rgba(255,255,255,.25) 0 10%, transparent 24%), radial-gradient(circle at 70% 60%, rgba(255,220,90,.7) 0 1.2%, transparent 1.6%), radial-gradient(circle at 20% 80%, rgba(255,255,255,.8) 0 1%, transparent 1.4%), radial-gradient(circle at 85% 25%, rgba(255,140,170,.8) 0 1.1%, transparent 1.5%), radial-gradient(ellipse at 60% 90%, rgba(70,130,40,.35) 0 20%, transparent 40%), #8CC75F",
    edge: "#5E9A38", line: "rgba(40,80,20,.22)", tint: "rgba(255,255,255,.18)", ink: "rgba(40,80,20,.7)", inkAlt: "rgba(255,255,240,.9)",
  },
};
const OLD = { ground: "#94CF63", edge: "#6fb33a", line: "transparent", tint: "#F1F9E6", ink: "#4F8A22", inkAlt: "#F1F9E6" };

export interface Highlights {
  targets?: number[];
  pending?: number | null;
  steps?: number[];
  /** Squares where moving would get you struck, and for how much. */
  danger?: Map<number, number>;
  /** The chance one enemy jab hits you (shown on danger squares). */
  jab?: number;
  /** Enemy squares the selected move card can capture on (with an attack that knocks it out). */
  captures?: number[];
  /** The combo you're building: numbered markers on each step's square. */
  combo?: { sq: number; n: number }[];
  /** The enemy the details panel is about (its square), and the squares it covers. */
  inspect?: number;
  cover?: number[];
}

/** Firecracker crate and boulder: pixel sprites from the Pixel Atlas (public/silat/pixel). */
function Crate() {
  // eslint-disable-next-line @next/next/no-img-element -- tiny pixel sprite
  return <img src="/silat/pixel/obj-petasan.png" alt="" className="sl-obj px" />;
}
function Boulder() {
  // eslint-disable-next-line @next/next/no-img-element -- tiny pixel sprite
  return <img src="/silat/pixel/obj-batu.png" alt="" className="sl-obj px" />;
}

const FX_TEXT: Partial<Record<Fx["t"], (f: Fx) => [string, string]>> = {
  dmg: (f) => [`-${"n" in f ? f.n : ""}`, "hero" in f && f.hero ? "#FF4B4B" : "#FF9600"],
  block: (f) => [`${"n" in f ? f.n : ""} blocked`, "#2F6E00"],
  ko: () => ["KO!", "#FFC800"],
  ringout: () => ["RING OUT", "#FFC800"],
  boom: () => ["BOOM", "#FF9600"],
  miss: () => ["miss", "#6F6F6F"],
  dodge: () => ["dodge", "#46A302"],
  promote: () => ["QUEEN!", "#CE82FF"],
  castle: () => ["CASTLES!", "#FFC800"],
  summon: () => ["+PAWN", "#CE82FF"],
  react: () => ["STRIKES!", "#FF4B4B"],
  slam: () => ["HANTAM!", "#FF4B4B"],
  gold: (f) => [`+${"n" in f ? f.n : ""} gold`, "#FFC800"],
  roll: (f) => (f.t === "roll" ? [`d20: ${f.n}${f.ok ? " ✓" : " ✗"}`, f.ok === !!f.hero ? "#58CC02" : "#FF4B4B"] : ["", ""]),
  fury: () => ["MURKA!", "#FF4B4B"],
  guard: (f) => [`+${"n" in f ? f.n : ""} shield`, "#1CB0F6"],
  command: () => ["ORDERS!", "#CE82FF"],
  gate: (f) => (f.t === "gate" && f.open ? ["GATE OPEN!", "#58CC02"] : ["", ""]),
  heal: (f) => [`+${"n" in f ? f.n : ""}`, "#58CC02"],
  capture: () => ["CAPTURE!", "#1CB0F6"],
  parry: () => ["SIAP!", "#58CC02"],
  crit: () => ["SEMPURNA!", "#FFC800"],
  stumble: () => ["TERJATUH!", "#58CC02"],
};

export function SilatBoard({
  fight: s,
  hl = {},
  preview,
  onTap,
  onHover,
  fxKey,
  combo = 0,
}: {
  fight: Fight;
  hl?: Highlights;
  /** What the board will look like after the selected card. Drawn as ghosts on the real board. */
  preview?: Fight;
  onTap?: (sq: number) => void;
  /** The mouse is over this square (null: it left the board). Mouse only: touch uses taps. */
  onHover?: (sq: number | null) => void;
  fxKey: number;
  combo?: number;
}) {
  const n = s.n;
  const cell = 100 / n;
  const look = s.scene ? SCENES[s.scene] : OLD;
  const at = (sq: number): CSSProperties => ({ width: `${cell}%`, height: `${cell}%`, transform: `translate(${col(s, sq) * 100}%, ${row(s, sq) * 100}%)` });
  const targets = new Set(hl.targets ?? []);
  const steps = new Set(hl.steps ?? []);
  // Intents: a badge on each acting enemy, and a red tint on the square it will hit. No paths.
  // While previewing a card, these show what the enemies would do after it.
  const p = preview ?? s;
  const live = p.status === "play" || p.status === "enemy" ? p.intents.filter((it, i) => intentValid(p, it) && (p.status !== "enemy" || i >= p.enemyStep)) : [];
  const badges = new Map<number, { ord: number; it: Intent; hit: number }>();
  const danger = new Map<number, number>();
  live.forEach((it) => {
    const u = p.units.find((x) => x.id === it.id)!;
    const m = it.type === "special" ? moveDef(it.move) : undefined;
    const hit = m ? (ATTACK_KINDS.has(m.kind) ? (m.damage !== undefined ? m.damage + (u.empower ?? 0) : unitHit(u)) : 0) : unitHit(u);
    badges.set(it.id, { ord: p.intents.indexOf(it) + 1, it, hit });
    if (it.type === "special") {
      for (const sq of specialDanger(p, u, it)) if (!p.units.some((v) => v.sq === sq)) danger.set(sq, (danger.get(sq) ?? 0) + hit);
      return;
    }
    if (it.type === "slam") {
      // Tint the whole area (that's where you'd get hit), but not squares holding its own pieces.
      for (const sq of slamArea(p, it.center)) if (sq !== u.sq && !p.units.some((v) => v.sq === sq)) danger.set(sq, (danger.get(sq) ?? 0) + hit);
      return;
    }
    const sq = it.type === "strike" ? it.target : it.type === "charge" ? chargeEnd(p, it) : null;
    if (sq !== null && sq !== undefined && (it.type === "strike" || occupant(p, sq))) danger.set(sq, (danger.get(sq) ?? 0) + hit);
  });

  // Preview: ghosts where things will end up, and what happens to each piece, on top of the real board.
  type Ghost = { key: string; sq: number; draw: "unit" | "hero" | "batu"; code?: Kind };
  const ghosts: Ghost[] = [];
  const marks = new Map<number, { dmg: number; gone?: "OFF" | "KO" | "BOOM" }>();
  if (preview) {
    for (const u of s.units) {
      const v = preview.units.find((x) => x.id === u.id);
      if (!v) {
        const off = preview.fx.some((f) => f.t === "ringout" && f.id === u.id);
        marks.set(u.sq, { dmg: 0, gone: off ? "OFF" : "KO" });
        continue;
      }
      if (v.sq !== u.sq) ghosts.push({ key: `u${u.id}`, sq: v.sq, draw: "unit", code: v.kind });
      if (v.hp < u.hp) marks.set(u.sq, { dmg: u.hp - v.hp });
    }
    for (const t of s.things) {
      const v = preview.things.find((x) => x.id === t.id);
      if (!v) { marks.set(t.sq, { dmg: 0, gone: t.kind === "petasan" ? "BOOM" : "OFF" }); continue; }
      if (v.sq !== t.sq && t.kind === "batu") ghosts.push({ key: `t${t.id}`, sq: v.sq, draw: "batu" });
    }
    if (preview.hero.sq !== s.hero.sq) ghosts.push({ key: "hero", sq: preview.hero.sq, draw: "hero" });
    const hurt = s.hero.hp - preview.hero.hp;
    if (hurt > 0) marks.set(preview.hero.sq, { dmg: hurt });
  }

  // Pieces that just left the board: keep drawing them for a moment while they fly off or fade.
  type Leaving = { id: number; kind: Kind; from: number; tx: number; ty: number };
  const [snap, setSnap] = useState<{ key: number; units: Fight["units"]; leaving: Leaving[]; heroSq: number; stepped: boolean; left: boolean }>({ key: fxKey, units: s.units, leaving: [], heroSq: s.hero.sq, stepped: false, left: false });
  if (snap.key !== fxKey) {
    const leaving = snap.units
      .filter((u) => !s.units.some((x) => x.id === u.id))
      .map((u) => {
        const f = s.fx.find((x): x is Extract<Fx, { t: "ko" | "ringout" }> => (x.t === "ko" || x.t === "ringout") && x.id === u.id);
        const end = f?.sq ?? u.sq;
        const [dx, dy] = f?.t === "ringout" && f.dir !== undefined ? DIRS[f.dir] : [0, 0];
        return { id: u.id, kind: u.kind, from: u.sq, tx: (col(s, end) - col(s, u.sq) + dx * 1.6) * 100, ty: (row(s, end) - row(s, u.sq) + dy * 1.6) * 100 };
      });
    // The hero's sprite faces right: turn it to face the way it last kicked or walked.
    const lunge = s.fx.find((x): x is Extract<Fx, { t: "lunge" }> => x.t === "lunge");
    const dx = lunge ? DIRS[lunge.dir][0] : col(s, s.hero.sq) - col(s, snap.heroSq);
    setSnap({ key: fxKey, units: s.units, leaving, heroSq: s.hero.sq, stepped: snap.heroSq !== s.hero.sq, left: dx < 0 ? true : dx > 0 ? false : snap.left });
  }
  const arrowAngle = (u: { sq: number }, it: Intent) => {
    if (it.type === "charge") return it.dir * 45;
    if (it.type === "slam") return 0;
    if (it.type === "special") {
      const kind = moveDef(it.move)?.kind;
      if (kind === "beam" && it.dir !== undefined) return it.dir * 45;
      if ((kind !== "kick" && kind !== "pounce") || it.target === undefined) return 0;
      return Math.round((Math.atan2(row(s, it.target) - row(s, u.sq), col(s, it.target) - col(s, u.sq)) * 180) / Math.PI) + 90;
    }
    const to = it.type === "move" ? it.to : it.target;
    return Math.round((Math.atan2(row(s, to) - row(s, u.sq), col(s, to) - col(s, u.sq)) * 180) / Math.PI) + 90;
  };

  return (
    <div className={`sl-board${preview ? " preview" : ""}`} onPointerLeave={() => onHover?.(null)} style={{ background: look.ground, boxShadow: `0 6px 0 ${look.edge}${preview ? ", 0 0 0 3px #ffc800" : ""}` }}>
      {s.tint && <div className="sl-tint" style={{ background: s.tint }} aria-hidden="true" />}
      {s.scene === "cell" && <div className="sl-bars" aria-hidden="true" />}
      <div className="sl-grid" style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }}>
        {Array.from({ length: n * n }, (_, sq) => {
          const r = row(s, sq), cc = col(s, sq);
          const light = (r + cc) % 2 === 0;
          const mud = s.mud.includes(sq);
          const bg = mud ? (light ? "#C9A27A" : "#B48A60") : light ? look.tint : "transparent";
          const label = `${FILES[cc]}${n - r}`;
          return (
            <button key={sq} type="button" className="sl-sq" style={{ background: bg, boxShadow: `inset 0 0 0 0.5px ${look.line}` }} aria-label={`${label}${s.gate === sq ? (s.gateOpen ? ", the gate (open: step here to escape)" : ", the gate (locked)") : ""}${danger.has(sq) ? `, will be hit for ${danger.get(sq)}` : ""}`} onClick={() => onTap?.(sq)} onPointerEnter={(e) => { if (e.pointerType === "mouse") onHover?.(sq); }}>
              {cc === 0 && <span className="coord" style={{ left: 3, top: 1, color: light ? look.ink : look.inkAlt }}>{n - r}</span>}
              {r === n - 1 && <span className="coord" style={{ right: 3, bottom: 0, color: light ? look.ink : look.inkAlt }}>{FILES[cc]}</span>}
              {danger.has(sq) && (
                <span className="sl-danger" aria-hidden="true"><span>{danger.get(sq)}</span></span>
              )}
              {steps.has(sq) && (
                <>
                  <span className={`sl-dot${hl.danger?.get(sq) ? " risky" : ""}`}>{hl.danger?.get(sq) ? hl.danger.get(sq) : ""}</span>
                  {!!hl.danger?.get(sq) && hl.jab !== undefined && <span className="sl-odds">{Math.round(hl.jab * 100)}%</span>}
                </>
              )}
              {s.hop === sq && <span className="sl-hop" />}
              {s.gate === sq && (
                <span className={`sl-gate${s.gateOpen ? " open" : ""}`} aria-hidden="true">
                  {/* eslint-disable-next-line @next/next/no-img-element -- pixel sprite */}
                  <img src={s.gateOpen ? "/silat/pixel/gate-open.png" : "/silat/pixel/gate-locked.png"} alt="" className="px" />
                </span>
              )}
            </button>
          );
        })}
      </div>

      {s.things.map((t) => (
        <div key={`t${t.id}`} className="sl-tok" style={at(t.sq)}>
          {t.kind === "petasan" ? <Crate /> : <Boulder />}
        </div>
      ))}
      {s.units.map((u) => {
        const b = badges.get(u.id);
        const special = b?.it.type === "special" ? moveDef(b.it.move) : undefined;
        const attack = b && b.it.type !== "move" && (!special || ATTACK_KINDS.has(special.kind));
        return (
          <div key={`u${u.id}`} className={`sl-tok${marks.get(u.sq)?.gone ? " sl-doomed" : ""}${u.boss ? " sl-bossglow" : ""}`} style={at(u.sq)}>
            <Sprite
              id={spriteFor(u.kind, u.boss)}
              play="hit"
              nonce={s.fx.some((x) => x.t === "dmg" && !x.hero && x.sq === u.sq) ? fxKey : 0}
              fallback={<Piece code={u.kind} />}
            />
            <span className="sl-hp" style={u.boss ? { borderColor: "#B81F1F" } : undefined}>{u.hp}</span>
            {!!u.block && <span className="sl-eblock" aria-label={`shield ${u.block}`}>{u.block}</span>}
            {!!u.empower && <span className="sl-empower" aria-label={`commanded: hits +${u.empower}`}>+{u.empower}</span>}
            {b && (
              <span key={JSON.stringify(b.it)} className="sl-intent" style={{ background: attack ? "#FF4B4B" : special ? SPECIAL_COLOR[special.kind] : "#8C8C8C" }}
                aria-label={`acts ${b.ord}${special ? `, ${special.name}` : ""}${attack ? `, hits for ${b.hit}` : special ? "" : ", moves"}`} title={special ? `${special.name}: ${b.it.type === "special" ? moveText(b.it.move) : ""}` : undefined}>
                {b.ord}
                <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true" style={{ transform: `rotate(${arrowAngle(u, b.it)}deg)` }}>
                  {special ? (
                    <path d={SPECIAL_ICON[special.kind]} stroke="#fff" strokeWidth="1.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                  ) : b.it.type === "slam" ? (
                    <path d="M5 1 V3 M5 7 V9 M1 5 H3 M7 5 H9 M2 2 L3.4 3.4 M6.6 6.6 L8 8 M8 2 L6.6 3.4 M3.4 6.6 L2 8" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" />
                  ) : b.it.type === "strike" ? (
                    <path d="M5 1 V9 M1 5 H9" stroke="#fff" strokeWidth="2" strokeLinecap="round" />
                  ) : (
                    <path d="M5 9 V2 M2 4.5 L5 1.5 L8 4.5" stroke="#fff" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                  )}
                </svg>
                {attack && b.hit}
              </span>
            )}
            {u.target && !b && <span className="sl-badge" style={{ background: "#FFC800", color: "#5C4200" }}>★</span>}
            {!!u.traits?.length && (
              <span className="sl-trait" aria-label={`Powers: ${u.traits.map((t) => TRAITS[t].name).join(", ")}`} title={u.traits.map((t) => `${TRAITS[t].name}: ${TRAITS[t].text}`).join("\n")}>
                {u.traits.map((t) => TRAITS[t].name[0]).join("")}
              </span>
            )}
            {isGuarded(s, u) && (
              <span className="sl-guard" aria-label="guarded">
                <svg viewBox="0 0 24 26" aria-hidden="true"><path d="M12 1 L22 5 V12 C22 19 17 23 12 25 C7 23 2 19 2 12 V5z" fill="#1CB0F6" stroke="#fff" strokeWidth="2.5" /></svg>
              </span>
            )}
          </div>
        );
      })}
      <div className="sl-tok" style={{ ...at(s.hero.sq), zIndex: 2 }}>
        {RIVE_ON ? (
          // One Rive instance for the whole fight: reloading it would replay the file's splash screen.
          <RiveHero
            kick={s.fx.some((x) => x.t === "lunge" || x.t === "capture") ? fxKey : 0}
            hit={s.fx.some((x) => x.t === "dmg" && x.hero) ? fxKey : 0}
            fallback={<SilatKing prisoner />}
          />
        ) : (() => {
          const l = s.fx.find((x): x is Extract<Fx, { t: "lunge" }> => x.t === "lunge");
          const [dx, dy] = l ? DIRS[l.dir] : [0, 0];
          const here = (t: Fx["t"]) => s.fx.some((x) => x.t === t && x.sq === s.hero.sq);
          // Which of the hero's animations this batch of effects calls for, most important first.
          const play: Anim | undefined = s.fx.some((x) => x.t === "dmg" && x.hero) ? "hit"
            : l || s.fx.some((x) => x.t === "capture") ? "kick"
            : here("dodge") ? "dodge"
            : here("block") || here("parry") ? "block"
            : snap.stepped ? "step"
            : undefined;
          return (
            <span key={l ? `l${fxKey}` : "still"} className={l ? "sl-lunge" : undefined} style={{ display: "block", width: "100%", height: "100%", ["--lx" as string]: `${dx * 34}%`, ["--ly" as string]: `${dy * 34}%` }}>
              <span style={{ display: "block", width: "100%", height: "100%", transform: snap.left ? "scaleX(-1)" : undefined }}>
                <Sprite
                  id="hero"
                  play={play}
                  nonce={play ? fxKey : 0}
                  hold={s.status === "lost" ? "ko" : s.status === "won" ? "win" : undefined}
                  fallback={<SilatKing prisoner />}
                />
              </span>
            </span>
          );
        })()}
        {s.hero.block > 0 && (
          <span className="sl-hp" style={{ borderColor: "#46A302", color: "#2F6E00", gap: 2 }} aria-label={`Block ${s.hero.block}`}>
            <svg width="9" height="10" viewBox="0 0 24 26" aria-hidden="true" style={{ width: 9, height: 10, margin: 0, filter: "none" }}><path d="M12 1 L22 5 V12 C22 19 17 23 12 25 C7 23 2 19 2 12 V5z" fill="#46A302" /></svg>
            {s.hero.block}
          </span>
        )}
      </div>

      {snap.leaving.map((g) => (
        <div key={`x${snap.key}-${g.id}`} className="sl-tok" style={{ ...at(g.from), zIndex: 5 }}>
          <span className="sl-leave" style={{ ["--tx" as string]: `${g.tx}%`, ["--ty" as string]: `${g.ty}%` }}><Sprite id={spriteFor(g.kind)} fallback={<Piece code={g.kind} />} /></span>
        </div>
      ))}

      {ghosts.map((g) => (
        <div key={`g-${g.key}`} className="sl-tok sl-ghost" style={{ ...at(g.sq), zIndex: 3 }}>
          {g.draw === "unit" ? <Sprite id={spriteFor(g.code!)} fallback={<Piece code={g.code!} />} /> : g.draw === "hero" ? <Sprite id="hero" fallback={<SilatKing prisoner />} /> : <Boulder />}
        </div>
      ))}
      {[...marks].map(([sq, m]) => (
        <div key={`m${sq}`} className="sl-tok" style={{ ...at(sq), zIndex: 5 }}>
          <span className={`sl-mark${m.gone ? " gone" : ""}`}>{m.gone ?? `-${m.dmg}`}</span>
        </div>
      ))}

      {(() => {
        // Several combo steps on one square stack their numbers.
        const at2 = new Map<number, number[]>();
        for (const c of hl.combo ?? []) at2.set(c.sq, [...(at2.get(c.sq) ?? []), c.n]);
        return [...at2].map(([sq, ns]) => (
          <div key={`q${sq}`} className="sl-tok" style={{ ...at(sq), zIndex: 7 }}>
            <span className="sl-qmark">{ns.join("·")}</span>
          </div>
        ));
      })()}

      {(hl.cover ?? []).map((sq) => (
        <div key={`cv${sq}`} className="sl-tok" style={{ ...at(sq), zIndex: 1 }} aria-hidden="true"><span className="sl-cover" /></div>
      ))}
      {hl.inspect !== undefined && (
        <div className="sl-tok" style={{ ...at(hl.inspect), zIndex: 4 }} aria-hidden="true"><span className="sl-inspected" /></div>
      )}

      {(hl.captures ?? []).map((sq) => (
        <div key={`cap${sq}`} className="sl-tok" style={{ ...at(sq), zIndex: 4 }}>
          <span className="sl-capture" aria-label="capture">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 4 L14 14 M14 14 l-2.5 1 l1 -2.5 M20 4 L10 14 M10 14 l2.5 1 l-1 -2.5 M6 18 l2 -2 M18 18 l-2 -2" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" fill="none" /></svg>
          </span>
        </div>
      ))}
      {hl.pending !== null && hl.pending !== undefined && !targets.has(hl.pending) && (
        <div className="sl-tok" style={{ ...at(hl.pending), zIndex: 4 }}><span className="sl-target on" /></div>
      )}

      {[...targets].map((sq) => (
        <div key={`h${sq}`} className="sl-tok" style={{ ...at(sq), zIndex: 4 }}>
          <span className={`sl-target${hl.pending === sq ? " on" : ""}`} />
          {!!hl.danger?.get(sq) && <span className="sl-risk">-{hl.danger.get(sq)}</span>}
          {!!hl.danger?.get(sq) && hl.jab !== undefined && <span className="sl-odds">{Math.round(hl.jab * 100)}%</span>}
        </div>
      ))}

      {s.fx.map((f, i) => (f.t === "ko" || f.t === "ringout") ? (
        <div key={`b${fxKey}-${i}`} className="sl-tok" style={{ ...at(f.sq), zIndex: 6 }} aria-hidden="true">
          <span className="sl-burst">
            {Array.from({ length: 10 }, (_, k) => <i key={k} style={{ ["--a" as string]: `${k * 36 + (i * 17) % 36}deg`, ["--d" as string]: `${150 + (k % 3) * 45}%` }} />)}
          </span>
          <span className="sl-ring" />
        </div>
      ) : f.t === "roll" && RIVE_ON ? (
        <div key={`d${fxKey}-${i}`} className="sl-tok" style={{ ...at(f.sq), zIndex: 8 }}><RiveDice n={f.n} ok={f.ok === !!f.hero} /></div>
      ) : f.t === "slam" ? (
        <div key={`s${fxKey}-${i}`} className="sl-tok" style={{ ...at(f.sq), zIndex: 5 }} aria-hidden="true"><span className="sl-quake" /></div>
      ) : null)}
      {s.fx.some((f) => f.t === "ko" || f.t === "ringout") && <div key={`f${fxKey}`} className="sl-flash" aria-hidden="true" />}

      {combo >= 3 && (
        <div key={`c${fxKey}`} className="sl-combo">COMBO ×{combo}!</div>
      )}

      {(() => {
        const seen = new Map<number, number>();
        return s.fx.map((f, i) => {
          const txt = FX_TEXT[f.t]?.(f);
          if (!txt) return null;
          const k = seen.get(f.sq) ?? 0;
          seen.set(f.sq, k + 1);
          return (
            <div key={`${fxKey}-${i}`} className="sl-tok" style={{ ...at(f.sq), zIndex: 6 }}>
              <span className={`sl-float${f.t === "ko" || f.t === "ringout" || f.t === "fury" || f.t === "crit" ? " big" : ""}${f.t === "roll" ? " roll" : ""}`} style={{ color: txt[1], top: `${-k * 34}%`, animationDelay: `${f.t === "gold" ? 280 : Math.min(i, 6) * 90}ms` }}>{txt[0]}</span>
            </div>
          );
        });
      })()}
    </div>
  );
}
