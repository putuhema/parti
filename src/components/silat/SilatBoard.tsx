"use client";

import { useState, type CSSProperties } from "react";
import { Piece } from "@/components/chess/Board";
import { SilatKing } from "@/components/shell";
import { DIRS, PIECE, chargeEnd, col, intentValid, isGuarded, occupant, row, slamArea, type Fight, type Fx, type Intent, type Kind } from "@/lib/silat/rules";

const FILES = "abcdefgh";

export interface Highlights {
  targets?: number[];
  pending?: number | null;
  steps?: number[];
  /** Squares where moving would get you struck, and for how much. */
  danger?: Map<number, number>;
}

function Crate() {
  return (
    <svg viewBox="0 0 40 40" aria-hidden="true">
      <path d="M27 9 q3 -5 7 -4" stroke="#6F6F6F" strokeWidth="1.8" fill="none" strokeLinecap="round" />
      <circle cx="34.5" cy="5" r="2.2" fill="#FFC800" />
      <rect x="7" y="11" width="26" height="24" rx="4" fill="#FF4B4B" stroke="#B81F1F" strokeWidth="2" />
      <rect x="7" y="19" width="26" height="6" fill="#FFC800" />
    </svg>
  );
}
function Boulder() {
  return (
    <svg viewBox="0 0 40 40" aria-hidden="true">
      <path d="M8 32 C5 26 8 17 14 13 C19 9 27 10 31 15 C35 20 36 28 32 32z" fill="#9AA0A6" stroke="#5F6368" strokeWidth="2" strokeLinejoin="round" />
      <path d="M14 18 q4 -3 8 -1" stroke="#C7CBD0" strokeWidth="2.2" fill="none" strokeLinecap="round" />
    </svg>
  );
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
};

