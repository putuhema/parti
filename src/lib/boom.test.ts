/**
 * Juragan Nusantara rules: the board, rent, buying, bankruptcy and whole games played by bots.
 * Run with `npm test`.
 */
import { describe, expect, it } from "vitest";
import { AUCTION_EXTEND, AUCTION_MAX, AUCTION_MS, RAISES, nextBid, openingBid, placeBid, BETS, CARDS, COLS, SIREN, SLOT, SLOT_PAY, SLOT_SPINS, resolveGamble, slotResult, GROUPS, HOLD_FILL_MS, JAIL, LAP_BONUS, LOBBY_FEE, MASH_CAP, MASH_MS, N, QTE_MS, ROWS, SPACES, START_CASH, active, botDilemma, botWants, cellOf, choose, leaveGame, mashTarget, newGame, onDeadline, priceOf, qteHit, qtePos, rentOf, resolveDilemma, resolveJail, resolveRent, roll, worthOf, type BoomGame, type Qte } from "../../convex/lib/boom/rules";
import { mulberry32 } from "../../convex/lib/sudoku";

/** An rng that makes the next roll come up as these dice, then falls back to a seeded stream. */
const dice = (a: number, b: number, seed = 1) => {
  const rest = mulberry32(seed);
  const q = [(a - 0.5) / 6, (b - 0.5) / 6];
  return () => (q.length ? q.shift()! : rest());
};
const game = (n = 2) => newGame(["a", "b", "c", "d"].slice(0, n), 20, 0);

describe("the board", () => {
  it("is a ring around a 7×12 grid with corners where the layout puts them", () => {
    const seen = new Set<string>();
    for (let i = 0; i < N; i++) {
      const { col, row } = cellOf(i);
      expect(col === 0 || col === COLS - 1 || row === 0 || row === ROWS - 1).toBe(true);
      seen.add(`${col},${row}`);
    }
    expect(seen.size).toBe(N);
    expect(N).toBe(2 * COLS + 2 * ROWS - 4);
    expect(cellOf(0)).toEqual({ col: 6, row: 0 });
    expect(SPACES[cellOfIndex(6, 11)].kind).toBe("jail");
    expect(SPACES[cellOfIndex(0, 11)].kind).toBe("jackpot");
    expect(SPACES[cellOfIndex(0, 0)].kind).toBe("wheel");
  });
  it("has 2 or 3 lots in every colour and a transport hub on each side", () => {
    GROUPS.forEach((_, k) => {
      const n = SPACES.filter((s) => s.kind === "lot" && s.group === k).length;
      expect(n === 2 || n === 3).toBe(true);
    });
    expect(SPACES.filter((s) => s.kind === "hub").length).toBe(4);
  });
});
const cellOfIndex = (col: number, row: number) => Array.from({ length: N }, (_, i) => i).find((i) => cellOf(i).col === col && cellOf(i).row === row)!;

