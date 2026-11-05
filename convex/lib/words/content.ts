// Game content for Parti Words, in English (en) and Bahasa Indonesia (id).
export type Lang = "en" | "id";
export type RoomLang = Lang | "mix"; // mix = accept both

/** Lowercase, letters only (keeps spaces between words). */
export function norm(s: string) {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z ]/g, "").replace(/\s+/g, " ").trim();
}
export const pickLang = (l: RoomLang, rand: () => number = Math.random): Lang => (l === "mix" ? (rand() < 0.5 ? "en" : "id") : l);

// ---------- Word Chain: each word links to the one before ----------
export const CHAINS: Record<Lang, string[][]> = {
  en: [
    ["banana", "yellow", "sun", "sunrise", "morning"],
    ["rain", "cloud", "sky", "blue", "ocean"],
    ["fire", "hot", "summer", "beach", "sand"],
    ["cat", "mouse", "cheese", "pizza", "italy"],
    ["snow", "winter", "cold", "ice", "cream"],
    ["apple", "tree", "forest", "bear", "honey"],
    ["book", "school", "teacher", "class", "room"],
    ["moon", "night", "star", "wish", "birthday"],
    ["phone", "call", "friend", "party", "cake"],
    ["car", "road", "trip", "map", "treasure"],
    ["bee", "honey", "sweet", "candy", "shop"],
    ["milk", "cow", "farm", "egg", "breakfast"],
  ],
  id: [
    ["pisang", "kuning", "matahari", "terbit", "pagi"],
    ["hujan", "payung", "basah", "handuk", "mandi"],
    ["kopi", "pahit", "gula", "manis", "permen"],
    ["kucing", "ikan", "laut", "pantai", "pasir"],
    ["nasi", "goreng", "telur", "ayam", "kampung"],
    ["sekolah", "guru", "murid", "kelas", "papan"],
    ["bulan", "bintang", "malam", "tidur", "mimpi"],
    ["sapi", "susu", "putih", "awan", "langit"],
    ["gunung", "tinggi", "pohon", "hutan", "harimau"],
    ["api", "panas", "matahari", "siang", "makan"],
    ["pesta", "kue", "lilin", "api", "merah"],
    ["jalan", "mobil", "roda", "sepeda", "gunung"],
  ],
};

// ---------- Chemistry: prompts and answers that count as the same ----------
export type Prompt = { en: string; id: string; groups: string[][] };
export const PROMPTS: Prompt[] = [
  { en: "Chicken ___", id: "Ayam ___", groups: [["goreng", "fried"], ["bakar", "grilled", "panggang", "roast", "roasted"], ["geprek"], ["kampung"], ["penyet"], ["soup", "sup", "soto"], ["nugget", "nuggets"], ["wings", "sayap"]] },
  { en: "___ rice", id: "Nasi ___", groups: [["goreng", "fried"], ["uduk"], ["kuning", "yellow"], ["putih", "white"], ["padang"], ["campur", "mixed"], ["liwet"], ["bakar"]] },
  { en: "Ice ___", id: "Es ___", groups: [["teh", "tea"], ["krim", "cream"], ["batu", "cube", "cubes"], ["jeruk", "orange"], ["campur"], ["kelapa", "coconut"], ["cendol"], ["skating"]] },
  { en: "Peanut ___", id: "Kacang ___", groups: [["butter", "mentega"], ["goreng", "fried"], ["tanah"], ["panjang"], ["hijau", "green"], ["allergy", "alergi"], ["sauce", "saus"]] },
  { en: "Hot ___", id: "___ panas", groups: [["dog"], ["chocolate", "cokelat", "coklat"], ["sauce", "saus"], ["pot"], ["air", "water"], ["spring"], ["summer", "musim"], ["tea", "teh"]] },
  { en: "Coffee ___", id: "Kopi ___", groups: [["susu", "milk"], ["hitam", "black"], ["tubruk"], ["shop", "kedai"], ["cup", "gelas", "cangkir"], ["bean", "beans", "biji"], ["luwak"]] },
  { en: "___ house", id: "Rumah ___", groups: [["sakit", "hospital"], ["makan", "restaurant"], ["tangga"], ["adat"], ["pohon", "tree"], ["kaca", "glass"], ["hantu", "haunted"], ["dog", "anjing"]] },
  { en: "___ clock", id: "Jam ___", groups: [["tangan", "wrist", "watch"], ["dinding", "wall"], ["weker", "alarm"], ["pasir", "sand"], ["gadang"]] },
  { en: "Birthday ___", id: "___ ulang tahun", groups: [["cake", "kue"], ["party", "pesta"], ["gift", "present", "kado", "hadiah"], ["song", "lagu"], ["candle", "candles", "lilin"]] },
  { en: "Satay ___", id: "Sate ___", groups: [["ayam", "chicken"], ["kambing", "goat"], ["padang"], ["madura"], ["sapi", "beef"], ["taichan"], ["lilit"]] },
  { en: "Super ___", id: "Super ___", groups: [["man", "hero", "pahlawan"], ["market", "pasar"], ["star", "bintang"], ["moon", "bulan"], ["power", "kekuatan"]] },
  { en: "Sun ___", id: "Matahari ___", groups: [["rise", "terbit"], ["set", "terbenam"], ["flower", "bunga"], ["glasses", "kacamata"], ["burn"], ["shine", "sinar"]] },
  { en: "Rain ___", id: "___ hujan", groups: [["bow", "pelangi"], ["coat", "jas"], ["drop", "tetes"], ["forest", "hutan"], ["boots", "sepatu"], ["season", "musim"]] },
  { en: "Fish ___", id: "Ikan ___", groups: [["bakar", "grilled"], ["goreng", "fried"], ["tank", "akuarium"], ["chips"], ["asin", "salted"], ["lele", "catfish"], ["hiu", "shark"]] },
];

