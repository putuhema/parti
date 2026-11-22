"use client";

import type { FunctionReturnType } from "convex/server";
import type { CSSProperties, ReactNode } from "react";
import { api } from "../../../convex/_generated/api";
import { guardAt, isLaser, key, watched, type Action, type Level, type Pos, type Role, type Sim } from "../../../convex/lib/heist/rules";

export type HeistView = NonNullable<FunctionReturnType<typeof api.heist.view>>;
export type HeistGameView = NonNullable<HeistView["game"]>;

export const GAME_NAME = "Heist Night";
export const RULE = "A co-op stealth puzzle for two. Each round you both plan up to 3 moves in secret, then watch them play out together. Sneak past guards, dodge cameras and lasers, grab the gem and both reach the van.";

export const ROLE_LOOK: Record<Role, { name: string; icon: string; color: string; edge: string; power: string }> = {
  cat: { name: "Cat", icon: "🐈‍⬛", color: "#FF9600", edge: "#CC7700", power: "Picks locked doors 🚪" },
  hacker: { name: "Hacker", icon: "🧑‍💻", color: "#1CB0F6", edge: "#1478A8", power: "Hacks terminals 🖥️ to kill cameras and lasers" },
};

export const ACTION_ICON: Record<Action, string> = { n: "↑", e: "→", s: "↓", w: "←", wait: "⏸", hack: "⚡" };

const CAM_ROT: Record<string, number> = { "^": -90, ">": 0, v: 90, "<": 180 };

type Mark = { pos: Pos; role: Role; step: number; ghost?: boolean };
type Ping = { x: number; y: number; n: number; mine: boolean };

/** The museum at night: tiles, what's watched, thieves, guards, plans and pings. */
export function Board({ lv, sim, marks = [], pings = [], targets = [], bust, onTap, children }: {
  lv: Level;
  sim: Sim;
  marks?: Mark[];
  pings?: Ping[];
  targets?: Pos[];
  bust?: Pos | null;
  onTap?: (p: Pos) => void;
  children?: ReactNode;
}) {
  const seen = watched(lv, sim);
  const guardTiles = new Set(seen.guards.flatMap((g) => g.tiles.map(key)));
  const camTiles = new Set(seen.cameras.flatMap((c) => c.tiles.map(key)));
  const targetSet = new Set(targets.map(key));
  const hacked = sim.hack > 0;
  const pct = (p: Pos): CSSProperties => ({ left: `${(p.x / lv.w) * 100}%`, top: `${(p.y / lv.h) * 100}%`, width: `${100 / lv.w}%`, height: `${100 / lv.h}%` });

  return (
    <div className="hz-board" style={{ aspectRatio: `${lv.w} / ${lv.h}`, "--cols": lv.w } as CSSProperties}>
      {lv.grid.flatMap((row, y) => row.map((c, x) => {
        const p = { x, y }, k = key(p);
        let cls = "hz-tile";
        let body: ReactNode = null;
        if (c === "#") cls += " wall";
        else if (c === "T") { cls += ` wall term${hacked ? " on" : ""}`; body = "🖥️"; }
        else if (CAM_ROT[c] !== undefined) { cls += ` wall cam${hacked ? " off" : ""}`; body = <span style={{ transform: `rotate(${CAM_ROT[c]}deg)` }}>📹</span>; }
        else {
          cls += (x + y) % 2 ? " floor" : " floor alt";
          if (c === "D") { const open = sim.open.includes(k); cls += open ? " door open" : " door"; body = open ? null : "🚪"; }
          else if (c === "h") body = "🪴";
          else if (c === "E") body = "🚐";
          else if (c === "*" && !sim.gem) body = <span className="hz-gem">💎</span>;
          else if (c === "$" && !sim.coins.includes(k)) body = "🪙";
          if (isLaser(lv, p)) cls += ` laser ${c === "|" ? "v" : "h"}${hacked ? " off" : ""}`;
          if (guardTiles.has(k)) cls += " seen";
          else if (camTiles.has(k)) cls += " cam-seen";
          if (targetSet.has(k)) cls += " target";
        }
        return (
          <button key={k} type="button" className={cls} tabIndex={onTap ? 0 : -1} onClick={onTap ? () => onTap(p) : undefined} aria-label={`Tile ${x + 1}, ${y + 1}`}>
            {body}
          </button>
        );
      }))}

      <div className="hz-layer" aria-hidden="true">
        {marks.map((m, i) => (
          <span key={`m${i}`} className={`hz-mark ${m.role}${m.ghost ? " ghost" : ""}`} style={{ ...pct(m.pos), "--c": ROLE_LOOK[m.role].color } as CSSProperties}>
            <b style={{ transform: `translate(${(m.step - 2) * 22}%, ${(m.step - 2) * 22}%)` }}>{m.step}</b>
          </span>
        ))}
        {lv.guards.map((g, i) => {
          const at = guardAt(g, sim.tick);
          return (
            <span key={`g${i}`} className={`hz-tok guard f-${at.f}`} style={pct(at)}>
              <span>👮</span>
            </span>
          );
        })}
        {(["cat", "hacker"] as Role[]).map((r) => (
          <span key={r} className={`hz-tok thief ${r}`} style={{ ...pct(sim[r]), "--c": ROLE_LOOK[r].color, "--ce": ROLE_LOOK[r].edge } as CSSProperties}>
            <span>{ROLE_LOOK[r].icon}</span>
          </span>
        ))}
        {pings.map((p) => (
          <span key={`p${p.n}`} className={`hz-ping${p.mine ? " mine" : ""}`} style={pct(p)}>📍</span>
        ))}
        {bust && <span className="hz-bust" style={pct(bust)} />}
      </div>
      {children}
    </div>
  );
}

export function Stars({ got, size = 28 }: { got: number; size?: number }) {
  return (
    <span className="hz-stars" style={{ fontSize: size }} aria-label={`${got} of 3 stars`}>
      {[0, 1, 2].map((i) => <span key={i} className={i < got ? "on" : ""}>★</span>)}
    </span>
  );
}
