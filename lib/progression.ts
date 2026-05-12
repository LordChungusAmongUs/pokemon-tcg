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
  winAI: 50,
  loseAI: 25,
  winPvp: 100,
  losePvp: 25,
  daily: 100,
  levelUp: 100,
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

export const VOUCHER_THRESHOLD  = 0.60; // hit this → free deck voucher + prerelease invite
export const UNLOCK_THRESHOLD   = 0.75; // hit this → next set packs become purchasable

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

// Returns 9 cards: 1 rare slot, 3 uncommon, 5 common
// Rare slot is 2:1 regular rare vs holo/super rare
export function pickPackCards(setCards: { id: string; rarity: string }[]): string[] {
  if (setCards.length === 0) return [];

  const allRares     = setCards.filter(c => rarityWeight(c.rarity) === 'Rare');
  const holos        = allRares.filter(c => c.rarity.toLowerCase() !== 'rare');
  const regularRares = allRares.filter(c => c.rarity.toLowerCase() === 'rare');
  const uncommons    = setCards.filter(c => rarityWeight(c.rarity) === 'Uncommon');
  const commons      = setCards.filter(c => rarityWeight(c.rarity) === 'Common');

  const rnd = (pool: { id: string }[]): string =>
    pool[Math.floor(Math.random() * pool.length)].id;

  // Pick n unique cards (no duplicates within a pack slot)
  const pickN = (preferred: typeof setCards, fallback: typeof setCards, n: number): string[] => {
    const pool = [...(preferred.length > 0 ? preferred : fallback)];
    const out: string[] = [];
    for (let i = 0; i < n && pool.length > 0; i++) {
      const idx = Math.floor(Math.random() * pool.length);
      out.push(pool[idx].id);
      pool.splice(idx, 1);
    }
    return out;
  };

  // Rare slot: 1/3 holo, 2/3 regular rare; fall back gracefully if one pool is empty
  let rareId: string;
  if (allRares.length === 0) {
    rareId = rnd(uncommons.length > 0 ? uncommons : setCards);
  } else if (holos.length === 0 || regularRares.length === 0) {
    rareId = rnd(allRares);
  } else {
    rareId = Math.random() < 1 / 3 ? rnd(holos) : rnd(regularRares);
  }

  return [
    rareId,
    ...pickN(uncommons, setCards, 3),
    ...pickN(commons, setCards, 5),
  ];
}
