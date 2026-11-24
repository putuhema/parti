"use client";

import type { PoseDef } from "../../../convex/lib/pose/poses";

type Props = {
  pose: PoseDef;
  variant?: "card" | "ghost" | "mini";
  className?: string;
};

/**
 * Clean articulated SVG character illustrating any PoseDef.
 * - `card`: colorful toybox silhouette on a soft tinted card
 * - `ghost`: translucent glowing neon outline overlaid directly on the live camera viewfinder
 * - `mini`: compact badge version for collage & photobooth headers
 */
export function PoseFigure({ pose, variant = "card", className = "" }: Props) {
  const j = pose.joints;
  const p = (pt: readonly [number, number]) => [pt[0] * 100, pt[1] * 100] as const;

  const [hx, hy] = p(j.head);
  const [nx, ny] = p(j.neck);
  const [lsx, lsy] = p(j.lShoulder);
  const [rsx, rsy] = p(j.rShoulder);
  const [lex, ley] = p(j.lElbow);
  const [rex, rey] = p(j.rElbow);
  const [lwx, lwy] = p(j.lWrist);
  const [rwx, rwy] = p(j.rWrist);
  const [lhx, lhy] = p(j.lHip);
  const [rhx, rhy] = p(j.rHip);

  const isGhost = variant === "ghost";
  const isMini = variant === "mini";

  const limbStroke = isGhost ? "rgba(255,255,255,0.88)" : pose.accent;
  const torsoFill = isGhost ? "rgba(255,255,255,0.14)" : `${pose.accent}24`;
  const jointFill = isGhost ? "#FFDE66" : "#FFFFFF";
  const jointStroke = isGhost ? "rgba(52,40,62,0.55)" : pose.accent;
  const strokeW = isGhost ? 4.2 : isMini ? 6.5 : 5.6;

  return (
    <svg
      viewBox="0 0 100 100"
      className={`ps-fig ${isGhost ? "ghost" : ""} ${isMini ? "mini" : ""} ${className}`}
      aria-label={isGhost ? undefined : `${pose.name} pose illustration`}
      aria-hidden={isGhost ? "true" : undefined}
    >
      {/* Subtle framing halo */}
      {!isGhost && !isMini && (
        <circle cx="50" cy="50" r="44" fill={`${pose.accent}12`} stroke={`${pose.accent}28`} strokeWidth="1.2" strokeDasharray="3 3" />
      )}

      {/* Torso */}
      <polygon
        points={`${lsx},${lsy} ${rsx},${rsy} ${rhx},${rhy} ${lhx},${lhy}`}
        fill={torsoFill}
        stroke={limbStroke}
        strokeWidth={isGhost ? 2.6 : 3.2}
        strokeLinejoin="round"
        strokeDasharray={isGhost ? "4 3" : undefined}
      />

      {/* Neck */}
      <line x1={nx} y1={ny} x2={hx} y2={hy + 6} stroke={limbStroke} strokeWidth={strokeW * 0.72} strokeLinecap="round" />

      {/* Left arm */}
      <polyline
        points={`${lsx},${lsy} ${lex},${ley} ${lwx},${lwy}`}
        fill="none"
        stroke={limbStroke}
        strokeWidth={strokeW}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeDasharray={isGhost ? "5 3" : undefined}
      />

      {/* Right arm */}
      <polyline
        points={`${rsx},${rsy} ${rex},${rey} ${rwx},${rwy}`}
        fill="none"
        stroke={limbStroke}
        strokeWidth={strokeW}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeDasharray={isGhost ? "5 3" : undefined}
      />

      {/* Head */}
      <circle
        cx={hx}
        cy={hy}
        r={isMini ? 9.5 : 8.8}
        fill={isGhost ? "rgba(255,255,255,0.18)" : "#FFFDF8"}
        stroke={limbStroke}
        strokeWidth={isGhost ? 2.8 : 3.6}
      />
      {!isGhost && (
        <>
          <circle cx={hx - 2.6} cy={hy - 0.8} r="1.15" fill="var(--plum, #34283E)" />
          <circle cx={hx + 2.6} cy={hy - 0.8} r="1.15" fill="var(--plum, #34283E)" />
          <path
            d={`M ${hx - 2.4} ${hy + 2.2} Q ${hx} ${hy + 4.4} ${hx + 2.4} ${hy + 2.2}`}
            fill="none"
            stroke="var(--plum, #34283E)"
            strokeWidth="1.2"
            strokeLinecap="round"
          />
        </>
      )}

      {/* Hand / wrist highlights */}
      {[
        [lwx, lwy],
        [rwx, rwy],
      ].map(([x, y], idx) => (
        <circle
          key={idx}
          cx={x}
          cy={y}
          r={isGhost ? 4.4 : isMini ? 4.8 : 4.3}
          fill={jointFill}
          stroke={jointStroke}
          strokeWidth="2.4"
        />
      ))}

      {/* Elbow dots */}
      {!isMini &&
        [
          [lex, ley],
          [rex, rey],
        ].map(([x, y], idx) => (
          <circle key={`e${idx}`} cx={x} cy={y} r="2.6" fill={jointFill} stroke={jointStroke} strokeWidth="1.8" />
        ))}
    </svg>
  );
}
