"use client";

import type { CSSProperties } from "react";
import { Piece } from "@/components/chess/Board";
import { SilatKing } from "@/components/shell";
import { PIECE, chargeEnd, col, intentValid, occupant, row, type Fight, type Fx, type Intent } from "@/lib/silat/rules";

const FILES = "abcdefgh";

export interface Highlights {
  targets?: number[];
  pending?: number | null;
  steps?: number[];
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
/** Placeholder villager: a person in a peci and sarong. */
function Warga() {
  return (
    <svg viewBox="0 0 40 40" aria-hidden="true">
      <path d="M11 37 L13 22 a7 7 0 0 1 14 0 L29 37z" fill="#2BB673" stroke="#1E7A4C" strokeWidth="2" strokeLinejoin="round" />
      <path d="M13.5 28 h13 M13 32.5 h14" stroke="#FFC800" strokeWidth="2" />
      <circle cx="20" cy="13" r="6.5" fill="#C98B5B" stroke="#7A4E2D" strokeWidth="2" />
      <path d="M13.8 10.5 a6.2 4 0 0 1 12.4 0 v-2 a6.2 3 0 0 0 -12.4 0z" fill="#262626" />
      <circle cx="17.6" cy="13.6" r="1" fill="#3C2414" /><circle cx="22.4" cy="13.6" r="1" fill="#3C2414" />
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
  ko: () => ["KO", "#FFC800"],
  ringout: () => ["RING OUT", "#FFC800"],
  boom: () => ["BOOM", "#FF9600"],
  miss: () => ["miss", "#6F6F6F"],
  dodge: () => ["dodge", "#46A302"],
  promote: () => ["QUEEN!", "#CE82FF"],
  castle: () => ["CASTLES!", "#FFC800"],
  lost: () => ["VILLAGER LOST", "#FF4B4B"],
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
  preview?: boolean;
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
  const live = s.status === "play" || s.status === "enemy" ? s.intents.filter((it, i) => intentValid(s, it) && (s.status !== "enemy" || i >= s.enemyStep)) : [];
  const badges = new Map<number, { ord: number; it: Intent; hit: number }>();
  const danger = new Map<number, number>();
  live.forEach((it) => {
    const u = s.units.find((x) => x.id === it.id)!;
    const hit = u.hit ?? PIECE[u.kind].hit;
    badges.set(it.id, { ord: s.intents.indexOf(it) + 1, it, hit });
    const sq = it.type === "strike" ? it.target : it.type === "charge" ? chargeEnd(s, it) : null;
    if (sq !== null && sq !== undefined && (it.type === "strike" || occupant(s, sq))) danger.set(sq, (danger.get(sq) ?? 0) + hit);
  });
  const arrowAngle = (u: { sq: number }, it: Intent) => {
    if (it.type === "charge") return it.dir * 45;
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
              {steps.has(sq) && <span className="sl-dot" />}
              {s.hop === sq && <span className="sl-hop" />}
            </button>
          );
        })}
      </div>

      {s.things.map((t) => (
        <div key={`t${t.id}`} className="sl-tok" style={at(t.sq)}>
          {t.kind === "petasan" ? <Crate /> : t.kind === "warga" ? <Warga /> : <Boulder />}
          {t.kind === "warga" && <span className="sl-hp" style={{ borderColor: "#1E7A4C", color: "#1E7A4C" }}>{t.hp}</span>}
        </div>
      ))}
      {s.units.map((u) => {
        const b = badges.get(u.id);
        const attack = b && b.it.type !== "move";
        return (
          <div key={`u${u.id}`} className="sl-tok" style={at(u.sq)}>
            <Piece code={u.kind} />
            <span className="sl-hp" style={u.boss ? { borderColor: "#B81F1F" } : undefined}>{u.hp}</span>
            {b && (
              <span className="sl-intent" style={{ background: attack ? "#FF4B4B" : "#8C8C8C" }} aria-label={`acts ${b.ord}${attack ? `, hits for ${b.hit}` : ", moves"}`}>
                {b.ord}
                <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true" style={{ transform: `rotate(${arrowAngle(u, b.it)}deg)` }}>
                  {b.it.type === "strike" ? (
                    <path d="M5 1 V9 M1 5 H9" stroke="#fff" strokeWidth="2" strokeLinecap="round" />
                  ) : (
                    <path d="M5 9 V2 M2 4.5 L5 1.5 L8 4.5" stroke="#fff" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                  )}
                </svg>
                {attack && b.hit}
              </span>
            )}
            {u.target && !b && <span className="sl-badge" style={{ background: "#FFC800", color: "#5C4200" }}>★</span>}
          </div>
        );
      })}
      <div className="sl-tok" style={{ ...at(s.hero.sq), zIndex: 2 }}>
        <SilatKing />
        {s.hero.block > 0 && (
          <span className="sl-hp" style={{ borderColor: "#46A302", color: "#2F6E00", gap: 2 }} aria-label={`Block ${s.hero.block}`}>
            <svg width="9" height="10" viewBox="0 0 24 26" aria-hidden="true" style={{ width: 9, height: 10, margin: 0, filter: "none" }}><path d="M12 1 L22 5 V12 C22 19 17 23 12 25 C7 23 2 19 2 12 V5z" fill="#46A302" /></svg>
            {s.hero.block}
          </span>
        )}
      </div>

      {[...targets].map((sq) => (
        <div key={`h${sq}`} className="sl-tok" style={{ ...at(sq), zIndex: 4 }}><span className={`sl-target${hl.pending === sq ? " on" : ""}`} /></div>
      ))}

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
              <span className="sl-float" style={{ color: txt[1], top: `${-k * 34}%`, animationDelay: `${Math.min(i, 6) * 90}ms` }}>{txt[0]}</span>
            </div>
          );
        });
      })()}
    </div>
  );
}
