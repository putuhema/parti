/**
 * Buzz Board question bank. Each category has 5 tiers (100 → 500 points, easy → hard),
 * two questions per tier. Each entry is [question, correct answer, wrong, wrong, wrong].
 * The server shuffles the choices and never sends the right one before the reveal.
 * Server-only: don't import this from client code.
 */
type Q = [string, string, string, string, string];
type Tiers = [Q[], Q[], Q[], Q[], Q[]];

const BANK: Tiers[] = [
  // Animals
  [
    [
      ["What do pandas mostly eat?", "Bamboo", "Fish", "Grass", "Berries"],
      ["Which animal is called the king of the jungle?", "Lion", "Tiger", "Gorilla", "Elephant"],
    ],
    [
      ["How many hearts does an octopus have?", "3", "1", "2", "8"],
      ["What is a baby kangaroo called?", "A joey", "A kit", "A cub", "A calf"],
    ],
    [
      ["Which bird is the fastest diver in the world?", "Peregrine falcon", "Bald eagle", "Hummingbird", "Albatross"],
      ["What is the only mammal that can truly fly?", "Bat", "Flying squirrel", "Sugar glider", "Flying lemur"],
    ],
    [
      ["A group of crows is called a…", "Murder", "Pride", "Gaggle", "Pod"],
      ["Which land animal has the longest pregnancy, nearly two years?", "African elephant", "Giraffe", "Rhino", "Hippo"],
    ],
    [
      ["Whose fingerprints are so like ours they could confuse a crime lab?", "Koala", "Sloth", "Panda", "Lemur"],
      ["What color is a polar bear's skin under its fur?", "Black", "White", "Pink", "Grey"],
    ],
  ],
  // Space & Earth
  [
    [
      ["Which star is at the center of our solar system?", "The Sun", "Polaris", "Sirius", "Vega"],
      ["How many continents are there?", "7", "5", "6", "8"],
    ],
    [
      ["How many planets are in our solar system?", "8", "9", "7", "10"],
      ["Which layer of the air shields us from the Sun's UV rays?", "The ozone layer", "The helium layer", "The carbon layer", "The neon layer"],
    ],
    [
      ["Which is the hottest planet in our solar system?", "Venus", "Mercury", "Mars", "Jupiter"],
      ["What is the tallest mountain above sea level?", "Mount Everest", "K2", "Kilimanjaro", "Denali"],
    ],
    [
      ["Which planet spins tipped over on its side?", "Uranus", "Neptune", "Saturn", "Mars"],
      ["What was the giant supercontinent that split apart long ago?", "Pangaea", "Atlantis", "Lemuria", "Avalon"],
    ],
    [
      ["Roughly how old is the Earth?", "4.5 billion years", "450 million years", "45 billion years", "4.5 million years"],
      ["Which planet has the shortest day, about 10 hours?", "Jupiter", "Mercury", "Earth", "Mars"],
    ],
  ],
  // World Map
  [
    [
      ["What is the capital of France?", "Paris", "Lyon", "Rome", "Madrid"],
      ["Which country is shaped like a boot?", "Italy", "Spain", "Greece", "Chile"],
    ],
    [
      ["Which is the longest river in Africa?", "Nile", "Congo", "Niger", "Zambezi"],
      ["Mount Kilimanjaro is in which country?", "Tanzania", "Kenya", "Uganda", "Ethiopia"],
    ],
    [
      ["What is the capital of Australia?", "Canberra", "Sydney", "Melbourne", "Perth"],
      ["What is the capital of Canada?", "Ottawa", "Toronto", "Vancouver", "Montreal"],
    ],
    [
      ["What is the smallest country in the world?", "Vatican City", "Monaco", "San Marino", "Liechtenstein"],
      ["What is the largest hot desert on Earth?", "Sahara", "Gobi", "Kalahari", "Atacama"],
    ],
    [
      ["Counting its overseas lands, which country spans the most time zones?", "France", "Russia", "USA", "China"],
      ["Which country's calendar runs about 7 to 8 years behind most of the world's?", "Ethiopia", "Kenya", "Morocco", "Ghana"],
    ],
  ],
  // Food
  [
    [
      ["What is the main ingredient in guacamole?", "Avocado", "Peas", "Cucumber", "Lime"],
      ["Raisins are dried versions of which fruit?", "Grapes", "Plums", "Figs", "Cherries"],
    ],
    [
      ["Marzipan is made mostly from which nut?", "Almonds", "Peanuts", "Cashews", "Walnuts"],
      ["Korean kimchi is most often made with which vegetable?", "Napa cabbage", "Carrot", "Eggplant", "Spinach"],
    ],
    [
      ["Rendang, the slow-cooked beef dish, comes from which country?", "Indonesia", "Thailand", "India", "Philippines"],
      ["Which spice comes from the threads of a crocus flower?", "Saffron", "Turmeric", "Paprika", "Cumin"],
    ],
    [
      ["Tempeh is made by fermenting which bean?", "Soybeans", "Black beans", "Chickpeas", "Kidney beans"],
      ["Which scale measures how spicy a chili is?", "Scoville", "Richter", "Kelvin", "Beaufort"],
    ],
    [
      ["Which of these is NOT a kind of pasta?", "Tzatziki", "Orecchiette", "Farfalle", "Rigatoni"],
      ["Wasabi is in the same plant family as which?", "Mustard", "Ginger", "Mint", "Onion"],
    ],
  ],
  // Music & Film
  [
    [
      ["How many strings does a standard guitar have?", "6", "4", "5", "8"],
      ["Which instrument has black and white keys?", "Piano", "Violin", "Flute", "Drum"],
    ],
    [
      ["How many musicians play in a quartet?", "4", "3", "5", "8"],
      ["Which animated film has a talking snowman named Olaf?", "Frozen", "Moana", "Tangled", "Brave"],
    ],
    [
      ["Which composer kept writing music after going deaf?", "Beethoven", "Mozart", "Bach", "Chopin"],
      ["What is the highest common singing voice?", "Soprano", "Alto", "Tenor", "Bass"],
    ],
    [
      ["Gamelan orchestras come from which country?", "Indonesia", "Japan", "India", "Peru"],
      ["In sheet music, what does \"forte\" mean?", "Loud", "Soft", "Fast", "Slow"],
    ],
    [
      ["How many keys does a standard piano have?", "88", "76", "92", "64"],
      ["The tango dance was born in which country?", "Argentina", "Spain", "Brazil", "Cuba"],
    ],
  ],
  // Sports
  [
    [
      ["How many players does a soccer team have on the field?", "11", "9", "10", "12"],
      ["Which sport uses a shuttlecock?", "Badminton", "Tennis", "Squash", "Volleyball"],
    ],
    [
      ["How many rings are on the Olympic flag?", "5", "4", "6", "7"],
      ["How many players does a basketball team have on court?", "5", "6", "7", "4"],
    ],
    [
      ["About how long is a marathon?", "42 km", "26 km", "50 km", "35 km"],
      ["Judo was created in which country?", "Japan", "China", "Korea", "Thailand"],
    ],
    [
      ["In tennis, what is a score of zero called?", "Love", "Nil", "Duck", "Zip"],
      ["In golf, what is one stroke under par called?", "Birdie", "Eagle", "Bogey", "Albatross"],
    ],
    [
      ["What is the highest possible normal break in snooker?", "147", "155", "180", "140"],
      ["In which year were the first modern Olympic Games held?", "1896", "1900", "1924", "1856"],
    ],
  ],
  // Inventions
  [
    [
      ["What did the Wright brothers famously build and fly?", "An airplane", "A car", "A rocket", "A hot air balloon"],
      ["What does a compass help you find?", "Which way is north", "The time", "The temperature", "How deep water is"],
    ],
    [
      ["Paper was first invented in which country?", "China", "Egypt", "Greece", "India"],
      ["In a web address, what does \"www\" stand for?", "World Wide Web", "World Web Wire", "Wide Web World", "Web With Words"],
    ],
    [
      ["Who is usually credited with inventing the telephone?", "Alexander Graham Bell", "Thomas Edison", "Nikola Tesla", "Samuel Morse"],
      ["What did Johannes Gutenberg build around 1440?", "A printing press", "A telescope", "A pendulum clock", "A steam engine"],
    ],
    [
      ["Who discovered penicillin?", "Alexander Fleming", "Marie Curie", "Louis Pasteur", "Isaac Newton"],
      ["What does LED stand for?", "Light-emitting diode", "Low energy device", "Light electric display", "Laser-emitting dot"],
    ],
    [
      ["What was the first artificial satellite sent into orbit?", "Sputnik 1", "Explorer 1", "Vostok 1", "Apollo 1"],
      ["QR codes were invented in which country?", "Japan", "USA", "South Korea", "Germany"],
    ],
  ],
  // Words
  [
    [
      ["What is the opposite of \"ancient\"?", "Modern", "Old", "Huge", "Quiet"],
      ["How many letters are in the English alphabet?", "26", "24", "25", "28"],
    ],
    [
      ["What do you call a word that means the same as another?", "Synonym", "Antonym", "Homonym", "Acronym"],
      ["Which spelling is correct?", "Necessary", "Neccessary", "Necesary", "Neccesary"],
    ],
    [
      ["A word that reads the same backward, like \"level\", is a…", "Palindrome", "Anagram", "Haiku", "Limerick"],
      ["The word \"kindergarten\" comes from which language?", "German", "French", "Dutch", "Latin"],
    ],
    [
      ["What does the prefix \"micro-\" mean?", "Very small", "Very large", "Many", "Under"],
      ["What is the Latin-style plural of \"cactus\"?", "Cacti", "Cactae", "Cactum", "Cactis"],
    ],
    [
      ["\"Run amok\" borrows its key word from which language?", "Malay", "Hindi", "Arabic", "Zulu"],
      ["Which letter is used most often in written English?", "E", "A", "T", "S"],
    ],
  ],
];

export type BuzzQuestion = { id: number; cat: number; tier: number; text: string; choices: string[] };

export const BUZZ_QUESTIONS: BuzzQuestion[] = BANK.flatMap((tiers, cat) =>
  tiers.flatMap((list, tier) => list.map(([text, ...choices]) => ({ cat, tier, text, choices }))),
).map((q, id) => ({ id, ...q }));
