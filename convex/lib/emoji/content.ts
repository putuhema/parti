// Emoji Charades content: secret phrases to act out in emoji, and the emoji palette to do it with.

export type CategoryId = "movies" | "songs" | "food" | "places" | "couple" | "sayings";
export const CATEGORIES: { id: CategoryId; name: string; icon: string }[] = [
  { id: "movies", name: "Movies", icon: "🎬" },
  { id: "songs", name: "Songs", icon: "🎵" },
  { id: "food", name: "Food & drink", icon: "🍜" },
  { id: "places", name: "Places", icon: "🗺️" },
  { id: "couple", name: "Us two", icon: "💞" },
  { id: "sayings", name: "Sayings", icon: "💬" },
];

export const PROMPTS: Record<CategoryId, string[]> = {
  movies: [
    "Frozen", "Titanic", "The Lion King", "Finding Nemo", "Toy Story", "Jurassic Park", "Spider-Man", "Harry Potter", "Star Wars",
    "The Little Mermaid", "Beauty and the Beast", "Up", "Cars", "Shrek", "Jaws", "Ghostbusters", "Home Alone", "Kung Fu Panda",
    "Ice Age", "The Wizard of Oz", "Back to the Future", "Inside Out", "Coco", "Moana", "Aladdin", "Ratatouille",
  ],
  songs: [
    "Let It Go", "Happy Birthday", "Twinkle Twinkle Little Star", "Baby Shark", "Yellow Submarine", "Shape of You", "Umbrella",
    "Firework", "Thriller", "Dancing Queen", "Despacito", "Gangnam Style", "Rasa Sayange", "Bengawan Solo", "Balonku", "Bintang Kecil",
    "Hotel California", "Wonderwall", "Love Story", "Bad Guy",
  ],
  food: [
    "Nasi goreng", "Sate ayam", "Martabak manis", "Es teh", "Bakso", "Pizza", "Hot dog", "Fried chicken", "Popcorn", "Sushi",
    "Pancakes", "Mie ayam", "Pisang goreng", "Rendang", "Fruit salad", "Chocolate cake", "Coconut water", "Spaghetti", "Ice cream", "Egg sandwich",
  ],
  places: [
    "Bali", "Paris", "Monas", "Mount Bromo", "Komodo Island", "Borobudur", "New York", "Tokyo", "The beach", "Hospital",
    "Airport", "Zoo", "Library", "Night market", "Cinema", "Swimming pool", "Outer space", "North Pole", "Desert island", "Haunted house",
  ],
  couple: [
    "First date", "Long distance", "Movie night", "Holding hands", "Video call", "Anniversary", "Love letter", "Cooking together",
    "Road trip", "Breakfast in bed", "Matching outfits", "Bad wifi", "Falling asleep on a call", "Surprise gift", "Dancing in the rain",
    "Late night snack", "Morning coffee", "Big hug", "Meeting the parents", "Our first trip",
  ],
  sayings: [
    "Time flies", "Piece of cake", "Break a leg", "Cold feet", "Raining cats and dogs", "Under the weather", "Spill the beans",
    "Hit the road", "Once in a blue moon", "Butterflies in my stomach", "Early bird", "Couch potato", "Night owl",
    "Love at first sight", "Elephant in the room", "Head in the clouds", "Heart of gold", "Sleep tight", "Over the moon", "Apple of my eye",
  ],
};

/** The emoji keyboard, in tabs. */
export const PALETTE: { name: string; icon: string; emojis: string[] }[] = [
  { name: "People", icon: "🙂", emojis: ["😀", "😂", "😍", "😢", "😡", "😱", "😴", "🤔", "😎", "🥶", "🤒", "🥳", "👶", "👦", "👧", "👨", "👩", "👴", "👵", "👸", "🤴", "🧙", "🧜", "🦸", "🧛", "👻", "🤖", "👽", "💃", "🕺", "👫", "💏", "🤝", "👋", "👍", "👎", "✋", "🙏", "💪", "🦵", "👀", "👂", "👃", "👄", "🧠", "🫀"] },
  { name: "Animals", icon: "🐱", emojis: ["🐶", "🐱", "🐭", "🐰", "🦊", "🐻", "🐼", "🐨", "🐯", "🦁", "🐮", "🐷", "🐸", "🐵", "🐔", "🐧", "🐦", "🦆", "🦉", "🦇", "🐺", "🐴", "🦄", "🐝", "🐛", "🦋", "🐌", "🐢", "🐍", "🦖", "🐙", "🦀", "🐠", "🐬", "🐳", "🦈", "🐊", "🐘", "🦒", "🐪", "🌲", "🌴", "🌵", "🌸", "🌹", "🌻", "🍀", "🍁"] },
  { name: "Food", icon: "🍔", emojis: ["🍎", "🍌", "🍇", "🍓", "🍉", "🍍", "🥥", "🥭", "🍋", "🍑", "🥑", "🌶️", "🥕", "🌽", "🥔", "🍞", "🥞", "🧀", "🍗", "🍖", "🥩", "🍔", "🍟", "🍕", "🌭", "🥪", "🌮", "🍝", "🍜", "🍲", "🍛", "🍣", "🍤", "🍚", "🍙", "🍢", "🥟", "🍦", "🍩", "🍪", "🎂", "🍰", "🍫", "🍿", "☕", "🍵", "🧋", "🥤", "🍺", "🍷", "🥛", "🧊"] },
  { name: "Things", icon: "🎁", emojis: ["⚽", "🏀", "🎾", "🎮", "🎲", "🎸", "🎹", "🎤", "🎧", "🎬", "📺", "📱", "💻", "📷", "💡", "🔦", "📚", "✏️", "✉️", "📦", "🎁", "🎈", "🎉", "🕯️", "💍", "👑", "👗", "👕", "👟", "🧦", "🎩", "👓", "🌂", "☂️", "⏰", "⌛", "🔑", "🚪", "🛏️", "🛁", "🧸", "🪄", "💰", "💎", "🔨", "✂️", "💊", "💌"] },
  { name: "Places", icon: "🌍", emojis: ["🏠", "🏫", "🏥", "🏰", "🏯", "⛪", "🕌", "🛕", "🗼", "🗽", "🏝️", "🏖️", "🏔️", "🌋", "🏕️", "🏙️", "🌃", "🎡", "🎢", "🎪", "🚗", "🚕", "🚌", "🚂", "🚲", "🛵", "✈️", "🚀", "🛸", "🚢", "⛵", "🗺️", "🌍", "🌙", "⭐", "🌞", "☁️", "🌧️", "⛈️", "❄️", "🌈", "🔥", "💧", "🌊", "🌪️", "⚡"] },
  { name: "Symbols", icon: "❤️", emojis: ["❤️", "💔", "💕", "💯", "✨", "💤", "💬", "💭", "❓", "❗", "❌", "✅", "➕", "➖", "➡️", "⬅️", "⬆️", "⬇️", "🔁", "🔄", "1️⃣", "2️⃣", "3️⃣", "🔟", "🎵", "🎶", "🔊", "🔇", "♻️", "🚫", "⚠️", "🎯", "🏆", "🥇", "⏩", "⏸️"] },
];
