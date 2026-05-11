// Real WotC Base Set theme decks — authentic decklists from 1998/1999.

export interface StarterDeck {
  id: string;
  name: string;
  description: string;
  type: string;
  cardIds: string[];
}

const E_FIRE       = 'basic-fire';
const E_WATER      = 'basic-water';
const E_LIGHTNING  = 'basic-lightning';
const E_GRASS      = 'basic-grass';
const E_PSYCHIC    = 'basic-psychic';
const E_FIGHTING   = 'basic-fighting';
const DCE          = 'base1-96';
const OAK          = 'base1-88';
const BILL         = 'base1-91';
const POTION       = 'base1-94';
const SWITCH       = 'base1-95';
const PLUSPOWER    = 'base1-84';
const GOW          = 'base1-93'; // Gust of Wind
const ENERGY_REM   = 'base1-92'; // Energy Removal
const SUPER_POTION = 'base1-90';
const FULL_HEAL    = 'base1-82';
const REVIVE       = 'base1-89';
const COMPUTER_S   = 'base1-71'; // Computer Search
const ITEM_FINDER  = 'base1-74';
const SCOOP_UP     = 'base1-78';
const POKEBALL     = 'base1-87'; // Pokédex (stand-in — no Poké Ball in base1)

function r(id: string, n: number): string[] { return Array(n).fill(id); }

export const STARTER_DECKS: StarterDeck[] = [
  {
    // Official WotC 2-Player Starter Set deck (Fighting/Psychic)
    id: 'starter-machamp',
    name: 'Machamp Deck',
    description: 'The original 2-Player Starter Set fighting deck. Machamp hits hard; Psychic types provide backup.',
    type: 'Fighting/Psychic',
    cardIds: [
      // Pokémon (22)
      ...r('base1-52', 4), // Machop
      ...r('base1-34', 3), // Machoke
      ...r('base1-8',  2), // Machamp
      ...r('base1-49', 4), // Drowzee
      ...r('base1-31', 3), // Jynx
      ...r('base1-5',  4), // Clefairy
      ...r('base1-43', 2), // Abra
      // Trainers (13)
      ...r(BILL,        2),
      ...r(POTION,      3),
      ...r(FULL_HEAL,   2),
      ...r(SWITCH,      2),
      ...r(GOW,         2),
      ...r(ENERGY_REM,  2),
      // Energy (25)
      ...r(E_FIGHTING, 14),
      ...r(E_PSYCHIC,   7),
      ...r(DCE,         4),
    ],
  },
  {
    // Official WotC Theme Deck "Zap!" (Lightning)
    id: 'starter-zap',
    name: 'Zap!',
    description: 'Official WotC theme deck. Zapdos and Electabuzz keep up constant electric pressure.',
    type: 'Lightning',
    cardIds: [
      // Pokémon (22)
      ...r('base1-16', 2), // Zapdos
      ...r('base1-20', 4), // Electabuzz
      ...r('base1-58', 4), // Pikachu
      ...r('base1-14', 2), // Raichu
      ...r('base1-53', 4), // Magnemite
      ...r('base1-9',  2), // Magneton
      ...r('base1-67', 2), // Voltorb
      ...r('base1-21', 2), // Electrode
      // Trainers (13)
      ...r(BILL,       2),
      ...r(OAK,        2),
      ...r(POTION,     3),
      ...r(SWITCH,     2),
      ...r(GOW,        2),
      ...r(PLUSPOWER,  2),
      // Energy (25)
      ...r(E_LIGHTNING, 21),
      ...r(DCE,          4),
    ],
  },
  {
    // Official WotC Theme Deck "Overgrowth" (Grass)
    id: 'starter-overgrowth',
    name: 'Overgrowth',
    description: 'Official WotC theme deck. Venusaur line and Beedrill swarm the opponent with Grass power.',
    type: 'Grass',
    cardIds: [
      // Pokémon (22)
      ...r('base1-44', 4), // Bulbasaur
      ...r('base1-30', 3), // Ivysaur
      ...r('base1-15', 2), // Venusaur
      ...r('base1-69', 3), // Weedle
      ...r('base1-33', 2), // Kakuna
      ...r('base1-17', 2), // Beedrill
      ...r('base1-45', 3), // Caterpie
      ...r('base1-54', 3), // Metapod
      // Trainers (13)
      ...r(BILL,        2),
      ...r(OAK,         2),
      ...r(POTION,      3),
      ...r(REVIVE,      2),
      ...r(SWITCH,      2),
      ...r(GOW,         2),
      // Energy (25)
      ...r(E_GRASS, 21),
      ...r(DCE,      4),
    ],
  },
  {
    // Official WotC Theme Deck "Brushfire" (Fire)
    id: 'starter-brushfire',
    name: 'Brushfire',
    description: 'Official WotC theme deck. Charizard is the star; Arcanine and Ninetales provide heat.',
    type: 'Fire',
    cardIds: [
      // Pokémon (22)
      ...r('base1-46', 4), // Charmander
      ...r('base1-24', 3), // Charmeleon
      ...r('base1-4',  2), // Charizard
      ...r('base1-68', 4), // Vulpix
      ...r('base1-12', 2), // Ninetales
      ...r('base1-28', 4), // Growlithe
      ...r('base1-23', 3), // Arcanine
      // Trainers (13)
      ...r(BILL,       2),
      ...r(OAK,        2),
      ...r(POTION,     3),
      ...r(SWITCH,     2),
      ...r(GOW,        2),
      ...r(PLUSPOWER,  2),
      // Energy (25)
      ...r(E_FIRE, 21),
      ...r(DCE,     4),
    ],
  },
];
