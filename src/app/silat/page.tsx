"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ShellPage, SilatKing } from "@/components/shell";
import { Sheet } from "@/components/ui";
import { feedback } from "@/lib/feedback";
import { FLOORS, floorName, loadBest, loadRun, newRun, saveRun, type Best, type Run } from "@/lib/silat/run";

export default function SilatHome() {
  const router = useRouter();
  const [saved, setSaved] = useState<Run | null>(null);
  const [best, setBest] = useState<Best | null>(null);
  const [confirm, setConfirm] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the saved run lives in localStorage
    setSaved(loadRun());
    setBest(loadBest());
  }, []);

  function start() {
    feedback.unlock();
    feedback.tap();
    saveRun(newRun());
    router.push("/silat/play");
  }

  return (
    <ShellPage tab="games" gap={14}>
      <div className="grow" style={{ minHeight: 16 }} />
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
        <SilatKing size={88} />
        <h1 className="display" style={{ margin: 0, fontSize: 64, lineHeight: 0.86, display: "flex", flexDirection: "column" }}>
          <span>Raja</span>
          <span style={{ paddingLeft: "0.9em" }}>Silat</span>
        </h1>
        <p style={{ margin: "8px 0 0", fontSize: 15, fontWeight: 700, color: "var(--plum-soft)", textAlign: "center" }}>
          Kick chess pieces into each other. Build your deck.
        </p>
        {best && best.runs > 0 && (
          <p style={{ margin: 0, fontSize: 13, fontWeight: 800, color: "var(--plum-soft)" }}>
            Best: floor {Math.min(best.floor, FLOORS)}/{FLOORS} · {best.wins} {best.wins === 1 ? "win" : "wins"} in {best.runs} {best.runs === 1 ? "run" : "runs"}
          </p>
        )}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 16, marginTop: 22 }}>
        {saved && (
          <Link href="/silat/play" className="pill-btn primary" onClick={() => { feedback.unlock(); feedback.tap(); }} style={{ flexDirection: "column", gap: 0, lineHeight: 1.1 }}>
            <span>Continue Run</span>
            <span style={{ fontSize: 13, fontWeight: 800, opacity: 0.75 }}>{floorName(saved.floor)} · HP {saved.fight?.hero.hp ?? saved.hp}/{saved.max}</span>
          </Link>
        )}
        <button className={`pill-btn${saved ? "" : " primary"}`} onClick={() => (saved ? setConfirm(true) : start())}>New Run</button>
        <Link href="/silat/cards" className="pill-btn" onClick={() => feedback.tap()}>Card Collection</Link>
      </div>
      <div className="grow" />

      <Sheet open={confirm} onClose={() => setConfirm(false)} label="Start a new run">
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, textAlign: "center" }}>
          <h2 className="display" style={{ margin: 0, fontSize: 26 }}>Start over?</h2>
          <p style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "var(--plum-soft)" }}>Your current run ends and won&apos;t count.</p>
          <button className="pill-btn primary" style={{ marginTop: 8 }} onClick={start}>Start a new run</button>
          <button className="pill-btn" onClick={() => setConfirm(false)}>Keep my run</button>
        </div>
      </Sheet>
    </ShellPage>
  );
}