export function sameAnswer(p: Prompt, a: string, b: string) {
  const x = norm(a), y = norm(b);
  if (!x || !y) return false;
  if (x === y) return true;
  return p.groups.some((g) => g.includes(x) && g.includes(y));
}

// ---------- Don't Say It: categories get smaller tier by tier ----------
export type Category = { en: string; id: string; ban: string[]; answers: string[]; tier: number };
export const CATEGORIES: Category[] = [
  { tier: 1, en: "Colors", id: "Warna", ban: ["red", "merah"], answers: ["blue", "biru", "green", "hijau", "yellow", "kuning", "orange", "oranye", "jingga", "purple", "ungu", "pink", "black", "hitam", "white", "putih", "brown", "coklat", "cokelat", "grey", "gray", "abu", "silver", "perak", "gold", "emas", "red", "merah", "violet", "navy", "cyan", "magenta", "maroon", "beige", "krem", "tosca"] },
  { tier: 1, en: "Animals", id: "Hewan", ban: ["lion", "singa"], answers: ["cat", "kucing", "dog", "anjing", "mouse", "tikus", "cow", "sapi", "horse", "kuda", "tiger", "harimau", "elephant", "gajah", "monkey", "monyet", "bird", "burung", "fish", "ikan", "snake", "ular", "duck", "bebek", "chicken", "ayam", "goat", "kambing", "rabbit", "kelinci", "bear", "beruang", "deer", "rusa", "frog", "kodok", "katak", "shark", "hiu", "whale", "paus", "giraffe", "jerapah", "zebra", "camel", "unta", "pig", "babi", "sheep", "domba", "butterfly", "kupu", "ant", "semut", "bee", "lebah", "crocodile", "buaya", "turtle", "penyu", "kura", "owl", "burung hantu", "wolf", "serigala", "fox", "rubah", "panda", "koala", "kangaroo", "kangguru", "lion", "singa", "dolphin", "lumba", "eagle", "elang", "parrot", "beo", "spider", "laba"] },
  { tier: 1, en: "Fruits", id: "Buah", ban: ["banana", "pisang"], answers: ["apple", "apel", "mango", "mangga", "orange", "jeruk", "grape", "anggur", "melon", "watermelon", "semangka", "papaya", "pepaya", "pineapple", "nanas", "durian", "rambutan", "salak", "strawberry", "stroberi", "lemon", "coconut", "kelapa", "jackfruit", "nangka", "avocado", "alpukat", "kiwi", "pear", "pir", "cherry", "ceri", "guava", "jambu", "banana", "pisang", "lychee", "leci", "mangosteen", "manggis", "starfruit", "belimbing", "dragonfruit", "naga", "peach", "plum", "blueberry"] },
  { tier: 1, en: "Countries", id: "Negara", ban: ["indonesia"], answers: ["japan", "jepang", "china", "cina", "tiongkok", "korea", "india", "malaysia", "singapore", "singapura", "thailand", "vietnam", "australia", "america", "amerika", "usa", "canada", "kanada", "brazil", "brasil", "france", "prancis", "perancis", "germany", "jerman", "italy", "italia", "spain", "spanyol", "england", "inggris", "mexico", "meksiko", "egypt", "mesir", "russia", "rusia", "netherlands", "belanda", "indonesia", "philippines", "filipina", "turkey", "turki", "argentina", "portugal", "nigeria", "kenya", "chile", "peru", "norway", "norwegia", "sweden", "swedia"] },
  { tier: 2, en: "Things in the sky", id: "Ada di langit", ban: ["sun", "matahari"], answers: ["moon", "bulan", "star", "stars", "bintang", "cloud", "clouds", "awan", "bird", "birds", "burung", "plane", "airplane", "pesawat", "rainbow", "pelangi", "kite", "layangan", "layang", "balloon", "balon", "helicopter", "helikopter", "rocket", "roket", "sun", "matahari", "lightning", "petir", "kilat", "comet", "komet", "satellite", "satelit", "drone"] },
  { tier: 2, en: "Vehicles", id: "Kendaraan", ban: ["car", "mobil"], answers: ["bus", "bicycle", "bike", "sepeda", "motorcycle", "motor", "train", "kereta", "plane", "pesawat", "ship", "kapal", "boat", "perahu", "truck", "truk", "taxi", "taksi", "ojek", "bajaj", "becak", "scooter", "skuter", "helicopter", "helikopter", "car", "mobil", "tram", "van", "ambulance", "ambulans", "tractor", "traktor", "angkot", "submarine", "rocket", "roket"] },
  { tier: 2, en: "Body parts", id: "Anggota tubuh", ban: ["hand", "tangan"], answers: ["head", "kepala", "eye", "eyes", "mata", "nose", "hidung", "mouth", "mulut", "ear", "ears", "telinga", "foot", "feet", "leg", "legs", "kaki", "arm", "arms", "lengan", "finger", "jari", "knee", "lutut", "hair", "rambut", "tooth", "teeth", "gigi", "lip", "lips", "bibir", "neck", "leher", "shoulder", "bahu", "stomach", "belly", "perut", "back", "punggung", "hand", "tangan", "chin", "dagu", "cheek", "pipi", "heart", "jantung", "elbow", "siku", "toe", "tongue", "lidah"] },
  { tier: 2, en: "Yellow fruits", id: "Buah kuning", ban: ["banana", "pisang"], answers: ["lemon", "mango", "mangga", "pineapple", "nanas", "durian", "papaya", "pepaya", "jackfruit", "nangka", "starfruit", "belimbing", "banana", "pisang", "melon", "passionfruit", "markisa", "quince"] },
  { tier: 3, en: "Days of the week", id: "Nama hari", ban: ["monday", "senin"], answers: ["tuesday", "selasa", "wednesday", "rabu", "thursday", "kamis", "friday", "jumat", "saturday", "sabtu", "sunday", "minggu", "monday", "senin"] },
  { tier: 3, en: "Planets", id: "Planet", ban: ["earth", "bumi"], answers: ["mercury", "merkurius", "venus", "mars", "jupiter", "saturn", "saturnus", "uranus", "neptune", "neptunus", "earth", "bumi"] },
  { tier: 3, en: "Rainbow colors", id: "Warna pelangi", ban: ["red", "merah"], answers: ["orange", "jingga", "oranye", "yellow", "kuning", "green", "hijau", "blue", "biru", "indigo", "nila", "violet", "purple", "ungu", "red", "merah"] },
  { tier: 4, en: "Planets with rings", id: "Planet bercincin", ban: ["saturn", "saturnus"], answers: ["jupiter", "uranus", "neptune", "neptunus", "saturn", "saturnus"] },
  { tier: 4, en: "Colors of the Indonesian flag", id: "Warna bendera Indonesia", ban: ["red", "merah"], answers: ["white", "putih", "red", "merah"] },
  { tier: 4, en: "Traffic light colors", id: "Warna lampu lalu lintas", ban: ["red", "merah"], answers: ["yellow", "kuning", "amber", "green", "hijau", "red", "merah"] },
  { tier: 4, en: "Black and white animals", id: "Hewan hitam putih", ban: ["zebra"], answers: ["panda", "penguin", "pinguin", "skunk", "sigung", "orca", "cow", "sapi", "badger", "zebra", "magpie", "tapir"] },
];

