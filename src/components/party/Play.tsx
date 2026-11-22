"use client";

import type { FunctionReturnType } from "convex/server";
import { useMutation } from "convex/react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../../../convex/_generated/api";
import { REVEAL_MS, microOf, type MicroId } from "../../../convex/lib/party/rules";
import { TimerBar, Toast } from "@/components/words/common";
import { Avatar, Confetti, Icon, Mascot, Sheet, roomPaints } from "@/components/ui";
import { errorText } from "@/lib/errors";
import { feedback } from "@/lib/feedback";
import { useNow } from "@/lib/hooks";
import { MicroGame } from "./Micro";

export type PartyView = NonNullable<FunctionReturnType<typeof api.party.view>>;
type G = NonNullable<PartyView["game"]>;
export const GAME_NAME = "Party Blitz";

export function PartyPlay({ room }: { room: PartyView }) {
  const g = room.game!;
  const submit = useMutation(api.party.submit);
  const now = useNow(100);
  const [toast, setToast] = useState<{ text: string; kind: string; id: number } | null>(null);
  const [mine, setMine] = useState<{ round: number; score: number } | null>(null);
  const me = room.meId;
  const name = (id: string) => (id === me ? "You" : g.names[id] ?? "Player");
  const paints = roomPaints(g.players.map((id, seat) => ({ id, seat, isMe: id === me })));

  const round = g.round;
  const onDone = useCallback((score: number) => {
    setMine({ round, score });
    void submit({ code: room.code, round, score }).catch((e) => { feedback.wrong(); setToast({ text: errorText(e, "Couldn't send your score"), kind: "bad", id: Date.now() }); });
  }, [round, room.code, submit]);

  // A fanfare for the round results.
  const key = `${g.round}${g.phase}`;
  const last = useRef(key);
  useEffect(() => {
    if (key === last.current) return;
    last.current = key;
    if (g.phase === "reveal") {
      const r = g.results.at(-1);
      if (r && (r.points[me] ?? 0) >= 3) feedback.correct(); else feedback.tap();
    }
  }, [key, g.phase, g.results, me]);

  const micro = g.micro ? microOf(g.micro) : null;
  const started = now >= g.startAt;
  const submitted = g.submitted.includes(me) || mine?.round === g.round;
  return (
    <main className="screen tight pb-screen">
      <Header room={room} g={g} />
      {!g.done && (
        <div className="pb-hud">
          <span className="chip pb-chip">ROUND {g.round + 1}/{g.rounds}</span>
          <span className="grow" />
          {[...g.players].sort((a, b) => (g.totals[b] ?? 0) - (g.totals[a] ?? 0)).slice(0, 4).map((p) => (
            <span key={p} className={`chip pb-tot${p === me ? " me" : ""}`}>{name(p)} {g.totals[p] ?? 0}</span>
          ))}
        </div>
      )}
      {g.done ? null : g.phase === "play" && micro ? (
        !g.isPlayer ? <p className="pb-wait wait">Watching…</p>
        : !started ? <Intro micro={g.micro!} left={g.startAt - now} best={room.bests[g.micro!] ?? null} />
        : !submitted ? <MicroGame key={g.round} id={g.micro!} seed={g.seed} onDone={onDone} />
        : (
          <section className="pb-waiting rise">
            <span className="pb-bigicon">{micro.icon}</span>
            <p>Your score: <b>{mine?.round === g.round ? mine.score : "…"}</b></p>
            <div className="pb-who">
              {g.players.map((p) => <span key={p} className={g.submitted.includes(p) ? "in" : ""}><Avatar name={g.names[p] ?? "?"} paint={paints.get(p)} size={30} />{g.submitted.includes(p) ? "✓" : "…"}</span>)}
            </div>
            <p className="wait">Waiting for the others…</p>
          </section>
        )
      ) : (
        <Results room={room} g={g} name={name} />
      )}
      <Toast toast={toast} onDone={() => setToast(null)} />
      {g.done && <Done room={room} g={g} name={name} />}
    </main>
  );
}

export function Intro({ micro, left, best }: { micro: MicroId; left: number; best: number | null }) {
  const m = microOf(micro);
  const secs = Math.ceil(left / 1000);
  const lastSec = useRef(-1);
  useEffect(() => {
    if (secs !== lastSec.current) {
      lastSec.current = secs;
      if (secs > 0 && secs <= 3) feedback.tick();
      if (secs <= 0) feedback.go();
    }
  }, [secs]);
  return (
    <section className="pb-intro" key={micro}>
      <span className="pb-bigicon pop">{m.icon}</span>
      <h2 className="pop">{m.name}</h2>
      <p>{m.howto}</p>
      <span className="pb-secs">{m.ms / 1000}s</span>
      {best !== null && <span className="pb-pb">🏆 Your record: {best}</span>}
      <span key={secs} className="pb-cd pop">{secs > 0 && secs <= 3 ? secs : secs > 3 ? "Get ready…" : "GO!"}</span>
    </section>
  );
}

