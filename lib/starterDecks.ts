// Pre-built 60-card starter decks using Base Set 1 cards.
// These are always available to all players; no card ownership required.

export interface StarterDeck {
  id: string;
  name: string;
  description: string;
  type: string;
  cardIds: string[];
}

const E_FIRE = 'basic-fire';
const E_WATER = 'basic-water';
const E_LIGHTNING = 'basic-lightning';
const E_GRASS = 'basic-grass';
const DCE = 'base1-96';
const OAK = 'base1-88';
const BILL = 'base1-91';
const POTION = 'base1-94';
const SWITCH = 'base1-95';
const PLUSPOWER = 'base1-84';
const GOW = 'base1-93'; // Gust of Wind
const ENERGY_RET = 'base1-81';
const REVIVE = 'base1-89';
const SUPER_POT = 'base1-90';

function repeat(id: string, n: number): string[] {
  return Array(n).fill(id);
}

export const STARTER_DECKS: StarterDeck[] = [
  {
    id: 'starter-fire',
    name: 'Fire Frenzy',
    description: 'Charmander line + Magmar. Hot and fast.',
    type: 'Fire',
    cardIds: [
      // Pokémon (18)
      ...repeat('base1-46', 4), // Charmander
      ...repeat('base1-24', 3), // Charmeleon
      ...repeat('base1-4',  1), // Charizard
      ...repeat('base1-36', 4), // Magmar
      ...repeat('base1-28', 3), // Growlithe
      ...repeat('base1-60', 3), // Ponyta
      // Trainers (16)
      ...repeat(OAK, 4),
      ...repeat(BILL, 4),
      ...repeat(POTION, 3),
      ...repeat(PLUSPOWER, 2),
      ...repeat(SWITCH, 2),
      ...repeat(REVIVE, 1),
      // Energy (26)
      ...repeat(E_FIRE, 22),
      ...repeat(DCE, 4),
    ],
  },
  {
    id: 'starter-water',
    name: 'Water Surge',
    description: 'Squirtle line + Seel. Steady and resilient.',
    type: 'Water',
    cardIds: [
      // Pokémon (18)
      ...repeat('base1-63', 4), // Squirtle
      ...repeat('base1-42', 3), // Wartortle
      ...repeat('base1-2',  1), // Blastoise
      ...repeat('base1-41', 4), // Seel
      ...repeat('base1-25', 2), // Dewgong
      ...repeat('base1-65', 3), // Staryu
      ...repeat('base1-64', 1), // Starmie
      // Trainers (16)
      ...repeat(OAK, 4),
      ...repeat(BILL, 4),
      ...repeat(POTION, 2),
      ...repeat(SWITCH, 2),
      ...repeat(ENERGY_RET, 2),
      ...repeat(SUPER_POT, 1),
      ...repeat(GOW, 1),
      // Energy (26)
      ...repeat(E_WATER, 22),
      ...repeat(DCE, 4),
    ],
  },
  {
    id: 'starter-lightning',
    name: 'Thunder Strike',
    description: 'Pikachu + Electabuzz. Fast and shocking.',
    type: 'Lightning',
    cardIds: [
      // Pokémon (18)
      ...repeat('base1-58', 4), // Pikachu
      ...repeat('base1-14', 2), // Raichu
      ...repeat('base1-20', 4), // Electabuzz
      ...repeat('base1-53', 4), // Magnemite
      ...repeat('base1-9',  2), // Magneton
      ...repeat('base1-7',  2), // Hitmonchan (colorless backup)
      // Trainers (16)
      ...repeat(OAK, 4),
      ...repeat(BILL, 4),
      ...repeat(POTION, 3),
      ...repeat(SWITCH, 2),
      ...repeat(PLUSPOWER, 2),
      ...repeat(GOW, 1),
      // Energy (26)
      ...repeat(E_LIGHTNING, 22),
      ...repeat(DCE, 4),
    ],
  },
  {
    id: 'starter-grass',
    name: 'Vine Force',
    description: 'Bulbasaur line + Tangela. Consistent and tough.',
    type: 'Grass',
    cardIds: [
      // Pokémon (18)
      ...repeat('base1-44', 4), // Bulbasaur
      ...repeat('base1-30', 3), // Ivysaur
      ...repeat('base1-15', 1), // Venusaur
      ...repeat('base1-66', 4), // Tangela
      ...repeat('base1-45', 4), // Caterpie
      ...repeat('base1-54', 2), // Metapod
      // Trainers (16)
      ...repeat(OAK, 4),
      ...repeat(BILL, 4),
      ...repeat(POTION, 3),
      ...repeat(SWITCH, 2),
      ...repeat(REVIVE, 1),
      ...repeat(GOW, 1),
      ...repeat(ENERGY_RET, 1),
      // Energy (26)
      ...repeat(E_GRASS, 22),
      ...repeat(DCE, 4),
    ],
  },
];
