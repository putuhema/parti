"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { SilatKing } from "@/components/shell";
import { FightView } from "@/components/silat/FightView";
import { CampScreen, EventScreen, MapScreen, RewardScreen, ShopScreen, StyleScreen, TreasureScreen } from "@/components/silat/RunScreens";
import { Confetti, Mascot } from "@/components/ui";
import { feedback } from "@/lib/feedback";
import { nodeById } from "@/lib/silat/map";
import { FLOORS, floorName, loadRun, newRun, recordEnd, saveRun, settle, type Run } from "@/lib/silat/run";
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
          key={run.at ?? "start"}
          fight={f}
          floorLabel={run.at && nodeById(run.map, run.at).kind === "elite" ? `Elite · ${floorName(run.floor)}` : floorName(run.floor)}
          onChange={(next: Fight) => update({ ...run, fight: next })}
        />
        {over && (
          <div className="sl-endpause" style={{ position: "fixed", inset: 0, zIndex: 40, background: "rgba(43,26,18,.55)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
            <div className="rise" style={{ animationDelay: "900ms", width: "100%", maxWidth: 360, borderRadius: 26, background: "var(--paper)", padding: 24, display: "flex", flexDirection: "column", alignItems: "center", gap: 10, textAlign: "center" }}>
              <span className="stamp display" style={{ fontSize: 40, color: f.status === "won" ? "#2F6E00" : "#B81F1F" }}>{f.status === "won" ? "MENANG!" : "KALAH"}</span>
              <span style={{ fontSize: 15, fontWeight: 700, color: "var(--plum-soft)" }}>
                {f.status === "won" ? `The enemy kneels. Knockouts: ${f.kos ?? 0} (+${(f.kos ?? 0) * 2} gold) · best combo: ${f.bestCombo}` : "You were knocked down. The run ends here."}
              </span>
              <button className="pill-btn primary" style={{ marginTop: 6 }} onClick={() => { feedback.tap(); update(settle(run)); }}>
                {f.status === "won" ? (run.floor >= FLOORS - 1 ? "Finish the run" : "Collect your reward") : "See results"}
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  if (run.status === "style") return <StyleScreen run={run} onChange={update} />;
  if (run.status === "map") return <MapScreen run={run} onChange={update} />;
  if (run.status === "reward" && run.reward) return <RewardScreen run={run} onChange={update} />;
  if (run.status === "camp") return <CampScreen run={run} onChange={update} />;
  if (run.status === "shop" && run.shop) return <ShopScreen run={run} onChange={update} />;
  if (run.status === "event" && run.event) return <EventScreen run={run} onChange={update} />;
  if (run.status === "treasure") return <TreasureScreen run={run} onChange={update} />;

  const won = run.status === "won";
  return (
    <main className="screen" style={{ alignItems: "center", justifyContent: "center", textAlign: "center", gap: 14 }}>
      {won && <Confetti />}
      <SilatKing size={96} />
      <h1 className="display" style={{ margin: 0, fontSize: 42, color: won ? "#2F6E00" : "#B81F1F" }}>{won ? "Raja Silat!" : "Run over"}</h1>
      <p style={{ margin: 0, fontSize: 17, fontWeight: 700, color: "var(--plum-soft)" }}>
        {won ? "You toppled Raja Hitam, the enemy King." : `You reached ${floorName(run.floor)}.`}
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
