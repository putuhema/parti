"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { feedback } from "@/lib/feedback";

/** The "pums party" wordmark. */
export function Logo({ size = 34 }: { size?: number }) {
  return (
    <Link href="/" className="logo" aria-label="pums party, all games" style={{ fontSize: size }} onClick={() => feedback.tap()}>
      <span className="logo-small">pums</span>
      party
    </Link>
  );
}

type Tab = "games" | "friends" | "me";

const TABS: { id: Tab; href: string; label: string; icon: (on: boolean) => ReactNode }[] = [
  {
    id: "games",
    href: "/",
    label: "games",
    icon: (on) => (
      <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
        {[[3, 3], [13, 3], [3, 13], [13, 13]].map(([x, y]) => (
          <rect key={`${x}${y}`} x={x} y={y} width="8" height="8" rx="2.6" fill={on ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2.2" />
        ))}
      </svg>
    ),
  },
  {
    id: "friends",
    href: "/friends",
    label: "friends",
    icon: (on) => (
      <svg width="24" height="22" viewBox="0 0 26 24" aria-hidden="true">
        <circle cx="9" cy="8" r="4" fill={on ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2.2" />
        <path d="M2 20 c0-4 3.2-6.5 7-6.5 s7 2.5 7 6.5z" fill={on ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round" />
        <circle cx="18.5" cy="8.5" r="3.2" fill="none" stroke="currentColor" strokeWidth="2.2" />
        <path d="M18 13.6 c3.6 0 6 2.2 6 6" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    id: "me",
    href: "/me",
    label: "me",
    icon: (on) => (
      <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="8" r="4.2" fill={on ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2.2" />
        <path d="M4 21 c0-4.6 3.6-7.4 8-7.4 s8 2.8 8 7.4z" fill={on ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round" />
      </svg>
    ),
  },
];

export function BottomNav({ current }: { current?: Tab }) {
  return (
    <nav className="bottom-nav" aria-label="Main">
      {TABS.map((t) => {
        const on = t.id === current;
        return (
          <Link key={t.id} href={t.href} aria-current={on ? "page" : undefined} onClick={() => { feedback.unlock(); feedback.tap(); }}>
            {t.icon(on)}
            <span>{t.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

/** A page in the app shell: logo on top, bottom nav, room for content in between. */
export function ShellPage({ tab, right, children, gap = 16 }: { tab?: Tab; right?: ReactNode; children: ReactNode; gap?: number }) {
  return (
    <main className="screen shell" style={{ gap }}>
      <header className="shell-top">
        <Logo />
        {right && <div style={{ display: "flex", gap: 8, alignItems: "center" }}>{right}</div>}
      </header>
      {children}
      <BottomNav current={tab} />
    </main>
  );
}