// ---------- Spy Word: grid words ----------
export const SPY_POOL: Record<Lang, string[]> = {
  en: ["apple", "river", "mango", "clock", "piano", "lemon", "tiger", "cloud", "bread", "rocket", "candle", "shoe", "moon", "guitar", "sock", "bridge", "banana", "ocean", "train", "pizza", "lion", "snow", "castle", "phone", "camera", "chair", "forest", "garden", "horse", "kite", "ladder", "magnet", "needle", "orange", "pencil", "pillow", "queen", "robot", "spoon", "star", "table", "tooth", "umbrella", "violin", "window", "zebra", "dragon", "egg", "flower", "glass", "hammer", "island", "jacket", "key", "lamp", "mirror", "owl", "pirate", "rabbit", "doctor", "ghost", "volcano", "bottle", "coin"],
  id: ["apel", "sungai", "mangga", "jam", "gitar", "jeruk", "harimau", "awan", "roti", "bulan", "sepatu", "jembatan", "pisang", "laut", "kereta", "singa", "salju", "istana", "kamera", "kursi", "hutan", "kebun", "kuda", "layangan", "tangga", "jarum", "bantal", "ratu", "sendok", "bintang", "meja", "gigi", "payung", "jendela", "naga", "telur", "bunga", "gelas", "palu", "pulau", "jaket", "kunci", "lampu", "cermin", "burung", "kelinci", "kapal", "dokter", "hantu", "gunung", "botol", "koin", "kopi", "nasi", "sapi", "ikan", "pantai", "kucing", "mobil", "buku", "topi", "kue", "lilin", "pohon"],
};

