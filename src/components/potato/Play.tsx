"use client";

import type { FunctionReturnType } from "convex/server";
import { useMutation } from "convex/react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { api } from "../../../convex/_generated/api";
import { BOOM_MS, alive as aliveOf, heat } from "../../../convex/lib/potato/rules";
import { TimerBar, Toast } from "@/components/words/common";
import { Avatar, Confetti, Icon, Sheet, roomPaints } from "@/components/ui";
import { errorText } from "@/lib/errors";
import { feedback } from "@/lib/feedback";
import { useNow } from "@/lib/hooks";
import { Challenge } from "./Challenges";

export type PotatoView = NonNullable<FunctionReturnType<typeof api.potato.view>>;
type G = NonNullable<PotatoView["game"]>;
export const GAME_NAME = "Hot Potato";

export function PotatoPlay({ room }: { room: PotatoView }) {
  const g = room.game!;
  const me = room.meId;
  const pass = useMutation(api.potato.pass);
  const now = useNow(100);
  const [toast, setToast] = useState<{ text: string; kind: string; id: number } | null>(null);
  const toastN = useRef(0);
  const [solvedFor, setSolvedFor] = useState<string | null>(null); // the challenge you beat, `${bomb}:${givenAt}`
  const name = (id: string) => (id === me ? "You" : g.names[id] ?? "Player");
  const paints = roomPaints(g.players.map((id, seat) => ({ id, seat, isMe: id === me })));
  const living = aliveOf({ players: g.players, lives: g.lives } as never);
  const holding = g.phase === "play" && g.holder === me;
  const turnKey = `${g.bomb}:${g.givenAt}`;
  const canThrow = holding && solvedFor === turnKey;
  const h = g.phase === "play" ? heat(g.bombAt, now) : 0;

  // Ticking that speeds up as the bomb heats; a buzz when the bomb lands on you; a bang on explosion.
  const hRef = useRef(h);
  useEffect(() => { hRef.current = h; }, [h]);
  useEffect(() => {
    if (g.phase !== "play" || g.done) return;
    let t: ReturnType<typeof setTimeout>;
    const loop = () => { feedback.tick(); t = setTimeout(loop, 900 - hRef.current * 700); };
    t = setTimeout(loop, 400);
    return () => clearTimeout(t);
  }, [g.phase, g.bomb, g.done]);
  const lastHolder = useRef(g.holder);
  useEffect(() => {
    if (g.holder !== lastHolder.current && g.holder === me && g.phase === "play") feedback.ping();
    lastHolder.current = g.holder;
  }, [g.holder, g.phase, me]);
  const lastPhase = useRef(g.phase);
  useEffect(() => {
    if (g.phase === "boom" && lastPhase.current !== "boom") feedback.wrong();
    lastPhase.current = g.phase;
  }, [g.phase]);

  async function throwAt(target: string) {
    feedback.tap();
    try { await pass({ code: room.code, bomb: g.bomb, target }); }
    catch (e) { feedback.wrong(); toastN.current += 1; setToast({ text: errorText(e, "Missed!"), kind: "bad", id: toastN.current }); }
  }

  const others = living.filter((p) => p !== me);
  return (
    <main className={`screen tight hp-screen${holding ? " hot" : ""}${g.phase === "boom" ? " boom" : ""}`} style={{ "--heat": h } as CSSProperties}>
      <Header room={room} />
      <div className="hp-ring">
        {g.players.map((p) => {
          const out = g.lives[p] <= 0;
          const has = g.phase === "play" && g.holder === p;
          return (
            <div key={p} className={`hp-seat${out ? " out" : ""}${has ? " has" : ""}${p === me ? " me" : ""}`}>
              <span className="av"><Avatar name={g.names[p] ?? "?"} paint={paints.get(p)} size={44} />{has && <span key={`${g.bomb}-${g.passes}`} className="hp-mini pop">💣</span>}</span>
              <span className="nm">{name(p)}</span>
              <span className="lv">{out ? "💀" : "❤️".repeat(g.lives[p])}</span>
            </div>
          );
        })}
      </div>

      {g.done ? null : g.phase === "boom" ? (
        <section className="hp-boom">
          <span className="hp-bang">💥</span>
          <h2>{g.lastBoom?.who === me ? "BOOM! You got blown up!" : `BOOM! ${name(g.lastBoom?.who ?? "")} got blown up!`}</h2>
          <p>{g.lives[g.lastBoom?.who ?? ""] > 0 ? "−1 ❤️" : "They're out! 💀"} · {g.lastBoom?.passes ?? 0} passes in {Math.round((g.lastBoom?.ms ?? 0) / 1000)}s</p>
          <TimerBar deadline={g.deadline} total={BOOM_MS} />
          <p className="hp-next">Next bomb coming…</p>
        </section>
      ) : holding ? (
        <section className="hp-mine">
          <span className="hp-bomb" aria-label="You have the bomb">💣</span>
          {!canThrow ? (
            <Challenge key={turnKey} kind={g.challenge!.kind} seed={g.challenge!.seed} onSolved={() => setSolvedFor(turnKey)} />
          ) : (
            <div className="hp-throw rise">
              <p className="hp-prompt">THROW IT AT…</p>
              <div className="hp-targets">
                {others.map((p) => (
                  <button key={p} type="button" className="hp-target-btn" onPointerDown={(e) => { e.preventDefault(); void throwAt(p); }}>
                    <Avatar name={g.names[p] ?? "?"} paint={paints.get(p)} size={52} />
                    <b>{g.names[p]}</b>
                  </button>
                ))}
              </div>
            </div>
          )}
        </section>
      ) : (
        <section className="hp-watch">
          <span key={`${g.bomb}-${g.passes}`} className="hp-bomb far pop">💣</span>
          <h2>{g.lives[me] > 0 ? `${name(g.holder)} has the bomb! 😬` : `${name(g.holder)} has the bomb`}</h2>
          <p>{g.lives[me] > 0 ? "Get ready… it could come your way!" : "You're out. Enjoy the chaos 🍿"}</p>
          <p className="hp-passes">{g.passes} {g.passes === 1 ? "pass" : "passes"} this bomb</p>
        </section>
      )}
      <Toast toast={toast} onDone={() => setToast(null)} />
      {g.done && <Done room={room} g={g} name={name} />}
    </main>
  );
}

