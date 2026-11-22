// Heist Night: a turn-based co-op stealth puzzle. Two thieves (the Cat and the Hacker) each
// plan up to three actions a round in secret; when both lock in, the round plays out tick by
// tick. Guards walk fixed patrols and see in a cone, cameras watch a cone until hacked, lasers
// cut corridors until hacked. Grab the gem and get both thieves to the van without being seen.
// Pure rules, shared by server, client (for previews) and the level solver.

export type Dir = "n" | "e" | "s" | "w";
export type Action = Dir | "wait" | "hack";
export type Role = "cat" | "hacker";
export const ROLES: Role[] = ["cat", "hacker"];
export type Pos = { x: number; y: number };

export const TICKS = 3; // actions per round
export const HACK_TICKS = 6; // how long a hack keeps cameras and lasers off
export const SIGHT = 3; // how far guards and cameras see

export const DIRS: Record<Dir, Pos> = { n: { x: 0, y: -1 }, e: { x: 1, y: 0 }, s: { x: 0, y: 1 }, w: { x: -1, y: 0 } };
const PERP: Record<Dir, Pos> = { n: { x: 1, y: 0 }, s: { x: 1, y: 0 }, e: { x: 0, y: 1 }, w: { x: 0, y: 1 } };

/**
 * Level map legend:
 *   #  wall          .  floor        h  plant (hide here: nobody can see you)
 *   A  Cat start     B  Hacker start E  the van (exit)
 *   *  the gem       $  coin         D  locked door (the Cat picks it open; blocks sight while shut)
 *   T  terminal (the Hacker hacks it from next door)
 *   |  -  laser beam (deadly unless hacked)
 *   ^ > v <  camera on the wall, looking that way (off while hacked)
 * Guards walk their `path` on a loop, one tile per tick. A step that stays put can name a facing.
 */
export type LevelDef = {
  id: string;
  name: string;
  intro: string;
  map: string[];
  guards: [number, number, Dir?][][];
  par: number; // rounds, checked by the solver in tests
};

type Guard = { pos: Pos[]; face: Dir[] };
export type Level = {
  def: LevelDef;
  w: number;
  h: number;
  grid: string[][];
  starts: Record<Role, Pos>;
  exits: Pos[];
  gem: Pos;
  coins: Pos[];
  doors: Pos[];
  terminals: Pos[];
  cameras: { x: number; y: number; f: Dir }[];
  guards: Guard[];
  cycle: number;
};

export type Sim = {
  cat: Pos;
  hacker: Pos;
  tick: number;
  hack: number; // ticks of hack left
  open: string[]; // doors picked open
  gem: boolean;
  coins: string[]; // coins collected
};

export const key = (p: Pos) => `${p.x},${p.y}`;
const same = (a: Pos, b: Pos) => a.x === b.x && a.y === b.y;
const add = (a: Pos, b: Pos, k = 1): Pos => ({ x: a.x + b.x * k, y: a.y + b.y * k });

function dirBetween(a: Pos, b: Pos): Dir | null {
  if (b.x > a.x) return "e";
  if (b.x < a.x) return "w";
  if (b.y > a.y) return "s";
  if (b.y < a.y) return "n";
  return null;
}

const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a);

export function parseLevel(def: LevelDef): Level {
  const grid = def.map.map((r) => r.split(""));
  const h = grid.length, w = Math.max(...grid.map((r) => r.length));
  const find = (c: string) => {
    const out: Pos[] = [];
    grid.forEach((r, y) => r.forEach((ch, x) => { if (ch === c) out.push({ x, y }); }));
    return out;
  };
  const cameras: Level["cameras"] = [];
  const camDir: Record<string, Dir> = { "^": "n", ">": "e", v: "s", "<": "w" };
  grid.forEach((r, y) => r.forEach((ch, x) => { if (camDir[ch]) cameras.push({ x, y, f: camDir[ch] }); }));
  const guards = def.guards.map((path) => {
    const pos = path.map(([x, y]) => ({ x, y }));
    const face: Dir[] = pos.map(() => "s");
    // Facing is the way the guard just walked; standing still keeps it (or uses the named facing).
    for (let pass = 0; pass < 2; pass++) {
      for (let i = 0; i < pos.length; i++) {
        const named = path[i][2];
        const moved = dirBetween(pos[(i - 1 + pos.length) % pos.length], pos[i]);
        face[i] = named ?? moved ?? face[(i - 1 + pos.length) % pos.length];
      }
    }
    return { pos, face };
  });
  const cycle = guards.reduce((l, g) => (l * g.pos.length) / gcd(l, g.pos.length), 1);
  return {
    def, w, h, grid,
    starts: { cat: find("A")[0], hacker: find("B")[0] },
    exits: find("E"), gem: find("*")[0], coins: find("$"), doors: find("D"), terminals: find("T"),
    cameras, guards, cycle,
  };
}

