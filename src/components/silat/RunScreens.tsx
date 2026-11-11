"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { SilatCard } from "@/components/silat/SilatCard";
import { Icon, Sheet } from "@/components/ui";
import { feedback } from "@/lib/feedback";
import { CARDS, STYLES, type Style } from "@/lib/silat/cards";
import { MAP_LANES, MAP_ROWS, NODE_INFO, nextNodes, type MapNode } from "@/lib/silat/map";
import { bossFor } from "@/lib/silat/endless";
import { RELICS } from "@/lib/silat/relics";
import { LOOKS, TOWER_FLOORS, TOWER_TIERS, tierFor, towerFloor } from "@/lib/silat/tower";
import {
  EVENTS, REST_HEAL, depthOf, floorOf, tierName, SHOP_HEAL, STYLE_STARTER, buyCard, checkBonus, chooseStyle, buyHeal, buyRelic, buyRemove, chooseEvent, enter, leave, rest, rollEvent, takeReward, takeTreasure, train, type RollResult, type Run,
} from "@/lib/silat/run";


// ---------- Small pieces ----------

/** Pixel icons from the Pixel Atlas (public/silat/pixel). Peci Hitam is a black cap: the fez, darkened. */
const RELIC_FILTER: Record<string, string> = { peci: "grayscale(1) brightness(.45) contrast(1.4)" };

export function RelicIcon({ id, size = 30 }: { id: string; size?: number }) {
  const r = RELICS[id];
  if (!r) return null;
  return (
    <span
      title={`${r.name}: ${r.text}`}
      style={{ width: size, height: size, borderRadius: size / 3, background: "#FFF8EC", border: `2px solid ${r.color}`, display: "inline-flex", alignItems: "center", justifyContent: "center", boxShadow: `0 3px 0 rgba(0,0,0,.2)${r.rare ? ", 0 0 0 2px #FFC800" : ""}`, flexShrink: 0 }}
      aria-hidden="true"
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- tiny pixel sprite, no optimisation needed */}
      <img src={`/silat/pixel/relic-${id}.png`} alt="" className="px" style={{ width: "78%", height: "78%", filter: RELIC_FILTER[id] }} />
    </span>
  );
}

function RelicRow({ id }: { id: string }) {
  const r = RELICS[id];
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
      <RelicIcon id={id} size={38} />
      <div style={{ display: "flex", flexDirection: "column", lineHeight: 1.25 }}>
        <span style={{ fontSize: 15, fontWeight: 900, color: "var(--plum)" }}>{r.name}{r.rare ? " ★" : ""}</span>
        <span style={{ fontSize: 13, fontWeight: 700, color: "var(--plum-soft)" }}>{r.text}</span>
      </div>
    </div>
  );
}

function Gold({ n }: { n: number }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 14, fontWeight: 900, color: "#8A6400" }}>
      {/* eslint-disable-next-line @next/next/no-img-element -- tiny pixel sprite */}
      <img src="/silat/pixel/ui-coin.png" alt="" className="px" style={{ width: 18, height: 18 }} />
      {n}
    </span>
  );
}

