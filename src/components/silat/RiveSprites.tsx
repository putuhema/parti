"use client";

// Rive sprites for Raja Silat. Sources live in /rive (RML, built with the Rive CLI); the built files are
// served from /public/silat/rive. If a file isn't there yet, or the runtime can't load it, the plain SVG
// art is drawn instead, so the game never depends on the .riv files being present.
import dynamic from "next/dynamic";
import { useEffect, useState, type ReactNode } from "react";

/** Off: on Rive's free plan every .riv carries a splash screen that plays each time a sprite loads,
 *  and these sprites are the same art as the SVGs. Turn on (and `npm run rive:build`) on a paid plan. */
export const RIVE_ON = false;

const HeroRive = dynamic(() => import("./RiveCanvas").then((m) => m.HeroRive), { ssr: false });
const DiceRive = dynamic(() => import("./RiveCanvas").then((m) => m.DiceRive), { ssr: false });

const BASE = "/silat/rive";
type Avail = "checking" | "yes" | "no";
const known = new Map<string, Avail>();
const waiting = new Map<string, Promise<Avail>>();

/** Is this .riv file served? Checked once per page load, without a 404 storm from the runtime. */
function useAvailable(src: string): Avail {
  const [state, setState] = useState<Avail>(() => (RIVE_ON ? known.get(src) ?? "checking" : "no"));
  useEffect(() => {
    if (!RIVE_ON || state !== "checking") return;
    let alive = true;
    let p = waiting.get(src);
    if (!p) {
      p = fetch(src, { method: "HEAD" })
        .then((r) => (r.ok ? "yes" : "no") as Avail)
        .catch(() => "no" as Avail)
        .then((a) => { known.set(src, a); return a; });
      waiting.set(src, p);
    }
    p.then((a) => { if (alive) setState(a); });
    return () => { alive = false; };
  }, [src, state]);
  return state;
}

/** The prisoner hero. `kick` and `hit` are counters: each change plays that reaction once. */
export function RiveHero({ kick, hit, fallback }: { kick: number; hit: number; fallback: ReactNode }) {
  const avail = useAvailable(`${BASE}/hero.riv`);
  const [failed, setFailed] = useState(false);
  if (!RIVE_ON || avail !== "yes" || failed) return <>{fallback}</>;
  return <HeroRive kick={kick} hit={hit} onFail={() => setFailed(true)} />;
}

/** A d20 that tumbles in and lands, then shows the number. Without the .riv file, nothing is drawn
 *  (the board's floating "d20: 14" text still shows the roll). */
export function RiveDice({ n, ok }: { n: number; ok: boolean }) {
  const avail = useAvailable(`${BASE}/dice.riv`);
  const [failed, setFailed] = useState(false);
  if (!RIVE_ON || avail !== "yes" || failed) return null;
  return (
    <span className="sl-dice" aria-hidden="true">
      <DiceRive onFail={() => setFailed(true)} />
      <b style={{ color: ok ? "#2F6E00" : "#B81F1F" }}>{n}</b>
    </span>
  );
}
