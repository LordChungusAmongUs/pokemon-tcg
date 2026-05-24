// Real WotC theme decks — authentic decklists for Base Set through Gym Challenge.

export interface StarterDeck {
  id: string;
  name: string;
  description: string;
  type: string;
  requiredSet: string;            // highest-tier set used; 'Base' = always available (AI filtering)
  prerequisiteSet: string | null; // which set must be completed to unlock in shop (null = always)
  prerequisitePct?: number;       // completion threshold to unlock (default 0.75 = 75%)
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
// Base Set 2 trainers (reprints, same effects — use for BS2 theme decks)
const BS2_BILL    = 'base4-118';
const BS2_OAK     = 'base4-116';
const BS2_POTION  = 'base4-122';
const BS2_SWITCH  = 'base4-123';
const BS2_GOW     = 'base4-120';
const BS2_EREM    = 'base4-119';
const BS2_PPLUS   = 'base4-113';
const BS2_DCE     = 'base4-124';
const BS2_CMSRCH  = 'base4-101';

function r(id: string, n: number): string[] { return Array(n).fill(id); }

export const STARTER_DECKS: StarterDeck[] = [

  // ── CUSTOM BASE SET DECK (always unlocked) ────────────────────────────────
  {
    id: 'custom-fists-and-fire',
    name: 'Fists & Fire',
    description: 'Base Set only. Machamp punishes with big Fighting damage; Charmander/Charmeleon build toward the fire side.',
    type: 'Fighting/Fire',
    requiredSet: 'Base',
    prerequisiteSet: null,
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

  // ── BASE SET THEME DECKS ──────────────────────────────────────────────────
  {
    id: 'starter-machamp',
    name: 'Machamp Deck',
    description: 'The original 2-Player Starter Set fighting deck. Machamp hits hard; Psychic types provide backup.',
    type: 'Fighting/Psychic',
    requiredSet: 'Base',
    prerequisiteSet: null,
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
  {
    id: 'starter-zap',
    name: 'Zap!',
    description: 'Lightning/Psychic combo. Pikachu and Magnemite shock while Mewtwo, Haunter, and Jynx provide Psychic pressure.',
    type: 'Lightning/Psychic',
    requiredSet: 'Base',
    prerequisiteSet: null,
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
    requiredSet: 'Base',
    prerequisiteSet: null,
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
    requiredSet: 'Base',
    prerequisiteSet: null,
    cardIds: [
      ...r('base1-12', 1), // Ninetales
      ...r('base1-69', 4), // Weedle
      ...r('base1-66', 2), // Tangela
      ...r('base1-55', 4), // Nidoran ♂
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
    requiredSet: 'Base',
    prerequisiteSet: null,
    cardIds: [
      ...r('base1-7',  1), // Hitmonchan
      ...r('base1-27', 2), // Farfetch'd
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

  // ── JUNGLE THEME DECKS (unlock: Base 75%) ────────────────────────────────
  {
    id: 'jungle-power-reserve',
    name: 'Power Reserve',
    description: 'Jungle/Base hybrid. Kangaskhan and the Nidoran♀ line hit hard; Abra/Kadabra provide Psychic support.',
    type: 'Grass/Psychic',
    requiredSet: 'Jungle',
    prerequisiteSet: 'Base',
    cardIds: [
      ...r('base2-21', 1), // Kangaskhan
      ...r('base2-58', 2), // Oddish
      ...r('base2-57', 4), // Nidoran ♀
      ...r('base2-48', 2), // Weepinbell
      ...r('base2-40', 2), // Nidorina
      ...r('base2-37', 1), // Gloom
      ...r('base1-43', 4), // Abra
      ...r('base1-32', 2), // Kadabra
      ...r('base1-31', 1), // Jynx
      ...r('base1-95', 1), // Switch
      ...r('base1-94', 3), // Potion
      ...r('base1-93', 2), // Gust of Wind
      ...r('base1-91', 2), // Bill
      ...r('base1-87', 2), // Pokédex
      ...r(E_PSYCHIC,  11), // Psychic Energy
      ...r(E_GRASS,    17), // Grass Energy
    ],
  },
  {
    id: 'jungle-water-blast',
    name: 'Water Blast',
    description: 'Vaporeon and Rhydon lead a Water/Fighting assault backed by a Meowth-Persian line.',
    type: 'Water/Fighting',
    requiredSet: 'Jungle',
    prerequisiteSet: 'Base',
    cardIds: [
      ...r('base2-51', 4), // Eevee
      ...r('base2-12', 1), // Vaporeon
      ...r('base2-61', 3), // Rhyhorn
      ...r('base2-45', 1), // Rhydon
      ...r('base2-56', 4), // Meowth
      ...r('base2-42', 2), // Persian
      ...r('base1-59', 4), // Poliwag
      ...r('base1-38', 2), // Poliwhirl
      ...r('base1-52', 2), // Machop
      ...r('base1-41', 1), // Seel
      ...r(POTION,       2),
      ...r(SUPER_POT,    2),
      ...r(GOW,          2),
      ...r(OAK,          1),
      ...r(E_WATER,     14),
      ...r(E_FIGHTING,  14),
    ],
  },

  // ── FOSSIL THEME DECKS (unlock: Jungle 75%) ───────────────────────────────
  {
    id: 'fossil-bodyguard',
    name: 'Bodyguard',
    description: 'Official WotC Fossil theme deck. Kabutops and Hitmonlee guard the bench with iron fists.',
    type: 'Fighting/Colorless',
    requiredSet: 'Fossil',
    prerequisiteSet: 'Jungle',
    cardIds: [
      ...r('base3-50', 4), // Kabuto
      ...r('base3-9',  2), // Kabutops
      ...r('base3-7',  3), // Hitmonlee
      ...r('base1-7',  2), // Hitmonchan
      ...r('base1-62', 4), // Sandshrew
      ...r('base3-41', 2), // Sandslash
      ...r('base3-1',  1), // Aerodactyl
      ...r('base3-62', 4), // Mysterious Fossil
      ...r(BILL,         2),
      ...r(OAK,          2),
      ...r(POTION,       3),
      ...r(SWITCH,       2),
      ...r(GOW,          2),
      ...r(ENERGY_REM,   2),
      ...r(MR_FUJI,      1),
      ...r(E_FIGHTING,  20),
      ...r(DCE,          4),
    ],
  },
  {
    id: 'fossil-excavation',
    name: 'Excavation',
    description: 'Official WotC Fossil theme deck. Gengar and Slowbro combine psychic power with Lapras bulk.',
    type: 'Psychic/Water',
    requiredSet: 'Fossil',
    prerequisiteSet: 'Jungle',
    cardIds: [
      ...r('base3-33', 4), // Gastly
      ...r('base3-6',  3), // Haunter
      ...r('base3-5',  2), // Gengar
      ...r('base3-55', 4), // Slowpoke
      ...r('base3-43', 2), // Slowbro
      ...r('base3-10', 2), // Lapras
      ...r('base3-3',  1), // Ditto
      ...r('base1-49', 4), // Drowzee
      ...r(BILL,         2),
      ...r(OAK,          2),
      ...r(POTION,       3),
      ...r(SWITCH,       2),
      ...r(GOW,          2),
      ...r(MR_FUJI,      1),
      ...r(REVIVE,       1),
      ...r(RECYCLE_F,    1),
      ...r(E_PSYCHIC,   20),
      ...r(E_WATER,      4),
    ],
  },

  // ── BASE SET 2 THEME DECKS (unlock: Base 100%) ───────────────────────────
  {
    id: 'bs2-grass-chopper',
    name: 'Grass Chopper',
    description: 'Base Set 2 reprints. Venusaur, Beedrill, and Exeggutor overwhelm with relentless Grass energy.',
    type: 'Grass',
    requiredSet: 'Base',
    prerequisiteSet: 'Base',
    prerequisitePct: 1.0,
    cardIds: [
      ...r('base4-67', 4), // Bulbasaur
      ...r('base4-44', 2), // Ivysaur
      ...r('base4-18', 1), // Venusaur
      ...r('base4-100',4), // Weedle
      ...r('base4-47', 2), // Kakuna
      ...r('base4-21', 1), // Beedrill
      ...r('base4-74', 4), // Exeggcute
      ...r('base4-39', 2), // Exeggutor
      ...r('base4-96', 4), // Tangela
      ...r(BS2_BILL,   2),
      ...r(BS2_OAK,    2),
      ...r(BS2_POTION, 2),
      ...r(BS2_GOW,    1),
      ...r(BS2_EREM,   1),
      ...r(BS2_PPLUS,  1),
      ...r(BS2_SWITCH, 1),
      ...r(E_GRASS,   22),
      ...r(BS2_DCE,    4),
    ],
  },
  {
    id: 'bs2-hot-water',
    name: 'Hot Water',
    description: 'Base Set 2 reprints. Blastoise, Gyarados, and Poliwrath bring a devastating Water assault.',
    type: 'Water',
    requiredSet: 'Base',
    prerequisiteSet: 'Base',
    prerequisitePct: 1.0,
    cardIds: [
      ...r('base4-93', 4), // Squirtle
      ...r('base4-63', 2), // Wartortle
      ...r('base4-2',  1), // Blastoise
      ...r('base4-50', 4), // Magikarp
      ...r('base4-7',  1), // Gyarados
      ...r('base4-88', 4), // Poliwag
      ...r('base4-57', 2), // Poliwhirl
      ...r('base4-15', 1), // Poliwrath
      ...r('base4-95', 4), // Staryu
      ...r('base4-94', 1), // Starmie
      ...r(BS2_BILL,   2),
      ...r(BS2_OAK,    2),
      ...r(BS2_POTION, 2),
      ...r(BS2_GOW,    1),
      ...r(BS2_EREM,   1),
      ...r(BS2_PPLUS,  1),
      ...r(BS2_SWITCH, 1),
      ...r(E_WATER,   22),
      ...r(BS2_DCE,    4),
    ],
  },
  {
    id: 'bs2-brain-wave',
    name: 'Brain Wave',
    description: 'Base Set 2 reprints. Alakazam and Mewtwo lead a Psychic onslaught with Haunter support.',
    type: 'Psychic',
    requiredSet: 'Base',
    prerequisiteSet: 'Base',
    prerequisitePct: 1.0,
    cardIds: [
      ...r('base4-65', 4), // Abra
      ...r('base4-46', 2), // Kadabra
      ...r('base4-1',  1), // Alakazam
      ...r('base4-73', 4), // Drowzee
      ...r('base4-75', 4), // Gastly
      ...r('base4-43', 2), // Haunter
      ...r('base4-10', 1), // Mewtwo
      ...r('base4-45', 4), // Jynx
      ...r('base4-82', 2), // Nidoran ♀
      ...r(BS2_BILL,     2),
      ...r(BS2_OAK,      2),
      ...r(BS2_POTION,   2),
      ...r(BS2_GOW,      1),
      ...r(BS2_EREM,     1),
      ...r(BS2_SWITCH,   1),
      ...r(BS2_CMSRCH,   1),
      ...r(E_PSYCHIC,   22),
      ...r(BS2_DCE,      4),
    ],
  },
  {
    id: 'bs2-power-punch',
    name: 'Power Punch',
    description: 'Base Set 2 reprints. Machop line, Hitmonchan, and Marowak deliver raw Fighting power.',
    type: 'Fighting',
    requiredSet: 'Base',
    prerequisiteSet: 'Base',
    prerequisitePct: 1.0,
    cardIds: [
      ...r('base4-78', 4), // Machop
      ...r('base4-49', 2), // Machoke
      ...r('base4-8',  2), // Hitmonchan
      ...r('base4-71', 4), // Diglett
      ...r('base4-23', 2), // Dugtrio
      ...r('base4-70', 4), // Cubone
      ...r('base4-52', 2), // Marowak
      ...r('base4-90', 2), // Rhyhorn
      ...r('base4-83', 2), // Nidoran ♂
      ...r(BS2_BILL,   2),
      ...r(BS2_OAK,    2),
      ...r(BS2_POTION, 2),
      ...r(BS2_GOW,    1),
      ...r(BS2_EREM,   2),
      ...r(BS2_SWITCH, 1),
      ...r(E_FIGHTING,22),
      ...r(BS2_DCE,    4),
    ],
  },

  // ── TEAM ROCKET THEME DECKS (unlock: Fossil 75%) ─────────────────────────
  {
    id: 'rocket-trouble',
    name: "Rocket's Trouble",
    description: "Official WotC Team Rocket theme deck. Dark Raichu and Dark Gyarados strike fast and hard.",
    type: 'Lightning/Water',
    requiredSet: 'Team Rocket',
    prerequisiteSet: 'Fossil',
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
    requiredSet: 'Team Rocket',
    prerequisiteSet: 'Fossil',
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

  // ── GYM HEROES THEME DECKS (unlock: Team Rocket 75%) ─────────────────────
  {
    id: 'gym1-brock',
    name: "Brock's Training",
    description: "Official WotC Gym Heroes theme deck. Boulder Badge Brock's Rock Pokémon outlast everything.",
    type: 'Fighting/Colorless',
    requiredSet: 'Gym Heroes',
    prerequisiteSet: 'Team Rocket',
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
    requiredSet: 'Gym Heroes',
    prerequisiteSet: 'Team Rocket',
    cardIds: [
      ...r('gym1-30', 4), // Misty's Goldeen
      ...r('base2-53', 4), // Goldeen
      ...r('base2-46', 2), // Seaking
      ...r('gym1-32', 4), // Misty's Tentacool
      ...r('gym1-10', 2), // Misty's Tentacruel
      ...r('base1-41', 4), // Seel
      ...r('base1-25', 2), // Dewgong
      ...r(BILL,         2),
      ...r(OAK,          2),
      ...r(POTION,       3),
      ...r(SWITCH,       2),
      ...r(GOW,          2),
      ...r(REVIVE,       1),
      ...r(ENERGY_REM,   2),
      ...r(E_WATER,     20),
      ...r(DCE,          4),
    ],
  },
  {
    id: 'gym1-surge',
    name: "Surge's Lightning",
    description: "Official WotC Gym Heroes theme deck. Lt. Surge's electric Pokémon shock opponents into submission.",
    type: 'Lightning',
    requiredSet: 'Gym Heroes',
    prerequisiteSet: 'Team Rocket',
    cardIds: [
      ...r('gym1-6',  2), // Lt. Surge's Electabuzz (holo)
      ...r('gym1-27', 2), // Lt. Surge's Electabuzz
      ...r('base1-20', 2), // Electabuzz
      ...r('base1-58', 4), // Pikachu
      ...r('base1-14', 2), // Raichu
      ...r('base1-67', 4), // Voltorb
      ...r('base1-21', 2), // Electrode
      ...r('base2-4',  2), // Jolteon
      ...r('base2-51', 2), // Eevee
      ...r(BILL,         2),
      ...r(OAK,          2),
      ...r(POTION,       3),
      ...r(SWITCH,       2),
      ...r(GOW,          2),
      ...r(PLUSPOWER,    1),
      ...r(ENERGY_REM,   2),
      ...r(E_LIGHTNING, 20),
      ...r(DCE,          4),
    ],
  },
  {
    id: 'gym1-erika',
    name: "Erika's Garden",
    description: "Official WotC Gym Heroes theme deck. Erika's Grass Pokémon heal and sap the opponent's strength.",
    type: 'Grass/Psychic',
    requiredSet: 'Gym Heroes',
    prerequisiteSet: 'Team Rocket',
    cardIds: [
      ...r('gym1-25', 3), // Erika's Clefairy
      ...r('gym1-42', 3), // Erika's Dratini
      ...r('gym1-43', 4), // Erika's Exeggcute
      ...r('base1-5',  4), // Clefairy
      ...r('base2-1',  1), // Clefable
      ...r('base2-35', 2), // Exeggutor
      ...r('base2-58', 4), // Oddish
      ...r('base2-37', 1), // Gloom
      ...r(BILL,         2),
      ...r(OAK,          2),
      ...r(POTION,       3),
      ...r(SWITCH,       2),
      ...r(GOW,          2),
      ...r(REVIVE,       1),
      ...r(SUPER_POT,    2),
      ...r(E_GRASS,     14),
      ...r(E_PSYCHIC,    6),
      ...r(DCE,          4),
    ],
  },

  // ── GYM CHALLENGE THEME DECKS (unlock: Gym Heroes 75%) ───────────────────
  {
    id: 'gym2-blaine',
    name: "Blaine's Inferno",
    description: "Official WotC Gym Challenge theme deck. Blaine's Fire Pokémon keep the heat relentless.",
    type: 'Fire',
    requiredSet: 'Gym Challenge',
    prerequisiteSet: 'Gym Heroes',
    cardIds: [
      ...r('gym2-60', 4), // Blaine's Charmander
      ...r('gym2-62', 4), // Blaine's Growlithe
      ...r('gym2-61', 4), // Blaine's Doduo
      ...r('gym2-64', 3), // Blaine's Ponyta
      ...r('gym2-65', 2), // Blaine's Rhyhorn
      ...r('gym2-63', 2), // Blaine's Mankey
      ...r('base1-23', 3), // Arcanine
      ...r(BILL,         2),
      ...r(OAK,          2),
      ...r(POTION,       3),
      ...r(SWITCH,       2),
      ...r(GOW,          2),
      ...r(PLUSPOWER,    1),
      ...r(ENERGY_REM,   2),
      ...r(E_FIRE,      20),
      ...r(DCE,          4),
    ],
  },
  {
    id: 'gym2-giovanni',
    name: "Giovanni's Ground",
    description: "Official WotC Gym Challenge theme deck. Giovanni's Ground Pokémon hit hard and survive hits.",
    type: 'Fighting/Colorless',
    requiredSet: 'Gym Challenge',
    prerequisiteSet: 'Gym Heroes',
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
      ...r(BILL,         2),
      ...r(OAK,          2),
      ...r(POTION,       3),
      ...r(SWITCH,       2),
      ...r(GOW,          2),
      ...r(ENERGY_REM,   2),
      ...r(PLUSPOWER,    1),
      ...r(E_FIGHTING,  20),
      ...r(DCE,          4),
    ],
  },
  {
    id: 'gym2-koga',
    name: "Koga's Poison",
    description: "Official WotC Gym Challenge theme deck. Koga's Poison Pokémon whittle down foes with status damage.",
    type: 'Psychic/Poison',
    requiredSet: 'Gym Challenge',
    prerequisiteSet: 'Gym Heroes',
    cardIds: [
      ...r('gym2-10', 2), // Koga's Ditto
      ...r('gym2-48', 4), // Koga's Koffing
      ...r('gym2-49', 4), // Koga's Pidgey
      ...r('base1-51', 4), // Koffing
      ...r('base5-14', 2), // Dark Weezing
      ...r('base1-50', 4), // Gastly
      ...r('base3-6',  2), // Haunter
      ...r('base3-5',  1), // Gengar
      ...r(BILL,         2),
      ...r(OAK,          2),
      ...r(POTION,       3),
      ...r(SWITCH,       2),
      ...r(GOW,          2),
      ...r(ENERGY_REM,   2),
      ...r(E_PSYCHIC,   20),
      ...r(DCE,          4),
    ],
  },
  {
    id: 'gym2-sabrina',
    name: "Sabrina's Psychic",
    description: "Official WotC Gym Challenge theme deck. Sabrina's Psychic Pokémon confuse and overwhelm.",
    type: 'Psychic',
    requiredSet: 'Gym Challenge',
    prerequisiteSet: 'Gym Heroes',
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
      ...r(E_PSYCHIC,   20),
      ...r(DCE,          4),
    ],
  },
];

// Returns all starter decks the AI is allowed to use given the player's collection.
// Falls back to Base Set decks if nothing else qualifies.
export function getAvailableAIDecks(
  collection: Record<string, number>,
  isSetUnlocked: (setName: string, collection: Record<string, number>) => boolean,
): StarterDeck[] {
  const available = STARTER_DECKS.filter(d => isSetUnlocked(d.requiredSet, collection));
  if (available.length > 0) return available;
  return STARTER_DECKS.filter(d => d.requiredSet === 'Base');
}
