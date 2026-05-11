export type EnergyType =
  | 'Fire' | 'Water' | 'Grass' | 'Lightning' | 'Psychic'
  | 'Fighting' | 'Darkness' | 'Metal' | 'Colorless' | 'Dragon' | 'Fairy';

export type StatusCondition = 'Poisoned' | 'Asleep' | 'Paralyzed' | 'Burned' | 'Confused';

export interface CardAttack {
  name: string;
  cost: EnergyType[];
  damage: number;
  damageStr: string;
  text: string;
}

export interface CardAbility {
  name: string;
  type: string;
  text: string;
}

export interface CardWeakness {
  type: EnergyType;
  value: string;
}

export interface CardResistance {
  type: EnergyType;
  value: string;
}

export interface CardData {
  id: string;
  name: string;
  set: string;
  setCode: string;
  number: string;
  rarity: string;
  supertype: 'Pokémon' | 'Trainer' | 'Energy' | string;
  subtype: string;
  evolvesFrom: string | null;
  hp: number | null;
  types: EnergyType[];
  attacks: CardAttack[];
  abilities: CardAbility[];
  weaknesses: CardWeakness[];
  resistances: CardResistance[];
  retreatCost: EnergyType[];
  rules: string[];
  localImagePath: string | null;
  apiImageUrl: string | null;
}

export interface CardInstance {
  uid: string;           // unique runtime ID (uuid)
  card: CardData;
  attachedEnergy?: EnergyInstance[];
}

export interface EnergyInstance {
  uid: string;
  type: EnergyType;
  cardId: string;        // "basic-fire", etc.
}

export interface InPlayPokemon {
  uid: string;           // same as the CardInstance uid
  card: CardData;
  currentHP: number;
  damageTaken: number;
  attachedEnergy: EnergyInstance[];
  statusCondition: StatusCondition | null;
  turnPlayed: number;    // turn number it was placed; can't evolve same turn
  isFirstTurn: boolean;  // true if it was active at start of game (can't retreat t1)
  evolvedFrom: CardData[]; // previous cards in evolution chain (oldest first)
}

export type GamePhase =
  | 'setup'       // choosing opening hand / prizes
  | 'draw'        // mandatory draw step
  | 'main'        // free actions: play basic, evolve, trainer, attach, retreat
  | 'attack'      // can declare attack or pass
  | 'end'         // apply end-of-turn effects, switch player
  | 'gameover';   // winner determined

export interface PlayerState {
  id: 'player1' | 'player2';
  name: string;
  deck: CardInstance[];
  hand: CardInstance[];
  active: InPlayPokemon | null;
  bench: (InPlayPokemon | null)[];  // always length 5
  discard: CardInstance[];
  prizes: CardInstance[];           // 6 face-down
  energyPlayedThisTurn: boolean;
  retreatedThisTurn: boolean;
  hasAttackedThisTurn: boolean;
  attackDamageBonus: number;        // from PlusPower; added after W/R; reset end of turn
}

export interface GameState {
  phase: GamePhase;
  setupStep?: 'p1-setup' | 'p2-setup'; // only set during phase==='setup'
  turn: number;
  activePlayer: 'player1' | 'player2';
  player1: PlayerState;
  player2: PlayerState;
  winner: 'player1' | 'player2' | null;
  log: string[];
  pendingCoinFlip: boolean;
  mode: 'vs-ai' | 'local-2p';
}

export interface SelectedDeck {
  name: string;
  cards: CardData[];
}