function Header({ room }: { room: PotatoView }) {
  const router = useRouter();
  const leave = useMutation(api.potato.leave);
  const g = room.game!;
  const [ask, setAsk] = useState(false);
  const go = async () => { await leave({ code: room.code }).catch(() => {}); router.push("/potato"); };
  return (
    <>
      <header className="topbar" style={{ gap: 8, minHeight: 44 }}>
        <button className="icon-btn" aria-label="Leave game" onClick={() => { feedback.tap(); if (g.done || !g.isPlayer) void go(); else setAsk(true); }}><Icon.Close /></button>
        <span className="chip hp-chip">💣 {GAME_NAME.toUpperCase()}</span>
        <span className="grow" />
        <span className="chip chip-mist">BOMB {g.bomb}</span>
      </header>
      <Sheet open={ask} onClose={() => setAsk(false)} label="Leave game">
        <h2 style={{ margin: 0, fontSize: 24, fontWeight: 900, textAlign: "center" }}>Run away?</h2>
        <p style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "var(--muted)", textAlign: "center" }}>You&apos;ll be out, and the others keep playing.</p>
        <button className="btn btn-green" onClick={() => setAsk(false)}>Stay</button>
        <button className="btn btn-white" style={{ color: "var(--cherry-edge)" }} onClick={go}>Leave</button>
      </Sheet>
    </>
  );
}

function Done({ room, g, name }: { room: PotatoView; g: G; name: (id: string) => string }) {
  const router = useRouter();
  const rematch = useMutation(api.potato.rematch);
  const leave = useMutation(api.potato.leave);
  const winner = g.done?.winner ?? null;
  const iWon = winner === room.meId;
  const played = useRef(false);
  useEffect(() => {
    if (played.current) return;
    played.current = true;
    if (iWon) feedback.win(); else feedback.wrong();
  }, [iWon]);
  const order = [...(winner ? [winner] : []), ...[...g.out].reverse()];
  return (
    <div className="overlay hp-done">
      {iWon && <Confetti />}
      <span className="hp-crown">{winner ? "👑" : "💥"}</span>
      <h2>{winner ? (iWon ? "You survived!" : `${name(winner)} survived!`) : "Everyone's gone!"}</h2>
      <div className="list" style={{ width: "100%", maxWidth: 360 }}>
        {order.map((p, i) => (
          <div key={p} className={`list-row${p === room.meId ? " me" : ""}`}>
            <span style={{ width: 28, fontSize: 18, fontWeight: 900 }}>{i === 0 && winner ? "🏆" : `#${i + 1}`}</span>
            <span style={{ flex: 1, fontSize: 17, fontWeight: 900 }}>{name(p)}</span>
            <span>{p === winner ? "❤️".repeat(Math.max(1, g.lives[p])) : "💀"}</span>
          </div>
        ))}
      </div>
      <button className="btn btn-green" style={{ maxWidth: 380 }} onClick={() => { feedback.tap(); void rematch({ code: room.code }); }}>Play again</button>
      <button className="btn btn-ghost" style={{ maxWidth: 380 }} onClick={async () => { await leave({ code: room.code }).catch(() => {}); router.push("/potato"); }}>Back home</button>
    </div>
  );
}
