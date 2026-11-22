"use client";

import type { FunctionReturnType } from "convex/server";
import { useState, type CSSProperties } from "react";
import { api } from "../../../convex/_generated/api";
import { CARDS, TOPICS, topicOf, type Card, type TopicId } from "../../../convex/lib/brain/cards";
import { Sheet } from "@/components/ui";
import { feedback } from "@/lib/feedback";

export type BrainView = NonNullable<FunctionReturnType<typeof api.brain.view>>;
export type BrainGameView = NonNullable<BrainView["game"]>;

export const GAME_NAME = "Brain Swap";
export const RULE = "Learn something new together. In Teach Swap you each read a different fact, teach it to the other, then get quizzed on what you were taught. In Agree to Answer you can only lock in once you both pick the same answer. Every fact goes into your Brain Book.";

export const topicVars = (t: TopicId) => {
  const x = topicOf(t);
  return { "--tc": x.color, "--te": x.edge } as CSSProperties;
};

/** A fact card. `keysOnly` shows just the teaching cheat sheet. */
export function FactCard({ card, keysOnly, className = "" }: { card: Card; keysOnly?: boolean; className?: string }) {
  const t = topicOf(card.topic);
  return (
    <article className={`bw-card ${className}`} style={topicVars(card.topic)}>
      <header>
        <span className="bw-topic">{t.icon} {t.name.toUpperCase()}</span>
        <span className="bw-emoji" aria-hidden="true">{card.emoji}</span>
      </header>
      <h3>{card.title}</h3>
      {!keysOnly && <p>{card.text}</p>}
      <div className="bw-keys" aria-label="Key words">
        {card.keys.map((k) => <span key={k}>{k}</span>)}
      </div>
    </article>
  );
}

/** Everything you've learned, by topic. Cards you haven't met yet stay locked. */
export function BrainBook({ open, onClose, learned }: { open: boolean; onClose: () => void; learned: string[] }) {
  const [topic, setTopic] = useState<TopicId | null>(null);
  const [card, setCard] = useState<string | null>(null);
  const known = new Set(learned);
  const list = topic ? CARDS.filter((c) => c.topic === topic) : [];
  const shown = card ? CARDS.find((c) => c.id === card) : null;
  return (
    <Sheet open={open} onClose={() => { setTopic(null); setCard(null); onClose(); }} label="Brain Book">
      <div className="bw-book">
        <h2>📖 Brain Book</h2>
        <p className="bw-booksub">{known.size} of {CARDS.length} facts learned</p>
        {shown ? (
          <>
            <FactCard card={shown} />
            <button className="btn btn-white btn-sm" onClick={() => { feedback.tap(); setCard(null); }}>← Back to {topicOf(shown.topic).name}</button>
          </>
        ) : topic ? (
          <>
            <div className="bw-booklist">
              {list.map((c) => known.has(c.id) ? (
                <button key={c.id} type="button" className="bw-bookitem" style={topicVars(c.topic)} onClick={() => { feedback.tap(); setCard(c.id); }}>
                  <span>{c.emoji}</span>{c.title}
                </button>
              ) : (
                <span key={c.id} className="bw-bookitem locked"><span>🔒</span>Not learned yet</span>
              ))}
            </div>
            <button className="btn btn-white btn-sm" onClick={() => { feedback.tap(); setTopic(null); }}>← All topics</button>
          </>
        ) : (
          <div className="bw-booktopics">
            {TOPICS.map((t) => {
              const all = CARDS.filter((c) => c.topic === t.id);
              const got = all.filter((c) => known.has(c.id)).length;
              return (
                <button key={t.id} type="button" className="bw-booktopic" style={topicVars(t.id)} onClick={() => { feedback.tap(); setTopic(t.id); }}>
                  <span className="ico">{t.icon}</span>
                  <b>{t.name}</b>
                  <span className="bar"><span style={{ width: `${(got / all.length) * 100}%` }} /></span>
                  <small>{got}/{all.length}</small>
                </button>
              );
            })}
          </div>
        )}
        <button className="btn btn-green" onClick={() => { setTopic(null); setCard(null); onClose(); }}>Close</button>
      </div>
    </Sheet>
  );
}