function Results({ room, g, name }: { room: PartyView; g: G; name: (id: string) => string }) {
  const r = g.results.at(-1);
  if (!r) return null;
  const m = microOf(r.micro);
  const ranked = [...g.players].sort((a, b) => (r.scores[b] ?? 0) - (r.scores[a] ?? 0));
  const next = g.next ? microOf(g.next) : null;
  const unit = r.micro === "draw" ? "pts" : "";
  const solo = g.players.length === 1;
  return (
    <section className="pb-results rise">
      <p className="pb-rtitle">{m.icon} {m.name}</p>
      <div className="pb-ranks">
        {ranked.map((p, i) => (
          <div key={p} className={`pb-rank${p === room.meId ? " me" : ""}${(r.points[p] ?? 0) === 3 ? " win" : ""}`} style={{ animationDelay: `${i * 90}ms` }}>
            <span className="medal">{(r.points[p] ?? 0) === 3 || (solo && (r.points[p] ?? 0) > 0) ? "🥇" : (r.points[p] ?? 0) === 2 ? "🥈" : (r.points[p] ?? 0) === 1 ? "🥉" : "·"}</span>
            <span className="nm">{name(p)}{r.records.includes(p) && <i>NEW RECORD 🏆</i>}</span>
            <span className="sc">{r.scores[p] ?? 0}{unit && ` ${unit}`}</span>
            <span className="pt">+{r.points[p] ?? 0}</span>
          </div>
        ))}
      </div>
      <TimerBar deadline={g.deadline} total={REVEAL_MS} />
      <p className="pb-next">{next ? `Next up: ${next.icon} ${next.name}` : "Final scores coming up…"}</p>
    </section>
  );
}

function Header({ room, g }: { room: PartyView; g: G }) {
  const router = useRouter();
  const leave = useMutation(api.party.leave);
  const [ask, setAsk] = useState(false);
  const go = async () => { await leave({ code: room.code }).catch(() => {}); router.push("/party"); };
  return (
    <>
      <header className="topbar" style={{ gap: 8, minHeight: 44 }}>
        <button className="icon-btn" aria-label="Leave game" onClick={() => { feedback.tap(); if (g.done || !g.isPlayer) void go(); else setAsk(true); }}><Icon.Close /></button>
        <span className="chip pb-chip">⚡ {GAME_NAME.toUpperCase()}</span>
        <span className="grow" />
        <span className="chip chip-mist" aria-label={`Room code ${room.code}`}>{room.code}</span>
      </header>
      <Sheet open={ask} onClose={() => setAsk(false)} label="Leave game">
        <h2 style={{ margin: 0, fontSize: 24, fontWeight: 900, textAlign: "center" }}>Leave the party?</h2>
        <p style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "var(--muted)", textAlign: "center" }}>The others keep playing without you.</p>
        <button className="btn btn-green" onClick={() => setAsk(false)}>Keep playing</button>
        <button className="btn btn-white" style={{ color: "var(--cherry-edge)" }} onClick={go}>Leave</button>
      </Sheet>
    </>
  );
}

function Done({ room, g, name }: { room: PartyView; g: G; name: (id: string) => string }) {
  const router = useRouter();
  const rematch = useMutation(api.party.rematch);
  const leave = useMutation(api.party.leave);
  const ranked = [...g.players].sort((a, b) => (g.totals[b] ?? 0) - (g.totals[a] ?? 0));
  const best = g.totals[ranked[0]] ?? 0;
  const champs = ranked.filter((p) => (g.totals[p] ?? 0) === best);
  const iWon = champs.includes(room.meId);
  const wins = (p: string) => g.results.filter((r) => r.points[p] === 3).length;
  const records = g.results.reduce((n, r) => n + (r.records.includes(room.meId) ? 1 : 0), 0);
  const played = useRef(false);
  useEffect(() => {
    if (played.current) return;
    played.current = true;
    if (iWon) feedback.win(); else feedback.wrong();
  }, [iWon]);
  return (
    <div className="overlay pb-done">
      {iWon && <Confetti />}
      {g.done?.reason === "left" ? <Mascot size={84} mood="wow" /> : <span className="pb-trophy">🏆</span>}
      <h2>{champs.length > 1 ? "It's a tie!" : iWon ? "You're the champion!" : `${name(champs[0])} wins!`}</h2>
      <div className="pb-podium">
        {ranked.slice(0, 3).map((p, i) => (
          <div key={p} className={`step s${i + 1}${p === room.meId ? " me" : ""}`}>
            <span className="nm">{name(p)}</span>
            <span className="block"><b>{g.totals[p] ?? 0}</b><small>{wins(p)} wins</small></span>
          </div>
        ))}
      </div>
      {records > 0 && <p className="pb-sub">🏆 You set {records} new {records === 1 ? "record" : "records"}!</p>}
      <button className="btn btn-green" style={{ maxWidth: 380 }} onClick={() => { feedback.tap(); void rematch({ code: room.code }); }}>Play again</button>
      <button className="btn btn-ghost" style={{ maxWidth: 380 }} onClick={async () => { await leave({ code: room.code }).catch(() => {}); router.push("/party"); }}>Back home</button>
    </div>
  );
}