/** HP, gold, Pusaka and deck. Tap the Pusaka or deck to see them. */
export function RunHeader({ run, title }: { run: Run; title: string }) {
  const [open, setOpen] = useState<"relics" | "deck" | null>(null);
  return (
    <>
      <header style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <Link href="/silat" className="icon-btn" aria-label="Leave (your run is saved)" style={{ background: "#fff", boxShadow: "0 3px 0 var(--cream-3)" }}><Icon.Close /></Link>
        <span className="display" style={{ flex: 1, fontSize: 20 }}>{title}</span>
        <button type="button" className="btn btn-sm btn-white" style={{ color: "var(--plum)" }} onClick={() => { feedback.tap(); setOpen("deck"); }}>Deck {run.deck.length}</button>
      </header>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 14, fontWeight: 900, color: "#B81F1F" }}>
          {/* eslint-disable-next-line @next/next/no-img-element -- tiny pixel sprite */}
          <img src="/silat/pixel/ui-heart.png" alt="" className="px" style={{ width: 18, height: 18 }} />
          {run.hp}/{run.max}
        </span>
        <Gold n={run.gold} />
        <button type="button" onClick={() => { feedback.tap(); setOpen("relics"); }} aria-label={`Your Pusaka: ${run.relics.map((id) => RELICS[id]?.name).join(", ")}`} style={{ border: 0, background: "none", padding: 0, cursor: "pointer", display: "flex", gap: 4, marginLeft: "auto" }}>
          {run.relics.map((id) => <RelicIcon key={id} id={id} size={26} />)}
        </button>
      </div>
      <Sheet open={open === "relics"} onClose={() => setOpen(null)} label="Your Pusaka">
        <h2 className="display" style={{ margin: 0, fontSize: 24, textAlign: "center" }}>Your Pusaka</h2>
        <div style={{ display: "flex", flexDirection: "column", gap: 14, maxHeight: "60dvh", overflowY: "auto" }}>
          {run.relics.map((id) => <RelicRow key={id} id={id} />)}
        </div>
      </Sheet>
      <Sheet open={open === "deck"} onClose={() => setOpen(null)} label="Your deck">
        <h2 className="display" style={{ margin: 0, fontSize: 24, textAlign: "center" }}>Your deck · {run.deck.length}</h2>
        <DeckGrid deck={run.deck} />
      </Sheet>
    </>
  );
}

function DeckGrid({ deck, onPick }: { deck: string[]; onPick?: (i: number) => void }) {
  const order = deck.map((id, i) => ({ id, i })).sort((a, b) => CARDS[a.id].type.localeCompare(CARDS[b.id].type) || a.id.localeCompare(b.id));
  return (
    <div style={{ maxHeight: "60dvh", overflowY: "auto", display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: "16px 8px", justifyItems: "center", padding: "10px 0" }}>
      {order.map(({ id, i }) => onPick ? (
        <button key={i} type="button" onClick={() => onPick(i)} aria-label={`Choose ${CARDS[id].name}`} style={{ width: 100, height: 144, border: 0, padding: 0, background: "none", cursor: "pointer" }}><SilatCard id={id} /></button>
      ) : (
        <span key={i} style={{ width: 100, height: 144, display: "block" }}><SilatCard id={id} /></span>
      ))}
    </div>
  );
}

function Screen({ children, dark }: { children: ReactNode; dark?: boolean }) {
  return <main className="screen" style={{ gap: 14, ...(dark ? { background: "#2B1A12", color: "#FFF8EC", maxWidth: "none" } : {}) }}>{children}</main>;
}

// ---------- Map: one tier of the tower ----------

const ROW_H = 82;
const PAD = 64;

function spot(n: MapNode) {
  const wobble = ((n.seed % 100) / 100 - 0.5) * 8;
  const x = n.kind === "boss" || n.row === 0 ? 50 : ((n.lane + 0.5) / MAP_LANES) * 100 + wobble;
  const y = PAD + (MAP_ROWS - 1 - n.row) * ROW_H;
  return { x, y };
}

/** The tower runs up the middle. Every room is a little island: the inner ones hang on the tower's
 *  wall, the outer ones float beside it. You climb from the door at the bottom to the guardian on top. */