describe("a turn", () => {
  it("offers an empty lot, and buying it passes the dice", () => {
    const g = game();
    roll(g, dice(1, 2), 0); // Jayapura
    expect(g.pos.a).toBe(3);
    expect(g.phase).toBe("buy");
    expect(g.turn).toBe("a");
    choose(g, true, 0);
    expect(g.owner[3]).toBe("a");
    expect(g.cash.a).toBe(START_CASH - 60);
    expect(g.turn).toBe("b");
    expect(g.phase).toBe("roll");
  });
  it("charges rent, doubled once the colour is complete", () => {
    const g = game();
    g.owner[3] = "a";
    expect(rentOf(g, 3)).toBe(10);
    g.owner[1] = "a";
    expect(rentOf(g, 3)).toBe(20);
    g.turn = "b";
    roll(g, dice(1, 2), 0);
    expect(g.phase).toBe("rent"); // pay or haggle
    onDeadline(g, dice(1, 1), 0); // no answer: pays in full
    expect(g.cash.b).toBe(START_CASH - 20);
    expect(g.cash.a).toBe(START_CASH + 20);
  });
  it("gives another roll on doubles, even after buying", () => {
    const g = game();
    roll(g, dice(4, 4), 0); // Labuan Bajo
    expect(g.phase).toBe("buy");
    choose(g, true, 0);
    expect(g.turn).toBe("a");
    expect(g.phase).toBe("roll");
  });
  it("pays the lap bonus when you pass Start", () => {
    const g = game();
    g.pos.a = 31;
    g.owner[2] = null;
    roll(g, dice(2, 3), 0); // lands on the gift at 2
    expect(g.pos.a).toBe(2);
    expect(g.cash.a).toBeGreaterThanOrEqual(START_CASH + LAP_BONUS + 50);
  });
  it("sends three doubles in a row to jail, and jail costs a turn", () => {
    const g = game(3);
    g.streak = 2;
    roll(g, dice(5, 5), 0);
    expect(g.pos.a).toBe(JAIL);
    expect(g.turn).toBe("b");
    g.phase = "roll";
    roll(g, dice(1, 3, 3), 0); // Pelabuhan: an offer
    choose(g, false, 0); // passing puts it up for auction; nobody bids
    onDeadline(g, dice(1, 1), 0);
    expect(g.turn).toBe("c");
    roll(g, dice(1, 3, 4), 0); // same port
    choose(g, false, 0);
    onDeadline(g, dice(1, 1), 0);
    expect(g.turn).toBe("a");
    expect(g.phase).toBe("jailed"); // wait it out, or lobby
    onDeadline(g, dice(1, 1), 0); // no answer: waits
    expect(g.turn).toBe("b"); // a sat that round out
    expect(g.log.some((e) => e.kind === "skip" && e.by === "a")).toBe(true);
  });
  it("sells your spaces when you can't pay, then bankrupts you", () => {
    const g = game(3);
    g.owner[32] = "b";
    g.owner[33] = "b";
    g.level[33] = 3;
    g.owner[1] = "a";
    g.cash.a = 100;
    g.pos.a = 26;
    roll(g, dice(3, 4), 0); // Menteng with a full set and a hotel
    resolveRent(g, false, null, 0);
    expect(g.out).toEqual(["a"]);
    expect(g.owner[1]).toBe(null);
    expect(g.cash.a).toBe(0);
    expect(g.cash.b).toBe(START_CASH + 100 + 36);
    expect(g.turn).toBe("b");
  });
  it("ends when one player is left", () => {
    const g = game(2);
    leaveGame(g, "b", 0);
    expect(g.done?.winners).toEqual(["a"]);
  });
});

describe("whole games", () => {
  it("played by bots always finish with money accounted for", () => {
    for (let seed = 1; seed <= 40; seed++) {
      const rng = mulberry32(seed);
      const g: BoomGame = newGame(["x", "bot1", "bot2", "y"].slice(0, 2 + (seed % 3)), 30, 0);
      let steps = 0;
      while (!g.done && steps++ < 5000) {
        if (g.phase === "roll") roll(g, rng, 0);
        else if (g.phase === "dilemma") { const b = botDilemma(g, rng); resolveDilemma(g, b.risky, b.ms, 0); }
        else if (g.phase === "jailed") resolveJail(g, rng() < 0.5, Math.floor(rng() * 20), 0);
        else if (g.phase === "rent") resolveRent(g, rng() < 0.5, Math.floor(rng() * 1500), 0);
        else if (g.phase === "auction") {
          const who = active(g)[Math.floor(rng() * active(g).length)];
          if (rng() < 0.4) placeBid(g, who, RAISES[Math.floor(rng() * 2)], 0);
          else onDeadline(g, rng, (g.auction?.start ?? 0) + AUCTION_MAX * rng());
        }
        else if (g.phase === "gamble") resolveGamble(g, rng() < 0.5 ? BETS[Math.floor(rng() * 3)] : 0, rng, 0);
        else choose(g, botWants(g), 0);
        for (const p of g.players) expect(g.cash[p]).toBeGreaterThanOrEqual(0);
        for (const p of g.out) expect(g.owner.includes(p)).toBe(false);
        if (!g.done) expect(active(g)).toContain(g.turn);
      }
      expect(g.done).toBeTruthy();
      expect(g.done!.winners.length).toBeGreaterThan(0);
      for (const p of active(g)) expect(g.done!.worth[p]).toBe(worthOf(g, p));
    }
  });
  it("move on when the clock runs out", () => {
    const g = game();
    onDeadline(g, dice(1, 2), 0);
    expect(g.phase).toBe("buy");
    onDeadline(g, dice(1, 2), 0);
    expect(g.phase).toBe("auction"); // a person who doesn't answer passes, and it goes to auction
    onDeadline(g, dice(1, 2), 0);
    expect(g.owner[3]).toBe(null); // nobody bid: the bank keeps it
    expect(g.turn).toBe("b");
    expect(priceOf(3)).toBe(60);
  });
});

