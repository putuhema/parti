"use client";

import { CARDS, STYLES, type CardType } from "@/lib/silat/cards";

export const TYPE_COLORS: Record<CardType, { face: string; edge: string; soft: string; ink: string }> = {
  Serang: { face: "#FF4B4B", edge: "#EA2B2B", soft: "#FFDFE0", ink: "#B81F1F" },
  Gerak: { face: "#1CB0F6", edge: "#1478A8", soft: "#DDF4FF", ink: "#1478A8" },
  Tangkis: { face: "#58CC02", edge: "#46A302", soft: "#D7FFB8", ink: "#2F6E00" },
  Jurus: { face: "#CE82FF", edge: "#A568CC", soft: "#F3E2FF", ink: "#8A4FB5" },
  Siasat: { face: "#D9489F", edge: "#B2347F", soft: "#FCE1F0", ink: "#9C2A6C" },
};

/** One card face. Placeholder art: the little 5×5 move pattern. */
export function SilatCard({ id, on, off, cost }: { id: string; on?: boolean; off?: boolean; cost?: number }) {
  const c = CARDS[id];
  if (!c) return null;
  const t = TYPE_COLORS[c.type];
  const border = c.rare ? "#FFC800" : t.face;
  const edge = c.rare ? "#E5A800" : t.edge;
  return (
    <span
      className={`sl-card${on ? " on" : ""}${off ? " off" : ""}`}
      style={{ borderColor: border, background: c.rare ? "#FFFBEA" : undefined, boxShadow: `0 6px 0 ${edge}, 0 14px 20px rgba(60,40,10,.16)` }}
    >
      <span className="gem" style={cost !== undefined && cost < c.cost ? { background: "#58CC02", boxShadow: "0 3px 0 #3A8700" } : undefined}>{cost ?? c.cost}</span>
      {c.style && (
        <span aria-label={STYLES[c.style].name} title={STYLES[c.style].name}
          style={{ position: "absolute", top: 4, right: 4, width: 14, height: 14, borderRadius: "50%", background: STYLES[c.style].color, boxShadow: `0 2px 0 ${STYLES[c.style].edge}`, color: "#fff", fontSize: 9, fontWeight: 900, display: "flex", alignItems: "center", justifyContent: "center" }}>
          {STYLES[c.style].name[0]}
        </span>
      )}
      <span className="band" style={{ background: t.soft, color: t.ink }}>{c.rare ? `Rare ${c.type}` : c.type}</span>
      <span className="art" style={{ background: t.soft }}>
        <span className="pat" aria-hidden="true">
          {Array.from({ length: 25 }, (_, i) => <i key={i} className={i === 12 ? "you" : c.pattern[i] ?? ""} />)}
        </span>
      </span>
      <span className="nm">{c.name}</span>
      <span className="tx">{c.text}</span>
    </span>
  );
}
