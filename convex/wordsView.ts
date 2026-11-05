/* eslint-disable @typescript-eslint/no-explicit-any */
import { v } from "convex/values";
import { query } from "./_generated/server";
import { findPlayer } from "./lib/helpers";
import { CATEGORIES, RIDDLES } from "./lib/words/content";
import type { WordGame } from "./words";

const mask = (word: string, shown: (ch: string, i: number) => boolean) => word.split("").map((ch, i) => (shown(ch, i) ? ch : "_")).join("");

export const view = query({
  args: { token: v.string(), code: v.string() },
  handler: async (ctx, { token, code }) => {
    const me = await findPlayer(ctx, token);
    const room = await ctx.db
      .query("wordRooms")
      .withIndex("by_code", (q) => q.eq("code", code.trim().toUpperCase()))
      .order("desc")
      .first();
    if (!me || !room) return null;
    const now = Date.now();
    const members = await Promise.all(
      [...room.members]
        .sort((a, b) => a.seat - b.seat)
        .map(async (m) => {
          const p = await ctx.db.get(m.playerId);
          return { id: m.playerId, name: p?.name ?? "Player", seat: m.seat, isMe: m.playerId === me._id, isHost: room.hostId === m.playerId, online: now - m.lastSeen < 30_000 };
        }),
    );
    const base = {
      code: room.code,
      mode: room.mode,
      lang: room.lang,
      status: room.status,
      gameNo: room.gameNo,
      startAt: room.startAt,
      isHost: room.hostId === me._id,
      isMember: room.members.some((m) => m.playerId === me._id),
      meId: me._id,
      members,
    };
    if (room.status === "lobby" || !room.game) return { ...base, game: null };
    const g = room.game as WordGame;
    const meId = me._id;
    const opp = g.players.find((p) => p !== meId) ?? g.players[1];
    const over = !!g.done;
    const m = g.m;
    let view: any = {};

    switch (g.mode) {
      case "chain": {
        if (g.phase === "setup") {
          const mine = m.picks[meId];
          view = { setup: true, myPick: mine ?? null, oppReady: !!m.picks[opp] };
          break;
        }
        const board = (b: any) => ({
          maker: b.maker,
          lang: b.lang,
          done: b.done,
          found: b.solved.filter((x: string) => x && x !== "given" && x !== "nobody").length,
          rows: b.words.map((w: string, i: number) => {
            const by = b.solved[i];
            if (i === 0 || by || over) return { text: w, by: i === 0 ? "given" : by ?? "nobody", current: false };
            if (i === b.wi) return { text: mask(w, (_, j) => b.open[j]), by: null, current: true };
            return { text: mask(w, (_, j) => j === 0), by: null, current: false };
          }),
        });
        const theirs = m.boards[opp];
        view = {
          turn: m.turn,
          event: m.event,
          mine: board(m.boards[meId]),
          theirs: board(theirs),
          myChain: theirs.maker === meId ? theirs.words : null,
        };
        break;
      }
      case "hangman": {
        const theirs: string = m.secrets[opp] ?? "";
        const mine: string = m.secrets[meId] ?? "";
        const myFound: string[] = m.found[meId] ?? [];
        const theirFound: string[] = m.found[opp] ?? [];
        view = {
          mySecret: mine || null,
          oppReady: !!m.secrets[opp],
          oppHint: m.hints[opp] ?? "",
          target: theirs ? mask(theirs, (ch) => over || myFound.includes(ch)) : "",
          myFound,
          myWrong: m.wrong[meId] ?? [],
          myLives: m.lives[meId] ?? 6,
          mineSeen: mine ? mask(mine, (ch) => theirFound.includes(ch)) : "",
          oppLives: m.lives[opp] ?? 6,
          oppWord: over ? theirs : null,
        };
        break;
      }
      case "guess": {
        const theirs: string = m.secrets[opp] ?? "";
        const mine: string = m.secrets[meId] ?? "";
        view = {
          mySecret: mine || null,
          oppReady: !!m.secrets[opp],
          oppLength: theirs.length,
          turn: m.turn,
          asked: m.asked.map((q: any) => ({ letter: q.letter, by: q.by, inTheirs: theirs.includes(q.letter), inMine: mine.includes(q.letter) })),
          log: m.log,
          oppWord: over ? theirs : null,
        };
        break;
      }
      case "pair": {
        const both = !!(m.first && m.last);
        const reveal = g.phase === "reveal" || over;
        view = {
          firstBy: m.firstBy,
          lastBy: m.lastBy,
          first: both || m.firstBy === meId ? m.first : null,
          last: both || m.lastBy === meId ? m.last : null,
          picked: { first: !!m.first, last: !!m.last },
          note: m.note,
          answers: Object.fromEntries(Object.entries(m.answers).map(([p, a]: [string, any]) => [p, p === meId || reveal ? a : { word: null, at: a.at, pts: a.pts }])),
          examples: reveal ? m.examples.slice(0, 6) : [],
        };
        break;
      }
      case "chemistry": {
        const reveal = g.phase !== "answer";
        view = {
          prompt: m.order[g.round],
          mine: m.answers[meId] ?? null,
          theirs: reveal ? m.answers[opp] ?? "" : null,
          locked: Object.fromEntries(g.players.map((p) => [p, !!m.answers[p]])),
          match: reveal ? m.history[0]?.match ?? false : null,
          matches: m.matches,
          history: m.history.slice(reveal ? 1 : 0, 6),
        };
        break;
      }
      case "dontsay": {
        const reveal = g.phase !== "answer";
        const c = CATEGORIES[m.order[g.round]];
        view = {
          // The client gets the category name only. The banned word stays secret until the reveal.
          catName: { en: c.en, id: c.id },
          tier: c.tier,
          ban: reveal || over ? [...new Set(c.ban)] : null,
          hearts: m.hearts,
          used: m.used[meId] ?? [],
          mine: m.answers[meId] ?? null,
          theirs: reveal ? m.answers[opp] ?? "" : null,
          locked: Object.fromEntries(g.players.map((p) => [p, !!m.answers[p]])),
          verdict: reveal ? m.verdict : {},
          history: m.history.slice(reveal ? 1 : 0, 5).map((h: any) => ({ ...h, ban: [...new Set(CATEGORIES[h.cat].ban)], catName: { en: CATEGORIES[h.cat].en, id: CATEGORIES[h.cat].id } })),
        };
        break;
      }
      case "spy":
        view = {
          lang: m.lang,
          words: m.words,
          found: m.found,
          wrong: m.wrong,
          misses: m.misses,
          giver: m.giver,
          clue: m.clue,
          partnerTargets: over ? [...m.targets[opp], ...m.targets[meId]] : m.targets[opp],
          myLeft: m.targets[meId].filter((i: number) => !m.found.includes(i)).length,
          partnerLeft: m.targets[opp].filter((i: number) => !m.found.includes(i)).length,
          log: m.log.slice(0, 4),
        };
        break;
      case "odd": {
        const maker = m.maker === meId;
        const s = m.set;
        view = {
          maker: m.maker,
          set: s
            ? {
                words: s.words,
                options: s.options,
                odd: maker || g.phase !== "guess" ? s.odd : null,
                link: maker || g.phase === "reveal" ? s.link : null,
                linkIdx: maker || g.phase === "reveal" ? s.linkIdx : null,
              }
            : null,
          tries: m.tries,
          picked: m.picked,
          linkPick: m.linkPick,
          pts: m.pts ?? 0,
        };
        break;
      }
      case "scramble": {
        const reveal = g.phase !== "play" || over;
        const mineFound: { w: string; pts: number }[] = m.found[meId] ?? [];
        const all = [m.word, ...m.bonus];
        view = {
          lang: m.lang,
          letters: m.letters,
          length: m.word.length,
          mine: mineFound,
          slots: all.map((w: string) => {
            const mineHas = mineFound.some((f) => f.w === w);
            const others = g.players.filter((p) => p !== meId && (m.found[p] ?? []).some((f: any) => f.w === w));
            return { len: w.length, main: w === m.word, text: mineHas || reveal ? w : null, mine: mineHas, others: others.length };
          }),
          rivals: g.players.filter((p) => p !== meId).map((p) => ({ id: p, count: (m.found[p] ?? []).length })),
          answer: reveal ? m.word : null,
        };
        break;
      }
      case "emoji": {
        const r = RIDDLES[m.order[g.round]];
        const describer = m.describer === meId;
        const reveal = g.phase !== "play";
        const shownWord = g.lang === "id" ? r.id : r.en;
        view = {
          describer: m.describer,
          riddle: describer || reveal ? m.order[g.round] : null,
          banned: describer || reveal ? r.ban : [],
          pattern: shownWord.split(" ").map((w) => w.length),
          cat: r.cat,
          emoji: m.emoji,
          guesses: m.guesses,
          solved: m.solved,
          pts: m.pts ?? 0,
          total: m.total,
          history: m.history.slice(reveal ? 1 : 0, 5),
        };
        break;
      }
    }

    return {
      ...base,
      game: {
        seq: g.seq,
        mode: g.mode,
        players: g.players,
        isPlayer: g.players.includes(meId),
        scores: g.scores,
        phase: g.phase,
        round: g.round,
        rounds: g.rounds,
        deadline: g.deadline,
        done: g.done ?? null,
        view,
      },
    };
  },
});