describe("Kejutan dilemmas and the timing QTE", () => {
  /** Put player "a" on a pending dilemma for card `k` with a known bar. */
  const pending = (k: number, q: Partial<Qte> = {}) => {
    const g = game(2);
    g.phase = "dilemma";
    g.qte = { card: k, c: 0.5, w: 0.2, period: 1400, phase: 0, ...q };
    return g;
  };
  const baliho = CARDS.findIndex((c) => c.art === "baliho");
  const ott = CARDS.findIndex((c) => c.art === "ott");

  it("sweeps the needle back and forth along the bar", () => {
    const q: Qte = { card: 0, c: 0.5, w: 0.2, period: 1000, phase: 0 };
    expect(qtePos(q, 0)).toBeCloseTo(0);
    expect(qtePos(q, 250)).toBeCloseTo(0.5);
    expect(qtePos(q, 500)).toBeCloseTo(1);
    expect(qtePos(q, 750)).toBeCloseTo(0.5);
    expect(qteHit(q, 250)).toBe(true);
    expect(qteHit(q, 50)).toBe(false);
    expect(qteHit(q, 1250)).toBe(true);
    expect(qteHit(q, QTE_MS + 1)).toBe(false); // too late counts as a miss
  });

  it("most Kejutan cards are dilemmas and landing on one waits for a choice", () => {
    expect(CARDS.filter((c) => c.dilemma).length).toBeGreaterThanOrEqual(6);
    const g = game(2);
    g.pos.a = SPACES.findIndex((s) => s.kind === "surprise") - 3;
    // Roll a 3 and land on Kejutan; force the card pick onto the baliho dilemma.
    const pick = (baliho + 0.5) / CARDS.length;
    const q = [(1 - 0.5) / 6, (2 - 0.5) / 6, pick];
    roll(g, () => (q.length ? q.shift()! : 0.5), 0);
    expect(g.phase).toBe("dilemma");
    expect(g.qte?.card).toBe(baliho);
    expect(g.turn).toBe("a");
  });

  it("the safe side pays its fixed amount and passes the dice", () => {
    const g = pending(baliho);
    resolveDilemma(g, false, null, 0);
    expect(g.cash.a).toBe(START_CASH + 50);
    expect(g.phase).toBe("roll");
    expect(g.turn).toBe("b");
    expect(g.log.at(-1)).toMatchObject({ kind: "card", risky: false, choice: "Satu di depan rumah" });
  });

  it("the risky side pays big on a hit and costs on a miss", () => {
    const hit = pending(baliho);
    resolveDilemma(hit, true, 350, 0); // needle at 0.5, inside the zone
    expect(hit.cash.a).toBe(START_CASH + 150);
    expect(hit.log.at(-1)).toMatchObject({ risky: true, success: true, ms: 350 });
    const miss = pending(baliho);
    resolveDilemma(miss, true, 0, 0); // needle at 0
    expect(miss.cash.a).toBe(START_CASH - 100);
    expect(miss.pot).toBe(100 + 100);
    expect(miss.log.at(-1)).toMatchObject({ risky: true, success: false });
  });

  it("no tap at all is a miss", () => {
    const g = pending(baliho);
    resolveDilemma(g, true, null, 0);
    expect(g.log.at(-1)?.success).toBe(false);
  });

  it("an OTT miss sends you to Diperiksa", () => {
    const g = pending(ott);
    resolveDilemma(g, true, 0, 0);
    expect(g.pos.a).toBe(JAIL);
    expect(g.jail.a).toBe(1);
  });

  it("a person who lets the clock run out takes the safe side", () => {
    const g = pending(baliho);
    onDeadline(g, () => 0.1, 0);
    expect(g.log.at(-1)).toMatchObject({ risky: false });
    expect(g.cash.a).toBe(START_CASH + 50);
  });

  it("a bot's tap lands where it aimed", () => {
    let hits = 0, risky = 0;
    for (let seed = 1; seed <= 200; seed++) {
      const rng = mulberry32(seed);
      const g = pending(baliho, { c: 0.3 + rng() * 0.4, phase: rng(), period: 1300 + Math.floor(rng() * 300) });
      g.players = ["bot1", "b"]; g.turn = "bot1"; g.cash.bot1 = 1500;
      const b = botDilemma(g, rng);
      if (!b.risky) continue;
      risky++;
      expect(b.ms!).toBeLessThanOrEqual(QTE_MS);
      if (qteHit(g.qte!, b.ms!)) hits++;
    }
    expect(risky).toBeGreaterThan(80);
    expect(hits / risky).toBeGreaterThan(0.5);
    expect(hits / risky).toBeLessThan(0.8);
  });
});

