"use client";

import type { FunctionReturnType } from "convex/server";
import { useState } from "react";
import { api } from "../../../convex/_generated/api";
import { themeOf } from "../../../convex/lib/truth/rules";
import { Sheet } from "@/components/ui";
import { feedback } from "@/lib/feedback";

export type TruthView = NonNullable<FunctionReturnType<typeof api.truth.view>>;
export type TruthGameView = NonNullable<TruthView["game"]>;

export const GAME_NAME = "Truth or Tale";
export const RULE = "Each round has a theme. You both write three things about yourself: two true, one made up. Then guess which of your partner's is the lie and bet up to 3 points on it. After the reveal, ask for the story behind a truth. Every truth goes into your Vault.";

type VaultItem = TruthView["vault"][number];

/** Everything you two have learned about each other, person by person. */
export function Vault({ open, onClose, vault, members, meId }: { open: boolean; onClose: () => void; vault: VaultItem[]; members: TruthView["members"]; meId: string }) {
  const [who, setWho] = useState(members.find((m) => !m.isMe)?.id ?? meId);
  const list = vault.filter((t) => t.owner === who);
  return (
    <Sheet open={open} onClose={onClose} label="The Vault">
      <div className="tl-vault">
        <h2>🔐 The Vault</h2>
        <p className="tl-vaultsub">True things you&apos;ve found out about each other</p>
        <div className="tl-vaulttabs">
          {members.map((m) => (
            <button key={m.id} type="button" aria-pressed={who === m.id} onClick={() => { feedback.tap(); setWho(m.id); }}>
              {m.isMe ? "About you" : `About ${m.name}`} · {vault.filter((t) => t.owner === m.id).length}
            </button>
          ))}
        </div>
        <div className="tl-vaultlist">
          {list.length === 0 && <p className="tl-vaultsub">Nothing yet. Play a round to fill it up!</p>}
          {list.map((t) => (
            <p key={t.id} className="tl-truth"><span>{themeOf(t.theme).icon}</span>{t.text}</p>
          ))}
        </div>
        <button className="btn btn-green" onClick={onClose}>Close</button>
      </div>
    </Sheet>
  );
}
