// In Sync question decks. Every question works from both sides: you answer for yourself,
// then guess what your partner answered. `talk` is the conversation starter shown on reveal.

export type DeckId = "light" | "dreams" | "deep" | "flirty";
export const DECKS: { id: DeckId; name: string; icon: string; sub: string }[] = [
  { id: "light", name: "Just for fun", icon: "🎈", sub: "Silly and easy" },
  { id: "dreams", name: "Dreams", icon: "🌏", sub: "Future and plans" },
  { id: "deep", name: "Deep talk", icon: "🌙", sub: "Feelings and memories" },
  { id: "flirty", name: "Cute & flirty", icon: "💘", sub: "About the two of you" },
];

type Base = { id: string; deck: DeckId; q: string; talk: string };
export type Question =
  | (Base & { type: "pick"; options: string[] })
  | (Base & { type: "scale"; lo: string; hi: string })
  | (Base & { type: "rank"; items: string[] })
  | (Base & { type: "who" })
  | (Base & { type: "open" });

const pick = (deck: DeckId, id: string, q: string, options: string[], talk: string): Question => ({ id, deck, type: "pick", q, options, talk });
const scale = (deck: DeckId, id: string, q: string, lo: string, hi: string, talk: string): Question => ({ id, deck, type: "scale", q, lo, hi, talk });
const rank = (deck: DeckId, id: string, q: string, items: string[], talk: string): Question => ({ id, deck, type: "rank", q, items, talk });
const who = (deck: DeckId, id: string, q: string, talk: string): Question => ({ id, deck, type: "who", q, talk });
const open = (deck: DeckId, id: string, q: string, talk: string): Question => ({ id, deck, type: "open", q, talk });

