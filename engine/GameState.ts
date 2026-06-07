export type EnergyType =
  | 'Fire' | 'Water' | 'Grass' | 'Lightning' | 'Psychic'
  | 'Fighting' | 'Darkness' | 'Metal' | 'Colorless' | 'Dragon' | 'Fairy';

export type StatusCondition = 'Poisoned' | 'Toxic' | 'Asleep' | 'Paralyzed' | 'Burned' | 'Confused';
// 'Toxic' = bad poison from Nidoking — 20 damage between turns instead of 10; mutually exclusive with 'Poisoned'

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
  provides?: number;     // energy symbols this card provides (default 1; DCE = 2)
}

export interface InPlayPokemon {
  uid: string;           // same as the CardInstance uid
  card: CardData;
  currentHP: number;
  damageTaken: number;
  attachedEnergy: EnergyInstance[];
  statusConditions: StatusCondition[];  // stackable; at most one of each kind
  shiftedType?: EnergyType;             // Venomoth Shift — overrides card.types for damage until end of turn
  turnPlayed: number;    // turn number it was placed; can't evolve same turn
  isFirstTurn: boolean;  // true if it was active at start of game (can't retreat t1)
  evolvedFrom: CardData[]; // previous cards in evolution chain (oldest first)
  energyBurned: boolean; // Charizard Energy Burn — all attached energy counts as Fire this turn
  swordsDanceActive: boolean; // Scyther Swords Dance — next Slash does 60 instead of 30
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

export type PendingTrainer =
  | { type: 'energy-removal' }
  | { type: 'energy-removal-energy'; targetSlot: 'active' | number }
  | { type: 'super-energy-removal' }
  | { type: 'super-energy-removal-energy'; targetSlot: 'active' | number }
  | { type: 'gust-of-wind' }
  | { type: 'pokedex'; cards: CardData[]; cardUids: string[] }
  | { type: 'pokeball'; pokemonUids: string[] }
  | { type: 'pokemon-trader' }
  | { type: 'pokemon-trader-deck'; handUid: string }
  | { type: 'maintenance' }
  | { type: 'maintenance-second'; firstUid: string }
  | { type: 'item-finder' }
  | { type: 'item-finder-second'; firstUid: string }
  | { type: 'item-finder-trainer'; firstUid: string; secondUid: string }
  | { type: 'nightly-garbage-run'; selectedUids: string[] }
  | { type: 'pokemon-breeder' }
  | { type: 'pokemon-breeder-target'; stage2Uid: string }
  | { type: 'recycle' }
  | { type: 'computer-search' }
  | { type: 'computer-search-second'; firstUid: string }
  | { type: 'computer-search-deck'; firstUid: string; secondUid: string }
  | { type: 'bosss-way'; cardUids: string[] }
  | { type: 'energy-retrieval' }
  | { type: 'energy-retrieval-energy'; discardUid: string; selectedEnergyUids: string[] }
  | { type: 'switch' };

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
  prizeCount: number;  // 6 for standard games; 4 for event formats (Prerelease/Draft/Sealed)
  pendingTrainer?: PendingTrainer;
  pendingRetreat?: { benchSlot: number; cost: number };
  pendingAttackDiscard?: { attackIndex: number; requiredType: EnergyType; count: number };
  pendingSendOut?: { side: 'player1' | 'player2' };  // KO'd player must choose a new active
  mode: 'vs-ai' | 'local-2p';
  usedPowersThisTurn: string[];  // "${uid}:${powerName}" for once-per-turn powers
  cantAttackTarget?: { attackerUid: string; targetUid: string }; // Leer-type: attacker can't attack targetUid
  sandAttackTarget?: string; // Sand Attack: UID of Pokémon with sand in its eyes; must flip coin to attack
  snivel?: { protectedUid: string; attackerUid: string }; // Cubone Snivel: next opponent attack against protectedUid deals -20
  defenderShield?: { protectedUid: string; playedOnTurn: number }; // Defender trainer: next opponent attack against protectedUid reduced by 20
}

export interface SelectedDeck {
  name: string;
  cards: CardData[];
}
