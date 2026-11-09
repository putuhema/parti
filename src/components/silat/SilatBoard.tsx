"use client";

import type { CSSProperties } from "react";
import { Piece } from "@/components/chess/Board";
import { SilatKing } from "@/components/shell";
import { DIRS, PIECE, chargeEnd, col, intentValid, row, type Fight, type Fx } from "@/lib/silat/rules";

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
  dmg: (f) => [`-${"n" in f ? f.n : ""}`, "hero" in f && f.hero ? "#FF4B4B" : "#FFFFFF"],
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
  const order = new Map(s.intents.filter((it) => intentValid(s, it)).map((it, i) => [it.id, i + 1]));
  const c = (sq: number) => ({ x: col(s, sq) + 0.5, y: row(s, sq) + 0.5 });

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
            <button key={sq} type="button" className="sl-sq" style={{ background: bg }} aria-label={label} onClick={() => onTap?.(sq)}>
              {cc === 0 && <span className="coord" style={{ left: 3, top: 1, color: light ? "#4F8A22" : "#F1F9E6" }}>{n - r}</span>}
              {r === n - 1 && <span className="coord" style={{ right: 3, bottom: 0, color: light ? "#4F8A22" : "#F1F9E6" }}>{FILES[cc]}</span>}
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
        const ord = order.get(u.id);
        return (
          <div key={`u${u.id}`} className="sl-tok" style={at(u.sq)}>
            <Piece code={u.kind} />
            <span className="sl-hp" style={u.boss ? { borderColor: "#B81F1F" } : undefined}>{u.hp}</span>
            {ord && <span className="sl-badge" style={{ background: "#FF4B4B" }}>{ord}</span>}
            {u.target && !ord && <span className="sl-badge" style={{ background: "#FFC800", color: "#5C4200" }}>★</span>}
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

      <svg style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none", overflow: "visible", zIndex: 3 }} viewBox={`0 0 ${n} ${n}`} aria-hidden="true">
        <defs>
          <marker id="sl-head" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="4" markerHeight="4" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10z" fill="#EA2B2B" /></marker>
          <marker id="sl-head-g" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="4" markerHeight="4" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10z" fill="#8C8C8C" /></marker>
        </defs>
        {s.status !== "won" && s.status !== "lost" && s.intents.map((it) => {
          const u = s.units.find((x) => x.id === it.id);
          if (!u || !intentValid(s, it)) return null;
          const a = c(u.sq);
          if (it.type === "move") {
            const b = c(it.to);
            return <path key={`i${it.id}`} d={`M${a.x} ${a.y} L${b.x} ${b.y}`} stroke="#8C8C8C" strokeWidth=".06" strokeDasharray=".12 .1" fill="none" markerEnd="url(#sl-head-g)" opacity=".8" />;
          }
          if (it.type === "charge") {
            const end = chargeEnd(s, it) ?? u.sq;
            const [dx, dy] = DIRS[it.dir];
            const stop = c(end);
            const tip = { x: stop.x - dx * 0.3, y: stop.y - dy * 0.3 };
            return <path key={`i${it.id}`} d={`M${a.x + dx * 0.3} ${a.y + dy * 0.3} L${tip.x} ${tip.y}`} stroke="#EA2B2B" strokeWidth=".09" strokeDasharray=".2 .12" fill="none" markerEnd="url(#sl-head)" />;
          }
          const b = c(it.target);
          return (
            <g key={`i${it.id}`}>
              <path d={`M${a.x} ${a.y} L${b.x} ${b.y}`} stroke="#EA2B2B" strokeWidth=".06" strokeDasharray=".14 .1" fill="none" opacity=".75" />
              <path d={`M${b.x - 0.2} ${b.y - 0.2} L${b.x + 0.2} ${b.y + 0.2} M${b.x + 0.2} ${b.y - 0.2} L${b.x - 0.2} ${b.y + 0.2}`} stroke="#EA2B2B" strokeWidth=".09" strokeLinecap="round" />
              <text x={b.x + 0.28} y={b.y - 0.22} fontSize=".26" fontWeight="900" fill="#B81F1F">{u.hit ?? PIECE[u.kind].hit}</text>
            </g>
          );
        })}
      </svg>

      {[...targets].map((sq) => (
        <div key={`h${sq}`} className="sl-tok" style={{ ...at(sq), zIndex: 4 }}><span className={`sl-target${hl.pending === sq ? " on" : ""}`} /></div>
      ))}

      {combo >= 3 && (
        <div key={`c${fxKey}`} className="sl-combo">COMBO ×{combo}!</div>
      )}

      {s.fx.map((f, i) => {
        const txt = FX_TEXT[f.t]?.(f);
        if (!txt) return null;
        return (
          <div key={`${fxKey}-${i}`} className="sl-float" style={{ ...at(f.sq), color: txt[1], animationDelay: `${Math.min(i, 6) * 70}ms` }}>
            {txt[0]}
          </div>
        );
      })}
    </div>
  );
}