export const QUESTIONS: Question[] = [
  // ---------- Just for fun ----------
  pick("light", "l1", "Perfect lazy Sunday?", ["Movie marathon", "Brunch out", "Long walk", "Sleep till noon"], "Plan your next lazy Sunday together. What's on it?"),
  pick("light", "l2", "Pick a superpower", ["Teleporting", "Flying", "Reading minds", "Pausing time"], "What's the first thing you'd do with it?"),
  pick("light", "l3", "Cats or dogs?", ["Cats", "Dogs", "Both!", "Neither"], "Name a pet you'd get together. Agree on one name."),
  pick("light", "l4", "Window or aisle seat?", ["Window", "Aisle"], "What's the worst flight or bus ride you've ever had?"),
  pick("light", "l5", "Best way to spend a rainy day?", ["Blanket and a movie", "Cook something", "Nap", "Go out anyway"], "Next rainy day: what are you two doing?"),
  pick("light", "l6", "Give up one for a month?", ["Social media", "Coffee or tea", "Music", "Sweets"], "Could you actually do it? Make a bet."),
  pick("light", "l7", "Pick a holiday snack", ["Martabak", "Pizza", "Sushi", "Fried chicken"], "Where's the best place to get it near you?"),
  scale("light", "l8", "How good is your singing voice, honestly?", "Shower only", "Ready for the stage", "Sing one line of any song right now. No skipping!"),
  scale("light", "l9", "How spicy do you like your food?", "Mild please", "Extra sambal", "What's the spiciest thing you've ever eaten?"),
  scale("light", "l10", "How messy is your room right now?", "Spotless", "Disaster zone", "Prove it: show each other on camera!"),
  scale("light", "l11", "How much do you love surprises?", "Hate them", "Love them", "What's the best surprise you've ever had?"),
  scale("light", "l12", "How much of a morning person are you?", "Don't talk to me", "Up with the sun", "What does your perfect morning look like?"),
  rank("light", "l13", "Rank these snacks", ["Chips", "Chocolate", "Ice cream", "Fruit"], "Which snack would you bring on a date?"),
  rank("light", "l14", "Rank these movie types", ["Comedy", "Horror", "Romance", "Action"], "Pick a movie to watch together this week."),
  rank("light", "l15", "Rank these chores, best to worst", ["Dishes", "Laundry", "Cooking", "Cleaning the bathroom"], "If you lived together, who'd do which chore?"),
  who("light", "l16", "Who's more likely to fall asleep during a movie?", "What's the last movie one of you fell asleep in?"),
  who("light", "l17", "Who's more likely to get lost, even with GPS?", "Tell the story of the most lost you've ever been."),
  who("light", "l18", "Who takes longer to get ready?", "Be honest: how long does it really take?"),
  who("light", "l19", "Who's the better cook?", "Plan a video cook-off: same recipe, same time."),
  who("light", "l20", "Who's more likely to cry at a cartoon?", "Which movie made you cry the most?"),
  open("light", "l21", "Describe your day today in three emojis.", "Explain your emojis!"),
  open("light", "l22", "What song is stuck in your head lately?", "Play it for each other right now."),

  // ---------- Dreams ----------
  pick("dreams", "d1", "Dream place to live?", ["Big city", "Beach town", "Mountains", "Countryside"], "Describe a normal morning in that home."),
  pick("dreams", "d2", "Dream trip together?", ["Japan", "Europe road trip", "Island hopping", "Northern lights"], "What's the first thing you'd do when you land?"),
  pick("dreams", "d3", "Your dream birthday?", ["Big party", "Small dinner", "A trip away", "Quiet day in"], "What should the other plan for your next birthday?"),
  pick("dreams", "d4", "Retire where?", ["By the sea", "In the city", "Travelling forever", "Near family"], "What would a day look like when you're 70?"),
  pick("dreams", "d5", "A side project to do together?", ["Small business", "Learn to dance", "Grow a garden", "Start a channel"], "What would you call it?"),
  pick("dreams", "d6", "Master one skill overnight?", ["An instrument", "Cooking", "A sport", "Drawing"], "What would you do first with that skill?"),
  scale("dreams", "d7", "How big should your future home be?", "Tiny and cozy", "Huge mansion", "Name the one room it must have."),
  scale("dreams", "d8", "How adventurous are you with new things?", "Comfort zone", "Yes to everything", "What's something new you want to try this year?"),
  scale("dreams", "d9", "How important is living close to family?", "Not really", "Super important", "Where would you want to live in five years?"),
  scale("dreams", "d10", "How much do you want to learn a new language?", "Not at all", "Already started", "Which language, and why?"),
  rank("dreams", "d11", "Rank what matters most in a home", ["Big kitchen", "Garden", "Location", "Space for hobbies"], "Draw your dream home's floor plan in the air."),
  rank("dreams", "d12", "Rank these adventures", ["Skydiving", "Scuba diving", "Hot air balloon", "Cross-country road trip"], "Which one would you actually do together?"),
  rank("dreams", "d13", "Rank these for a weekend away", ["Great food", "A nice view", "Doing nothing", "Exploring"], "Plan that weekend in one minute. Go!"),
  who("dreams", "d14", "Who's more likely to quit their job and travel the world?", "Where would you go first?"),
  who("dreams", "d15", "Who's more likely to become famous?", "What would you be famous for?"),
  who("dreams", "d16", "Who would spend more on a dream holiday?", "What's one thing worth splurging on when travelling?"),
  who("dreams", "d17", "Who'd be the stricter parent or pet owner?", "What's one rule you'd definitely have?"),
  open("dreams", "d18", "If money didn't matter, what would you do every day?", "What's stopping you from doing a bit of that now?"),
  open("dreams", "d19", "One thing you want to have done by next year?", "How can the other help you get there?"),
  open("dreams", "d20", "Describe the two of you in 10 years, in one sentence.", "What's the first step toward that?"),

  // ---------- Deep talk ----------
  pick("deep", "p1", "When you're upset, what helps most?", ["Talk it out now", "Space first, talk later", "A hug, no words", "A distraction"], "Is that what usually happens? What would help more?"),
  pick("deep", "p2", "Biggest fear?", ["Being alone", "Failing", "Losing someone", "Feeling stuck"], "Where do you think that fear comes from?"),
  pick("deep", "p3", "What do you need more of lately?", ["Rest", "Fun", "Support", "Adventure"], "How can the other help with that this week?"),
  pick("deep", "p4", "What makes you feel most loved?", ["Hearing it", "Being remembered", "Time together", "Being helped"], "When did the other last make you feel that way?"),
  scale("deep", "p5", "How much alone time do you need to recharge?", "Hardly any", "Lots", "What does a perfect recharge day look like?"),
  scale("deep", "p6", "How much do you worry about the future?", "Rarely", "All the time", "What's on your mind most these days?"),
  scale("deep", "p7", "How easy is it for you to say what you feel?", "Really hard", "Easy", "What makes it easier for you to open up?"),
  scale("deep", "p8", "How well do you handle change?", "I hate it", "I love it", "What's the biggest change you've been through?"),
  scale("deep", "p9", "How much do you miss each other right now?", "Barely 😜", "So much", "What would you do if you were together right now?"),
  rank("deep", "p10", "Rank how you like to be loved", ["Kind words", "Quality time", "Hugs", "Helping out"], "Give one example of each that you'd love."),
  rank("deep", "p11", "Rank what you value most", ["Honesty", "Kindness", "Humor", "Loyalty"], "Which one do you see most in each other?"),
  who("deep", "p12", "Who usually apologizes first?", "Is that fair? What makes it hard to say sorry?"),
  who("deep", "p13", "Who's the better listener?", "What's something you wish the other asked you about more?"),
  who("deep", "p14", "Who's more likely to overthink a text message?", "What text have you overthought the most?"),
  open("deep", "p15", "Something you're proud of that you rarely talk about?", "Tell the full story."),
  open("deep", "p16", "A small thing the other does that makes your day better?", "Say thank you for it, properly."),
  open("deep", "p17", "A childhood memory that shaped who you are?", "How does it still show up today?"),
  open("deep", "p18", "When did you feel closest to each other?", "What made that moment special?"),
  open("deep", "p19", "One thing you'd tell your younger self?", "Would they have listened?"),
  open("deep", "p20", "Something you'd like the other to ask you about more?", "Ask about it now."),

  // ---------- Cute & flirty ----------
  pick("flirty", "f1", "Best kind of date?", ["Fancy dinner", "Picnic", "Arcade", "Cooking at home"], "Plan your next date, right now."),
  pick("flirty", "f2", "Your favourite thing about the other?", ["Smile", "Eyes", "Laugh", "Voice"], "Say why. Don't be shy."),
  pick("flirty", "f3", "Ideal cuddle activity?", ["A movie", "Talking for hours", "Napping", "Gaming"], "What would you watch or play?"),
  pick("flirty", "f4", "A pet name you'd secretly love?", ["Babe", "Honey", "Sayang", "Something silly"], "Try it out on each other. How did it feel?"),
  scale("flirty", "f5", "How cheesy are you, really?", "Not at all", "Extra cheesy", "Say your cheesiest line. Right now."),
  scale("flirty", "f6", "How much do you like holding hands in public?", "Not really", "Always", "Where's your favourite place to walk together?"),
  scale("flirty", "f7", "How fast does the other reply to messages?", "Turtle", "Lightning", "What's the longest you've waited for a reply?"),
  scale("flirty", "f8", "How jealous do you get?", "Never", "Very", "What helps you feel secure?"),
  rank("flirty", "f9", "Rank these date ideas", ["Stargazing", "Karaoke", "Museum", "Night market"], "Pick one and set a date."),
  rank("flirty", "f10", "Rank the best parts of a date", ["The planning", "The food", "The talking", "The goodbye"], "What made your best date the best?"),
  who("flirty", "f11", "Who fell for the other first?", "When did you know?"),
  who("flirty", "f12", "Who sends more good-morning texts?", "Send one now, even if it's night."),
  who("flirty", "f13", "Who's the bigger flirt?", "Prove it in one sentence."),
  who("flirty", "f14", "Who's more likely to plan a surprise date?", "What would the surprise be?"),
  who("flirty", "f15", "Who gives better hugs?", "Describe the perfect hug."),
  open("flirty", "f16", "What did you think the first time you talked?", "Was the first impression right?"),
  open("flirty", "f17", "Describe the other in three words.", "Pick your favourite word from their list."),
  open("flirty", "f18", "Which song reminds you of the two of you?", "Play it together."),
  open("flirty", "f19", "A date you'd want to repeat?", "What made it so good?"),
  open("flirty", "f20", "The moment you knew you liked the other?", "Did you tell them then?"),
];

export const questionById = (id?: string) => QUESTIONS.find((q) => q.id === id);
