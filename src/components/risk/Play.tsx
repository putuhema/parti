"use client";

import { useMutation } from "convex/react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../../../convex/_generated/api";
import { TERRITORIES, TERRITORY_IDS, isAdjacent, type TerritoryId } from "../../../convex/lib/risk/map";
import {
  BLITZ_GOAL,
  BLITZ_MAX_ROUNDS,
  findValidSet,
  isBot,
  nextTradeBonus,
  reachableOwned,
  type RiskCard,
  type Seat,
} from "../../../convex/lib/risk/rules";
import { Countdown, Toast } from "@/components/words/common";
import { Confetti, Icon, Sheet } from "@/components/ui";
import { errorText } from "@/lib/errors";
import { feedback } from "@/lib/feedback";
import { CARD_META, GAME_NAME, describeEvent, paletteMap, useNameOf, type PlayerPalette, type RiskGameView, type RiskView } from "./common";
import { RiskMap } from "./RiskMap";

const PIP_LAYOUTS: Record<number, [number, number][]> = {
  1: [[50, 50]],
  2: [[28, 28], [72, 72]],
  3: [[28, 28], [50, 50], [72, 72]],
  4: [[28, 28], [72, 28], [28, 72], [72, 72]],
  5: [[28, 28], [72, 28], [50, 50], [28, 72], [72, 72]],
  6: [[28, 24], [72, 24], [28, 50], [72, 50], [28, 76], [72, 76]],
};

/** Chunky glossy 3D-styled vinyl battle die (coral for attacker, sky blue for defender). */
function VinylDie({ value, side, won }: { value: number; side: "atk" | "def"; won?: boolean }) {
  const pips = PIP_LAYOUTS[value] ?? PIP_LAYOUTS[1];
  return (
    <span className={`rk-die ${side}${won === true ? " win" : won === false ? " lose" : ""}`} aria-label={`${side === "atk" ? "Attacker" : "Defender"} rolled ${value}`}>
      <svg viewBox="0 0 100 100" aria-hidden="true">
        {pips.map(([cx, cy], i) => (
          <circle key={i} cx={cx} cy={cy} r={value === 1 ? 15 : 10.5} fill="currentColor" />
        ))}
      </svg>
    </span>
  );
}

