"use client";

import { useState } from "react";
import { ShellPage, SilatKing } from "@/components/shell";
import { Sheet } from "@/components/ui";
import { feedback } from "@/lib/feedback";

export default function SilatHome() {
  const [soon, setSoon] = useState<string | null>(null);
  const open = (what: string) => {
    feedback.unlock();
    feedback.tap();
    setSoon(what);
  };

  return (
    <ShellPage tab="games" gap={14}>
      <div className="grow" style={{ minHeight: 24 }} />
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
        <SilatKing size={88} />
        <h1 className="display" style={{ margin: 0, fontSize: 64, lineHeight: 0.86, display: "flex", flexDirection: "column" }}>
          <span>Raja</span>
          <span style={{ paddingLeft: "0.9em" }}>Silat</span>
        </h1>
        <p style={{ margin: "8px 0 0", fontSize: 15, fontWeight: 700, color: "var(--plum-soft)", textAlign: "center" }}>
          Kick chess pieces into each other. Build your deck.
        </p>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 16, marginTop: 26 }}>
        <button className="pill-btn primary" onClick={() => open("Continue run")}>Continue Run</button>
        <button className="pill-btn" onClick={() => open("New run")}>New Run</button>
        <button className="pill-btn" onClick={() => open("Card collection")}>Card Collection</button>
      </div>
      <div className="grow" />

      <Sheet open={soon !== null} onClose={() => setSoon(null)} label="Coming soon">
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, textAlign: "center" }}>
          <SilatKing size={72} />
          <h2 className="display" style={{ margin: 0, fontSize: 26 }}>{soon} is coming soon</h2>
          <p style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "var(--plum-soft)" }}>
            Raja Silat is still being built. The first fight is next.
          </p>
          <button className="pill-btn primary" style={{ marginTop: 8 }} onClick={() => setSoon(null)}>OK</button>
        </div>
      </Sheet>
    </ShellPage>
  );
}
