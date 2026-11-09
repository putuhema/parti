"use client";

import { SilatCard } from "@/components/silat/SilatCard";
import { TopBar } from "@/components/ui";
import { ALL_CARDS, STYLES, type Style } from "@/lib/silat/cards";

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
    </main>
  );
}