export function MapScreen({ run, onChange }: { run: Run; onChange: (r: Run) => void }) {
  const reach = new Set(nextNodes(run.map, run.at));
  const visited = new Set(run.path);
  const height = PAD * 2 + (MAP_ROWS - 1) * ROW_H;
  const pos = new Map(run.map.nodes.map((n) => [n.id, spot(n)]));
  const [peek, setPeek] = useState<MapNode | null>(null);
  const depth = depthOf(run);
  const look = LOOKS[tierFor(depth).biome];
  const night = look.day < 0.9;
  // Start with the rooms you can go to in view.
  const focus = useRef<HTMLButtonElement>(null);
  useEffect(() => { focus.current?.scrollIntoView({ block: "center" }); }, [run.at]);
  const focusId = [...reach][0] ?? run.at;
  return (
    <Screen>
      <RunHeader run={run} title={`${tierName(run)} · ${floorOf(run)}/${TOWER_FLOORS}`} />
      <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: "var(--plum-soft)", textAlign: "center" }}>
        Tier {depth} of {TOWER_TIERS}. Pick your way up: {bossFor(run.seed, depth).name} guards floor {towerFloor(depth, MAP_ROWS - 1)}.
      </p>
      <div className="sl-tower" style={{ height, background: `linear-gradient(${look.sky[0]}, ${look.sky[1]})` }} aria-label="This tier of the tower">
        {[[8, 70, 0.9], [72, 210, 0.7], [-6, 390, 0.8], [78, 520, 0.9], [4, 650, 0.7]].map(([x, y, o], i) => (
          <span key={i} className="sl-cloud" style={{ left: `${x}%`, top: y, opacity: night ? o * 0.25 : o }} aria-hidden="true" />
        ))}
        <div className="sl-tower-body" style={{ background: look.brick }} aria-hidden="true">
          {[0, 3, 6].map((r) => <span key={r} className="sl-tower-ring" style={{ top: PAD + (MAP_ROWS - 1 - r) * ROW_H - ROW_H * 0.52 - (r === 0 ? 300 : 0), display: r === 0 ? "none" : undefined, background: look.brick }} />)}
          <span className="sl-tower-door" style={{ top: PAD + (MAP_ROWS - 1) * ROW_H - 34 }} />
        </div>
        {Array.from({ length: MAP_ROWS }, (_, r) => (
          <span key={r} className="sl-tower-floor" style={{ top: PAD + (MAP_ROWS - 1 - r) * ROW_H - 9 }} aria-hidden="true">{towerFloor(depth, r)}</span>
        ))}
        <svg width="100%" height={height} style={{ position: "absolute", inset: 0 }} aria-hidden="true">
          {run.map.edges.map(([f, t]) => {
            const a = pos.get(f)!, b = pos.get(t)!;
            const walked = visited.has(f) && visited.has(t) && run.path.indexOf(t) === run.path.indexOf(f) + 1;
            const next = f === run.at && reach.has(t);
            return (
              <line key={`${f}>${t}`} x1={`${a.x}%`} y1={a.y} x2={`${b.x}%`} y2={b.y}
                stroke={walked ? "#FFC800" : next ? "#FFFFFF" : "rgba(255,255,255,.55)"} strokeWidth={walked || next ? 4 : 3} strokeDasharray={walked ? undefined : "2 9"} strokeLinecap="round" />
            );
          })}
        </svg>
        {run.map.nodes.map((n) => {
          const p = pos.get(n.id)!;
          const info = NODE_INFO[n.kind];
          const can = reach.has(n.id);
          const here = n.id === run.at;
          const past = visited.has(n.id) && !here;
          const w = n.kind === "boss" ? 84 : 62;
          return (
            <button
              key={n.id}
              ref={n.id === focusId ? focus : undefined}
              type="button"
              onClick={() => { feedback.tap(); setPeek(n); }}
              aria-label={`Floor ${towerFloor(depth, n.row)}: ${info.name}${can ? ", you can go here" : ""}${here ? ", you are here" : ""}`}
              className={`sl-isle${can ? " can sl-node-can" : ""}${here ? " here" : ""}${past ? " past" : ""}`}
              style={{ left: `calc(${p.x}% - ${w / 2}px)`, top: p.y - 34, width: w, ["--isle" as string]: can || here ? info.color : look.grass, ["--dirt" as string]: look.dirt }}
            >
              <span className="land" />
              {/* eslint-disable-next-line @next/next/no-img-element -- tiny pixel sprite */}
              <img src={`/silat/pixel/map-${n.kind}.png`} alt="" className="px" style={{ width: n.kind === "boss" ? 46 : 32, height: n.kind === "boss" ? 46 : 32 }} />
              {here && <span className="you">You</span>}
            </button>
          );
        })}
      </div>
      <Sheet open={!!peek} onClose={() => setPeek(null)} label="Map stop">
        {peek && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, textAlign: "center" }}>
            <h2 className="display" style={{ margin: 0, fontSize: 26 }}>{NODE_INFO[peek.kind].name}</h2>
            <p style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "var(--plum-soft)" }}>{NODE_INFO[peek.kind].sub}</p>
            {reach.has(peek.id) ? (
              <button className="pill-btn primary" onClick={() => { feedback.unlock(); feedback.tap(); setPeek(null); onChange(enter(run, peek.id)); }}>Go here</button>
            ) : (
              <p style={{ margin: 0, fontSize: 14, fontWeight: 800, color: "var(--plum-soft)" }}>{visited.has(peek.id) ? "You've been here." : "You can't reach this yet."}</p>
            )}
          </div>
        )}
      </Sheet>
    </Screen>
  );
}