// ---------- Odd One Out: ready-made sets ----------
export type OddSet = { words: string[]; odd: number; link: string };
export const ODD_SETS: Record<Lang, OddSet[]> = {
  en: [
    { words: ["mango", "banana", "lemon", "carrot"], odd: 3, link: "Fruits" },
    { words: ["piano", "guitar", "violin", "hammer"], odd: 3, link: "Musical instruments" },
    { words: ["paris", "tokyo", "london", "africa"], odd: 3, link: "Cities" },
    { words: ["shark", "whale", "dolphin", "eagle"], odd: 3, link: "Live in the sea" },
    { words: ["red", "blue", "green", "table"], odd: 3, link: "Colors" },
    { words: ["monday", "june", "friday", "sunday"], odd: 1, link: "Days of the week" },
    { words: ["sun", "moon", "star", "tree"], odd: 3, link: "Things in the sky" },
    { words: ["lion", "tiger", "leopard", "wolf"], odd: 3, link: "Big cats" },
    { words: ["spoon", "fork", "knife", "pillow"], odd: 3, link: "Cutlery" },
    { words: ["snow", "ice", "frost", "fire"], odd: 3, link: "Cold things" },
    { words: ["bus", "train", "taxi", "house"], odd: 3, link: "Transport" },
    { words: ["nose", "ear", "mouth", "shoe"], odd: 3, link: "On your face" },
  ],
  id: [
    { words: ["kucing", "mobil", "anjing", "ayam"], odd: 1, link: "Hewan" },
    { words: ["merah", "biru", "hijau", "meja"], odd: 3, link: "Warna" },
    { words: ["nasi", "roti", "mie", "batu"], odd: 3, link: "Makanan" },
    { words: ["senin", "selasa", "juni", "rabu"], odd: 2, link: "Nama hari" },
    { words: ["gitar", "piano", "suling", "sendok"], odd: 3, link: "Alat musik" },
    { words: ["hiu", "paus", "lumba", "elang"], odd: 3, link: "Hidup di laut" },
    { words: ["jakarta", "bandung", "surabaya", "jepang"], odd: 3, link: "Kota di Indonesia" },
    { words: ["mata", "hidung", "mulut", "sepatu"], odd: 3, link: "Ada di wajah" },
    { words: ["bus", "kereta", "ojek", "rumah"], odd: 3, link: "Kendaraan" },
    { words: ["apel", "mangga", "jeruk", "wortel"], odd: 3, link: "Buah" },
    { words: ["kopi", "teh", "susu", "batu"], odd: 3, link: "Minuman" },
    { words: ["matahari", "bulan", "bintang", "pohon"], odd: 3, link: "Ada di langit" },
  ],
};
export const ODD_DECOYS: Record<Lang, string[]> = {
  en: ["Things that are round", "Things you can eat", "Animals", "Things at school", "Things that fly", "Sweet things", "Things in a kitchen", "Colors", "Sports", "Jobs", "Things at the beach", "Things with wheels", "Fruits", "Cold things"],
  id: ["Benda bulat", "Bisa dimakan", "Hewan", "Ada di sekolah", "Bisa terbang", "Yang manis", "Ada di dapur", "Warna", "Olahraga", "Pekerjaan", "Ada di pantai", "Punya roda", "Buah", "Yang dingin"],
};

