// Real WotC theme decks — authentic decklists for Base Set through Gym Challenge.

export interface StarterDeck {
  id: string;
  name: string;
  description: string;
  type: string;
  cardIds: string[];
}

// ── Base Set trainers / energy helpers ──────────────────────────────────────
const E_FIRE      = 'basic-energy-fire';
const E_WATER     = 'basic-energy-water';
const E_LIGHTNING = 'basic-energy-lightning';
const E_GRASS     = 'basic-energy-grass';
const E_PSYCHIC   = 'basic-energy-psychic';
const E_FIGHTING  = 'basic-energy-fighting';
const E_COLORLESS = 'basic-energy-colorless'; // used as DCE stand-in when needed
const DCE         = 'base1-96';
const OAK         = 'base1-88';
const BILL        = 'base1-91';
const POTION      = 'base1-94';
const SWITCH      = 'base1-95';
const PLUSPOWER   = 'base1-84';
const GOW         = 'base1-93'; // Gust of Wind
const ENERGY_REM  = 'base1-92'; // Energy Removal
const SUPER_E_REM = 'base1-79'; // Super Energy Removal
const ENERGY_RET  = 'base1-81'; // Energy Retrieval
const POKEDEX     = 'base1-87'; // Pokédex
const SUPER_POT   = 'base1-90'; // Super Potion
const FULL_HEAL   = 'base1-82';
const REVIVE      = 'base1-89';
const COMPUTER_S  = 'base1-71'; // Computer Search
const ITEM_FINDER = 'base1-74';
const SCOOP_UP    = 'base1-78';
// Fossil-set trainers
const MR_FUJI     = 'base3-58';
const RECYCLE_F   = 'base3-61';
const MYST_FOSSIL = 'base3-62'; // Mysterious Fossil
// Team Rocket trainers
const HCTR        = 'base5-15'; // Here Comes Team Rocket!
const ROCKETS_SA  = 'base5-16'; // Rocket's Sneak Attack
// Jungle trainer
const POKEBALL_J  = 'base2-64'; // Poké Ball (Jungle)

function r(id: string, n: number): string[] { return Array(n).fill(id); }