// ---------- Reward after a fight ----------

export function RewardScreen({ run, onChange }: { run: Run; onChange: (r: Run) => void }) {
  const [card, setCard] = useState<string | null>(null);
  const [relic, setRelic] = useState<string | null>(null);
  const rw = run.reward!;
  const needRelic = rw.relics.length > 0 && !relic;
  return (
    <Screen dark>
      <span className="stamp" style={{ alignSelf: "center", marginTop: 12, padding: "8px 20px", borderRadius: 14, background: "#FFC800", color: "#4A3200", fontSize: 26, fontWeight: 900, boxShadow: "0 5px 0 #E5A800" }}>{rw.escape ? "NAIK!" : "MENANG!"}</span>
      {rw.escape && (
        <span style={{ textAlign: "center", fontSize: 15, fontWeight: 700, color: "#E8D6C0", lineHeight: 1.4 }}>
          {tierName(run)} is cleared: {floorOf(run)} floors down. The stairs lead up to{" "}
          <b style={{ color: "#FFC800" }}>{tierName({ depth: depthOf(run) + 1 })}</b>. Tougher pieces, a bigger board, a new guardian.
        </span>
      )}
      <span style={{ textAlign: "center", fontSize: 15, fontWeight: 800, color: "#E8D6C0" }}>+{rw.gold} gold · HP {run.hp}/{run.max}</span>

      {rw.relics.length > 0 && (
        <>
          <span className="label" style={{ textAlign: "center", color: "#C9B49C", marginTop: 6 }}>{rw.escape ? "Guardian reward: pick a Pusaka" : "Elite reward: pick a Pusaka"}</span>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {rw.relics.map((id) => (
              <button key={id} type="button" onClick={() => { feedback.tap(); setRelic(id); }} aria-pressed={relic === id}
                style={{ textAlign: "left", padding: 12, borderRadius: 16, border: relic === id ? "3px solid #FFC800" : "3px solid transparent", background: "#FFF8EC", cursor: "pointer" }}>
                <RelicRow id={id} />
              </button>
            ))}
          </div>
        </>
      )}

      {rw.unlocked && (
        <span className="sl-unlock">New cards unlocked: {rw.unlocked}</span>
      )}
      <span className="label" style={{ textAlign: "center", color: "#C9B49C", marginTop: 6 }}>Add a card to your deck</span>
      <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
        {rw.cards.map((id, i) => (
          <button key={id} type="button" className="sl-cw" aria-pressed={card === id} aria-label={`${CARDS[id].name}: ${CARDS[id].text}`}
            onClick={() => { feedback.tap(); setCard(card === id ? null : id); }}
            style={{ position: "relative", bottom: 0, transform: card === id ? "translateY(-12px) scale(1.08)" : card ? "scale(.92)" : undefined, opacity: card && card !== id ? 0.5 : 1 }}>
            <span className="deal" style={{ animationDelay: `${120 + i * 100}ms` }}><span className="bob" style={{ animationDelay: `${-i * 0.9}s` }}><SilatCard id={id} on={card === id} /></span></span>
            {!run.deck.includes(id) && <span className="sl-new">NEW</span>}
          </button>
        ))}
      </div>
      <div className="grow" />
      <button className="pill-btn primary" disabled={needRelic} style={{ opacity: needRelic ? 0.5 : 1 }}
        onClick={() => { feedback.correct(); onChange(takeReward(run, card, relic)); }}>
        {needRelic ? "Pick a Pusaka first" : card ? `Take ${CARDS[card].name}` : "Skip the card"}
      </button>
    </Screen>
  );
}

