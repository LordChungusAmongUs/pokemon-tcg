import cardsData from '@/data/cards.json';
import type { CardData, CardInstance, EnergyInstance, EnergyType } from '@/engine/GameState';
import { SET_PROGRESSION } from '@/lib/progression';

export const ALL_CARDS: CardData[] = cardsData as CardData[];

export const BASIC_ENERGY_TYPES: EnergyType[] = [
  'Fire', 'Water', 'Grass', 'Lightning', 'Psychic', 'Fighting',
  'Darkness', 'Metal', 'Colorless',
];

export const BASIC_ENERGY_CARDS: CardData[] = BASIC_ENERGY_TYPES.map(type => ({
  id: `basic-energy-${type.toLowerCase()}`,
  name: `${type} Energy`,
  set: 'Basic',
  setCode: 'basic',
  number: '0',
  rarity: 'Common',
  supertype: 'Energy',
  subtype: 'Basic',
  evolvesFrom: null,
  hp: null,
  types: [type],
  attacks: [],
  abilities: [],
  weaknesses: [],
  resistances: [],
  retreatCost: [],
  rules: [],
  localImagePath: null,
  apiImageUrl: null,
}));

export const ALL_CARDS_WITH_ENERGY: CardData[] = [...ALL_CARDS, ...BASIC_ENERGY_CARDS];

let _uidCounter = 0;
export function makeUID(): string {
  return `card-${Date.now()}-${_uidCounter++}`;
}

export function makeCardInstance(card: CardData): CardInstance {
  return { uid: makeUID(), card, attachedEnergy: [] };
}

export function makeEnergyInstance(type: EnergyType): EnergyInstance {
  return {
    uid: makeUID(),
    type,
    cardId: `basic-energy-${type.toLowerCase()}`,
  };
}

export function getCardById(id: string): CardData | undefined {
  return ALL_CARDS_WITH_ENERGY.find(c => c.id === id);
}

export function cardImageSrc(card: CardData): string {
  if (card.localImagePath) {
    return card.localImagePath
      .split('/')
      .map(seg => encodeURIComponent(seg))
      .join('/');
  }
  return card.apiImageUrl || '/card-back.png';
}

// Precomputed map from energy type → image URL using real card images
export const ENERGY_IMAGE_MAP: Partial<Record<EnergyType, string>> = (() => {
  const map: Partial<Record<EnergyType, string>> = {};
  for (const card of ALL_CARDS) {
    if (card.supertype === 'Energy' && card.rarity === '' && card.localImagePath && card.types.length > 0) {
      const type = card.types[0];
      if (!map[type]) map[type] = cardImageSrc(card);
    }
  }
  return map;
})();

export function isPokemon(card: CardData): boolean {
  return card.supertype === 'Pokémon';
}

export function isTrainer(card: CardData): boolean {
  return card.supertype === 'Trainer';
}

export function isEnergy(card: CardData): boolean {
  return card.supertype === 'Energy';
}

export function isBasicPokemon(card: CardData): boolean {
  return isPokemon(card) && (!card.subtype || card.subtype === 'Basic');
}

export function isBasicEnergy(card: CardData): boolean {
  return isEnergy(card) && card.subtype === 'Basic';
}

export function totalEnergy(energies: EnergyInstance[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const e of energies) {
    counts[e.type] = (counts[e.type] || 0) + 1;
    counts['Colorless'] = (counts['Colorless'] || 0) + 1;
  }
  return counts;
}

export function canPayCost(cost: EnergyType[], attached: EnergyInstance[]): boolean {
  const have = attached.reduce((acc, e) => {
    acc[e.type] = (acc[e.type] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const need: Record<string, number> = {};
  for (const t of cost) need[t] = (need[t] || 0) + 1;

  // First satisfy specific type requirements
  const typedCost = Object.entries(need).filter(([t]) => t !== 'Colorless');
  for (const [type, count] of typedCost) {
    const available = have[type] || 0;
    if (available < count) return false;
    have[type] = available - count;
  }

  // Then satisfy colorless with anything
  const colorlessCost = need['Colorless'] || 0;
  const totalLeft = Object.values(have).reduce((a, b) => a + b, 0);
  return totalLeft >= colorlessCost;
}

export function typeColor(type: string): string {
  const map: Record<string, string> = {
    Fire: 'bg-orange-500',
    Water: 'bg-blue-500',
    Grass: 'bg-green-500',
    Lightning: 'bg-yellow-400',
    Psychic: 'bg-purple-500',
    Fighting: 'bg-orange-700',
    Darkness: 'bg-gray-800',
    Metal: 'bg-gray-400',
    Colorless: 'bg-gray-200',
    Dragon: 'bg-indigo-600',
    Fairy: 'bg-pink-400',
  };
  return map[type] || 'bg-gray-300';
}

export function typeEmoji(type: string): string {
  const map: Record<string, string> = {
    Fire: '🔥', Water: '💧', Grass: '🌿', Lightning: '⚡',
    Psychic: '🔮', Fighting: '👊', Darkness: '🌑', Metal: '⚙️',
    Colorless: '⬜', Dragon: '🐉', Fairy: '✨',
  };
  return map[type] || '?';
}

export function isSetUnlocked(setName: string, collection: Record<string, number>): boolean {
  const entry = SET_PROGRESSION.find(s => s.name === setName);
  if (!entry) return true;
  if (entry.prerequisite === null) return true;
  const prereqCards = ALL_CARDS.filter(c => c.set === entry.prerequisite);
  if (prereqCards.length === 0) return true;
  const ownedCount = prereqCards.filter(c => (collection[c.id] ?? 0) > 0).length;
  return ownedCount / prereqCards.length >= 0.6;
}

export function setCompletionPct(setName: string, collection: Record<string, number>): number {
  const cards = ALL_CARDS.filter(c => c.set === setName);
  if (cards.length === 0) return 0;
  return cards.filter(c => (collection[c.id] ?? 0) > 0).length / cards.length;
}