// ---------- Scrambled Sprint ----------
export type Scramble = { word: string; bonus: string[] };
export const SCRAMBLES: Record<Lang, Scramble[]> = {
  en: [
    { word: "planet", bonus: ["plane", "plant", "plan", "pane", "lane", "neat", "leap", "pale", "pant", "tape"] },
    { word: "garden", bonus: ["danger", "range", "anger", "grade", "grand", "dean", "read", "dear", "near", "earn", "gear", "rage"] },
    { word: "friend", bonus: ["finder", "fried", "fired", "diner", "fern", "fire", "find", "fine", "ride", "dine"] },
    { word: "stream", bonus: ["master", "steam", "smear", "team", "meat", "mate", "seat", "east", "star", "tram", "mast", "rest"] },
    { word: "bright", bonus: ["right", "birth", "girth", "grit", "brig"] },
    { word: "silver", bonus: ["sliver", "liver", "lives", "evil", "veil", "vile", "rise", "lies"] },
    { word: "orange", bonus: ["range", "anger", "groan", "organ", "rage", "gear", "near", "earn", "gone", "ogre"] },
    { word: "winter", bonus: ["twin", "wire", "tire", "rein", "rent", "tern", "writ", "wren", "twine"] },
  ],
  id: [
    { word: "pisang", bonus: ["siang", "saing", "sapi", "nasi", "pagi", "asin", "singa"] },
    { word: "matahari", bonus: ["mata", "hari", "amat", "tari", "hati", "arah", "arti", "irama", "marah", "ramah", "ramai"] },
    { word: "semangka", bonus: ["angka", "makan", "sama", "asam", "enak", "akan", "aman", "anak", "emas", "enam", "ganas", "mana", "masak", "naga", "nama"] },
    { word: "bintang", bonus: ["nanti", "ganti", "intan", "angin", "anting", "bagi", "ingat", "tiba", "tiga"] },
    { word: "makanan", bonus: ["makan", "nama", "anak", "kanan", "mana", "akan", "aman"] },
    { word: "pelangi", bonus: ["pagi", "lagi", "pelan", "lain", "pena", "gali", "apel", "elang", "gelap", "geli", "gila", "paling"] },
    { word: "merpati", bonus: ["peta", "pita", "tari", "mati", "petir", "rapi", "arti", "empat", "erat", "ipar", "maret", "pria", "terima"] },
  ],
};
/** Points for a found word: the main word is worth the most. */
export const scramblePoints = (w: string, main: string) => (w === main ? 5 : w.length >= 5 ? 3 : 2);

