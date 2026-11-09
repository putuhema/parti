"use client";

import { SilatCard } from "@/components/silat/SilatCard";
import { TopBar } from "@/components/ui";
import { ALL_CARDS, STARTER } from "@/lib/silat/cards";

const GROUPS = ["Serang", "Gerak", "Tangkis", "Jurus"] as const;
const LABEL = { Serang: "Serang · attack", Gerak: "Gerak · move", Tangkis: "Tangkis · defend", Jurus: "Jurus · power" };

export default function SilatCards() {
  return (
    <main className="screen" style={{ gap: 18 }}>
      <TopBar back="/silat" title="Card Collection" />
      <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: "var(--plum-soft)", textAlign: "center" }}>
        {ALL_CARDS.length} cards. Your starter deck has {STARTER.length}: Tendang, Tangkis, Langkah Kuda and Tarik.
      </p>
      {GROUPS.map((g) => (
        <section key={g} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <h2 className="label" style={{ color: "var(--plum-soft)" }}>{LABEL[g]}</h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: "18px 10px", justifyItems: "center" }}>
            {ALL_CARDS.filter((c) => c.type === g).map((c) => (
              <span key={c.id} style={{ width: 100, height: 144, display: "block" }}><SilatCard id={c.id} /></span>
            ))}
          </div>
        </section>
      ))}
    </main>
  );
}
