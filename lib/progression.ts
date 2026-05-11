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

// Ordered set progression — each set unlocks when you own ≥60% of its prerequisite.
// prerequisite: null means always unlocked (Base Set).
export const SET_PROGRESSION: Array<{ name: string; prerequisite: string | null }> = [
  { name: 'Base',                     prerequisite: null },
  { name: 'Jungle',                  prerequisite: 'Base' },
  { name: 'Fossil',                  prerequisite: 'Jungle' },
  { name: 'Team Rocket',             prerequisite: 'Fossil' },
  { name: 'Gym Heroes',              prerequisite: 'Team Rocket' },
  { name: 'Gym Challenge',           prerequisite: 'Gym Heroes' },
  { name: 'Neo Genesis',             prerequisite: 'Gym Challenge' },
  { name: 'Neo Discovery',           prerequisite: 'Neo Genesis' },
  { name: 'Wizards Black Star Promos', prerequisite: 'Neo Discovery' },
  { name: 'Neo Revelation',          prerequisite: 'Neo Discovery' },
  { name: 'Neo Destiny',             prerequisite: 'Neo Revelation' },
  { name: 'Expedition Base Set',     prerequisite: 'Neo Destiny' },
  { name: 'Aquapolis',               prerequisite: 'Expedition Base Set' },
  { name: 'Skyridge',                prerequisite: 'Aquapolis' },
  { name: 'Ruby & Sapphire',         prerequisite: 'Skyridge' },
  { name: 'Sandstorm',               prerequisite: 'Ruby & Sapphire' },
  { name: 'Dragon',                  prerequisite: 'Sandstorm' },
  { name: 'Team Magma vs Team Aqua', prerequisite: 'Dragon' },
  { name: 'Hidden Legends',          prerequisite: 'Team Magma vs Team Aqua' },
  { name: 'FireRed & LeafGreen',     prerequisite: 'Hidden Legends' },
];

export const PACK_COST = 30;
export const PACK_BUNDLE_5 = 125;
export const PACK_BUNDLE_10 = 250;
export const THEME_DECK_COST = 150;
export const STARTING_CREDITS = 250;

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