// ---------- Emoji Riddle ----------
// `ban` lists the emoji that would give the answer away. The describer can't use them,
// so they have to combine other emoji (🔥🐶 = hot dog, 🍯🌙 = honeymoon).
export type Riddle = { en: string; id: string; also: string[]; cat: { en: string; id: string }; ban: string[] };
const FOOD = { en: "Food", id: "Makanan" }, NATURE = { en: "Nature", id: "Alam" }, ANIMAL = { en: "Animal", id: "Hewan" }, THING = { en: "Thing", id: "Benda" }, EVENT = { en: "Event", id: "Acara" }, JOB = { en: "Job", id: "Pekerjaan" }, ACTION = { en: "Action", id: "Kegiatan" };
export const RIDDLES: Riddle[] = [
  { en: "fried rice", id: "nasi goreng", also: [], cat: FOOD, ban: ["🍛"] },
  { en: "ice cream", id: "es krim", also: [], cat: FOOD, ban: ["🍦", "🍨"] },
  { en: "rainbow", id: "pelangi", also: [], cat: NATURE, ban: ["🌈"] },
  { en: "birthday", id: "ulang tahun", also: ["birthday party", "pesta ulang tahun"], cat: EVENT, ban: ["🎂", "🎉", "🎈", "🎁"] },
  { en: "volcano", id: "gunung berapi", also: ["gunung api"], cat: NATURE, ban: ["🌋"] },
  { en: "snowman", id: "manusia salju", also: [], cat: THING, ban: ["☃️", "⛄"] },
  { en: "fireworks", id: "kembang api", also: ["firework"], cat: EVENT, ban: ["🎆", "🎇"] },
  { en: "coconut", id: "kelapa", also: [], cat: FOOD, ban: ["🥥"] },
  { en: "pizza", id: "pizza", also: [], cat: FOOD, ban: ["🍕"] },
  { en: "airplane", id: "pesawat", also: ["plane", "aeroplane", "pesawat terbang"], cat: THING, ban: ["✈️", "🛩️"] },
  { en: "beach", id: "pantai", also: [], cat: NATURE, ban: ["🏖️", "🏝️"] },
  { en: "elephant", id: "gajah", also: [], cat: ANIMAL, ban: ["🐘"] },
  { en: "monkey", id: "monyet", also: ["kera"], cat: ANIMAL, ban: ["🐒", "🐵", "🙈"] },
  { en: "sunflower", id: "bunga matahari", also: [], cat: NATURE, ban: ["🌻"] },
  { en: "football", id: "sepak bola", also: ["soccer", "sepakbola"], cat: ACTION, ban: ["⚽"] },
  { en: "doctor", id: "dokter", also: [], cat: JOB, ban: ["👩‍⚕️", "👨‍⚕️", "🩺"] },
  { en: "teacher", id: "guru", also: [], cat: JOB, ban: ["👨‍🏫", "👩‍🏫"] },
  { en: "hamburger", id: "burger", also: ["burger"], cat: FOOD, ban: ["🍔"] },
  { en: "popcorn", id: "berondong", also: ["popcorn"], cat: FOOD, ban: ["🍿"] },
  { en: "bee", id: "lebah", also: ["honeybee"], cat: ANIMAL, ban: ["🐝"] },
  { en: "sleep", id: "tidur", also: ["sleeping"], cat: ACTION, ban: ["😴", "💤", "🛌"] },
  { en: "hot dog", id: "hot dog", also: ["hotdog"], cat: FOOD, ban: ["🌭"] },
  { en: "music", id: "musik", also: [], cat: THING, ban: ["🎵", "🎶"] },
  { en: "wedding", id: "pernikahan", also: ["nikah", "kawin"], cat: EVENT, ban: ["💍", "👰", "🤵", "💒"] },
  { en: "rain", id: "hujan", also: [], cat: NATURE, ban: ["🌧️", "☔"] },
  { en: "astronaut", id: "astronot", also: [], cat: JOB, ban: ["👩‍🚀", "👨‍🚀"] },
  { en: "watermelon", id: "semangka", also: [], cat: FOOD, ban: ["🍉"] },
  { en: "swimming", id: "berenang", also: ["swim", "renang"], cat: ACTION, ban: ["🏊"] },
  { en: "ghost", id: "hantu", also: [], cat: THING, ban: ["👻"] },
  { en: "coffee", id: "kopi", also: [], cat: FOOD, ban: ["☕"] },
  // Compound words: the fun is in combining emoji.
  { en: "honeymoon", id: "bulan madu", also: [], cat: EVENT, ban: [] },
  { en: "starfish", id: "bintang laut", also: [], cat: ANIMAL, ban: [] },
  { en: "pineapple", id: "nanas", also: ["ananas"], cat: FOOD, ban: ["🍍"] },
  { en: "butterfly", id: "kupu kupu", also: ["kupu-kupu", "kupukupu"], cat: ANIMAL, ban: ["🦋"] },
  { en: "sunglasses", id: "kacamata hitam", also: ["kacamata"], cat: THING, ban: ["🕶️", "😎"] },
  { en: "firefighter", id: "pemadam kebakaran", also: ["fireman", "damkar"], cat: JOB, ban: ["🧑‍🚒", "🚒"] },
  { en: "toothbrush", id: "sikat gigi", also: [], cat: THING, ban: ["🪥"] },
  { en: "earthquake", id: "gempa", also: ["gempa bumi"], cat: NATURE, ban: [] },
  { en: "homework", id: "pekerjaan rumah", also: ["pr"], cat: THING, ban: [] },
  { en: "snowball", id: "bola salju", also: [], cat: THING, ban: [] },
  { en: "rainforest", id: "hutan hujan", also: [], cat: NATURE, ban: [] },
  { en: "cowboy", id: "koboi", also: [], cat: JOB, ban: ["🤠"] },
];
export function riddleAccepts(r: Riddle, guess: string) {
  const g = norm(guess).replace(/ /g, "");
  return [r.en, r.id, ...r.also].some((a) => norm(a).replace(/ /g, "") === g);
}
export const EMOJI: { group: string; list: string[] }[] = [
  { group: "Food", list: ["🍚", "🍛", "🍳", "🍗", "🥩", "🍞", "🧀", "🍅", "🌽", "🍕", "🍔", "🌭", "🍦", "🍩", "🍰", "🍯", "🧈", "🥛", "🍌", "🍎", "🍈", "🥥", "🍉", "🍍", "🌰", "☕", "🌶️", "🥚"] },
  { group: "Nature", list: ["☀️", "🌙", "⭐", "☁️", "🌧️", "❄️", "🌈", "🔥", "💧", "🌊", "🌋", "⛰️", "🌳", "🌲", "🌴", "🌻", "🌸", "🍂", "⚡", "🏝️", "🏖️", "🌍", "💨", "🧊", "🌾", "🪨", "🌱", "🌑"] },
  { group: "Animals", list: ["🐶", "🐱", "🐭", "🐒", "🐘", "🦁", "🐯", "🐄", "🐔", "🐟", "🦈", "🐍", "🐝", "🦋", "🐢", "🦆", "🐴", "🐷", "🐸", "🦉", "🐞", "🪰", "🐜", "🦀", "🐳", "🐦", "🦒", "🐑"] },
  { group: "People", list: ["👶", "👦", "👧", "👨", "👩", "👴", "👵", "👰", "🤵", "👮", "👩‍⚕️", "👨‍🏫", "👩‍🚀", "🧑‍🍳", "🧑‍🚒", "🤠", "💃", "🏃", "🏊", "😴", "😂", "😱", "😎", "💪", "🦶", "🦷", "👃", "👀"] },
  { group: "Things", list: ["⚽", "⚪", "🥅", "🎂", "🎁", "🎈", "🎉", "🎆", "🎵", "🎸", "🎤", "🎬", "📚", "📝", "✏️", "📱", "🚗", "✈️", "🚀", "🚒", "🏠", "🏥", "🏫", "⛪", "💍", "👻", "👓", "🧹"] },
  { group: "Signs", list: ["➕", "➖", "❌", "✅", "❓", "❤️", "💔", "⬆️", "⬇️", "🔄", "⏰", "📅", "💤", "💥", "💯", "🕯️", "💊", "🔑", "👍", "👎", "🤫", "🔺", "🔵", "🟡", "1️⃣", "2️⃣", "3️⃣", "🔟"] },
];
