"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { SilatKing } from "@/components/shell";
import { FightView } from "@/components/silat/FightView";
import { SilatCard } from "@/components/silat/SilatCard";
import { Confetti, Mascot } from "@/components/ui";
import { feedback } from "@/lib/feedback";
import { CARDS } from "@/lib/silat/cards";
import { FLOORS, HEAL_AFTER_FIGHT, floorName, loadRun, newRun, recordEnd, saveRun, settle, takeReward, type Run } from "@/lib/silat/run";
import type { Fight } from "@/lib/silat/rules";

export default function SilatPlay() {
  const router = useRouter();
  const [run, setRun] = useState<Run | null | undefined>(undefined);

  // Load the saved run (or start one) once on the device.
  useEffect(() => {
    const saved = loadRun();
    const r = saved && saved.status !== "lost" && saved.status !== "won" ? saved : newRun();
    saveRun(r);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage is only readable after mount
    setRun(r);
  }, []);

  function update(r: Run) {
    setRun(r);
    if (r.status === "lost" || r.status === "won") {
      recordEnd(r);
      saveRun(null);
    } else {
      saveRun(r);
    }
  }

  if (!run) return <main className="screen" style={{ alignItems: "center", justifyContent: "center" }}><Mascot size={80} className="bob" /></main>;

  if (run.status === "fight" && run.fight) {
    const f = run.fight;
    const over = f.status === "won" || f.status === "lost";
    return (
      <>
        <FightView
          key={run.floor}
          fight={f}
          floorLabel={floorName(run.floor)}
          onChange={(next: Fight) => update({ ...run, fight: next })}
        />
        {over && (
          <div style={{ position: "fixed", inset: 0, zIndex: 40, background: "rgba(43,26,18,.55)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
            <div className="rise" style={{ width: "100%", maxWidth: 360, borderRadius: 26, background: "var(--paper)", padding: 24, display: "flex", flexDirection: "column", alignItems: "center", gap: 10, textAlign: "center" }}>
              <span className="stamp display" style={{ fontSize: 40, color: f.status === "won" ? "#2F6E00" : "#B81F1F" }}>{f.status === "won" ? "MENANG!" : "KALAH"}</span>
              <span style={{ fontSize: 15, fontWeight: 700, color: "var(--plum-soft)" }}>
                {f.status === "won" ? `The enemy kneels. Ring outs: ${f.ringOuts} · best combo: ${f.bestCombo}` : "You were knocked down. The run ends here."}
              </span>
              <button className="pill-btn primary" style={{ marginTop: 6 }} onClick={() => { feedback.tap(); update(settle(run)); }}>
                {f.status === "won" ? (run.floor >= FLOORS - 1 ? "Finish the run" : "Pick a reward") : "See results"}
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  if (run.status === "reward" && run.reward) {
    return <RewardView run={run} onDone={(id) => { feedback.correct(); update(takeReward(run, id)); }} />;
  }

  const won = run.status === "won";
  return (
    <main className="screen" style={{ alignItems: "center", justifyContent: "center", textAlign: "center", gap: 14 }}>
      {won && <Confetti />}
      <SilatKing size={96} />
      <h1 className="display" style={{ margin: 0, fontSize: 42, color: won ? "#2F6E00" : "#B81F1F" }}>{won ? "Raja Silat!" : "Run over"}</h1>
      <p style={{ margin: 0, fontSize: 17, fontWeight: 700, color: "var(--plum-soft)" }}>
        {won ? "You beat Mandor Benteng and cleared Sawah." : `You reached ${floorName(run.floor)}.`}
      </p>
      <div style={{ display: "flex", gap: 10, width: "100%" }}>
        {[["Floors", `${Math.min(run.floor + 1, FLOORS)}/${FLOORS}`], ["Ring outs", run.ringOuts], ["Best combo", run.bestCombo], ["Deck", run.deck.length]].map(([k, v]) => (
          <div key={k} style={{ flex: 1, padding: "10px 4px", borderRadius: 16, background: "#fff", boxShadow: "0 3px 0 var(--cream-3)" }}>
            <div style={{ fontSize: 20, fontWeight: 900, color: "var(--plum)" }}>{v}</div>
            <div style={{ fontSize: 11, fontWeight: 800, color: "var(--plum-soft)" }}>{k}</div>
          </div>
        ))}
      </div>
      <button className="pill-btn primary" style={{ marginTop: 10 }} onClick={() => { feedback.tap(); update(newRun()); }}>New Run</button>
      <button className="pill-btn" onClick={() => router.push("/silat")}>Back</button>
    </main>
  );
}

function RewardView({ run, onDone }: { run: Run; onDone: (id: string | null) => void }) {
  const [pick, setPick] = useState<string | null>(null);
  const choice = pick ? CARDS[pick] : null;
  return (
    <main className="screen" style={{ alignItems: "center", gap: 14, background: "#2B1A12", color: "#FFF8EC", maxWidth: "none" }}>
      <div style={{ width: "100%", maxWidth: 428, display: "flex", flexDirection: "column", alignItems: "center", gap: 14, flex: 1 }}>
        <span className="stamp" style={{ marginTop: 24, padding: "8px 20px", borderRadius: 14, background: "#FFC800", color: "#4A3200", fontSize: 26, fontWeight: 900, boxShadow: "0 5px 0 #E5A800" }}>MENANG!</span>
        <span style={{ fontSize: 15, fontWeight: 800, color: "#E8D6C0" }}>Healed {HEAL_AFTER_FIGHT}. HP {run.hp}/{run.max}. Next: {floorName(run.floor + 1)}</span>
        <span style={{ fontSize: 13, fontWeight: 900, letterSpacing: ".1em", textTransform: "uppercase", color: "#C9B49C", marginTop: 18 }}>Add a card to your deck</span>
        <div style={{ display: "flex", gap: 12, justifyContent: "center", height: 190, alignItems: "center" }}>
          {run.reward!.map((id, i) => (
            <button
              key={id}
              type="button"
              className="sl-cw"
              aria-pressed={pick === id}
              aria-label={`${CARDS[id].name}: ${CARDS[id].text}`}
              onClick={() => { feedback.tap(); setPick(pick === id ? null : id); }}
              style={{ position: "relative", bottom: 0, transform: pick === id ? "translateY(-16px) scale(1.12)" : pick ? "scale(.92)" : undefined, opacity: pick && pick !== id ? 0.5 : 1 }}
            >
              <span className="deal" style={{ animationDelay: `${150 + i * 110}ms` }}>
                <span className="bob" style={{ animationDelay: `${-i * 0.9}s` }}><SilatCard id={id} on={pick === id} /></span>
              </span>
            </button>
          ))}
        </div>
        <div style={{ minHeight: 44, textAlign: "center" }}>
          <div style={{ fontSize: 16, fontWeight: 900 }}>{choice ? choice.name : "Tap a card to choose it"}</div>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#C9B49C" }}>{choice ? `${choice.type} · costs ${choice.cost} · ${choice.text}` : `Your deck has ${run.deck.length} cards.`}</div>
        </div>
        <div className="grow" />
        <button className="pill-btn primary" disabled={!pick} style={{ opacity: pick ? 1 : 0.5 }} onClick={() => pick && onDone(pick)}>{choice ? `Take ${choice.name}` : "Pick a card"}</button>
        <button className="pill-btn" style={{ background: "transparent", boxShadow: "none", color: "#C9B49C", fontSize: 17 }} onClick={() => onDone(null)}>Skip</button>
        <Link href="/silat" style={{ fontSize: 14, fontWeight: 800, color: "#C9B49C", marginBottom: 8 }}>Save and leave</Link>
      </div>
    </main>
  );
}