// ---------- Campfire ----------

export function CampScreen({ run, onChange }: { run: Run; onChange: (r: Run) => void }) {
  const [picking, setPicking] = useState(false);
  return (
    <Screen>
      <RunHeader run={run} title="Campfire" />
      <div className="grow" />
      <div style={{ fontSize: 72, textAlign: "center" }} aria-hidden="true">
        {/* eslint-disable-next-line @next/next/no-img-element -- pixel sprite */}
        <img src="/silat/pixel/map-camp.png" alt="" className="px" style={{ width: 112, height: 112 }} />
      </div>
      <p style={{ margin: 0, textAlign: "center", fontSize: 16, fontWeight: 700, color: "var(--plum-soft)" }}>A quiet night by the fire. Do one thing.</p>
      <button className="pill-btn primary" onClick={() => { feedback.correct(); onChange(rest(run)); }}>Rest · heal {REST_HEAL} HP</button>
      <button className="pill-btn" onClick={() => { feedback.tap(); setPicking(true); }} disabled={run.deck.length <= 5}>Train · remove a card</button>
      <div className="grow" />
      <Sheet open={picking} onClose={() => setPicking(false)} label="Remove a card">
        <h2 className="display" style={{ margin: 0, fontSize: 22, textAlign: "center" }}>Tap a card to remove it</h2>
        <DeckGrid deck={run.deck} onPick={(i) => { feedback.correct(); setPicking(false); onChange(train(run, i)); }} />
      </Sheet>
    </Screen>
  );
}

// ---------- Shop ----------

