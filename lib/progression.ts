export const XP_REWARDS = {
  playBasic: 5,
  evolve: 10,
  attachEnergy: 3,
  playTrainer: 5,
  takePrize: 20,
  winGame: 100,
  loseGame: 25,
} as const;

export const CREDIT_REWARDS = {
  winGame: 50,
  loseGame: 15,
  levelUp: 100,
  packOpen: 0,
} as const;

// XP required to go FROM level N to level N+1
export function xpForNextLevel(level: number): number {
  return Math.floor(100 * Math.pow(level, 1.5));
}

// Total XP accumulated to have reached a given level
export function totalXpForLevel(level: number): number {
  let total = 0;
  for (let i = 1; i < level; i++) total += xpForNextLevel(i);
  return total;
}

// Compute level and XP-within-level from total XP
export function computeLevel(totalXp: number): { level: number; xpIntoLevel: number; xpForNext: number } {
  let level = 1;
  let remaining = totalXp;
  while (true) {
    const needed = xpForNextLevel(level);
    if (remaining < needed) break;
    remaining -= needed;
    level++;
  }
  return { level, xpIntoLevel: remaining, xpForNext: xpForNextLevel(level) };
}

// Set names exactly as they appear in cards.json, mapped to unlock level
export const SET_UNLOCK_LEVELS: Record<string, number> = {
  'Base': 1,
  'Jungle': 4,
  'Fossil': 7,
  'Team Rocket': 11,
  'Gym Heroes': 15,
  'Gym Challenge': 19,
  'Neo Genesis': 24,
  'Neo Discovery': 29,
  'Neo Revelation': 34,
  'Neo Destiny': 39,
  'Expedition Base Set': 44,
  'Wizards Black Star Promos': 30,
  'Aquapolis': 50,
  'Skyridge': 56,
  'Ruby & Sapphire': 62,
  'Sandstorm': 68,
  'Dragon': 74,
  'Team Magma vs Team Aqua': 80,
  'Hidden Legends': 86,
  'FireRed & LeafGreen': 90,
  // Base Set 2 and Diamond & Pearl excluded intentionally
};

export function isSetUnlocked(setName: string, level: number): boolean {
  const required = SET_UNLOCK_LEVELS[setName];
  if (required === undefined) return false; // Base Set 2 or unknown
  return level >= required;
}

export const PACK_COST = 25;
export const THEME_DECK_COST = 150;

export const SINGLE_COSTS: Record<string, number> = {
  Common: 3,
  Uncommon: 5,
  Rare: 15,
  'Rare Holo': 50,
  'Holo Rare': 50,
  Promo: 25,
};

export function singleCost(rarity: string): number {
  if (!rarity) return 5;
  if (rarity.toLowerCase().includes('holo')) return 50;
  if (rarity.toLowerCase().includes('promo')) return 25;
  if (rarity.toLowerCase().includes('rare')) return 15;
  if (rarity.toLowerCase().includes('uncommon')) return 5;
  return 3; // Common default
}

export type RarityWeight = 'Common' | 'Uncommon' | 'Rare';

export function rarityWeight(rarity: string): RarityWeight {
  const r = rarity.toLowerCase();
  if (r.includes('rare') || r.includes('holo')) return 'Rare';
  if (r.includes('uncommon')) return 'Uncommon';
  return 'Common';
}

export function pickPackCards(setCards: { id: string; rarity: string }[], count = 10): string[] {
  const commons = setCards.filter(c => rarityWeight(c.rarity) === 'Common');
  const uncommons = setCards.filter(c => rarityWeight(c.rarity) === 'Uncommon');
  const rares = setCards.filter(c => rarityWeight(c.rarity) === 'Rare');

  const pick = (pool: typeof setCards, n: number) => {
    const out: string[] = [];
    for (let i = 0; i < n; i++) {
      if (pool.length === 0) break;
      out.push(pool[Math.floor(Math.random() * pool.length)].id);
    }
    return out;
  };

  // 1 rare, 2 uncommons, 7 commons (adjust if pools are small)
  return [
    ...pick(rares.length ? rares : setCards, 1),
    ...pick(uncommons.length ? uncommons : setCards, 2),
    ...pick(commons.length ? commons : setCards, count - 3),
  ];
}