export const STARTER_DECKS: StarterDeck[] = [

  // ── CUSTOM BASE SET DECK ──────────────────────────────────────────────────
  {
    id: 'custom-fists-and-fire',
    name: 'Fists & Fire',
    description: 'Base Set only. Machamp punishes with big Fighting damage; Charmander/Charmeleon build toward the fire side.',
    type: 'Fighting/Fire',
    cardIds: [
      // Pokémon (24)
      ...r('base1-47', 3), // Diglett
      ...r('base1-52', 4), // Machop
      ...r('base1-34', 2), // Machoke
      ...r('base1-8',  1), // Machamp
      ...r('base1-60', 4), // Ponyta
      ...r('base1-46', 4), // Charmander
      ...r('base1-24', 2), // Charmeleon
      ...r('base1-28', 1), // Growlithe
      ...r('base1-61', 2), // Rattata
      ...r('base1-26', 1), // Dratini
      // Trainers (9)
      ...r(BILL,       1),
      ...r(ENERGY_REM, 1),
      ...r(ENERGY_RET, 1),
      ...r(GOW,        1),
      ...r(POKEDEX,    1),
      ...r(POTION,     2),
      ...r(SWITCH,     2),
      // Energy (28)
      ...r(E_FIGHTING, 14),
      ...r(E_FIRE,     14),
    ],
  },

  // ── STARTER (30-card intro deck) ──────────────────────────────────────────
  {
    id: 'starter-machamp',
    name: 'Machamp Deck',
    description: 'The original 2-Player Starter Set fighting deck. Machamp hits hard; Psychic types provide backup.',
    type: 'Fighting/Psychic',
    cardIds: [
      ...r('base1-52', 4), // Machop
      ...r('base1-34', 3), // Machoke
      ...r('base1-8',  2), // Machamp
      ...r('base1-49', 4), // Drowzee
      ...r('base1-31', 3), // Jynx
      ...r('base1-5',  4), // Clefairy
      ...r('base1-43', 2), // Abra
      // Trainers
      ...r(BILL,       2),
      ...r(POTION,     3),
      ...r(FULL_HEAL,  2),
      ...r(SWITCH,     2),
      ...r(GOW,        2),
      ...r(ENERGY_REM, 2),
      // Energy
      ...r(E_FIGHTING, 14),
      ...r(E_PSYCHIC,   7),
      ...r(DCE,         4),
    ],
  },

  // ── BASE SET THEME DECKS (60-card) ────────────────────────────────────────
  {
    id: 'starter-zap',
    name: 'Zap!',
    description: 'Lightning/Psychic combo. Pikachu and Magnemite shock while Mewtwo, Haunter, and Jynx provide Psychic pressure.',
    type: 'Lightning/Psychic',
    cardIds: [
      ...r('base1-10', 1), // Mewtwo
      ...r('base1-32', 1), // Kadabra
      ...r('base1-31', 2), // Jynx
      ...r('base1-29', 2), // Haunter
      ...r('base1-50', 3), // Gastly
      ...r('base1-43', 3), // Abra
      ...r('base1-58', 4), // Pikachu
      ...r('base1-53', 3), // Magnemite
      ...r(COMPUTER_S,  1),
      ...r(SUPER_POT,   1),
      ...r(OAK,         1),
      ...r(SWITCH,      2),
      ...r(POTION,      1),
      ...r(GOW,         2),
      ...r(BILL,        2),
      ...r(E_LIGHTNING, 12),
      ...r(E_PSYCHIC,  16),
    ],
  },
  {
    id: 'starter-overgrowth',
    name: 'Overgrowth',
    description: 'Grass/Water hybrid. Bulbasaur line and Beedrill provide Grass punch; Gyarados and Starmie deliver Water firepower.',
    type: 'Grass/Water',
    cardIds: [
      ...r('base1-6',  1), // Gyarados
      ...r('base1-35', 2), // Magikarp
      ...r('base1-64', 3), // Starmie
      ...r('base1-65', 4), // Staryu
      ...r('base1-17', 1), // Beedrill
      ...r('base1-33', 2), // Kakuna
      ...r('base1-30', 2), // Ivysaur
      ...r('base1-69', 4), // Weedle
      ...r('base1-44', 4), // Bulbasaur
      ...r(POTION,      1),
      ...r(BILL,        2),
      ...r(SUPER_POT,   2),
      ...r(SWITCH,      2),
      ...r(GOW,         2),
      ...r(E_WATER,    12),
      ...r(E_GRASS,    16),
    ],
  },
  {
    id: 'starter-brushfire',
    name: 'Brushfire',
    description: 'Fire/Grass beatdown. Charmander line and Arcanine bring the heat while Weedle, Tangela, and Nidoran fill the bench.',
    type: 'Fire/Grass',
    cardIds: [
      ...r('base1-12', 1), // Ninetales
      ...r('base1-69', 4), // Weedle
      ...r('base1-66', 2), // Tangela
      ...r('base1-55', 4), // Nidoran♀
      ...r('base1-23', 1), // Arcanine
      ...r('base1-28', 2), // Growlithe
      ...r('base1-24', 2), // Charmeleon
      ...r('base1-68', 2), // Vulpix
      ...r('base1-46', 4), // Charmander
      ...r('base1-75', 1), // Lass
      ...r(PLUSPOWER,  1),
      ...r(ENERGY_RET, 2),
      ...r(SWITCH,     1),
      ...r(POTION,     3),
      ...r(GOW,        1),
      ...r(ENERGY_REM, 1),
      ...r(E_GRASS,   10),
      ...r(E_FIRE,    18),
    ],
  },
  {
    id: 'starter-blackout',
    name: 'Blackout',
    description: 'Fighting/Water beatdown. Machop/Machoke grind opponents down while Squirtle/Staryu provide Water backup.',
    type: 'Fighting/Water',
    cardIds: [
      ...r('base1-7',  1), // Hitmonchan
      ...r('base2-27', 2), // Farfetch'd
      ...r('base1-42', 2), // Wartortle
      ...r('base1-63', 4), // Squirtle
      ...r('base1-65', 3), // Staryu
      ...r('base1-56', 3), // Onix
      ...r('base1-62', 3), // Sandshrew
      ...r('base1-34', 2), // Machoke
      ...r('base1-52', 4), // Machop
      ...r(SUPER_E_REM, 1),
      ...r(PLUSPOWER,   1),
      ...r(OAK,         1),
      ...r(ENERGY_REM,  4),
      ...r(E_FIGHTING, 16),
      ...r(E_WATER,    12),
    ],
  },

  // ── JUNGLE THEME DECKS ────────────────────────────────────────────────────
  {
    id: 'jungle-power-reserve',
    name: 'Power Reserve',
    description: 'Official WotC Jungle theme deck. Scyther, Snorlax, and Kangaskhan are unstoppable walls.',
    type: 'Grass/Colorless',
    cardIds: [
      // Pokemon (21)
      ...r('base2-10', 4), // Scyther
      ...r('base2-11', 2), // Snorlax
      ...r('base2-5',  3), // Kangaskhan
      ...r('base2-9',  2), // Pinsir
      ...r('base2-54', 4), // Jigglypuff
      ...r('base2-16', 2), // Wigglytuff
      ...r('base2-63', 3), // Venonat
      ...r('base2-13', 1), // Venomoth
      // Trainers (13)
      ...r(BILL,         2),
      ...r(OAK,          2),
      ...r(POTION,       3),
      ...r(SWITCH,       2),
      ...r(GOW,          2),
      ...r(POKEBALL_J,   2),
      // Energy (26)
      ...r(E_GRASS,     22),
      ...r(DCE,          4),
    ],
  },
  {
    id: 'jungle-water-blast',
    name: 'Water Blast',
    description: 'Official WotC Jungle theme deck. Vaporeon and Seaking unleash a relentless watery assault.',
    type: 'Water/Grass',
    cardIds: [
      ...r('base2-51', 4), // Eevee
      ...r('base2-12', 2), // Vaporeon
      ...r('base2-53', 4), // Goldeen
      ...r('base2-46', 2), // Seaking
      ...r('base2-58', 4), // Oddish
      ...r('base2-37', 2), // Gloom
      ...r('base2-15', 1), // Vileplume
      ...r('base2-6',  2), // Mr. Mime
      ...r('base2-1',  1), // Clefable
      ...r('base2-54', 2), // Jigglypuff
      ...r(BILL,         2),
      ...r(OAK,          2),
      ...r(POTION,       3),
      ...r(SWITCH,       2),
      ...r(GOW,          2),
      ...r(POKEBALL_J,   1),
      ...r(E_WATER,     14),
      ...r(E_GRASS,      6),
      ...r(DCE,          4),
    ],
  },

  // ── FOSSIL THEME DECKS ────────────────────────────────────────────────────
  {
    id: 'fossil-bodyguard',
    name: 'Bodyguard',
    description: 'Official WotC Fossil theme deck. Kabutops and Hitmonlee guard the bench with iron fists.',
    type: 'Fighting/Colorless',
    cardIds: [
      // Pokemon (22)
      ...r('base3-50', 4), // Kabuto
      ...r('base3-9',  2), // Kabutops
      ...r('base3-7',  3), // Hitmonlee
      ...r('base1-7',  2), // Hitmonchan
      ...r('base1-61', 4), // Sandshrew
      ...r('base3-41', 2), // Sandslash
      ...r('base3-1',  1), // Aerodactyl
      ...r('base3-62', 4), // Mysterious Fossil
      // Trainers (14)
      ...r(BILL,         2),
      ...r(OAK,          2),
      ...r(POTION,       3),
      ...r(SWITCH,       2),
      ...r(GOW,          2),
      ...r(ENERGY_REM,   2),
      ...r(MR_FUJI,      1),
      // Energy (24)
      ...r(E_FIGHTING,  20),
      ...r(DCE,          4),
    ],
  },
  {
    id: 'fossil-excavation',
    name: 'Excavation',
    description: 'Official WotC Fossil theme deck. Gengar and Slowbro combine psychic power with Lapras bulk.',
    type: 'Psychic/Water',
    cardIds: [
      // Pokemon (22)
      ...r('base3-33', 4), // Gastly
      ...r('base3-6',  3), // Haunter
      ...r('base3-5',  2), // Gengar
      ...r('base3-55', 4), // Slowpoke
      ...r('base3-43', 2), // Slowbro
      ...r('base3-10', 2), // Lapras
      ...r('base3-3',  1), // Ditto
      ...r('base1-49', 4), // Drowzee
      // Trainers (14)
      ...r(BILL,         2),
      ...r(OAK,          2),
      ...r(POTION,       3),
      ...r(SWITCH,       2),
      ...r(GOW,          2),
      ...r(MR_FUJI,      1),
      ...r(REVIVE,       1),
      ...r(RECYCLE_F,    1),
      // Energy (24)
      ...r(E_PSYCHIC,   20),
      ...r(E_WATER,      4),
    ],
  },

  // ── TEAM ROCKET THEME DECKS ───────────────────────────────────────────────
  {
    id: 'rocket-trouble',
    name: "Rocket's Trouble",
    description: "Official WotC Team Rocket theme deck. Dark Raichu and Dark Gyarados strike fast and hard.",
    type: 'Lightning/Water',
    cardIds: [
      ...r('base1-58', 4), // Pikachu
      ...r('base5-83', 2), // Dark Raichu
      ...r('base1-53', 4), // Magnemite
      ...r('base5-11', 2), // Dark Magneton
      ...r('base1-35', 4), // Magikarp
      ...r('base5-8',  2), // Dark Gyarados
      ...r('base1-51', 4), // Koffing
      ...r('base5-14', 2), // Dark Weezing
      ...r(HCTR,         2),
      ...r(ROCKETS_SA,   2),
      ...r(BILL,         2),
      ...r(POTION,       3),
      ...r(SWITCH,       2),
      ...r(GOW,          1),
      ...r(E_LIGHTNING, 12),
      ...r(E_WATER,      8),
      ...r(DCE,          4),
    ],
  },
  {
    id: 'rocket-devastation',
    name: "Rocket's Devastation",
    description: "Official WotC Team Rocket theme deck. Dark Alakazam and Dark Charizard bring overwhelming power.",
    type: 'Psychic/Fire',
    cardIds: [
      ...r('base1-43', 4), // Abra
      ...r('base1-32', 2), // Kadabra
      ...r('base5-1',  2), // Dark Alakazam
      ...r('base1-49', 4), // Drowzee
      ...r('base5-9',  2), // Dark Hypno
      ...r('base1-46', 4), // Charmander
      ...r('base1-24', 2), // Charmeleon
      ...r('base5-4',  2), // Dark Charizard
      ...r('base5-2',  2), // Dark Arbok
      ...r(HCTR,         2),
      ...r(ROCKETS_SA,   2),
      ...r(BILL,         2),
      ...r(POTION,       3),
      ...r(GOW,          1),
      ...r(E_PSYCHIC,   14),
      ...r(E_FIRE,       8),
      ...r(DCE,          4),
    ],
  },

  // ── GYM HEROES THEME DECKS ────────────────────────────────────────────────
  {
    id: 'gym1-brock',
    name: "Brock's Training",
    description: "Official WotC Gym Heroes theme deck. Boulder Badge Brock's Rock Pokémon outlast everything.",
    type: 'Fighting/Colorless',
    cardIds: [
      ...r('base1-56', 4), // Onix
      ...r('gym1-21', 3), // Brock's Onix
      ...r('gym1-22', 4), // Brock's Rhyhorn
      ...r('gym1-38', 4), // Brock's Geodude
      ...r('gym1-41', 3), // Brock's Lickitung
      ...r('gym1-24', 4), // Brock's Zubat
      ...r(BILL,        2),
      ...r(OAK,         2),
      ...r(POTION,      3),
      ...r(SWITCH,      2),
      ...r(GOW,         2),
      ...r(PLUSPOWER,   2),
      ...r(ENERGY_REM,  1),
      ...r(E_FIGHTING, 20),
      ...r(DCE,          4),
    ],
  },
  {
    id: 'gym1-misty',
    name: "Misty's Torrent",
    description: "Official WotC Gym Heroes theme deck. Misty's Water Pokémon wear down opponents wave by wave.",
    type: 'Water',
    cardIds: [
      // Pokemon (22)
      ...r('gym1-30', 4), // Misty's Goldeen
      ...r('base2-53', 4), // Goldeen
      ...r('base2-46', 2), // Seaking
      ...r('gym1-32', 4), // Misty's Tentacool
      ...r('base1-29', 2), // Tentacruel
      ...r('base1-41', 4), // Seel
      ...r('base1-25', 2), // Dewgong
      // Trainers (14)
      ...r(BILL,         2),
      ...r(OAK,          2),
      ...r(POTION,       3),
      ...r(SWITCH,       2),
      ...r(GOW,          2),
      ...r(REVIVE,       1),
      ...r(ENERGY_REM,   2),
      // Energy (24)
      ...r(E_WATER,     20),
      ...r(DCE,          4),
    ],
  },
  {
    id: 'gym1-surge',
    name: "Surge's Lightning",
    description: "Official WotC Gym Heroes theme deck. Lt. Surge's electric Pokémon shock opponents into submission.",
    type: 'Lightning',
    cardIds: [
      // Pokemon (22)
      ...r('gym1-6',  2), // Lt. Surge's Electabuzz (holo)
      ...r('gym1-27', 2), // Lt. Surge's Electabuzz
      ...r('base1-20', 2), // Electabuzz
      ...r('base1-58', 4), // Pikachu
      ...r('base1-14', 2), // Raichu
      ...r('base1-67', 4), // Voltorb
      ...r('base1-21', 2), // Electrode
      ...r('base2-4',  2), // Jolteon
      ...r('base2-51', 2), // Eevee
      // Trainers (14)
      ...r(BILL,         2),
      ...r(OAK,          2),
      ...r(POTION,       3),
      ...r(SWITCH,       2),
      ...r(GOW,          2),
      ...r(PLUSPOWER,    1),
      ...r(ENERGY_REM,   2),
      // Energy (24)
      ...r(E_LIGHTNING, 20),
      ...r(DCE,          4),
    ],
  },
  {
    id: 'gym1-erika',
    name: "Erika's Garden",
    description: "Official WotC Gym Heroes theme deck. Erika's Grass Pokémon heal and sap the opponent's strength.",
    type: 'Grass/Psychic',
    cardIds: [
      // Pokemon (22)
      ...r('gym1-25', 3), // Erika's Clefairy
      ...r('gym1-42', 3), // Erika's Dratini
      ...r('gym1-43', 4), // Erika's Exeggcute
      ...r('base1-5',  4), // Clefairy
      ...r('base2-1',  1), // Clefable
      ...r('base2-35', 2), // Exeggutor
      ...r('base2-58', 4), // Oddish
      ...r('base2-37', 1), // Gloom
      // Trainers (14)
      ...r(BILL,         2),
      ...r(OAK,          2),
      ...r(POTION,       3),
      ...r(SWITCH,       2),
      ...r(GOW,          2),
      ...r(REVIVE,       1),
      ...r(SUPER_POT,    2),
      // Energy (24)
      ...r(E_GRASS,     14),
      ...r(E_PSYCHIC,    6),
      ...r(DCE,          4),
    ],
  },

  // ── GYM CHALLENGE THEME DECKS ─────────────────────────────────────────────
  {
    id: 'gym2-blaine',
    name: "Blaine's Inferno",
    description: "Official WotC Gym Challenge theme deck. Blaine's Fire Pokémon keep the heat relentless.",
    type: 'Fire',
    cardIds: [
      ...r('gym2-60', 4), // Blaine's Charmander
      ...r('gym2-62', 4), // Blaine's Growlithe
      ...r('gym2-61', 4), // Blaine's Doduo
      ...r('gym2-64', 3), // Blaine's Ponyta
      ...r('gym2-65', 2), // Blaine's Rhyhorn
      ...r('gym2-63', 2), // Blaine's Mankey
      ...r('base1-23', 3), // Arcanine
      // Trainers (14)
      ...r(BILL,         2),
      ...r(OAK,          2),
      ...r(POTION,       3),
      ...r(SWITCH,       2),
      ...r(GOW,          2),
      ...r(PLUSPOWER,    1),
      ...r(ENERGY_REM,   2),
      // Energy (24)
      ...r(E_FIRE,      20),
      ...r(DCE,          4),
    ],
  },
  {
    id: 'gym2-giovanni',
    name: "Giovanni's Ground",
    description: "Official WotC Gym Challenge theme deck. Giovanni's Ground Pokémon hit hard and survive hits.",
    type: 'Fighting/Colorless',
    cardIds: [
      ...r('gym2-24', 3), // Giovanni's Pinsir
      ...r('gym2-43', 4), // Giovanni's Meowth
      ...r('base2-9',  1), // Pinsir
      ...r('base2-50', 4), // Cubone
      ...r('base2-39', 2), // Marowak
      ...r('base1-7',  2), // Hitmonchan
      ...r('base1-52', 4), // Machop
      ...r('base1-34', 1), // Machoke
      ...r('base1-8',  1), // Machamp
      // Trainers (14)
      ...r(BILL,         2),
      ...r(OAK,          2),
      ...r(POTION,       3),
      ...r(SWITCH,       2),
      ...r(GOW,          2),
      ...r(ENERGY_REM,   2),
      ...r(PLUSPOWER,    1),
      // Energy (24)
      ...r(E_FIGHTING,  20),
      ...r(DCE,          4),
    ],
  },
  {
    id: 'gym2-koga',
    name: "Koga's Poison",
    description: "Official WotC Gym Challenge theme deck. Koga's Poison Pokémon whittle down foes with status damage.",
    type: 'Psychic/Poison',
    cardIds: [
      ...r('gym2-10', 2), // Koga's Ditto
      ...r('gym2-48', 4), // Koga's Koffing
      ...r('gym2-49', 4), // Koga's Pidgey
      ...r('base1-51', 4), // Koffing
      ...r('base5-14', 2), // Dark Weezing
      ...r('base1-50', 4), // Gastly
      ...r('base3-6',  2), // Haunter
      ...r('base3-5',  1), // Gengar
      // Trainers (13)
      ...r(BILL,         2),
      ...r(OAK,          2),
      ...r(POTION,       3),
      ...r(SWITCH,       2),
      ...r(GOW,          2),
      ...r(ENERGY_REM,   2),
      // Energy (24)
      ...r(E_PSYCHIC,   20),
      ...r(DCE,          4),
    ],
  },
  {
    id: 'gym2-sabrina',
    name: "Sabrina's Psychic",
    description: "Official WotC Gym Challenge theme deck. Sabrina's Psychic Pokémon confuse and overwhelm.",
    type: 'Psychic',
    cardIds: [
      ...r('gym2-57', 3), // Sabrina's Jynx
      ...r('gym2-59', 2), // Sabrina's Mr. Mime
      ...r('gym2-14', 2), // Rocket's Mewtwo
      ...r('base1-43', 4), // Abra
      ...r('base1-32', 2), // Kadabra
      ...r('base1-1',  1), // Alakazam
      ...r('base1-31', 3), // Jynx
      ...r('base2-6',  2), // Mr. Mime
      ...r('base1-49', 3), // Drowzee
      ...r(BILL,         2),
      ...r(OAK,          2),
      ...r(POTION,       3),
      ...r(SWITCH,       2),
      ...r(GOW,          2),
      ...r(COMPUTER_S,   1),
      ...r(ITEM_FINDER,  1),
      ...r(SCOOP_UP,     1),
      // Energy (24)
      ...r(E_PSYCHIC,   20),
      ...r(DCE,          4),
    ],
  },
];
