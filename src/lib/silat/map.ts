// Raja Silat run map: rows of nodes joined by paths. You pick where to go next.
// Row 0 is the Warm-up fight, the last row is the boss, the row before it is always a campfire.

export type NodeKind = "fight" | "elite" | "camp" | "shop" | "event" | "treasure" | "boss";

export interface MapNode {
  id: string;
  row: number;
  lane: number;
  kind: NodeKind;
  seed: number;
}
export interface RunMap {
  nodes: MapNode[];
  edges: [string, string][];
}

export const MAP_ROWS = 7; // rows 0..6, row 6 = boss
export const MAP_LANES = 4;

export const NODE_INFO: Record<NodeKind, { name: string; sub: string; color: string; edge: string }> = {
  fight: { name: "Fight", sub: "Gold and a new card", color: "#1CB0F6", edge: "#1478A8" },
  elite: { name: "Elite", sub: "Tougher fight. Drops a Pusaka", color: "#FF4B4B", edge: "#B81F1F" },
  camp: { name: "Campfire", sub: "Rest to heal, or train to remove a card", color: "#FF9600", edge: "#C46A00" },
  shop: { name: "Warung", sub: "Buy cards and Pusaka, heal, remove a card", color: "#2BB673", edge: "#1E7A4C" },
  event: { name: "Mystery", sub: "Something happens. You choose", color: "#CE82FF", edge: "#8A4FB5" },
  treasure: { name: "Treasure", sub: "Pick a Pusaka", color: "#FFC800", edge: "#B88A00" },
  boss: { name: "Boss", sub: "The prison's warden. Beat it to escape", color: "#3C3C3C", edge: "#1A1A1A" },
};

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function kindFor(row: number, r: () => number, depth: number): NodeKind {
  if (row === 0) return "fight";
  if (row === MAP_ROWS - 2) return "camp";
  const roll = r();
  if (row === 1) return roll < 0.75 ? "fight" : "event";
  if (row === 3 && roll < 0.2) return "treasure";
  // Deeper prisons swap some plain fights for elites.
  const elite = Math.min(0.12, 0.03 * (depth - 1));
  if (roll < 0.45 - elite) return "fight";
  if (roll < 0.62) return "elite";
  if (roll < 0.78) return "event";
  if (roll < 0.9) return "shop";
  return "camp";
}

/** One prison's map. Each depth of an endless run gets its own. */
export function makeMap(seed: number, depth = 1): RunMap {
  const r = rng(seed * 31 + 7 + (depth - 1) * 104_729);
  const nodes = new Map<string, MapNode>();
  const edges: [string, string][] = [];
  const id = (row: number, lane: number) => `${row}-${lane}`;
  const bossId = id(MAP_ROWS - 1, 0);
  const start = id(0, 1);
  nodes.set(start, { id: start, row: 0, lane: 1.5, kind: "fight", seed: 0 });
  const crosses = (row: number, a: number, b: number) =>
    edges.some(([f, t]) => {
      const [fr, fl] = f.split("-").map(Number), [, tl] = t.split("-").map(Number);
      return fr === row && ((fl < a && tl > b) || (fl > a && tl < b));
    });
  // Four routes fan out from the start and wander up, sometimes merging.
  const lanes = [0, 1, 2, 3];
  for (const first of lanes) {
    if (!edges.some(([f, t]) => f === start && t === id(1, first))) edges.push([start, id(1, first)]);
    let lane = first;
    for (let row = 1; row < MAP_ROWS - 1; row++) {
      if (!nodes.has(id(row, lane))) nodes.set(id(row, lane), { id: id(row, lane), row, lane, kind: "fight", seed: 0 });
      if (row === MAP_ROWS - 2) {
        if (!edges.some(([f]) => f === id(row, lane))) edges.push([id(row, lane), bossId]);
        break;
      }
      const options = [lane - 1, lane, lane + 1]
        .filter((l) => l >= 0 && l < MAP_LANES && !crosses(row, lane, l))
        .map((l) => ({ l, k: (nodes.has(id(row + 1, l)) ? 0.6 : 0) + r() }))
        .sort((a, b) => a.k - b.k)
        .map((x) => x.l);
      const next = options[0] ?? lane;
      if (!edges.some(([f, t]) => f === id(row, lane) && t === id(row + 1, next))) edges.push([id(row, lane), id(row + 1, next)]);
      lane = next;
    }
  }
  nodes.set(bossId, { id: bossId, row: MAP_ROWS - 1, lane: 1.5, kind: "boss", seed: 0 });
  for (const n of nodes.values()) {
    n.seed = Math.floor(r() * 1e9);
    if (n.kind !== "boss" && n.id !== start) n.kind = kindFor(n.row, r, depth);
  }
  // Never two elites in a row, and never a shop right after a shop.
  for (const [f, t] of edges) {
    const a = nodes.get(f)!, b = nodes.get(t)!;
    if (a.kind === b.kind && (a.kind === "elite" || a.kind === "shop" || a.kind === "camp") && b.row !== MAP_ROWS - 2) b.kind = "fight";
  }
  return { nodes: [...nodes.values()], edges };
}

export const nodeById = (map: RunMap, id: string) => map.nodes.find((n) => n.id === id)!;

/** Where you can go next from `at` (null = the start). */
export function nextNodes(map: RunMap, at: string | null): string[] {
  if (!at) return [map.nodes.find((n) => n.row === 0)!.id];
  return map.edges.filter(([f]) => f === at).map(([, t]) => t);
}
