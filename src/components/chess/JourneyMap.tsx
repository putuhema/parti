"use client";

import { ACTS, LANES, NODE_INFO, ROWS, TWIST_INFO, rng, type MapNode, type NodeKind, type Run } from "@/lib/journey";

const ROW_H = 86;
const PAD = 50;

export function NodeGlyph({ kind, size = 40, muted }: { kind: NodeKind; size?: number; muted?: boolean }) {
  const n = NODE_INFO[kind];
  return (
    <span style={{ width: size, height: size, borderRadius: kind === "boss" ? size / 2.6 : size / 2, background: muted ? "#E5E5E5" : n.face, boxShadow: `0 ${size > 50 ? 5 : 3}px 0 ${muted ? "#CFCFCF" : n.edge}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
      <svg width={size * 0.56} height={size * 0.56} viewBox="0 0 24 24" aria-hidden="true"><path d={n.icon} stroke={muted ? "#AFAFAF" : "#fff"} strokeWidth="2.4" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>
    </span>
  );
}

/** Where a node sits on the map, in % across and px down. Small wobble keeps it from looking like a grid. */
function spot(n: MapNode) {
  const r = rng(n.seed);
  const x = n.kind === "boss" ? 50 : ((n.lane + 0.5) / LANES) * 100 + (r() - 0.5) * 9;
  const y = PAD + (ROWS - 1 - n.row) * ROW_H + (n.kind === "boss" ? 0 : (r() - 0.5) * 18);
  return { x, y };
}

export function JourneyMap({ run, reach, onPick }: { run: Run; reach: string[]; onPick: (n: MapNode) => void }) {
  const act = ACTS[run.act];
  const height = PAD * 2 + (ROWS - 1) * ROW_H;
  const pos = new Map(run.map.nodes.map((n) => [n.id, spot(n)]));
  const visited = new Set(run.path);
  const doneRow = run.at ? run.map.nodes.find((n) => n.id === run.at)!.row : -1;
  const onTrail = (f: string, t: string) => visited.has(f) && visited.has(t) && run.path.indexOf(t) === run.path.indexOf(f) + 1;

  return (
    <div style={{ position: "relative", height, borderRadius: 24, overflow: "hidden", background: `linear-gradient(180deg, ${act.soft} 0%, #fff 70%)`, border: `2px solid ${act.soft}` }} aria-label="Journey map">
      {/* Path lines */}
      <svg width="100%" height={height} style={{ position: "absolute", inset: 0 }} aria-hidden="true">
        {run.map.edges.map(([f, t]) => {
          const a = pos.get(f)!, b = pos.get(t)!;
          const trail = onTrail(f, t);
          const next = f === run.at && reach.includes(t);
          const dead = !trail && pos.get(f) && (run.map.nodes.find((n) => n.id === f)!.row <= doneRow);
          return (
            <line
              key={f + t}
              x1={`${a.x}%`} y1={a.y} x2={`${b.x}%`} y2={b.y}
              stroke={trail ? act.face : next ? act.face : "#D9D9D9"}
              strokeWidth={trail ? 6 : next ? 4 : 3}
              strokeDasharray={trail ? undefined : next ? "2 9" : "1 8"}
              strokeLinecap="round"
              opacity={dead ? 0.35 : 1}
              className={next ? "march" : undefined}
            />
          );
        })}
      </svg>


      {/* Nodes */}
      {run.map.nodes.map((n) => {
        const p = pos.get(n.id)!;
        const isHere = n.id === run.at;
        const can = reach.includes(n.id);
        const been = visited.has(n.id);
        const past = !been && n.row <= doneRow;
        const size = n.kind === "boss" ? 66 : n.kind === "elite" ? 50 : 44;
        const tw = TWIST_INFO[n.twist];
        return (
          <button
            key={n.id}
            onClick={() => can && onPick(n)}
            disabled={!can}
            aria-label={`${n.kind === "boss" ? act.boss : NODE_INFO[n.kind].name}${tw ? `, ${tw.name}` : ""}${can ? ", you can go here" : been ? ", visited" : ""}`}
            className={can ? "mapnode can" : "mapnode"}
            style={{ position: "absolute", left: `${p.x}%`, top: p.y, transform: "translate(-50%, -50%)", padding: 0, border: 0, background: "none", cursor: can ? "pointer" : "default", opacity: past ? 0.3 : !can && !been && !isHere && n.row > doneRow + 1 ? 0.75 : 1 }}
          >
            <span style={{ position: "relative", display: "block", borderRadius: "50%", boxShadow: isHere ? `0 0 0 5px #fff, 0 0 0 9px ${act.face}` : undefined }}>
              <NodeGlyph kind={n.kind} size={size} muted={past} />
              {tw && !past && (
                <span style={{ position: "absolute", right: -6, top: -6, minWidth: 20, height: 20, borderRadius: 10, background: tw.color, color: "#fff", fontSize: 12, fontWeight: 900, display: "flex", alignItems: "center", justifyContent: "center", border: "2px solid #fff" }}>!</span>
              )}
              {been && !isHere && (
                <span style={{ position: "absolute", right: -4, bottom: -4, width: 20, height: 20, borderRadius: 10, background: "#fff", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 1px 3px rgba(0,0,0,.2)" }}>
                  <svg width="12" height="12" viewBox="0 0 24 24"><path d="M4 12 L10 18 L20 6" stroke="#58CC02" strokeWidth="4" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>
                </span>
              )}
            </span>
            {n.kind === "boss" && <span style={{ display: "block", marginTop: 8, fontSize: 13, fontWeight: 900, color: "var(--ink)", whiteSpace: "nowrap" }}>{act.boss}</span>}
          </button>
        );
      })}

      {/* "You are here" marker before the first step */}
      {!run.at && (
        <div style={{ position: "absolute", left: "50%", bottom: 4, transform: "translateX(-50%)", fontSize: 12, fontWeight: 900, letterSpacing: ".06em", color: act.ink }}>START · PICK A PATH</div>
      )}
    </div>
  );
}
