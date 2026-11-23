// What stands on a town in Juragan Nusantara, drawn in Orbwick's cut-paper style (flat fills, ink outlines),
// coloured in the owner's ink. Level 0 is a bought, empty lot (a "sold" flag), then warung, ruko and hotel.

const INK = "#231B1A", BONE = "#F3EDE0", GLASS = "#CFE9F2", MUST = "#F4C64E", WOOD = "#5A4A44";

export const BUILDING_NAMES = ["Empty lot", "Warung", "Ruko", "Hotel"];

export function Building({ level, ink, className = "" }: { level: number; ink: string; className?: string }) {
  const s = { stroke: INK, strokeWidth: 1.8, strokeLinejoin: "round" as const };
  return (
    <svg className={`jn-bld ${className}`} viewBox="0 0 40 34" aria-hidden="true">
      <ellipse cx="20" cy="32.4" rx="15" ry="1.6" fill={INK} opacity=".18" />
      {level <= 0 && (
        // A stake with the owner's flag, and a little mound of fresh earth.
        <g>
          <path d="M9 32 Q20 26 31 32 Z" fill="#B98A5A" {...s} />
          <path d="M15 31 L15 6" stroke={INK} strokeWidth="2.4" strokeLinecap="round" />
          <path d="M15.6 6.5 L32 11 L15.6 16 Z" fill={ink} {...s} />
          <path d="M19 9 L24 11.2 L19 13.2" fill="none" stroke={BONE} strokeWidth="1.4" strokeLinecap="round" />
        </g>
      )}
      {level === 1 && (
        // Warung: a stall with a striped awning in the owner's colour.
        <g>
          <rect x="8" y="17" width="24" height="15" fill={BONE} {...s} />
          <rect x="11.5" y="21" width="17" height="6" fill={WOOD} {...s} />
          <rect x="6" y="10" width="28" height="7" fill={BONE} {...s} />
          {[0, 2, 4].map((k) => <rect key={k} x={6 + k * 4.67} y="10" width="4.67" height="7" fill={ink} />)}
          <rect x="6" y="10" width="28" height="7" fill="none" {...s} />
          {[8.3, 13, 17.7, 22.3, 27, 31.7].map((x, k) => <circle key={x} cx={x} cy="17.4" r="2.3" fill={k % 2 ? BONE : ink} {...s} strokeWidth={1.2} />)}
          <rect x="14" y="5" width="12" height="4.5" rx="1" fill={MUST} {...s} strokeWidth={1.4} />
        </g>
      )}
      {level === 2 && (
        // Ruko: a two-storey shophouse with a roller door and a sign.
        <g>
          <rect x="7" y="7" width="26" height="25" fill={BONE} {...s} />
          <rect x="5" y="3.5" width="30" height="5" rx="1" fill={ink} {...s} />
          <rect x="10.5" y="11" width="7" height="6" fill={GLASS} {...s} strokeWidth={1.4} />
          <rect x="22.5" y="11" width="7" height="6" fill={GLASS} {...s} strokeWidth={1.4} />
          <rect x="9.5" y="19" width="21" height="3.2" fill={MUST} {...s} strokeWidth={1.4} />
          <rect x="11" y="23" width="18" height="9" fill={ink} {...s} strokeWidth={1.4} />
          {[25.5, 28].map((y) => <path key={y} d={`M11.8 ${y} H28.2`} stroke={BONE} strokeWidth="1" opacity=".8" />)}
        </g>
      )}
      {level >= 3 && (
        // Hotel: a tall tower with a grid of windows, a side wing and a star sign.
        <g>
          <rect x="3.5" y="19" width="8" height="13" fill={BONE} {...s} />
          <rect x="5.5" y="22" width="4" height="3" fill={GLASS} stroke={INK} strokeWidth="1" />
          <rect x="11" y="3" width="21" height="29" fill={ink} {...s} />
          {[6.5, 11.5, 16.5, 21.5].map((y) => [14, 19.5, 25].map((x) => <rect key={`${x}-${y}`} x={x} y={y} width="3.4" height="3" fill={BONE} stroke={INK} strokeWidth=".8" />))}
          <rect x="18.3" y="26.5" width="6.4" height="5.5" fill={WOOD} {...s} strokeWidth={1.4} />
          <circle cx="32" cy="5" r="4.2" fill={MUST} {...s} strokeWidth={1.4} />
          <path d="M32 2.6 L32.8 4.4 L34.6 4.6 L33.2 5.8 L33.6 7.6 L32 6.6 L30.4 7.6 L30.8 5.8 L29.4 4.6 L31.2 4.4 Z" fill={INK} />
        </g>
      )}
    </svg>
  );
}
