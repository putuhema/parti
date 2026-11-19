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

/**
 * More questions, same shape and category order as BANK. Kept as a separate list that is
 * appended after BANK so the ids of the original questions (stored in live games) never shift.
 * Always add new questions at the END of this file's lists, never in the middle of BANK.
 */
const MORE: Tiers[] = [
  // Animals
  [
    [
      ["Which animal is famous for its long neck?", "Giraffe", "Zebra", "Camel", "Horse"],
      ["What do bees make?", "Honey", "Milk", "Silk", "Wax paper"],
      ["Which animal says \"moo\"?", "Cow", "Sheep", "Goat", "Pig"],
    ],
    [
      ["What is the largest animal that has ever lived?", "Blue whale", "T. rex", "African elephant", "Megalodon"],
      ["Which animal is known for changing its skin color?", "Chameleon", "Iguana", "Gecko", "Frog"],
      ["What is a baby frog called?", "A tadpole", "A froglet egg", "A pup", "A nymph"],
    ],
    [
      ["Which big cat is the fastest land animal?", "Cheetah", "Leopard", "Lion", "Jaguar"],
      ["Komodo dragons live wild in which country?", "Indonesia", "Australia", "Brazil", "Madagascar"],
      ["How many legs does a spider have?", "8", "6", "10", "12"],
    ],
    [
      ["What is the only bird that can fly backward?", "Hummingbird", "Swallow", "Kingfisher", "Sparrow"],
      ["Which animal sleeps the most, up to 22 hours a day?", "Koala", "Cat", "Sloth", "Owl"],
      ["A group of lions is called a…", "Pride", "Pack", "Herd", "School"],
    ],
    [
      ["What shape is wombat poop?", "Cube", "Sphere", "Pyramid", "Ring"],
      ["How many stomach chambers does a cow have?", "4", "1", "2", "6"],
      ["Which animal has blue blood?", "Octopus", "Shark", "Crocodile", "Dolphin"],
    ],
  ],
  // Space & Earth
  [
    [
      ["Which planet do we live on?", "Earth", "Mars", "Venus", "Saturn"],
      ["What is frozen water called?", "Ice", "Steam", "Fog", "Dew"],
      ["Which is the largest ocean?", "Pacific", "Atlantic", "Indian", "Arctic"],
    ],
    [
      ["Which planet is known as the Red Planet?", "Mars", "Jupiter", "Venus", "Mercury"],
      ["What is the largest planet in our solar system?", "Jupiter", "Saturn", "Neptune", "Earth"],
      ["What do we call molten rock once it erupts from a volcano?", "Lava", "Magma", "Basalt", "Ash"],
    ],
    [
      ["Who was the first person to walk on the Moon?", "Neil Armstrong", "Buzz Aldrin", "Yuri Gagarin", "John Glenn"],
      ["Which gas do plants take in from the air?", "Carbon dioxide", "Oxygen", "Nitrogen", "Helium"],
      ["Which planet is famous for its bright rings?", "Saturn", "Mars", "Mercury", "Venus"],
    ],
    [
      ["Which is the closest star to Earth after the Sun?", "Proxima Centauri", "Sirius", "Betelgeuse", "Polaris"],
      ["What is the deepest known point in the ocean?", "Challenger Deep", "Puerto Rico Trench", "Java Trench", "Tonga Trench"],
      ["The Ring of Fire mostly circles which ocean?", "Pacific", "Atlantic", "Indian", "Arctic"],
    ],
    [
      ["About how long does sunlight take to reach Earth?", "8 minutes", "8 seconds", "8 hours", "1 minute"],
      ["Which element makes up most of the Sun?", "Hydrogen", "Helium", "Oxygen", "Carbon"],
      ["Krakatoa's huge 1883 eruption happened in which country?", "Indonesia", "Philippines", "Japan", "Italy"],
    ],
  ],
  // World Map
  [
    [
      ["What is the capital of Japan?", "Tokyo", "Kyoto", "Osaka", "Seoul"],
      ["The Statue of Liberty stands in which city?", "New York", "Washington", "Boston", "Chicago"],
      ["The island of Bali belongs to which country?", "Indonesia", "Malaysia", "Thailand", "Philippines"],
    ],
    [
      ["What is the capital of Indonesia?", "Jakarta", "Surabaya", "Bandung", "Medan"],
      ["Which country is home to the Great Pyramid of Giza?", "Egypt", "Mexico", "Peru", "Sudan"],
      ["Which is the largest country by area?", "Russia", "Canada", "China", "USA"],
    ],
    [
      ["Machu Picchu is in which country?", "Peru", "Bolivia", "Mexico", "Chile"],
      ["What is the capital of Brazil?", "Brasília", "Rio de Janeiro", "São Paulo", "Salvador"],
      ["Which river flows through London?", "Thames", "Seine", "Danube", "Rhine"],
    ],
    [
      ["Which country has the most islands, over 17,000?", "Indonesia", "Philippines", "Japan", "Norway"],
      ["What is the capital of New Zealand?", "Wellington", "Auckland", "Christchurch", "Queenstown"],
      ["Which strait separates Europe from Africa?", "Strait of Gibraltar", "Bosphorus", "Strait of Malacca", "Bering Strait"],
    ],
    [
      ["Which country completely surrounds the kingdom of Lesotho?", "South Africa", "Namibia", "Botswana", "Mozambique"],
      ["Lake Baikal, the world's deepest lake, is in which country?", "Russia", "Mongolia", "Kazakhstan", "China"],
      ["Which country has the capital Ulaanbaatar?", "Mongolia", "Kazakhstan", "Kyrgyzstan", "Nepal"],
    ],
  ],
  // Food
  [
    [
      ["What fruit is yellow and curved?", "Banana", "Apple", "Grape", "Cherry"],
      ["Which food is made from milk and often has holes?", "Cheese", "Bread", "Tofu", "Butter"],
      ["Which country is pizza originally from?", "Italy", "France", "USA", "Greece"],
    ],
    [
      ["Sushi comes from which country?", "Japan", "China", "Korea", "Thailand"],
      ["Nasi goreng means what in English?", "Fried rice", "Fried noodles", "Chicken soup", "Grilled fish"],
      ["What is the main ingredient of hummus?", "Chickpeas", "Lentils", "Peanuts", "Potatoes"],
    ],
    [
      ["Which nut is used to make Indonesian satay sauce?", "Peanut", "Almond", "Cashew", "Walnut"],
      ["Croissants are most associated with which country?", "France", "Italy", "Germany", "Belgium"],
      ["Chocolate is made from the beans of which plant?", "Cacao", "Coffee", "Vanilla", "Carob"],
    ],
    [
      ["Paella is a rice dish from which country?", "Spain", "Mexico", "Portugal", "Italy"],
      ["Which fruit has its seeds on the outside?", "Strawberry", "Raspberry", "Kiwi", "Blueberry"],
      ["Which country produces the most coffee?", "Brazil", "Colombia", "Vietnam", "Ethiopia"],
    ],
    [
      ["Kopi luwak coffee involves which animal?", "Civet", "Monkey", "Bat", "Bird"],
      ["Which spice is the most expensive by weight?", "Saffron", "Vanilla", "Cardamom", "Nutmeg"],
      ["Botanically speaking, which of these is a berry?", "Banana", "Strawberry", "Raspberry", "Cherry"],
    ],
  ],
  // Music & Film
  [
    [
      ["Which instrument do you play by hitting it with sticks?", "Drum", "Flute", "Harp", "Violin"],
      ["Which instrument do you blow into?", "Trumpet", "Drum", "Guitar", "Piano"],
      ["What color is the cartoon sponge SpongeBob?", "Yellow", "Blue", "Pink", "Green"],
    ],
    [
      ["Which instrument has 4 strings and is played with a bow under the chin?", "Violin", "Cello", "Harp", "Ukulele"],
      ["In \"The Lion King\", what is the young lion's name?", "Simba", "Mufasa", "Scar", "Nala"],
      ["Which band sang \"Hey Jude\"?", "The Beatles", "Queen", "ABBA", "The Rolling Stones"],
    ],
    [
      ["The angklung, made of bamboo, comes from which country?", "Indonesia", "Japan", "Vietnam", "India"],
      ["Which country does K-pop come from?", "South Korea", "Japan", "China", "Thailand"],
      ["Which film studio created \"Toy Story\"?", "Pixar", "DreamWorks", "Ghibli", "Illumination"],
    ],
    [
      ["Who composed \"The Four Seasons\"?", "Vivaldi", "Mozart", "Handel", "Haydn"],
      ["What does \"tempo\" describe in music?", "Speed", "Volume", "Pitch", "Mood"],
      ["Which Studio Ghibli film features a giant forest spirit called Totoro?", "My Neighbor Totoro", "Spirited Away", "Ponyo", "Princess Mononoke"],
    ],
    [
      ["How many lines are in a standard music staff?", "5", "4", "6", "7"],
      ["What was the first full-length feature film with synchronized talking?", "The Jazz Singer", "Metropolis", "King Kong", "Steamboat Willie"],
      ["Which country does the didgeridoo come from?", "Australia", "New Zealand", "South Africa", "Peru"],
    ],
  ],
  // Sports
  [
    [
      ["In which sport do you score a touchdown?", "American football", "Soccer", "Basketball", "Golf"],
      ["What color is the center of an archery target?", "Gold/yellow", "Red", "Blue", "Black"],
      ["Which sport is played at Wimbledon?", "Tennis", "Cricket", "Golf", "Rugby"],
    ],
    [
      ["How many points is a basketball shot from far beyond the arc?", "3", "2", "4", "1"],
      ["Sepak takraw is like volleyball, but played with your…", "Feet", "Hands", "Head only", "Paddles"],
      ["How often are the Summer Olympics held?", "Every 4 years", "Every 2 years", "Every year", "Every 5 years"],
    ],
    [
      ["In which sport would you perform a slam dunk?", "Basketball", "Volleyball", "Tennis", "Handball"],
      ["Which country has won the most men's football World Cups?", "Brazil", "Germany", "Italy", "Argentina"],
      ["Badminton is hugely popular in which Southeast Asian country, a frequent Olympic gold winner?", "Indonesia", "Vietnam", "Cambodia", "Laos"],
    ],
    [
      ["How many players are on a volleyball team on court?", "6", "5", "7", "9"],
      ["In cricket, how many balls are in an over?", "6", "5", "8", "10"],
      ["What is the maximum score with three darts?", "180", "150", "160", "200"],
    ],
    [
      ["Which country hosted the first FIFA World Cup in 1930?", "Uruguay", "Brazil", "Italy", "England"],
      ["How long is an Olympic swimming pool?", "50 m", "25 m", "100 m", "75 m"],
      ["In bowling, what is three strikes in a row called?", "A turkey", "A hat-trick", "A triple", "An eagle"],
    ],
  ],
  // Inventions
  [
    [
      ["What do you use a light bulb for?", "Light", "Heat food", "Make music", "Tell time"],
      ["What has wheels and pedals and you ride it?", "A bicycle", "A boat", "A plane", "A ladder"],
      ["What device do you use to take photos?", "A camera", "A radio", "A microphone", "A printer"],
    ],
    [
      ["Which company made the iPhone?", "Apple", "Samsung", "Nokia", "Google"],
      ["What does a thermometer measure?", "Temperature", "Weight", "Speed", "Distance"],
      ["What does \"PC\" stand for?", "Personal computer", "Power cable", "Private chip", "Public computer"],
    ],
    [
      ["Who is famous for the theory of relativity?", "Albert Einstein", "Isaac Newton", "Galileo", "Stephen Hawking"],
      ["Which ancient people built the first known wheel-based vehicles?", "Mesopotamians", "Romans", "Vikings", "Aztecs"],
      ["Who developed the first practical steam engine improvements in the 1760s?", "James Watt", "Henry Ford", "Thomas Edison", "Karl Benz"],
    ],
    [
      ["What does \"HTML\" stand for?", "HyperText Markup Language", "High Tech Modern Language", "Hyperlink Text Machine Language", "Home Tool Markup Language"],
      ["Who invented the World Wide Web?", "Tim Berners-Lee", "Bill Gates", "Steve Jobs", "Alan Turing"],
      ["What did Marie Curie discover along with Pierre Curie?", "Radium and polonium", "Penicillin", "X-rays", "Electrons"],
    ],
    [
      ["Which code of dots and dashes did Samuel Morse help create?", "Morse code", "Braille", "Binary", "Semaphore"],
      ["What was the name of the first programmable electronic general-purpose computer, finished in 1945?", "ENIAC", "UNIVAC", "Apple I", "Colossus II"],
      ["Who wrote what is often called the first computer program, for Babbage's engine?", "Ada Lovelace", "Grace Hopper", "Alan Turing", "Charles Babbage"],
    ],
  ],
  // Words
  [
    [
      ["What is the opposite of \"hot\"?", "Cold", "Warm", "Wet", "Dry"],
      ["Which word rhymes with \"cat\"?", "Hat", "Dog", "Cup", "Car"],
      ["How many vowels are in the English alphabet (not counting Y)?", "5", "4", "6", "7"],
    ],
    [
      ["What do you call a word that means the opposite of another?", "Antonym", "Synonym", "Homonym", "Pronoun"],
      ["What is the plural of \"mouse\"?", "Mice", "Mouses", "Meese", "Mousen"],
      ["Which of these is a verb?", "Run", "Blue", "Happy", "Table"],
    ],
    [
      ["A word made by rearranging another word's letters is an…", "Anagram", "Acronym", "Antonym", "Alliteration"],
      ["\"Laser\" was originally what kind of word?", "Acronym", "Palindrome", "Loanword", "Onomatopoeia"],
      ["Words like \"buzz\" and \"sizzle\" that sound like their meaning are…", "Onomatopoeia", "Metaphors", "Idioms", "Similes"],
    ],
    [
      ["The word \"ketchup\" likely comes from which language family?", "Chinese (Hokkien)", "Spanish", "Hindi", "Arabic"],
      ["What does \"bon voyage\" mean?", "Have a good trip", "Good morning", "Enjoy your meal", "Good luck"],
      ["Which word means fear of spiders?", "Arachnophobia", "Claustrophobia", "Acrophobia", "Agoraphobia"],
    ],
    [
      ["The English word \"orangutan\" comes from Malay words meaning…", "Person of the forest", "Red monkey", "Tree climber", "Big hands"],
      ["A haiku's three lines usually have how many syllables?", "5, 7, 5", "7, 5, 7", "3, 5, 3", "5, 5, 5"],
      ["A sentence using every letter of the alphabet is called a…", "Pangram", "Palindrome", "Lipogram", "Tautogram"],
    ],
  ],
];

export type BuzzQuestion = { id: number; cat: number; tier: number; text: string; choices: string[] };

const flatten = (bank: Tiers[]) =>
  bank.flatMap((tiers, cat) =>
    tiers.flatMap((list, tier) => list.map(([text, ...choices]) => ({ cat, tier, text, choices }))),
  );

export const BUZZ_QUESTIONS: BuzzQuestion[] = [...flatten(BANK), ...flatten(MORE)].map((q, id) => ({
  id,
  ...q,
}));