export function startSim(lv: Level): Sim {
  return { cat: { ...lv.starts.cat }, hacker: { ...lv.starts.hacker }, tick: 0, hack: 0, open: [], gem: false, coins: [] };
}

export const guardAt = (g: Guard, tick: number) => ({ ...g.pos[tick % g.pos.length], f: g.face[tick % g.face.length] });

const charAt = (lv: Level, p: Pos) => (p.y >= 0 && p.y < lv.h && p.x >= 0 && p.x < lv.w ? lv.grid[p.y][p.x] ?? "#" : "#");

/** Blocks sight: walls, terminals, cameras and shut doors. */
export function opaque(lv: Level, sim: Sim, p: Pos) {
  const c = charAt(lv, p);
  if (c === "#" || c === "T" || "^>v<".includes(c)) return true;
  return c === "D" && !sim.open.includes(key(p));
}

/** Can someone stand here? (Lasers are walkable, just deadly while on.) */
export function walkable(lv: Level, sim: Sim, p: Pos) {
  return !opaque(lv, sim, p);
}

export const isLaser = (lv: Level, p: Pos) => "|-".includes(charAt(lv, p));
export const isHide = (lv: Level, p: Pos) => charAt(lv, p) === "h";

function lineOfSight(lv: Level, sim: Sim, a: Pos, b: Pos) {
  const n = Math.max(Math.abs(b.x - a.x), Math.abs(b.y - a.y));
  for (let i = 1; i < n; i++) {
    const p = { x: Math.round(a.x + ((b.x - a.x) * i) / n), y: Math.round(a.y + ((b.y - a.y) * i) / n) };
    if (opaque(lv, sim, p)) return false;
  }
  return true;
}

/** The tiles a guard or camera at `src` facing `f` can see. */
export function cone(lv: Level, sim: Sim, src: Pos, f: Dir): Pos[] {
  const out: Pos[] = [];
  const d = DIRS[f], perp = PERP[f];
  for (let k = 1; k <= SIGHT; k++) {
    const wide = k === 1 ? 0 : 1;
    for (let l = -wide; l <= wide; l++) {
      const p = add(add(src, d, k), perp, l);
      if (p.x < 0 || p.y < 0 || p.x >= lv.w || p.y >= lv.h || opaque(lv, sim, p)) continue;
      if (lineOfSight(lv, sim, src, p)) out.push(p);
    }
  }
  return out;
}

/** Everything watched right now, for drawing. */
export function watched(lv: Level, sim: Sim) {
  const guards = lv.guards.map((g) => { const at = guardAt(g, sim.tick); return { at, tiles: cone(lv, sim, at, at.f) }; });
  const cameras = sim.hack > 0 ? [] : lv.cameras.map((c) => ({ at: c, tiles: cone(lv, sim, c, c.f) }));
  return { guards, cameras };
}

/** Who (if anyone) spots someone standing on `p`. */
function spottedBy(lv: Level, sim: Sim, p: Pos): string | null {
  // Bumping into a guard always gets you caught; a plant only hides you from a distance.
  if (lv.guards.some((g) => same(guardAt(g, sim.tick), p))) return "guard";
  if (isHide(lv, p)) return null;
  for (const gd of lv.guards) {
    const g = guardAt(gd, sim.tick);
    if (cone(lv, sim, g, g.f).some((t) => same(t, p))) return "guard";
  }
  if (sim.hack <= 0) for (const c of lv.cameras) if (cone(lv, sim, c, c.f).some((t) => same(t, p))) return "camera";
  return null;
}

export const nextTo = (a: Pos, b: Pos) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y) === 1;
export const canHack = (lv: Level, p: Pos) => lv.terminals.some((t) => nextTo(t, p));

export type Event = { tick: number; kind: "pick" | "hack" | "gem" | "coin" | "bump"; role: Role; at: Pos };
export type Bust = { role: Role; by: "guard" | "camera" | "laser"; at: Pos };
export type Tick = { sim: Sim; events: Event[]; bust: Bust | null; won: boolean };