export function ShopScreen({ run, onChange }: { run: Run; onChange: (r: Run) => void }) {
  const [picking, setPicking] = useState(false);
  const shop = run.shop!;
  const buy = (next: Run) => { if (next !== run) { feedback.correct(); onChange(next); } else feedback.wrong(); };
  const price = (p: number, sold: boolean) => (sold ? "Sold" : <Gold n={p} />);
  return (
    <Screen>
      <RunHeader run={run} title="Warung" />
      <span className="label" style={{ color: "var(--plum-soft)" }}>Cards</span>
      <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
        {shop.cards.map((c, i) => (
          <button key={c.id} type="button" disabled={c.sold} onClick={() => buy(buyCard(run, i))} aria-label={`Buy ${CARDS[c.id].name} for ${c.price} gold`}
            style={{ border: 0, background: "none", padding: 0, cursor: c.sold ? "default" : "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 8, opacity: c.sold ? 0.4 : 1 }}>
            <span style={{ width: 100, height: 144, display: "block" }}><SilatCard id={c.id} off={!c.sold && run.gold < c.price} /></span>
            {price(c.price, c.sold)}
          </button>
        ))}
      </div>
      {shop.relic && (
        <>
          <span className="label" style={{ color: "var(--plum-soft)" }}>Pusaka</span>
          <button type="button" disabled={shop.relic.sold} onClick={() => buy(buyRelic(run))}
            style={{ display: "flex", alignItems: "center", gap: 12, textAlign: "left", padding: 12, borderRadius: 16, border: 0, background: "#fff", boxShadow: "0 3px 0 var(--cream-3)", cursor: "pointer", opacity: shop.relic.sold ? 0.4 : 1 }}>
            <span style={{ flex: 1 }}><RelicRow id={shop.relic.id} /></span>
            {price(shop.relic.price, shop.relic.sold)}
          </button>
        </>
      )}
      <span className="label" style={{ color: "var(--plum-soft)" }}>Services</span>
      <div style={{ display: "flex", gap: 10 }}>
        <button className="pill-btn" style={{ fontSize: 16, minHeight: 52, flexDirection: "column", gap: 0 }} disabled={shop.removed || run.gold < shop.removePrice || run.deck.length <= 5} onClick={() => setPicking(true)}>
          <span>Remove a card</span>{price(shop.removePrice, shop.removed)}
        </button>
        <button className="pill-btn" style={{ fontSize: 16, minHeight: 52, flexDirection: "column", gap: 0 }} disabled={shop.healed || run.gold < shop.healPrice || run.hp >= run.max} onClick={() => buy(buyHeal(run))}>
          <span>Heal {SHOP_HEAL} HP</span>{price(shop.healPrice, shop.healed)}
        </button>
      </div>
      <div className="grow" />
      <button className="pill-btn primary" onClick={() => { feedback.tap(); onChange(leave(run)); }}>Leave the warung</button>
      <Sheet open={picking} onClose={() => setPicking(false)} label="Remove a card">
        <h2 className="display" style={{ margin: 0, fontSize: 22, textAlign: "center" }}>Tap a card to remove it</h2>
        <DeckGrid deck={run.deck} onPick={(i) => { setPicking(false); buy(buyRemove(run, i)); }} />
      </Sheet>
    </Screen>
  );
}

// ---------- Mystery event ----------

export function EventScreen({ run, onChange }: { run: Run; onChange: (r: Run) => void }) {
  const ev = EVENTS[run.event!];
  const [picking, setPicking] = useState<string | null>(null);
  const [rolled, setRolled] = useState<RollResult | null>(null);
  if (rolled) {
    const total = rolled.die + rolled.bonus;
    return (
      <Screen>
        <RunHeader run={run} title="Mystery" />
        <div className="grow" />
        <h1 className="display" style={{ margin: 0, fontSize: 30, textAlign: "center" }}>{ev.title}</h1>
        <div className="sl-d20" style={{ background: rolled.ok ? "#58CC02" : "#FF4B4B", boxShadow: `0 6px 0 ${rolled.ok ? "#3A8700" : "#B81F1F"}` }}>
          <span>{rolled.die}</span>
        </div>
        <p style={{ margin: 0, fontSize: 15, fontWeight: 900, color: "var(--plum)", textAlign: "center" }}>
          d20: {rolled.die}{rolled.bonus ? ` + ${rolled.bonus} (Pusaka) = ${total}` : ""} vs {rolled.dc}
          {rolled.die === 20 ? " · Natural 20!" : rolled.die === 1 ? " · Natural 1" : ""} · {rolled.ok ? "Success" : "Failed"}
        </p>
        <p style={{ margin: 0, fontSize: 17, fontWeight: 700, color: "var(--plum-soft)", textAlign: "center", lineHeight: 1.45 }}>{rolled.text}</p>
        <div className="grow" />
        <button className="pill-btn primary" onClick={() => { feedback.tap(); onChange(rolled.next); }}>Continue</button>
      </Screen>
    );
  }
  return (
    <Screen>
      <RunHeader run={run} title="Mystery" />
      <div className="grow" />
      <h1 className="display" style={{ margin: 0, fontSize: 32, textAlign: "center" }}>{ev.title}</h1>
      <p style={{ margin: 0, fontSize: 17, fontWeight: 700, color: "var(--plum-soft)", textAlign: "center", lineHeight: 1.45 }}>{ev.text}</p>
      <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 8 }}>
        {ev.choices.map((c) => {
          const broke = c.cost !== undefined && run.gold < c.cost;
          return (
            <button key={c.id} type="button" className="pill-btn" disabled={broke} style={{ flexDirection: "column", gap: 2, minHeight: 64, fontSize: 18, opacity: broke ? 0.5 : 1 }}
              onClick={() => {
                feedback.tap();
                if (c.needsCard) return setPicking(c.id);
                const r = c.check ? rollEvent(run, c.id) : null;
                if (r) { setRolled(r); if (r.ok) feedback.correct(); else feedback.wrong(); return; }
                onChange(chooseEvent(run, c.id));
              }}>
              <span>{c.label}</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: "var(--plum-soft)" }}>{c.detail}</span>
              {c.check && (
                <span style={{ fontSize: 12, fontWeight: 900, color: "#8A6400" }}>
                  Needs {c.check.dc}+ on a d20{checkBonus(run, c.check) ? ` · your Pusaka add +${checkBonus(run, c.check)}` : ""} · {Math.round(Math.min(19, Math.max(1, 21 - c.check.dc + checkBonus(run, c.check))) * 5)}%
                </span>
              )}
            </button>
          );
        })}
      </div>
      <div className="grow" />
      <Sheet open={!!picking} onClose={() => setPicking(null)} label="Choose a card">
        <h2 className="display" style={{ margin: 0, fontSize: 22, textAlign: "center" }}>Tap a card to remove it</h2>
        <DeckGrid deck={run.deck} onPick={(i) => { const c = picking!; setPicking(null); feedback.correct(); onChange(chooseEvent(run, c, i)); }} />
      </Sheet>
    </Screen>
  );
}

