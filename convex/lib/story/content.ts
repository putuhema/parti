// Sneaky Story content: story starters, the odd secret words you sneak into your lines,
// and twists that shake the story up.

export const STARTERS: { emoji: string; text: string }[] = [
  { emoji: "🦝", text: "Two raccoons open a bakery in Bandung." },
  { emoji: "🏮", text: "At the night market, one lantern refuses to go out." },
  { emoji: "👵", text: "A grandma enters a karaoke contest to win back her stolen cat." },
  { emoji: "🚇", text: "The last train of the night stops at a station that isn't on the map." },
  { emoji: "🐢", text: "A turtle decides today is the day it becomes famous." },
  { emoji: "🍜", text: "A noodle stall owner discovers his broth can make people tell the truth." },
  { emoji: "🌋", text: "A tiny village throws a birthday party for its volcano." },
  { emoji: "📮", text: "A letter arrives, addressed to both of you, written 50 years ago." },
  { emoji: "🛵", text: "An ojek driver picks up a passenger who only speaks in riddles." },
  { emoji: "🦕", text: "A museum's dinosaur skeleton wakes up hungry." },
  { emoji: "🏝️", text: "Two strangers wash up on an island with one coconut and a ukulele." },
  { emoji: "🤖", text: "A robot vacuum decides it wants to see the ocean." },
  { emoji: "🧳", text: "Someone at the airport picks up the wrong suitcase. It's moving." },
  { emoji: "🐈", text: "The neighbourhood cats hold their monthly secret meeting." },
  { emoji: "🌙", text: "The Moon calls in sick, and someone has to cover its shift." },
  { emoji: "🎻", text: "A street musician's violin starts playing by itself." },
  { emoji: "🏰", text: "A sandcastle on Kuta Beach declares itself a kingdom." },
  { emoji: "📺", text: "A TV weather presenter's forecasts start coming true, exactly." },
  { emoji: "🥚", text: "A chicken lays an egg that hums." },
  { emoji: "🧙", text: "A wizard retires and opens a phone repair shop." },
  { emoji: "🚀", text: "Two astronauts realise they left the stove on. On Earth." },
  { emoji: "🐘", text: "An elephant enrols at university to study history." },
  { emoji: "☕", text: "A coffee shop's barista can see your future in the milk foam." },
  { emoji: "🌧️", text: "It has been raining in one small town for exactly 100 days." },
];

/** Single words only, so a tap on one word is a clear guess. */
export const WORDS: string[] = [
  // food
  "durian", "martabak", "pineapple", "noodle", "waffle", "mango", "sambal", "croissant", "popcorn", "avocado", "rendang", "pickle", "pancake", "jelly", "coconut", "cheese", "dumpling", "lollipop",
  // animals
  "penguin", "giraffe", "octopus", "gecko", "flamingo", "hamster", "buffalo", "jellyfish", "owl", "sloth", "goose", "llama", "squirrel", "walrus", "parrot", "hedgehog", "lobster", "pigeon",
  // things
  "umbrella", "trombone", "toaster", "kite", "lantern", "helmet", "sock", "teapot", "mirror", "ladder", "suitcase", "broom", "compass", "balloon", "doorbell", "scooter", "hammock", "telescope", "accordion", "sandal", "trampoline", "spatula", "bucket", "remote", "crown", "glitter", "bubble", "spoon",
  // places
  "volcano", "lighthouse", "library", "swamp", "rooftop", "elevator", "waterfall", "castle", "warung", "jungle", "igloo", "basement", "circus", "pyramid",
  // people
  "wizard", "pirate", "astronaut", "grandpa", "robot", "ghost", "dinosaur", "mermaid", "detective", "chef", "ninja", "cowboy", "dentist", "librarian",
  // describing
  "sparkly", "sticky", "grumpy", "invisible", "enormous", "wobbly", "haunted", "fluffy", "ancient", "mysterious", "squeaky", "sleepy", "spicy", "shiny",
  // weather and sky
  "thunder", "rainbow", "fog", "meteor", "snowflake", "tornado", "comet", "moonlight",
];

export const TWISTS: string[] = [
  "Suddenly, it starts to rain.",
  "Someone has been lying the whole time.",
  "A phone rings in the distance.",
  "The ground begins to shake.",
  "A famous celebrity walks in.",
  "Everyone falls asleep except one person.",
  "A door appears where there wasn't one before.",
  "It's suddenly ten years later.",
  "Someone finds a mysterious map.",
  "All the lights go out.",
  "Something important gets stolen.",
  "An animal starts giving advice.",
  "It turns out this was all a dream… or was it?",
  "A long-lost twin arrives.",
  "Gravity stops working for a minute.",
  "Everyone has to sing instead of talk.",
];
