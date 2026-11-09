"use client";

import { useMutation, useQuery } from "convex/react";
import { createContext, useContext, useState, type ReactNode } from "react";
import { api } from "../../convex/_generated/api";
import { Mascot } from "@/components/ui";
import { feedback } from "@/lib/feedback";

type Me = NonNullable<ReturnType<typeof useQuery<typeof api.players.me>>>;
type Identity = { token: string; me: Me };

const Ctx = createContext<Identity | null>(null);
const KEY = "sudoku-party:token";

function readToken() {
  try {
    let t = localStorage.getItem(KEY);
    if (!t) {
      t = crypto.randomUUID() + crypto.randomUUID();
      localStorage.setItem(KEY, t);
    }
    return t;
  } catch {
    return crypto.randomUUID() + crypto.randomUUID();
  }
}

export function IdentityProvider({ children }: { children: ReactNode }) {
  const [token] = useState<string | null>(() => (typeof window === "undefined" ? null : readToken()));
  const me = useQuery(api.players.me, token ? { token } : "skip");

  if (!token || me === undefined) return <Splash />;
  if (me === null) return <Onboarding token={token} />;
  return <Ctx.Provider value={{ token, me }}>{children}</Ctx.Provider>;
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

function Onboarding({ token }: { token: string }) {
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
            await create({ token, name });
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
      </form>
      <div className="grow" />
    </main>
  );
}
