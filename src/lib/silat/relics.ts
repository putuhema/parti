// Raja Silat Pusaka (relics): each one bends a rule for the rest of the run.
// The rule changes themselves live where the rule is (rules.ts, cards.ts, run.ts),
// checked with has(fight, id) or run.relics.includes(id).

export interface Relic {
  id: string;
  name: string;
  text: string;
  rare?: boolean;
  /** Placeholder icon colour. */
  color: string;
}

const list: Relic[] = [
  { id: "keris_api", name: "Keris Berapi", text: "Your first crash each turn deals double damage.", color: "#E5383B", rare: true },
  { id: "selendang", name: "Selendang Angin", text: "Pieces you kick fly straight through mud.", color: "#1CB0F6" },
  { id: "peci", name: "Peci Hitam", text: "Langkah Kuda never sets off enemy reactions.", color: "#3C3C3C" },
  { id: "gelang", name: "Gelang Besi", text: "Up to 5 Block carries over to your next turn.", color: "#8C8C8C" },
  { id: "kopi", name: "Kopi Tubruk", text: "Your first knockout each turn gives +1 Tenaga.", color: "#7A4E2D", rare: true },
  { id: "tasbih", name: "Tasbih", text: "Heal 1 HP whenever you knock a piece off the board.", color: "#2BB673" },
  { id: "sandal", name: "Sandal Jepit", text: "Two free steps every turn.", color: "#FF9600", rare: true },
  { id: "akik", name: "Batu Akik", text: "Draw 6 cards each turn instead of 5.", color: "#CE82FF", rare: true },
  { id: "jamu", name: "Jamu Kunyit", text: "Heal 4 extra HP after every fight.", color: "#FFC800" },
  { id: "kendang", name: "Kendang", text: "+1 Tenaga on the first turn of every fight.", color: "#B5651D" },
  { id: "songket", name: "Songket Merah", text: "Enemies that strike you as you arrive take 1 damage.", color: "#B81F1F" },
  { id: "keris", name: "Keris Pusaka", text: "All your kicks and punches hit +1.", color: "#E5A800" },
];

export const RELICS: Record<string, Relic> = Object.fromEntries(list.map((r) => [r.id, r]));
export const ALL_RELICS = list;