export function RiskPlay({ room }: { room: RiskView }) {
  const g = room.game!;
  const router = useRouter();
  const act = useMutation(api.risk.act);
  const leave = useMutation(api.risk.leave);
  const rematch = useMutation(api.risk.rematch);
  const nameOf = useNameOf(room);

  const palettes = useMemo(() => paletteMap(g.players, room.meId), [g.players, room.meId]);
  const myTurn = g.isPlayer && g.turn === room.meId && !g.done;
  const mustTrade = myTurn && g.phase === "deploy" && g.myCards.length >= 5;
  const validSet = useMemo(() => findValidSet(g.myCards), [g.myCards]);

  // Interactive selection state
  const [selected, setSelected] = useState<TerritoryId | null>(null);
  const [target, setTarget] = useState<TerritoryId | null>(null);
  const [deployStep, setDeployStep] = useState<1 | 5 | 99>(1);
  const [moveCount, setMoveCount] = useState(1);
  const [cardsOpen, setCardsOpen] = useState(false);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [toast, setToast] = useState<{ text: string; kind: "bad"; id: number } | null>(null);
  const [dismissedBattleId, setDismissedBattleId] = useState(0);

  // Clean derived selections whenever phase or ownership changes
  const activeSelected = useMemo<TerritoryId | null>(() => {
    if (!myTurn || !selected) return null;
    if (g.phase === "attack") {
      return g.owners[selected] === room.meId && (g.troops[selected] ?? 0) >= 2 ? selected : null;
    }
    if (g.phase === "fortify") {
      return g.owners[selected] === room.meId && (g.troops[selected] ?? 0) >= 2 ? selected : null;
    }
    return null;
  }, [myTurn, selected, g.phase, g.owners, g.troops, room.meId]);

  const activeTarget = useMemo<TerritoryId | null>(() => {
    if (!myTurn || !activeSelected || !target) return null;
    if (g.phase === "attack") {
      return g.owners[target] !== room.meId && isAdjacent(activeSelected, target) ? target : null;
    }
    if (g.phase === "fortify") {
      const reach = reachableOwned(g as never, room.meId as Seat, activeSelected);
      return reach.includes(target) ? target : null;
    }
    return null;
  }, [myTurn, activeSelected, target, g, room.meId]);

  // Sound & haptic reactions for turn start and live battles
  const wasMine = useRef(myTurn);
  useEffect(() => {
    if (myTurn && !wasMine.current) feedback.ping();
    wasMine.current = myTurn;
  }, [myTurn]);

  const lastBattleIdRef = useRef(g.lastBattle?.id ?? 0);
  useEffect(() => {
    const b = g.lastBattle;
    if (!b || b.id === lastBattleIdRef.current) return;
    lastBattleIdRef.current = b.id;
    if (b.by === room.meId || b.defender === room.meId) {
      feedback.diceLand(b.atkDice[0] ?? 4);
      if (b.captured) {
        if (b.by === room.meId) feedback.correct();
        else feedback.wrong();
      }
    }
  }, [g.lastBattle, room.meId]);

  // Compute selectable territories & valid targets for map highlights
  const { selectable, validTargets, arrowKind } = useMemo(() => {
    const sel = new Set<TerritoryId>();
    const tgt = new Set<TerritoryId>();
    let arrow: "attack" | "fortify" | null = null;
    if (!myTurn) return { selectable: sel, validTargets: tgt, arrowKind: arrow };

    if (g.phase === "deploy" && !mustTrade) {
      for (const id of TERRITORY_IDS) {
        if (g.owners[id] === room.meId) sel.add(id);
      }
    } else if (g.phase === "attack") {
      arrow = "attack";
      for (const id of TERRITORY_IDS) {
        if (
          g.owners[id] === room.meId &&
          (g.troops[id] ?? 0) >= 2 &&
          TERRITORIES[id].neighbors.some((n) => g.owners[n] !== room.meId)
        ) {
          sel.add(id);
        }
      }
      if (activeSelected) {
        for (const n of TERRITORIES[activeSelected].neighbors) {
          if (g.owners[n] !== room.meId) tgt.add(n);
        }
      }
    } else if (g.phase === "fortify") {
      arrow = "fortify";
      for (const id of TERRITORY_IDS) {
        if (g.owners[id] === room.meId && (g.troops[id] ?? 0) >= 2) sel.add(id);
      }
      if (activeSelected) {
        for (const r of reachableOwned(g as never, room.meId as Seat, activeSelected)) {
          tgt.add(r);
        }
      }
    }
    return { selectable: sel, validTargets: tgt, arrowKind: arrow };
  }, [myTurn, g, room.meId, mustTrade, activeSelected]);

  // Per-player empire stats (territories & armies)
  const stats = useMemo(() => {
    const map = new Map<string, { lands: number; armies: number }>();
    for (const p of g.players) map.set(p, { lands: 0, armies: 0 });
    for (const id of TERRITORY_IDS) {
      const o = g.owners[id];
      const cur = map.get(o);
      if (cur) {
        cur.lands += 1;
        cur.armies += g.troops[id] ?? 0;
      }
    }
    return map;
  }, [g.players, g.owners, g.troops]);

  async function send(move: Parameters<typeof act>[0]["move"]) {
    if (sending) return;
    feedback.unlock();
    setSending(true);
    try {
      await act({ code: room.code, move });
    } catch (e) {
      feedback.wrong();
      setToast({ text: errorText(e, "Move not allowed"), kind: "bad", id: Date.now() });
    }
    setSending(false);
  }

  function handleTerritoryTap(id: TerritoryId) {
    if (!myTurn || sending) return;
    feedback.unlock();

    if (g.phase === "deploy") {
      if (mustTrade) {
        setCardsOpen(true);
        return;
      }
      if (g.owners[id] !== room.meId) return;
      feedback.tap();
      const amt = deployStep === 99 ? g.reinforce : Math.min(deployStep, g.reinforce);
      void send({ kind: "deploy", to: id, count: amt });
      return;
    }

    if (g.phase === "attack") {
      if (g.owners[id] === room.meId) {
        if ((g.troops[id] ?? 0) < 2) {
          setToast({ text: "Need at least 2 troops to attack from here", kind: "bad", id: Date.now() });
          return;
        }
        feedback.tap();
        setSelected(id === activeSelected ? null : id);
        setTarget(null);
        return;
      }
      if (activeSelected && isAdjacent(activeSelected, id)) {
        feedback.tap();
        setTarget(id);
      }
      return;
    }

    if (g.phase === "fortify") {
      if (g.owners[id] !== room.meId) return;
      if (activeSelected && id !== activeSelected && validTargets.has(id)) {
        feedback.tap();
        setTarget(id);
        setMoveCount(Math.max(1, (g.troops[activeSelected] ?? 2) - 1));
        return;
      }
      if ((g.troops[id] ?? 0) >= 2) {
        feedback.tap();
        setSelected(id === activeSelected ? null : id);
        setTarget(null);
      }
    }
  }

  function runAttack(blitz: boolean) {
    if (!activeSelected || !activeTarget || sending) return;
    feedback.diceToss();
    setDismissedBattleId(0);
    void send({ kind: "attack", from: activeSelected, to: activeTarget, blitz });
  }

  function runTrade() {
    if (!validSet || sending) return;
    feedback.correct();
    setCardsOpen(false);
    void send({ kind: "trade", cardIds: validSet });
  }

  // Clamp occupy & fortify counts cleanly
  const occ = g.pendingOccupy;
  const occupyVal = occ ? Math.min(occ.max, Math.max(occ.min, moveCount)) : 1;
  const fortMax = activeSelected ? Math.max(1, (g.troops[activeSelected] ?? 2) - 1) : 1;
  const fortVal = Math.min(fortMax, Math.max(1, moveCount));

  const showBattle = g.lastBattle && g.lastBattle.id !== dismissedBattleId;
  const latestEvents = useMemo(
    () => [...g.log].slice(-4).reverse().map((e) => ({ id: e.n, ...describeEvent(e, nameOf, room.meId) })),
    [g.log, nameOf, room.meId],
  );

  const mapFrom = g.phase === "occupy" && occ ? (occ.from as TerritoryId) : activeSelected;
  const mapTo = g.phase === "occupy" && occ ? (occ.to as TerritoryId) : activeTarget;

  return (
    <main className="rk-screen">
      {/* 1. Floating Toybox Porcelain Top Bar */}
      <header className="rk-topbar">
        <button
          type="button"
          className="rk-iconbtn"
          aria-label="Leave game"
          onClick={() => {
            feedback.tap();
            if (g.done || !g.isPlayer) {
              void leave({ code: room.code }).catch(() => {});
              router.push("/risk");
            } else {
              setLeaveOpen(true);
            }
          }}
        >
          <Icon.Close size={16} />
        </button>

        <div className="rk-brandpill">
          <b>{GAME_NAME}</b>
          <span className="rk-roundchip">
            {g.mode === "blitz" ? `R${Math.min(g.round, BLITZ_MAX_ROUNDS)}/${BLITZ_MAX_ROUNDS} · Goal ${BLITZ_GOAL}` : `Round ${g.round}`}
          </span>
        </div>

        <div className="rk-phases" aria-label="Turn phase">
          {(["deploy", "attack", "fortify"] as const).map((p, i) => {
            const active = g.phase === p || (g.phase === "occupy" && p === "attack");
            return (
              <span key={p} className={`rk-phase${active ? " on" : ""}`}>
                <i>{i + 1}</i>
                {p === "deploy" ? "Deploy" : p === "attack" ? "Attack" : "Fortify"}
              </span>
            );
          })}
        </div>

        <button
          type="button"
          className={`rk-cardbtn${validSet && myTurn && g.phase === "deploy" ? " ready" : ""}`}
          onClick={() => {
            feedback.tap();
            setCardsOpen(true);
          }}
          aria-label={`Your Risk cards (${g.myCards.length})`}
        >
          <span>🃏</span>
          <b>{g.myCards.length}</b>
          {validSet && myTurn && g.phase === "deploy" && <em>+{nextTradeBonus(g.tradesDone)}</em>}
        </button>
      </header>

      {/* 2. Main Arena: Floating Player Dock + Sunlit World Map */}
      <div className="rk-arena">
        <aside className="rk-dock" aria-label="Commanders">
          <div className="rk-players">
            {g.players.map((p) => {
              const pal = palettes.get(p)!;
              const st = stats.get(p) ?? { lands: 0, armies: 0 };
              const isOut = g.out.includes(p);
              const isTurn = g.turn === p && !g.done;
              const pct = Math.min(100, Math.round((st.lands / (g.mode === "blitz" ? BLITZ_GOAL : TERRITORY_IDS.length)) * 100));
              return (
                <div
                  key={p}
                  className={`rk-plcard${isTurn ? " active" : ""}${isOut ? " out" : ""}`}
                >
                  <span className="rk-plbadge" style={{ background: pal.fill, boxShadow: `0 3px 0 ${pal.edge}` }}>
                    {isBot(p) ? "🤖" : nameOf(p).slice(0, 1).toUpperCase()}
                  </span>
                  <div className="rk-plmeta">
                    <div className="rk-plrow">
                      <span className="rk-plname">{p === room.meId ? "You" : nameOf(p)}</span>
                      <span className="rk-plstat">{isOut ? "Out" : `🏰${st.lands} · ⚔️${st.armies}`}</span>
                    </div>
                    <div className="rk-plbar">
                      <i style={{ width: `${pct}%`, background: pal.fill }} />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="rk-feed">
            <span className="rk-feed-h">Battle Log</span>
            {latestEvents.length ? (
              latestEvents.map((ev) => (
                <p key={ev.id} className={`rk-feed-line ${ev.tone}`}>
                  {ev.text}
                </p>
              ))
            ) : (
              <p className="rk-feed-line info">Deploy troops and expand your empire!</p>
            )}
          </div>
        </aside>

        <section className="rk-stage">
          <RiskMap
            owners={g.owners}
            troops={g.troops}
            palettes={palettes}
            selected={mapFrom}
            target={mapTo}
            selectable={selectable}
            validTargets={validTargets}
            arrowKind={g.phase === "occupy" ? "attack" : arrowKind}
            lastBattleFrom={showBattle ? (g.lastBattle!.from as TerritoryId) : null}
            lastBattleTo={showBattle ? (g.lastBattle!.to as TerritoryId) : null}
            onSelect={handleTerritoryTap}
          />

          {/* Live Battle Dice Clash Floating Banner */}
          {showBattle && g.lastBattle && (
            <div key={g.lastBattle.id} className={`rk-clash${g.lastBattle.captured ? " cap" : ""}`}>
              <div className="rk-clash-head">
                <span>
                  <b>{TERRITORIES[g.lastBattle.from as TerritoryId]?.short}</b>
                  {" ⚔️ "}
                  <b>{TERRITORIES[g.lastBattle.to as TerritoryId]?.short}</b>
                  {g.lastBattle.waves > 1 ? ` · ${g.lastBattle.waves} waves` : ""}
                </span>
                {g.lastBattle.captured ? (
                  <span className="rk-clash-tag win">CAPTURED! 🏴</span>
                ) : (
                  <span className="rk-clash-tag">−{g.lastBattle.atkLost} / −{g.lastBattle.defLost}</span>
                )}
                <button
                  type="button"
                  className="rk-clash-x"
                  aria-label="Dismiss battle result"
                  onClick={() => setDismissedBattleId(g.lastBattle!.id)}
                >
                  ✕
                </button>
              </div>
              <div className="rk-clash-dice">
                <div className="rk-dice-side">
                  {g.lastBattle.atkDice.map((d, i) => {
                    const opp = g.lastBattle!.defDice[i];
                    return <VinylDie key={i} value={d} side="atk" won={opp !== undefined ? d > opp : undefined} />;
                  })}
                </div>
                <span className="rk-vs">VS</span>
                <div className="rk-dice-side">
                  {g.lastBattle.defDice.map((d, i) => {
                    const opp = g.lastBattle!.atkDice[i];
                    return <VinylDie key={i} value={d} side="def" won={opp !== undefined ? d >= opp : undefined} />;
                  })}
                </div>
              </div>
            </div>
          )}
        </section>
      </div>

      {/* 3. Contextual Toybox Vinyl Command Dock */}
      <footer className={`rk-cmd${myTurn ? " mine" : ""}`}>
        {!myTurn ? (
          <div className="rk-cmd-wait">
            <span
              className="rk-turn-dot"
              style={{ background: palettes.get(g.turn)?.fill ?? "#7A6D85" }}
            />
            <b>{g.done ? "Battle complete!" : `${nameOf(g.turn)} is ${g.phase === "deploy" ? "deploying armies" : g.phase === "fortify" ? "fortifying borders" : "attacking"}…`}</b>
          </div>
        ) : g.phase === "deploy" ? (
          <div className="rk-cmd-row">
            <div className="rk-cmd-info">
              <span className="rk-pill-count">+{g.reinforce}</span>
              <div>
                <b>{mustTrade ? "Trade cards first!" : "Tap your lands to deploy"}</b>
                <small>{mustTrade ? "You hold 5+ Risk cards" : `${g.reinforce} ${g.reinforce === 1 ? "army" : "armies"} ready`}</small>
              </div>
            </div>
            <div className="rk-cmd-actions">
              {validSet && (
                <button type="button" className="rk-btn gold" disabled={sending} onClick={runTrade}>
                  🃏 Trade +{nextTradeBonus(g.tradesDone)}
                </button>
              )}
              {!mustTrade && (
                <div className="rk-stepgroup" role="group" aria-label="Deploy amount per tap">
                  {([1, 5, 99] as const).map((n) => (
                    <button
                      key={n}
                      type="button"
                      className={`rk-stepbtn${deployStep === n ? " on" : ""}`}
                      onClick={() => { feedback.tap(); setDeployStep(n); }}
                    >
                      {n === 99 ? "All" : `+${n}`}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : g.phase === "occupy" && occ ? (
          <div className="rk-cmd-row">
            <div className="rk-cmd-info">
              <span className="rk-pill-count green">🏴</span>
              <div>
                <b>Advance into {TERRITORIES[occ.to as TerritoryId]?.name}</b>
                <small>Move {occupyVal} of {occ.max} available troops</small>
              </div>
            </div>
            <div className="rk-cmd-actions">
              <input
                type="range"
                className="rk-slider"
                min={occ.min}
                max={occ.max}
                value={occupyVal}
                onChange={(e) => setMoveCount(Number(e.target.value))}
                aria-label="Troops to advance"
              />
              <button
                type="button"
                className="rk-btn green"
                disabled={sending}
                onClick={() => {
                  feedback.tap();
                  setSelected(occ.to as TerritoryId);
                  setTarget(null);
                  void send({ kind: "occupy", count: occupyVal });
                }}
              >
                Move {occupyVal}
              </button>
              <button
                type="button"
                className="rk-btn gold"
                disabled={sending}
                onClick={() => {
                  feedback.tap();
                  setSelected(occ.to as TerritoryId);
                  setTarget(null);
                  void send({ kind: "occupy", count: occ.max });
                }}
              >
                All ({occ.max})
              </button>
            </div>
          </div>
        ) : g.phase === "attack" ? (
          <div className="rk-cmd-row">
            <div className="rk-cmd-info">
              <span className="rk-pill-count coral">⚔️</span>
              <div>
                {activeSelected && activeTarget ? (
                  <>
                    <b>{TERRITORIES[activeSelected].name} ({g.troops[activeSelected]}) → {TERRITORIES[activeTarget].name} ({g.troops[activeTarget]})</b>
                    <small>Roll 1 clash or Blitz until victory</small>
                  </>
                ) : activeSelected ? (
                  <>
                    <b>{TERRITORIES[activeSelected].name} selected ({g.troops[activeSelected]})</b>
                    <small>Tap a glowing neighbor to attack</small>
                  </>
                ) : (
                  <>
                    <b>Attack Phase</b>
                    <small>Tap one of your lands (2+ troops) to launch an assault</small>
                  </>
                )}
              </div>
            </div>
            <div className="rk-cmd-actions">
              {activeSelected && activeTarget && (
                <>
                  <button type="button" className="rk-btn coral" disabled={sending} onClick={() => runAttack(false)}>
                    🎲 Roll
                  </button>
                  <button type="button" className="rk-btn gold" disabled={sending} onClick={() => runAttack(true)}>
                    ⚡ Blitz
                  </button>
                </>
              )}
              <button
                type="button"
                className="rk-btn soft"
                disabled={sending}
                onClick={() => {
                  feedback.tap();
                  setSelected(null);
                  setTarget(null);
                  void send({ kind: "toFortify" });
                }}
              >
                Fortify →
              </button>
              <button
                type="button"
                className="rk-btn green"
                disabled={sending}
                onClick={() => {
                  feedback.tap();
                  setSelected(null);
                  setTarget(null);
                  void send({ kind: "endTurn" });
                }}
              >
                End Turn
              </button>
            </div>
          </div>
        ) : (
          <div className="rk-cmd-row">
            <div className="rk-cmd-info">
              <span className="rk-pill-count green">🛡️</span>
              <div>
                {activeSelected && activeTarget ? (
                  <>
                    <b>{TERRITORIES[activeSelected].name} → {TERRITORIES[activeTarget].name}</b>
                    <small>Move {fortVal} of {fortMax} troops</small>
                  </>
                ) : activeSelected ? (
                  <>
                    <b>Fortify from {TERRITORIES[activeSelected].name}</b>
                    <small>Tap any connected owned territory</small>
                  </>
                ) : (
                  <>
                    <b>Fortify Phase</b>
                    <small>Move troops between connected lands, or end turn</small>
                  </>
                )}
              </div>
            </div>
            <div className="rk-cmd-actions">
              {activeSelected && activeTarget && (
                <>
                  <input
                    type="range"
                    className="rk-slider"
                    min={1}
                    max={fortMax}
                    value={fortVal}
                    onChange={(e) => setMoveCount(Number(e.target.value))}
                    aria-label="Troops to fortify"
                  />
                  <button
                    type="button"
                    className="rk-btn green"
                    disabled={sending}
                    onClick={() => {
                      feedback.tap();
                      void send({ kind: "fortify", from: activeSelected, to: activeTarget, count: fortVal });
                      setSelected(null);
                      setTarget(null);
                    }}
                  >
                    Move {fortVal}
                  </button>
                </>
              )}
              <button
                type="button"
                className="rk-btn soft"
                disabled={sending}
                onClick={() => {
                  feedback.tap();
                  setSelected(null);
                  setTarget(null);
                  void send({ kind: "endTurn" });
                }}
              >
                End Turn
              </button>
            </div>
          </div>
        )}
      </footer>

      {/* Risk Territory Cards Sheet */}
      <Sheet open={cardsOpen} onClose={() => setCardsOpen(false)} label="Your Risk cards">
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <h2 className="display" style={{ margin: 0, fontSize: 24 }}>Risk Cards ({g.myCards.length})</h2>
            <span className="chip chip-sun">Next set: +{nextTradeBonus(g.tradesDone)}</span>
          </div>
          <p style={{ margin: 0, fontSize: 13.5, fontWeight: 700, color: "var(--muted)" }}>
            Capture at least 1 land on your turn to earn a card. Match 3 of a kind or 1 of each during Deploy for bonus armies (+2 extra if you own a matching land!).
          </p>
          {g.myCards.length === 0 ? (
            <p style={{ margin: 0, padding: "18px 12px", borderRadius: 18, background: "var(--cream-2)", textAlign: "center", fontWeight: 800, color: "var(--muted)" }}>
              No cards yet — capture a territory to draw your first!
            </p>
          ) : (
            <div className="rk-cardgrid">
              {g.myCards.map((c: RiskCard) => {
                const m = CARD_META[c.kind];
                const tName = c.territory ? TERRITORIES[c.territory as TerritoryId]?.name : "Any territory";
                const owned = c.territory ? g.owners[c.territory] === room.meId : false;
                return (
                  <div
                    key={c.id}
                    className="rk-carditem"
                    style={{ background: m.bg, boxShadow: `0 4px 0 ${m.edge}`, color: m.ink }}
                  >
                    <span className="rk-cardemoji">{m.emoji}</span>
                    <b>{m.label}</b>
                    <small>{tName}{owned ? " (+2)" : ""}</small>
                  </div>
                );
              })}
            </div>
          )}
          {validSet && myTurn && g.phase === "deploy" ? (
            <button type="button" className="btn btn-green" disabled={sending} onClick={runTrade}>
              Trade set for +{nextTradeBonus(g.tradesDone)} armies
            </button>
          ) : (
            <button type="button" className="btn btn-white" onClick={() => setCardsOpen(false)}>
              Close
            </button>
          )}
        </div>
      </Sheet>

      {/* Leave Game Sheet */}
      <Sheet open={leaveOpen} onClose={() => setLeaveOpen(false)} label="Leave battle">
        <div style={{ display: "flex", flexDirection: "column", gap: 12, textAlign: "center" }}>
          <h2 className="display" style={{ margin: 0, fontSize: 24 }}>Leave this battle?</h2>
          <p style={{ margin: 0, fontSize: 15, fontWeight: 700, color: "var(--muted)" }}>
            Your territories will be divided among the remaining commanders.
          </p>
          <button type="button" className="btn btn-green" onClick={() => setLeaveOpen(false)}>Keep fighting</button>
          <button
            type="button"
            className="btn btn-white"
            onClick={async () => {
              await leave({ code: room.code }).catch(() => {});
              router.push("/risk");
            }}
          >
            Leave battle
          </button>
        </div>
      </Sheet>

      <Toast toast={toast} onDone={() => setToast(null)} />
      {room.startAt && !g.done && (
        <Countdown
          startAt={room.startAt}
          label={g.turn === room.meId ? "You deploy first!" : `${nameOf(g.turn)} deploys first`}
        />
      )}
      {g.done && (
        <DoneOverlay
          room={room}
          g={g}
          palettes={palettes}
          stats={stats}
          nameOf={nameOf}
          onRematch={() => { feedback.tap(); void rematch({ code: room.code }); }}
          onLeave={async () => { await leave({ code: room.code }).catch(() => {}); router.push("/risk"); }}
        />
      )}
    </main>
  );
}

function DoneOverlay({
  room,
  g,
  palettes,
  stats,
  nameOf,
  onRematch,
  onLeave,
}: {
  room: RiskView;
  g: RiskGameView;
  palettes: Map<string, PlayerPalette>;
  stats: Map<string, { lands: number; armies: number }>;
  nameOf: (id?: string | null) => string;
  onRematch: () => void;
  onLeave: () => void;
}) {
  const d = g.done!;
  const iWon = d.winners.includes(room.meId as Seat);
  const played = useRef(false);
  useEffect(() => {
    if (played.current) return;
    played.current = true;
    if (iWon) feedback.win();
    else feedback.wrong();
  }, [iWon]);

  const ranked = [...g.players].sort((a, b) => {
    const sa = stats.get(a) ?? { lands: 0, armies: 0 };
    const sb = stats.get(b) ?? { lands: 0, armies: 0 };
    return sb.lands - sa.lands || sb.armies - sa.armies;
  });

  const title = iWon
    ? d.winners.length > 1
      ? "Shared Victory!"
      : "World Conquered!"
    : d.winners.length === 1
      ? `${nameOf(d.winners[0])} rules the map`
      : "Battle Over";

  const sub =
    d.reason === "domination"
      ? "Total world domination."
      : d.reason === "blitz"
        ? `Reached ${BLITZ_GOAL} territories first!`
        : d.reason === "rounds"
          ? `After ${BLITZ_MAX_ROUNDS} rounds, the largest empire wins:`
          : "Last commander standing.";

  return (
    <div className="overlay">
      {iWon && <Confetti />}
      <span style={{ fontSize: 56, lineHeight: 1 }} aria-hidden="true">{iWon ? "🏆" : "🌍"}</span>
      <h2 className="display" style={{ margin: 0, fontSize: 30, textAlign: "center" }}>{title}</h2>
      <p style={{ margin: 0, fontSize: 15, fontWeight: 700, color: "var(--muted)", textAlign: "center" }}>{sub}</p>
      <div className="list" style={{ width: "100%", maxWidth: 380 }}>
        {ranked.map((p) => {
          const pal = palettes.get(p)!;
          const st = stats.get(p) ?? { lands: 0, armies: 0 };
          return (
            <div key={p} className={`list-row${p === room.meId ? " me" : ""}`}>
              <span className="rk-plbadge" style={{ background: pal.fill, boxShadow: `0 3px 0 ${pal.edge}` }}>
                {isBot(p) ? "🤖" : nameOf(p).slice(0, 1).toUpperCase()}
              </span>
              <span style={{ flex: 1, minWidth: 0, fontSize: 16, fontWeight: 900 }}>
                {p === room.meId ? "You" : nameOf(p)}
                {d.winners.includes(p) && " 👑"}
              </span>
              <span style={{ fontSize: 14, fontWeight: 900, color: "var(--muted)" }}>
                🏰 {st.lands} · ⚔️ {st.armies}
              </span>
            </div>
          );
        })}
      </div>
      {room.isHost ? (
        <button className="btn btn-green" style={{ maxWidth: 380 }} onClick={onRematch}>
          Play again
        </button>
      ) : (
        <p className="wait" style={{ margin: 0, fontWeight: 900, color: "var(--muted)" }}>
          Waiting for the host…
        </p>
      )}
      <button className="btn btn-ghost" style={{ maxWidth: 380 }} onClick={onLeave}>
        Back home
      </button>
    </div>
  );
}
