"use client";

import { SilatCard } from "@/components/silat/SilatCard";
import { TopBar } from "@/components/ui";
import { ALL_CARDS, CARDS, STYLES, type Style } from "@/lib/silat/cards";
import { RANGKAI } from "@/lib/silat/rangkai";

const GROUPS: (Style | "neutral")[] = ["neutral", "harimau", "bangau", "ular"];

export default function SilatCards() {
  return (
    <main className="screen" style={{ gap: 18 }}>
      <TopBar back="/silat" title="Card Collection" />
      <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: "var(--plum-soft)", textAlign: "center" }}>
        {ALL_CARDS.length} cards in three styles. You pick a style at the start of each run.
      </p>
      {GROUPS.map((g) => (
        <section key={g} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <h2 className="label" style={{ color: g === "neutral" ? "var(--plum-soft)" : STYLES[g].edge }}>
            {g === "neutral" ? "Neutral · everyone" : `${STYLES[g].name} · ${STYLES[g].animal}`}
          </h2>
          {g !== "neutral" && <p style={{ margin: "-6px 0 0", fontSize: 13, fontWeight: 700, color: "var(--plum-soft)" }}>{STYLES[g].text}</p>}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: "18px 10px", justifyItems: "center" }}>
            {ALL_CARDS.filter((c) => (c.style ?? "neutral") === g).map((c) => (
              <span key={c.id} style={{ width: 100, height: 144, display: "block" }}><SilatCard id={c.id} /></span>
            ))}
          </div>
        </section>
      ))}
      <section style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <h2 className="label" style={{ color: "var(--plum)" }}>Jurus Rangkai · named combos</h2>
        <p style={{ margin: "-4px 0 0", fontSize: 13, fontWeight: 700, color: "var(--plum-soft)" }}>
          Queue these cards in this order inside one combo. The last one is powered up.
        </p>
        {RANGKAI.map((r) => (
          <div key={r.id} style={{ display: "flex", flexDirection: "column", gap: 3, padding: "10px 12px", borderRadius: 14, background: "#fff", boxShadow: `0 3px 0 var(--cream-3)`, borderLeft: `5px solid ${r.color}` }}>
            <span className="display" style={{ fontSize: 17, color: r.color }}>{r.name}</span>
            <span style={{ fontSize: 12, fontWeight: 900, color: "var(--plum)" }}>
              {r.seq.map((l) => (l === "step" ? "Free step" : l.startsWith("type:") ? `any ${l.slice(5)}` : CARDS[l]?.name ?? l)).join(" → ")}
            </span>
            <span style={{ fontSize: 13, fontWeight: 700, color: "var(--plum-soft)" }}>{r.text}</span>
          </div>
        ))}
      </section>
    </main>
  );
}