describe("Diperiksa: wait it out or lobby", () => {
  const jailed = () => {
    const g = game(2);
    g.pos.a = JAIL;
    g.jail.a = 1;
    g.phase = "jailed";
    return g;
  };
  it("waiting costs the turn", () => {
    const g = jailed();
    resolveJail(g, false, null, 0);
    expect(g.jail.a).toBe(0);
    expect(g.turn).toBe("b");
    expect(g.cash.a).toBe(START_CASH);
  });
  it("enough taps buys your way out and you roll this turn", () => {
    const g = jailed();
    resolveJail(g, true, mashTarget(g.round), 0);
    expect(g.jail.a).toBe(0);
    expect(g.turn).toBe("a");
    expect(g.phase).toBe("roll");
    expect(g.cash.a).toBe(START_CASH - LOBBY_FEE);
    expect(g.log.at(-1)).toMatchObject({ kind: "lobby", success: true });
  });
  it("too few taps loses the fee and the turn", () => {
    const g = jailed();
    resolveJail(g, true, mashTarget(g.round) - 1, 0);
    expect(g.turn).toBe("b");
    expect(g.cash.a).toBe(START_CASH - LOBBY_FEE);
    expect(g.log.some((e) => e.kind === "lobby" && e.success === false)).toBe(true);
  });
  it("caps implausibly fast tapping", () => {
    const g = jailed();
    resolveJail(g, true, 999, 0);
    expect(g.log.find((e) => e.kind === "lobby")?.taps).toBe((MASH_CAP * MASH_MS) / 1000);
  });
});

describe("rent: pay or haggle", () => {
  const owed = () => {
    const g = game(2);
    g.owner[3] = "b";
    g.pos.a = 3;
    g.phase = "rent";
    g.nego = { tile: 3, owner: "b", rent: 100, lo: 0.6, hi: 0.8 };
    return g;
  };
  it("a release in the zone pays 70%", () => {
    const g = owed();
    resolveRent(g, true, 0.7 * HOLD_FILL_MS, 0);
    expect(g.cash.a).toBe(START_CASH - 70);
    expect(g.cash.b).toBe(START_CASH + 70);
    expect(g.log.at(-1)?.nego?.result).toBe("deal");
  });
  it("letting go too early pays full, holding too long pays 120%", () => {
    const early = owed();
    resolveRent(early, true, 0.3 * HOLD_FILL_MS, 0);
    expect(early.cash.a).toBe(START_CASH - 100);
    const late = owed();
    resolveRent(late, true, 0.95 * HOLD_FILL_MS, 0);
    expect(late.cash.a).toBe(START_CASH - 120);
    expect(late.log.at(-1)?.nego?.result).toBe("over");
  });
  it("paying straight up passes the dice", () => {
    const g = owed();
    resolveRent(g, false, null, 0);
    expect(g.cash.a).toBe(START_CASH - 100);
    expect(g.turn).toBe("b");
    expect(g.log.at(-1)?.nego).toBeUndefined();
  });
});