/** One tick: both thieves act, then guards walk, then the hack wears down, then anyone seen is busted. */
export function step(lv: Level, prev: Sim, acts: Record<Role, Action>): Tick {
  const sim: Sim = { ...prev, cat: { ...prev.cat }, hacker: { ...prev.hacker }, open: [...prev.open], coins: [...prev.coins] };
  const events: Event[] = [];
  let bust: Bust | null = null;
  for (const role of ROLES) {
    const a = acts[role];
    const me = sim[role];
    if (a === "hack") {
      if (role === "hacker" && canHack(lv, me)) { sim.hack = HACK_TICKS + 1; events.push({ tick: sim.tick + 1, kind: "hack", role, at: { ...me } }); }
      continue;
    }
    if (a === "wait") continue;
    const to = add(me, DIRS[a]);
    if (charAt(lv, to) === "D" && !sim.open.includes(key(to))) {
      if (role === "cat") { sim.open.push(key(to)); events.push({ tick: sim.tick + 1, kind: "pick", role, at: to }); }
      else events.push({ tick: sim.tick + 1, kind: "bump", role, at: to });
      continue;
    }
    if (!walkable(lv, sim, to)) { events.push({ tick: sim.tick + 1, kind: "bump", role, at: to }); continue; }
    sim[role] = to;
    if (isLaser(lv, to) && sim.hack <= 0 && !bust) bust = { role, by: "laser", at: to };
  }
  for (const role of ROLES) {
    const p = sim[role];
    if (!sim.gem && same(p, lv.gem)) { sim.gem = true; events.push({ tick: sim.tick + 1, kind: "gem", role, at: { ...p } }); }
    const c = lv.coins.find((x) => same(x, p));
    if (c && !sim.coins.includes(key(c))) { sim.coins.push(key(c)); events.push({ tick: sim.tick + 1, kind: "coin", role, at: { ...p } }); }
  }
  sim.tick += 1;
  sim.hack = Math.max(0, sim.hack - 1);
  if (!bust) {
    for (const role of ROLES) {
      const by = spottedBy(lv, sim, sim[role]);
      if (by) { bust = { role, by: by as Bust["by"], at: { ...sim[role] } }; break; }
    }
  }
  const won = !bust && sim.gem && ROLES.every((r) => lv.exits.some((e) => same(e, sim[r])));
  return { sim, events, bust, won };
}

/** A whole round: up to TICKS ticks, stopping early on a bust or a getaway. */
export function playRound(lv: Level, start: Sim, plans: Record<Role, Action[]>): Tick[] {
  const out: Tick[] = [];
  let sim = start;
  for (let t = 0; t < TICKS; t++) {
    const r = step(lv, sim, { cat: plans.cat[t] ?? "wait", hacker: plans.hacker[t] ?? "wait" });
    out.push(r);
    sim = r.sim;
    if (r.bust || r.won) break;
  }
  return out;
}

/** Where a plan leaves you, ignoring guards (for drawing the planned path). */
export function planPath(lv: Level, sim: Sim, role: Role, plan: Action[]): Pos[] {
  let p = { ...sim[role] };
  const open = new Set(sim.open);
  const out: Pos[] = [];
  for (const a of plan) {
    if (a !== "wait" && a !== "hack") {
      const to = add(p, DIRS[a]);
      const c = charAt(lv, to);
      if (c === "D" && !open.has(key(to))) { if (role === "cat") open.add(key(to)); }
      else if (!opaque(lv, { ...sim, open: [...open] }, to)) p = to;
    }
    out.push({ ...p });
  }
  return out;
}

/** The action that moves from `from` to the tapped tile, if it's a legal next step for this role. */
export function actionFor(lv: Level, sim: Sim, role: Role, from: Pos, open: string[], tap: Pos): Action | null {
  if (same(from, tap)) return "wait";
  if (!nextTo(from, tap)) return null;
  const d = dirBetween(from, tap)!;
  const c = charAt(lv, tap);
  if (c === "T") return role === "hacker" ? "hack" : null;
  if (c === "D" && !open.includes(key(tap))) return role === "cat" ? d : null;
  return opaque(lv, { ...sim, open }, tap) ? null : d;
}

export function stars(lv: Level, sim: Sim, rounds: number) {
  return { escaped: true, coins: sim.coins.length === lv.coins.length, par: rounds <= lv.def.par };
}

// ---------- Solver (for tests and par) ----------
const ALL: Action[] = ["n", "e", "s", "w", "wait"];

/** Fewest ticks to a getaway (optionally with every coin), or -1 if impossible. */
export function solve(lv: Level, opts: { coins?: boolean; limit?: number } = {}): number {
  const start = startSim(lv);
  const k = (s: Sim) => `${key(s.cat)}|${key(s.hacker)}|${s.tick % lv.cycle}|${s.hack}|${[...s.open].sort().join(";")}|${s.gem ? 1 : 0}|${opts.coins ? [...s.coins].sort().join(";") : ""}`;
  const seen = new Set([k(start)]);
  let frontier = [start];
  for (let depth = 1; depth <= (opts.limit ?? 80); depth++) {
    const next: Sim[] = [];
    for (const s of frontier) {
      const hackerActs = canHack(lv, s.hacker) ? [...ALL, "hack" as Action] : ALL;
      for (const ca of ALL) for (const ha of hackerActs) {
        const r = step(lv, s, { cat: ca, hacker: ha });
        if (r.bust) continue;
        if (r.won && (!opts.coins || r.sim.coins.length === lv.coins.length)) return depth;
        const kk = k(r.sim);
        if (seen.has(kk)) continue;
        seen.add(kk);
        next.push(r.sim);
      }
    }
    if (!next.length) return -1;
    frontier = next;
  }
  return -1;
}
