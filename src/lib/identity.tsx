"use client";

import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { api } from "../../convex/_generated/api";
import { Mascot } from "@/components/ui";
import { authClient } from "@/lib/auth-client";
import { feedback } from "@/lib/feedback";

type Me = NonNullable<ReturnType<typeof useQuery<typeof api.players.me>>>;
type Identity = { me: Me };

const Ctx = createContext<Identity | null>(null);
/** Where the app kept its login before accounts. Used once to bring old players over. */
const LEGACY_KEY = "sudoku-party:token";

function readLegacy() {
  try {
    return typeof window === "undefined" ? null : localStorage.getItem(LEGACY_KEY);
  } catch {
    return null;
  }
}

/**
 * Everyone gets a guest session straight away, so the app opens with no sign-up.
 * A guest can save their account (email + password) later from the Me tab.
 */
export function IdentityProvider({ children }: { children: ReactNode }) {
  const { isLoading, isAuthenticated } = useConvexAuth();
  const me = useQuery(api.players.me, isAuthenticated ? {} : "skip");
  const claim = useMutation(api.players.claim);
  const [legacy] = useState(readLegacy);
  const [claimed, setClaimed] = useState(!legacy);
  const [failed, setFailed] = useState(false);
  const guestStarted = useRef(false);

  // Not signed in at all (first visit, or just signed out): start a guest session.
  useEffect(() => {
    if (isAuthenticated) { guestStarted.current = false; return; }
    if (isLoading || guestStarted.current) return;
    guestStarted.current = true;
    authClient.signIn.anonymous().then((r) => { if (r.error) setFailed(true); }, () => setFailed(true));
  }, [isLoading, isAuthenticated]);

  // Signed in without a player yet: if this phone played before accounts, bring that player over.
  useEffect(() => {
    if (me !== null || claimed || !legacy) return;
    claim({ token: legacy })
      .then((ok) => { if (ok) try { localStorage.removeItem(LEGACY_KEY); } catch {} })
      .catch(() => {})
      .finally(() => setClaimed(true));
  }, [me, claimed, legacy, claim]);

  if (failed && !isAuthenticated) return <Retry />;
  if (!isAuthenticated || me === undefined || (me === null && !claimed)) return <Splash />;
  if (me === null) return <Onboarding />;
  return <Ctx.Provider value={{ me }}>{children}</Ctx.Provider>;
}

export function useIdentity() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useIdentity outside provider");
  return v;
}

function Splash() {
  return (
    <main className="screen" style={{ alignItems: "center", justifyContent: "center" }}>
      <Mascot size={96} className="bob" />
    </main>
  );
}

function Retry() {
  return (
    <main className="screen" style={{ alignItems: "center", justifyContent: "center", textAlign: "center" }}>
      <Mascot size={96} mood="wow" />
      <h1 style={{ margin: 0, fontSize: 26, fontWeight: 900 }}>Can&apos;t connect</h1>
      <p style={{ margin: 0, fontSize: 17, fontWeight: 700, color: "var(--muted)" }}>Check your connection and try again.</p>
      <button className="btn btn-green" style={{ marginTop: 12 }} onClick={() => location.reload()}>Try again</button>
    </main>
  );
}

function Onboarding() {
  const create = useMutation(api.players.create);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const ok = name.trim().length > 0;
  return (
    <main className="screen">
      <div className="grow" />
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14 }}>
        <Mascot size={120} className="bob" />
        <h1 className="display" style={{ margin: 0, fontSize: 40 }}>pums party</h1>
        <p style={{ margin: 0, fontSize: 18, fontWeight: 700, color: "var(--muted)", textAlign: "center" }}>
          Hi, I&apos;m Kubo! What should your friends call you?
        </p>
      </div>
      <form
        style={{ display: "flex", flexDirection: "column", gap: 14, marginTop: 12 }}
        onSubmit={async (e) => {
          e.preventDefault();
          if (!ok || busy) return;
          setBusy(true);
          feedback.unlock();
          feedback.tap();
          try {
            await create({ name });
          } finally {
            setBusy(false);
          }
        }}
      >
        <label htmlFor="name" className="label">Your name</label>
        <input
          id="name"
          className="input"
          autoComplete="nickname"
          maxLength={16}
          placeholder="e.g. Maya"
          value={name}
          onChange={(e) => setName(e.target.value)}
          style={{ fontSize: 20 }}
        />
        <div className="grow" />
        <button className="btn btn-green" disabled={!ok || busy}>Let&apos;s play</button>
        <p style={{ margin: 0, textAlign: "center", fontSize: 14, fontWeight: 700, color: "var(--muted)" }}>
          You can save an account later to play on other phones.
        </p>
      </form>
      <div className="grow" />
    </main>
  );
}