export function SilatBoard({
  fight: s,
  hl = {},
  preview,
  onTap,
  fxKey,
  combo = 0,
}: {
  fight: Fight;
  hl?: Highlights;
  /** What the board will look like after the selected card. Drawn as ghosts on the real board. */
  preview?: Fight;
  onTap?: (sq: number) => void;
  fxKey: number;
  combo?: number;
}) {
  const n = s.n;
  const cell = 100 / n;
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
    const hit = u.hit ?? PIECE[u.kind].hit;
    badges.set(it.id, { ord: p.intents.indexOf(it) + 1, it, hit });
    if (it.type === "slam") {
      for (const sq of slamArea(p, it.center)) if (sq !== u.sq) danger.set(sq, (danger.get(sq) ?? 0) + hit);
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
  const [snap, setSnap] = useState<{ key: number; units: Fight["units"]; leaving: Leaving[] }>({ key: fxKey, units: s.units, leaving: [] });
  if (snap.key !== fxKey) {
    const leaving = snap.units
      .filter((u) => !s.units.some((x) => x.id === u.id))
      .map((u) => {
        const f = s.fx.find((x): x is Extract<Fx, { t: "ko" | "ringout" }> => (x.t === "ko" || x.t === "ringout") && x.id === u.id);
        const end = f?.sq ?? u.sq;
        const [dx, dy] = f?.t === "ringout" && f.dir !== undefined ? DIRS[f.dir] : [0, 0];
        return { id: u.id, kind: u.kind, from: u.sq, tx: (col(s, end) - col(s, u.sq) + dx * 1.6) * 100, ty: (row(s, end) - row(s, u.sq) + dy * 1.6) * 100 };
      });
    setSnap({ key: fxKey, units: s.units, leaving });
  }
  const arrowAngle = (u: { sq: number }, it: Intent) => {
    if (it.type === "charge") return it.dir * 45;
    if (it.type === "slam") return 0;
    const to = it.type === "move" ? it.to : it.target;
    return Math.round((Math.atan2(row(s, to) - row(s, u.sq), col(s, to) - col(s, u.sq)) * 180) / Math.PI) + 90;
  };

  return (
    <div className={`sl-board${preview ? " preview" : ""}`}>
      <div className="sl-grid" style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }}>
        {Array.from({ length: n * n }, (_, sq) => {
          const r = row(s, sq), cc = col(s, sq);
          const light = (r + cc) % 2 === 0;
          const mud = s.mud.includes(sq);
          const bg = mud ? (light ? "#C9A27A" : "#B48A60") : light ? "#F1F9E6" : "#94CF63";
          const label = `${FILES[cc]}${n - r}`;
          return (
            <button key={sq} type="button" className="sl-sq" style={{ background: bg }} aria-label={danger.has(sq) ? `${label}, will be hit for ${danger.get(sq)}` : label} onClick={() => onTap?.(sq)}>
              {cc === 0 && <span className="coord" style={{ left: 3, top: 1, color: light ? "#4F8A22" : "#F1F9E6" }}>{n - r}</span>}
              {r === n - 1 && <span className="coord" style={{ right: 3, bottom: 0, color: light ? "#4F8A22" : "#F1F9E6" }}>{FILES[cc]}</span>}
              {danger.has(sq) && (
                <span className="sl-danger" aria-hidden="true"><span>{danger.get(sq)}</span></span>
              )}
              {steps.has(sq) && (
                <span className={`sl-dot${hl.danger?.get(sq) ? " risky" : ""}`}>{hl.danger?.get(sq) ? hl.danger.get(sq) : ""}</span>
              )}
              {s.hop === sq && <span className="sl-hop" />}
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
        const attack = b && b.it.type !== "move";
        return (
          <div key={`u${u.id}`} className={`sl-tok${marks.get(u.sq)?.gone ? " sl-doomed" : ""}`} style={at(u.sq)}>
            <Piece code={u.kind} />
            <span className="sl-hp" style={u.boss ? { borderColor: "#B81F1F" } : undefined}>{u.hp}</span>
            {b && (
              <span className="sl-intent" style={{ background: attack ? "#FF4B4B" : "#8C8C8C" }} aria-label={`acts ${b.ord}${attack ? `, hits for ${b.hit}` : ", moves"}`}>
                {b.ord}
                <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true" style={{ transform: `rotate(${arrowAngle(u, b.it)}deg)` }}>
                  {b.it.type === "slam" ? (
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
            {isGuarded(s, u) && (
              <span className="sl-guard" aria-label="guarded">
                <svg viewBox="0 0 24 26" aria-hidden="true"><path d="M12 1 L22 5 V12 C22 19 17 23 12 25 C7 23 2 19 2 12 V5z" fill="#1CB0F6" stroke="#fff" strokeWidth="2.5" /></svg>
              </span>
            )}
          </div>
        );
      })}
      <div className="sl-tok" style={{ ...at(s.hero.sq), zIndex: 2 }}>
        {(() => {
          const l = s.fx.find((x): x is Extract<Fx, { t: "lunge" }> => x.t === "lunge");
          const [dx, dy] = l ? DIRS[l.dir] : [0, 0];
          return (
            <span key={l ? `l${fxKey}` : "still"} className={l ? "sl-lunge" : undefined} style={{ display: "block", width: "100%", height: "100%", ["--lx" as string]: `${dx * 34}%`, ["--ly" as string]: `${dy * 34}%` }}>
              <SilatKing />
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
          <span className="sl-leave" style={{ ["--tx" as string]: `${g.tx}%`, ["--ty" as string]: `${g.ty}%` }}><Piece code={g.kind} /></span>
        </div>
      ))}

      {ghosts.map((g) => (
        <div key={`g-${g.key}`} className="sl-tok sl-ghost" style={{ ...at(g.sq), zIndex: 3 }}>
          {g.draw === "unit" ? <Piece code={g.code!} /> : g.draw === "hero" ? <SilatKing /> : <Boulder />}
        </div>
      ))}
      {[...marks].map(([sq, m]) => (
        <div key={`m${sq}`} className="sl-tok" style={{ ...at(sq), zIndex: 5 }}>
          <span className={`sl-mark${m.gone ? " gone" : ""}`}>{m.gone ?? `-${m.dmg}`}</span>
        </div>
      ))}

      {[...targets].map((sq) => (
        <div key={`h${sq}`} className="sl-tok" style={{ ...at(sq), zIndex: 4 }}>
          <span className={`sl-target${hl.pending === sq ? " on" : ""}`} />
          {!!hl.danger?.get(sq) && <span className="sl-risk">-{hl.danger.get(sq)}</span>}
        </div>
      ))}

      {s.fx.map((f, i) => (f.t === "ko" || f.t === "ringout") ? (
        <div key={`b${fxKey}-${i}`} className="sl-tok" style={{ ...at(f.sq), zIndex: 6 }} aria-hidden="true">
          <span className="sl-burst">
            {Array.from({ length: 10 }, (_, k) => <i key={k} style={{ ["--a" as string]: `${k * 36 + (i * 17) % 36}deg`, ["--d" as string]: `${150 + (k % 3) * 45}%` }} />)}
          </span>
          <span className="sl-ring" />
        </div>
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
              <span className={`sl-float${f.t === "ko" || f.t === "ringout" ? " big" : ""}`} style={{ color: txt[1], top: `${-k * 34}%`, animationDelay: `${f.t === "gold" ? 280 : Math.min(i, 6) * 90}ms` }}>{txt[0]}</span>
            </div>
          );
        });
      })()}
    </div>
  );
}