describe("judol: the slot", () => {
  const JUDOL = SPACES.findIndex((s) => s.kind === "judol");
  /** An rng whose next three draws stop the reels on these symbols. */
  const reels = (a: number, b: number, c: number) => {
    const q = [a, b, c].map((r) => (r + 0.5) / SLOT.length);
    const rest = mulberry32(3);
    return () => (q.length ? q.shift()! : rest());
  };
  const atTable = () => {
    const g = game(2);
    g.pos.a = JUDOL;
    g.phase = "gamble";
    g.spins = 0;
    return g;
  };
  it("is on the board once, and landing there opens the table", () => {
    expect(SPACES.filter((s) => s.kind === "judol").length).toBe(1);
    const g = game(2);
    g.pos.a = JUDOL - 5;
    roll(g, dice(2, 3), 0);
    expect(g.pos.a).toBe(JUDOL);
    expect(g.phase).toBe("gamble");
  });
  it("reads the reels: pairs, triples, the jackpot and raids", () => {
    expect(slotResult([0, 0, 0])).toBe("jackpot");
    expect(slotResult([1, 1, 1])).toBe("triple");
    expect(slotResult([1, 2, 1])).toBe("pair");
    expect(slotResult([1, 2, 3])).toBe("zonk");
    expect(slotResult([SIREN, 1, SIREN])).toBe("raid");
    expect(slotResult([SIREN, SIREN, SIREN])).toBe("raid");
    expect(slotResult([SIREN, 1, 1])).toBe("pair");
  });
  it("pays the bank's winnings and sends lost bets to the dana aspirasi", () => {
    const g = atTable();
    const pot = g.pot;
    resolveGamble(g, 100, reels(1, 1, 2), 0);
    expect(g.cash.a).toBe(START_CASH - 100 + 100 * SLOT_PAY.pair);
    expect(g.pot).toBe(pot + 100);
    expect(g.log.at(-1)).toMatchObject({ kind: "gamble", bet: 100, slot: "pair", amount: 100, spin: 1 });
  });
  it("lets you spin again, up to the limit, then passes the dice", () => {
    const g = atTable();
    for (let k = 1; k <= SLOT_SPINS; k++) {
      expect(g.phase).toBe("gamble");
      resolveGamble(g, BETS[0], reels(1, 2, 3), 0);
    }
    expect(g.phase).toBe("roll");
    expect(g.turn).toBe("b");
    expect(g.cash.a).toBe(START_CASH - BETS[0] * SLOT_SPINS);
  });
  it("a raid takes the bet and calls you in", () => {
    const g = atTable();
    resolveGamble(g, 200, reels(SIREN, 2, SIREN), 0);
    expect(g.cash.a).toBe(START_CASH - 200);
    expect(g.pos.a).toBe(JAIL);
    expect(g.jail.a).toBe(1);
    expect(g.turn).toBe("b");
  });
  it("walking away (or a bet that isn't on the table) costs nothing", () => {
    const g = atTable();
    resolveGamble(g, 0, reels(0, 0, 0), 0);
    expect(g.cash.a).toBe(START_CASH);
    expect(g.turn).toBe("b");
    const h = atTable();
    resolveGamble(h, 75, reels(0, 0, 0), 0);
    expect(h.cash.a).toBe(START_CASH);
  });
  it("a person who lets the clock run out walks away", () => {
    const g = atTable();
    onDeadline(g, reels(0, 0, 0), 0);
    expect(g.cash.a).toBe(START_CASH);
    expect(g.log.at(-1)).toMatchObject({ kind: "gamble", bet: 0 });
  });
  it("the house keeps an edge over a long night", () => {
    const rng = mulberry32(42);
    let back = 0;
    const spins = 60000;
    for (let k = 0; k < spins; k++) {
      const r: [number, number, number] = [0, 0, 0].map(() => Math.floor(rng() * SLOT.length)) as [number, number, number];
      back += SLOT_PAY[slotResult(r)];
    }
    const rtp = back / spins;
    expect(rtp).toBeGreaterThan(0.8);
    expect(rtp).toBeLessThan(1);
  });
});

