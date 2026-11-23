// Draws an asset from assets.ts: a still or animated image, or a sprite sheet stepped frame by frame,
// with its motion preset and any scale or nudge.

import type { CSSProperties } from "react";
import type { Anim, Asset } from "./assets";

export const animClass = (a: Anim) => (a === "none" ? "" : ` jn-anim-${a}`);

export function Sprite({ a, className = "" }: { a: Asset; className?: string }) {
  const place: CSSProperties = { transform: `translate(${a.dx ?? 0}px, ${a.dy ?? 0}px) scale(${a.scale ?? 1})` };
  const motion = animClass(a.anim ?? "none");
  if (a.frames && a.frames > 1) {
    return (
      <span className={`jn-sprite${motion} ${className}`} aria-hidden="true">
        <span
          className="jn-sheet"
          style={{
            ...place,
            backgroundImage: `url(${a.src})`,
            backgroundSize: `${a.frames * 100}% 100%`,
            animation: `jn-frames ${(a.frames / (a.fps ?? 8)).toFixed(3)}s steps(${a.frames}, jump-none) infinite`,
          }}
        />
      </span>
    );
  }
  return (
    <span className={`jn-sprite${motion} ${className}`} aria-hidden="true">
      {/* eslint-disable-next-line @next/next/no-img-element -- art on a transformed, scaled layer */}
      <img src={a.src} alt="" draggable={false} style={place} />
    </span>
  );
}
