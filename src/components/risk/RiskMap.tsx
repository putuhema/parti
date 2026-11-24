"use client";

import { CONTINENT_LIST, SEA_LANES, TERRITORIES, TERRITORY_IDS, type TerritoryId } from "../../../convex/lib/risk/map";
import type { PlayerPalette } from "./common";

type RiskMapProps = {
  owners: Record<string, string>;
  troops: Record<string, number>;
  palettes: Map<string, PlayerPalette>;
  selected: TerritoryId | null;
  target: TerritoryId | null;
  selectable: Set<TerritoryId>;
  validTargets: Set<TerritoryId>;
  arrowKind?: "attack" | "fortify" | null;
  lastBattleTo?: TerritoryId | null;
  lastBattleFrom?: TerritoryId | null;
  onSelect: (id: TerritoryId) => void;
};

/** Interactive Toybox Vinyl World Map (24 chunky clickable territories, 6 continents, sea lanes). */
export function RiskMap({
  owners,
  troops,
  palettes,
  selected,
  target,
  selectable,
  validTargets,
  arrowKind,
  lastBattleTo,
  lastBattleFrom,
  onSelect,
}: RiskMapProps) {
  const fromDef = selected ? TERRITORIES[selected] : null;
  const toDef = target ? TERRITORIES[target] : null;

  return (
    <div className="rk-mapwrap">
      <svg
        className="rk-map"
        viewBox="0 0 1000 560"
        role="group"
        aria-label="Risk world map"
      >
        <defs>
          <linearGradient id="rkOcean" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#93DCFF" />
            <stop offset="55%" stopColor="#69C4F8" />
            <stop offset="100%" stopColor="#4CB1EE" />
          </linearGradient>
          <radialGradient id="rkGlow" cx="50%" cy="46%" r="54%">
            <stop offset="0%" stopColor="rgba(255,255,255,0.26)" />
            <stop offset="100%" stopColor="rgba(255,255,255,0)" />
          </radialGradient>
          <filter id="rkShadow" x="-8%" y="-8%" width="116%" height="120%">
            <feDropShadow dx="0" dy="5" stdDeviation="3" floodColor="#1A4B78" floodOpacity="0.22" />
          </filter>
          <marker id="rkArrowAtk" markerWidth="10" markerHeight="10" refX="7" refY="5" orient="auto">
            <path d="M 1 1 L 9 5 L 1 9 Z" fill="#FF526D" />
          </marker>
          <marker id="rkArrowFort" markerWidth="10" markerHeight="10" refX="7" refY="5" orient="auto">
            <path d="M 1 1 L 9 5 L 1 9 Z" fill="#27BA66" />
          </marker>
        </defs>

        {/* Sunlit Toybox Ocean */}
        <rect x="0" y="0" width="1000" height="560" rx="26" fill="url(#rkOcean)" />
        <rect x="0" y="0" width="1000" height="560" rx="26" fill="url(#rkGlow)" />

        {/* Subtle decorative pastel wave pills */}
        <g fill="rgba(255,255,255,0.32)" aria-hidden="true">
          <rect x="44" y="250" width="46" height="5" rx="2.5" />
          <rect x="308" y="244" width="54" height="5" rx="2.5" />
          <rect x="332" y="486" width="44" height="5" rx="2.5" />
          <rect x="630" y="438" width="58" height="5" rx="2.5" />
          <rect x="912" y="314" width="48" height="5" rx="2.5" />
          <rect x="52" y="424" width="60" height="5" rx="2.5" />
        </g>

        {/* Dashed Sea Lanes connecting intercontinental borders */}
        <g className="rk-lanes" fill="none" stroke="rgba(255,255,255,0.72)" strokeWidth="3" strokeDasharray="6 7" strokeLinecap="round" aria-hidden="true">
          {SEA_LANES.map(({ from, to, wrap }) => {
            const a = TERRITORIES[from];
            const b = TERRITORIES[to];
            if (wrap) {
              return (
                <g key={`${from}-${to}`}>
                  <path d={`M ${a.x - 42} ${a.y} Q 14 ${a.y + 18}, 4 ${a.y + 38}`} />
                  <path d={`M ${b.x + 28} ${b.y} Q 986 ${b.y - 14}, 996 ${b.y - 32}`} />
                  <text x="16" y={a.y - 8} fill="rgba(255,255,255,0.9)" fontSize="11" fontWeight="900">◀ JPN</text>
                  <text x="954" y={b.y - 26} fill="rgba(255,255,255,0.9)" fontSize="11" fontWeight="900">ALA ▶</text>
                </g>
              );
            }
            const mx = (a.x + b.x) / 2;
            const my = (a.y + b.y) / 2 - 14;
            return <path key={`${from}-${to}`} d={`M ${a.x} ${a.y} Q ${mx} ${my} ${b.x} ${b.y}`} />;
          })}
        </g>

        {/* 3D Toybox Landmass Base Layer (sculpted thickness shadow under all territories) */}
        <g filter="url(#rkShadow)" aria-hidden="true">
          {TERRITORY_IDS.map((id) => {
            const t = TERRITORIES[id];
            const pal = palettes.get(owners[id]);
            return (
              <path
                key={`base-${id}`}
                d={t.path}
                transform="translate(0, 7)"
                fill={pal?.edge ?? "#6E5D7A"}
                stroke={pal?.edge ?? "#6E5D7A"}
                strokeWidth="4"
                strokeLinejoin="round"
              />
            );
          })}
        </g>

        {/* Interactive Territory Polygons */}
        <g>
          {TERRITORY_IDS.map((id) => {
            const t = TERRITORIES[id];
            const owner = owners[id];
            const pal = palettes.get(owner);
            const isSel = selected === id;
            const isTgt = target === id;
            const isValidTgt = validTargets.has(id);
            const canPick = selectable.has(id) || isValidTgt;
            const isRecent = lastBattleTo === id || lastBattleFrom === id;

            return (
              <g
                key={id}
                className={`rk-terr${canPick ? " pick" : ""}${isSel ? " sel" : ""}${isTgt ? " tgt" : ""}${isValidTgt ? " hot" : ""}${isRecent ? " clash" : ""}`}
                onClick={() => onSelect(id)}
                role="button"
                tabIndex={canPick ? 0 : -1}
                aria-label={`${t.name}, ${troops[id] ?? 0} troops`}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onSelect(id);
                  }
                }}
              >
                <path
                  d={t.path}
                  fill={pal?.fill ?? "#CFC0AD"}
                  stroke={isSel ? "#FFB21E" : isTgt ? "#FF526D" : isValidTgt ? "#FFFDF8" : "rgba(255,253,248,0.88)"}
                  strokeWidth={isSel || isTgt ? 4.5 : isValidTgt ? 3.5 : 2.4}
                  strokeLinejoin="round"
                  className="rk-poly"
                />
                {/* Top vinyl highlight sheen */}
                <path
                  d={t.path}
                  fill="rgba(255,255,255,0.16)"
                  transform="scale(0.96)"
                  style={{ transformOrigin: `${t.x}px ${t.y}px`, pointerEvents: "none" }}
                />

                {/* Territory short label */}
                <text
                  x={t.x}
                  y={t.y - 20}
                  textAnchor="middle"
                  className="rk-tlabel"
                >
                  {t.short}
                </text>

                {/* Pulsing ring for valid attack/fortify target or selected source */}
                {(isSel || isValidTgt || isTgt) && (
                  <circle
                    cx={t.x}
                    cy={t.y + 2}
                    r={isTgt ? 23 : 21}
                    fill="none"
                    stroke={isSel ? "#FFD05C" : isTgt ? "#FF526D" : arrowKind === "fortify" ? "#5CE093" : "#FFFDF8"}
                    strokeWidth="3"
                    strokeDasharray={isSel ? undefined : "5 4"}
                    className="rk-ring"
                  />
                )}

                {/* Sculpted 3D Vinyl Troop Badge */}
                <g transform={`translate(${t.x}, ${t.y + 2})`}>
                  <circle cx="0" cy="3" r="15.5" fill="rgba(52,40,62,0.28)" />
                  <circle
                    cx="0"
                    cy="0"
                    r="15.5"
                    fill="#FFFDF8"
                    stroke={pal?.edge ?? "#34283E"}
                    strokeWidth="3"
                  />
                  <circle cx="0" cy="0" r="11.5" fill={pal?.fill ?? "#7A6D85"} />
                  <text
                    x="0"
                    y="4.5"
                    textAnchor="middle"
                    fill={pal?.ink ?? "#FFFFFF"}
                    fontSize="13.5"
                    fontWeight="900"
                    style={{ fontVariantNumeric: "tabular-nums" }}
                  >
                    {troops[id] ?? 0}
                  </text>
                </g>
              </g>
            );
          })}
        </g>

        {/* Continent Bonus Badges floating cleanly near each continent */}
        <g pointerEvents="none" aria-hidden="true">
          {CONTINENT_LIST.map((c) => {
            const firstOwner = owners[c.territories[0]];
            const controlled = c.territories.every((tid) => owners[tid] === firstOwner);
            const pal = controlled ? palettes.get(firstOwner) : null;
            return (
              <g key={c.id} transform={`translate(${c.badgeX}, ${c.badgeY})`}>
                <rect
                  x="-54"
                  y="-12"
                  width="108"
                  height="24"
                  rx="12"
                  fill={pal ? pal.fill : "rgba(255,253,248,0.88)"}
                  stroke={pal ? "#FFFDF8" : c.edge}
                  strokeWidth="2"
                />
                <text
                  x="0"
                  y="4"
                  textAnchor="middle"
                  fontSize="10.5"
                  fontWeight="900"
                  fill={pal ? pal.ink : "#34283E"}
                >
                  {c.name.replace("North ", "N. ").replace("South ", "S. ")} +{c.bonus}
                </text>
              </g>
            );
          })}
        </g>

        {/* Animated Trajectory Arrow for Active Attack or Fortify Selection */}
        {fromDef && toDef && arrowKind && (
          <g pointerEvents="none" className="rk-arrow">
            <line
              x1={fromDef.x}
              y1={fromDef.y + 2}
              x2={toDef.x}
              y2={toDef.y + 2}
              stroke="#FFFDF8"
              strokeWidth="7"
              strokeLinecap="round"
              opacity="0.7"
            />
            <line
              x1={fromDef.x}
              y1={fromDef.y + 2}
              x2={toDef.x}
              y2={toDef.y + 2}
              stroke={arrowKind === "attack" ? "#FF526D" : "#27BA66"}
              strokeWidth="4"
              strokeDasharray="8 6"
              strokeLinecap="round"
              markerEnd={arrowKind === "attack" ? "url(#rkArrowAtk)" : "url(#rkArrowFort)"}
              className="rk-arrow-dash"
            />
          </g>
        )}
      </svg>
    </div>
  );
}