// ---------- Treasure ----------

export function TreasureScreen({ run, onChange }: { run: Run; onChange: (r: Run) => void }) {
  return (
    <Screen>
      <RunHeader run={run} title="Treasure" />
      <div className="grow" />
      <h1 className="display" style={{ margin: 0, fontSize: 30, textAlign: "center" }}>Pick a Pusaka</h1>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {(run.treasure ?? []).map((id) => (
          <button key={id} type="button" onClick={() => { feedback.correct(); onChange(takeTreasure(run, id)); }}
            style={{ textAlign: "left", padding: 14, borderRadius: 18, border: 0, background: "#fff", boxShadow: "0 4px 0 var(--cream-3)", cursor: "pointer" }}>
            <RelicRow id={id} />
          </button>
        ))}
      </div>
      <div className="grow" />
      <button className="pill-btn" onClick={() => onChange(takeTreasure(run, null))}>Leave it</button>
    </Screen>
  );
}

// ---------- Pick a playstyle ----------

export function StyleScreen({ run, onChange }: { run: Run; onChange: (r: Run) => void }) {
  const [pick, setPick] = useState<Style | null>(null);
  return (
    <Screen>
      <RunHeader run={run} title="Choose your style" />
      <p style={{ margin: 0, fontSize: 15, fontWeight: 700, color: "var(--plum-soft)", textAlign: "center" }}>
        Everyone starts with 5 Tendang and 4 Tangkis. Your style adds its signature card, and its cards show up more as rewards.
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {(Object.keys(STYLES) as Style[]).map((id) => {
          const st = STYLES[id];
          const on = pick === id;
          return (
            <button key={id} type="button" aria-pressed={on} onClick={() => { feedback.tap(); setPick(id); }}
              style={{ textAlign: "left", padding: 14, borderRadius: 20, cursor: "pointer", background: "#fff", border: `3px solid ${on ? st.color : "transparent"}`, boxShadow: `0 4px 0 ${on ? st.edge : "var(--cream-3)"}`, display: "flex", flexDirection: "column", gap: 10 }}>
              <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ width: 34, height: 34, borderRadius: 12, background: st.color, boxShadow: `0 3px 0 ${st.edge}`, color: "#fff", fontWeight: 900, fontSize: 18, display: "flex", alignItems: "center", justifyContent: "center" }}>{st.name[0]}</span>
                <span style={{ display: "flex", flexDirection: "column", lineHeight: 1.2 }}>
                  <span className="display" style={{ fontSize: 20 }}>{st.name} · {st.animal}</span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: "var(--plum-soft)" }}>{st.text}</span>
                </span>
              </span>
              {on && (
                <span style={{ display: "flex", gap: 10, justifyContent: "center" }}>
                  {STYLE_STARTER[id].map((cid) => <span key={cid} style={{ width: 100, height: 144, display: "block" }}><SilatCard id={cid} /></span>)}
                </span>
              )}
            </button>
          );
        })}
      </div>
      <div className="grow" />
      <button className="pill-btn primary" disabled={!pick} style={{ opacity: pick ? 1 : 0.5 }}
        onClick={() => { if (!pick) return; feedback.correct(); onChange(chooseStyle(run, pick)); }}>
        {pick ? `Fight as ${STYLES[pick].name}` : "Pick a style"}
      </button>
    </Screen>
  );
}
