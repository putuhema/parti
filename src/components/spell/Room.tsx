"use client";

import { useMutation } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { api } from "../../../convex/_generated/api";
import { MAX_HP, MAX_SHIELD, OVERCHARGE_MAX, SPELL_MAX } from "../../../convex/lib/spell/rules";
import { SPELLS, SPELL_BY_ID, type SpellId } from "../../../convex/lib/spell/spells";
import { InviteFriends } from "@/components/InviteFriends";
import { Avatar, Icon, roomPaints } from "@/components/ui";
import { errorText } from "@/lib/errors";
import { feedback } from "@/lib/feedback";
import { useNow } from "@/lib/hooks";
import { SpellArena } from "./SpellArena";

export type SpellView = NonNullable<FunctionReturnType<typeof api.spell.view>>;

export function SpellLobby({ room }: { room: SpellView }) {
  const router = useRouter();
  const start = useMutation(api.spell.start);
  const leave = useMutation(api.spell.leave);
  const [copied, setCopied] = useState(false);
  const [starting, setStarting] = useState(false);
  const paints = roomPaints(room.members);

  async function share() {
    feedback.tap();
    const url = `${location.origin}/spell/room/${room.code}`;
    try {
      if (navigator.share) await navigator.share({ title: "pums party", text: `Duel me in Spellcaster! Code ${room.code}`, url });
      else {
        await navigator.clipboard.writeText(url);
        setCopied(true);
        setTimeout(() => setCopied(false), 1800);
      }
    } catch {}
  }

  return (
    <main className="screen tight">
      <header className="topbar">
        <button className="icon-btn" onClick={async () => { await leave({ code: room.code }).catch(() => {}); router.push("/spell"); }}>
          <Icon.Close />
        </button>
        <span style={{ flex: 1, display: "flex", flexDirection: "column" }}>
          <span className="label" style={{ fontSize: 12 }}>Duel code</span>
          <span style={{ fontSize: 22, fontWeight: 900, letterSpacing: ".14em" }}>{room.code}</span>
        </span>
        <button className="icon-btn" style={{ border: "2px solid var(--line)", boxShadow: "0 3px 0 var(--line)" }} onClick={share} aria-label="Share">
          <Icon.Share size={18} />
        </button>
      </header>

      <section className="rise sc-hero">
        <span className="ps-kicker">3D ARENA · AIR-RUNE WIZARD DUEL</span>
        <h1 className="display" style={{ margin: 0, fontSize: 30 }}>Spellcaster Duel</h1>
        <p style={{ margin: 0, fontSize: 14, fontWeight: 700, opacity: 0.92 }}>
          Trace glowing runes in mid-air with your fingertip and unleash 3D spells!
        </p>
      </section>

      <section className="ps-collage-card">
        <span className="label">Grimoire · 5 Air Runes</span>
        <div className="sc-grimoire">
          {SPELLS.map((s) => (
            <div key={s.id} className="sc-grim-row">
              <span className="sc-rune-badge" style={{ background: `${s.color}22`, color: s.color }}>{s.rune}</span>
              <div style={{ flex: 1 }}>
                <b>{s.emoji} {s.name}</b>
                <small>{s.runeHint} · {s.desc}</small>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <span className="label">Wizards ({room.members.length}/{SPELL_MAX})</span>
          {copied && <span style={{ fontSize: 13, fontWeight: 900, color: "var(--lime-ink)" }}>Link copied!</span>}
        </div>
        {room.members.map((m) => (
          <div key={m.id} className="row-card" style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <Avatar name={m.name} paint={paints.get(m.id)} size={38} />
            <span style={{ flex: 1, fontWeight: 900 }}>{m.name} {m.isMe && <span style={{ color: "var(--muted)" }}>(you)</span>}</span>
            {m.isHost && <span className="pill" style={{ background: "var(--sun-soft)", color: "var(--sun-ink)" }}>Host</span>}
          </div>
        ))}
      </section>

      <InviteFriends kind="spell" code={room.code} />
      <div className="grow" />
      {room.isHost ? (
        <button
          className="btn btn-green"
          disabled={starting}
          onClick={async () => {
            feedback.unlock();
            feedback.tap();
            setStarting(true);
            await start({ code: room.code }).catch(() => setStarting(false));
          }}
        >
          {starting ? "Summoning arena…" : room.members.length === 1 ? "Duel Archmage Bot 🧙" : "Start 1v1 Wizard Duel ⚡"}
        </button>
      ) : (
        <p style={{ margin: 0, textAlign: "center", fontWeight: 800, color: "var(--muted)" }}>Waiting for host…</p>
      )}
    </main>
  );
}

export function SpellPlay({ room }: { room: SpellView }) {
  const router = useRouter();
  const castMut = useMutation(api.spell.cast);
  const rematchMut = useMutation(api.spell.rematch);
  const leaveMut = useMutation(api.spell.leave);

  const now = useNow(120);
  const [error, setError] = useState("");
  const [guideSpell, setGuideSpell] = useState<SpellId | null>(null);
  const g = room.game!;

  const countingDown = room.startAt !== null && now < room.startAt - 80;
  const countNum = room.startAt ? Math.max(1, Math.ceil((room.startAt - now) / 850)) : 0;

  const meId = room.meId;
  const oppId = g.players[0] === meId ? g.players[1] : g.players[0];
  const meWiz = g.wizards[meId];
  const oppWiz = g.wizards[oppId];

  const cdMs = meWiz ? Math.max(0, meWiz.nextCastAt - now) : 0;
  const canCast = !g.done && !countingDown && !!meWiz && cdMs <= 80;
  const latestEvent = g.events.length > 0 ? g.events[g.events.length - 1] : null;

  const handleCast = useCallback(
    (spell: SpellId) => {
      if (!canCast) return;
      setError("");
      void castMut({ code: room.code, spell }).catch((e) => setError(errorText(e)));
    },
    [canCast, castMut, room.code],
  );

  if (g.done) {
    const iWon = g.done.winner === meId;
    return (
      <main className="screen tight">
        <header className="topbar">
          <button className="icon-btn" onClick={async () => { await leaveMut({ code: room.code }).catch(() => {}); router.push("/spell"); }}>
            <Icon.Close />
          </button>
          <span style={{ flex: 1, fontWeight: 900, fontSize: 18 }}>Duel Complete</span>
        </header>

        <section className="rise sc-hero">
          <span className="ps-kicker">ARCANE VICTORY</span>
          <span style={{ fontSize: 58 }}>{iWon ? "🏆" : "🪄"}</span>
          <h1 className="display" style={{ margin: 0, fontSize: 32 }}>
            {iWon ? "You won the duel!" : `${g.names[g.done.winner]} wins!`}
          </h1>
          <p style={{ margin: 0, fontSize: 14.5, fontWeight: 700, opacity: 0.9 }}>
            Spells cast: {g.names[meId]} ({meWiz?.casts ?? 0}) · {g.names[oppId]} ({oppWiz?.casts ?? 0})
          </p>
        </section>

        <div className="grow" />
        {room.isHost && <button className="btn btn-green" onClick={() => void rematchMut({ code: room.code })}>Rematch ⚡</button>}
        <button className="btn btn-white" onClick={async () => { await leaveMut({ code: room.code }).catch(() => {}); router.push("/spell"); }}>Back home</button>
      </main>
    );
  }

  return (
    <main className="screen tight">
      <header className="topbar">
        <button className="icon-btn" onClick={async () => { await leaveMut({ code: room.code }).catch(() => {}); router.push("/spell"); }}>
          <Icon.Close />
        </button>
        <span style={{ flex: 1, fontWeight: 900, fontSize: 18 }}>🪄 Spellcaster Duel</span>
        {!countingDown && (
          <span className={`ps-timer-pill ${canCast ? "" : "urgent"}`} style={canCast ? { background: "#e2f8ec", color: "var(--lime-ink)" } : undefined}>
            {canCast ? "✨ Ready!" : `⏳ ${(cdMs / 1000).toFixed(1)}s`}
          </span>
        )}
      </header>

      {/* Enemy HP & Shield Bar */}
      {oppWiz && (
        <div className={`sc-hud-bar enemy ${oppWiz.frozen ? "frozen" : ""}`}>
          <div className="sc-hud-top">
            <b>{g.names[oppId]} {oppWiz.frozen && "❄️ FROZEN"}</b>
            <span>❤️ {oppWiz.hp}/{MAX_HP} {oppWiz.shield > 0 && `· 🛡️ ${oppWiz.shield}`}</span>
          </div>
          <div className="sc-hp-track">
            <div className="sc-hp-fill enemy" style={{ width: `${(oppWiz.hp / MAX_HP) * 100}%` }} />
            {oppWiz.shield > 0 && <div className="sc-sh-fill" style={{ width: `${(oppWiz.shield / MAX_SHIELD) * 100}%` }} />}
          </div>
        </div>
      )}

      {/* 3D Spell Arena */}
      <div style={{ position: "relative" }}>
        <SpellArena
          meId={meId}
          canCast={canCast}
          myShield={meWiz?.shield ?? 0}
          myFrozen={meWiz?.frozen ?? false}
          overcharged={(meWiz?.charge ?? 0) >= OVERCHARGE_MAX}
          guideSpell={guideSpell}
          latestEvent={latestEvent}
          onCast={handleCast}
        />
        {countingDown && (
          <div className="sc-count-overlay">
            <span>WANDS UP!</span>
            <b>{countNum}</b>
          </div>
        )}
      </div>

      {/* Latest Battle Event Ticker */}
      {latestEvent && (
        <div className="sc-ticker" key={latestEvent.id}>
          <span>
            {SPELL_BY_ID[latestEvent.spell].emoji}{" "}
            <b>{g.names[latestEvent.by]}</b> cast <b>{SPELL_BY_ID[latestEvent.spell].name}</b>
            {latestEvent.overcharged && " 🌟"}
            {latestEvent.damage > 0 && ` for ${latestEvent.damage} dmg`}
            {latestEvent.shattered && " (❄️ SHATTER +10!)"}
            {latestEvent.pierced && " (⚡ SHIELD BROKEN!)"}
            {latestEvent.blocked > 0 && ` (${latestEvent.blocked} blocked)`}
            {latestEvent.healed > 0 && ` (+${latestEvent.healed} HP)`}
            {latestEvent.combo >= 3 && ` · 🔥 ${latestEvent.combo}x COMBO!`}
          </span>
        </div>
      )}

      {/* My HP, Shield & Overcharge Bar */}
      {meWiz && (
        <div className={`sc-hud-bar me ${meWiz.frozen ? "frozen" : ""}`}>
          <div className="sc-hud-top">
            <b>
              {g.names[meId]} (You) {meWiz.frozen && "❄️"}
              {(meWiz.combo ?? 0) >= 2 && <span className="sc-combo-tag"> 🔥{meWiz.combo}x</span>}
            </b>
            <span>
              ❤️ {meWiz.hp}/{MAX_HP}
              {meWiz.shield > 0 && ` · 🛡️ ${meWiz.shield}`}
              {" · "}
              <span style={{ color: (meWiz.charge ?? 0) >= OVERCHARGE_MAX ? "#d97706" : "#6b38e8" }}>
                {"⚡".repeat(meWiz.charge ?? 0)}{"○".repeat(Math.max(0, OVERCHARGE_MAX - (meWiz.charge ?? 0)))}
              </span>
            </span>
          </div>
          <div className="sc-hp-track">
            <div className="sc-hp-fill me" style={{ width: `${(meWiz.hp / MAX_HP) * 100}%` }} />
            {meWiz.shield > 0 && <div className="sc-sh-fill" style={{ width: `${(meWiz.shield / MAX_SHIELD) * 100}%` }} />}
          </div>
        </div>
      )}

      {/* Quick-Cast & Animated Rune Guide Bar */}
      <div className="sc-spell-bar">
        {SPELLS.map((s) => (
          <button
            key={s.id}
            type="button"
            className={`sc-spell-btn ${guideSpell === s.id ? "guided" : ""}`}
            disabled={!canCast}
            onMouseEnter={() => setGuideSpell(s.id)}
            onMouseLeave={() => setGuideSpell((cur) => (cur === s.id ? null : cur))}
            onClick={() => handleCast(s.id)}
            title={`${s.name}: ${s.runeHint} — ${s.desc}`}
          >
            <span className="sc-spell-rune" style={{ color: s.color }}>{s.rune}</span>
            <span style={{ fontSize: 16 }}>{s.emoji}</span>
            <small>{s.name.split(" ")[0]}</small>
          </button>
        ))}
      </div>

      {error && <p role="alert" style={{ margin: 0, color: "var(--cherry-edge)", fontWeight: 800, textAlign: "center", fontSize: 13 }}>{error}</p>}
    </main>
  );
}