describe("lelang: auctions", () => {
  /** Player "a" passes on Pelabuhan (space 4); b and c are people, bot1 a bot. */
  const passed = (players = ["a", "b", "c"]) => {
    const g = newGame(players, 20, 0);
    roll(g, dice(1, 3), 0);
    expect(g.phase).toBe("buy");
    choose(g, false, 1000, mulberry32(9));
    return g;
  };
  it("passing on a space opens an auction for everyone", () => {
    const g = passed();
    expect(g.phase).toBe("auction");
    expect(g.auction).toMatchObject({ tile: 4, bid: 0, leader: null, from: "a" });
    expect(g.turn).toBe("a");
  });
  it("opens at 20% of the price, then goes up by the raise, from anyone", () => {
    const g = passed();
    expect(placeBid(g, "b", 50, 1000)).toBe(true);
    expect(g.auction!.bid).toBe(openingBid(4));
    expect(placeBid(g, "b", 10, 1000)).toBe(false); // already leading
    expect(placeBid(g, "c", 50, 1000)).toBe(true);
    expect(g.auction).toMatchObject({ bid: openingBid(4) + 50, leader: "c" });
    expect(placeBid(g, "a", 25, 1000)).toBe(false); // not a raise on offer
    expect(nextBid(g.auction!, 10)).toBe(openingBid(4) + 60);
  });
  it("a late bid keeps the hammer up, but never past the cap", () => {
    const g = passed();
    const opened = g.deadline!;
    placeBid(g, "b", 10, opened - 500);
    expect(g.deadline).toBe(opened - 500 + AUCTION_EXTEND);
    const g2 = passed();
    const start = g2.auction!.start;
    g2.deadline = start + AUCTION_MAX - 50; // a long bidding war, nearly at the cap
    expect(placeBid(g2, "b", 10, start + AUCTION_MAX - 100)).toBe(true);
    expect(g2.deadline).toBe(start + AUCTION_MAX);
    expect(AUCTION_MS).toBeLessThan(AUCTION_MAX);
    // and once the hammer is down, a bid doesn't count
    expect(placeBid(g, "c", 10, g.deadline! + 1000)).toBe(false);
  });
  it("the leader pays and takes the space when the hammer falls; the dice pass on", () => {
    const g = passed();
    placeBid(g, "c", 10, 1000);
    placeBid(g, "b", 50, 1000);
    onDeadline(g, mulberry32(1), g.deadline!);
    expect(g.owner[4]).toBe("b");
    expect(g.cash.b).toBe(START_CASH - (openingBid(4) + 50));
    expect(g.log.at(-1)).toMatchObject({ kind: "auction", by: "b", tile: 4, other: "a" });
    expect(g.turn).toBe("b");
  });
  it("you can't bid more than you have", () => {
    const g = passed();
    g.cash.b = openingBid(4) - 1;
    expect(placeBid(g, "b", 10, 1000)).toBe(false);
  });
  it("bots snipe at the last moment, up to what the space is worth to them", () => {
    const g = passed(["a", "b", "bot1"]);
    g.auction!.caps.bot1 = 120;
    placeBid(g, "b", 10, 1000);
    onDeadline(g, mulberry32(2), g.deadline!);
    expect(g.phase).toBe("auction");
    expect(g.auction!.leader).toBe("bot1");
    // Outbid past its limit, the bot lets it go.
    g.auction!.bid = 150; g.auction!.leader = "b";
    onDeadline(g, mulberry32(2), g.deadline!);
    expect(g.owner[4]).toBe("b");
  });
});
