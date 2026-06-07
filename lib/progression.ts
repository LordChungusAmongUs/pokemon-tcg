import { ALL_CARDS } from './cardUtils';

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
  perPrize: 5,       // credits per prize card taken
  winBonus: 20,      // flat bonus for winning
} as const;

// Multiplier applied to credits earned based on AI difficulty tier
export const TIER_MULTIPLIERS: Record<number, number> = {
  1: 1.0,
  2: 1.2,
  3: 1.5,
  4: 1.75,
  5: 2.0,
};

/** Compute credits earned at game end.
 *  formula = floor((prizesTaken × 5 + (won ? 20 : 0)) × tierMultiplier)
 */
export function computeGameCredits(
  prizesTaken: number,
  won: boolean,
  aiTier: number,
): number {
  const multiplier = TIER_MULTIPLIERS[aiTier] ?? 1.0;
  const base = prizesTaken * CREDIT_REWARDS.perPrize + (won ? CREDIT_REWARDS.winBonus : 0);
  return Math.floor(base * multiplier);
}

export type LevelRewardType = 'credits' | 'rare-voucher' | 'holo-voucher' | 'deck-voucher' | 'pack-voucher' | 'promo';

export interface LevelReward {
  type: LevelRewardType;
  amount?: number;
  label: string;
}

// Reward earned when reaching `level`. Called for levels 2, 3, 4, …
export function getLevelUpReward(level: number): LevelReward {
  if (level % 10 === 0) return { type: 'credits',      amount: 500, label: '500 Credits' };
  if (level % 5  === 0) return { type: 'deck-voucher',              label: 'Theme Deck Voucher' };
  const table: LevelReward[] = [
    { type: 'credits',      amount:  50, label:  '50 Credits' },
    { type: 'pack-voucher',              label: 'Booster Pack Voucher' },
    { type: 'credits',      amount: 100, label: '100 Credits' },
    { type: 'rare-voucher',              label: 'Random Rare Card' },
    { type: 'credits',      amount: 100, label: '100 Credits' },
    { type: 'pack-voucher',              label: 'Booster Pack Voucher' },
    { type: 'holo-voucher',              label: 'Random Holo Rare Card' },
    { type: 'credits',      amount: 250, label: '250 Credits' },
    { type: 'promo',                     label: 'Wizards Black Star Promo' },
  ];
  return table[(level - 1) % table.length];
}

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
  { name: 'Wizards Black Star Promos', prerequisite: null },
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
export const STARTING_CREDITS = 500;

// Promo IDs awarded for participating in Draft / Sealed events (#1-20 and #22-28)
export const EVENT_PROMO_IDS: string[] = [
  ...Array.from({ length: 20 }, (_, i) => `basep-${i + 1}`),  // basep-1 … basep-20
  ...Array.from({ length: 7 },  (_, i) => `basep-${i + 22}`), // basep-22 … basep-28
];

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
//
// collection (optional): combined persistent + session counts used for balance.
// Gap limits per rarity tier: Holo=2, Rare=3, Uncommon=4, Common=6.
// A card is only eligible if count < min_count_in_tier + gap_limit.
// This ensures no card in a tier runs ahead of the rest by more than the limit.
export function pickPackCards(
  setCards: { id: string; rarity: string }[],
  collection?: Record<string, number>,
): string[] {
  if (setCards.length === 0) return [];

  const col = collection ?? {};

  // Balance helper: filter pool so no card leads its tier minimum by more than `limit`
  function bal(pool: { id: string; rarity: string }[], limit: number): typeof pool {
    if (pool.length === 0) return pool;
    const minCount = pool.reduce((m, c) => Math.min(m, col[c.id] ?? 0), Infinity);
    const threshold = (isFinite(minCount) ? minCount : 0) + limit;
    const eligible = pool.filter(c => (col[c.id] ?? 0) < threshold);
    return eligible.length > 0 ? eligible : pool; // always fall back so pool never empties
  }

  const allRares     = setCards.filter(c => rarityWeight(c.rarity) === 'Rare');
  const holos        = allRares.filter(c => c.rarity.toLowerCase() !== 'rare');
  const regularRares = allRares.filter(c => c.rarity.toLowerCase() === 'rare');
  const uncommons    = setCards.filter(c => rarityWeight(c.rarity) === 'Uncommon');
  const commons      = setCards.filter(c => rarityWeight(c.rarity) === 'Common');

  // Apply balance filtering per rarity tier
  const balHolos        = bal(holos, 2);
  const balRegularRares = bal(regularRares, 3);
  const balUncommons    = bal(uncommons, 4);
  const balCommons      = bal(commons, 6);

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
    rareId = rnd(balUncommons.length > 0 ? balUncommons : setCards);
  } else if (holos.length === 0 || regularRares.length === 0) {
    const balAll = [...balHolos, ...balRegularRares];
    rareId = rnd(balAll.length > 0 ? balAll : allRares);
  } else {
    rareId = Math.random() < 1 / 3 ? rnd(balHolos) : rnd(balRegularRares);
  }

  return [
    rareId,
    ...pickN(balUncommons, setCards, 3),
    ...pickN(balCommons, setCards, 5),
  ];
}

// Generate all card IDs for one booster pack of a given set (9 non-energy + 2 energy)
// collection: combined persistent + session counts for balance (gap limit 10 for energy)
export function generatePackCards(setName: string, collection?: Record<string, number>): string[] {
  const allSetCards = ALL_CARDS.filter(c => c.set === setName);
  const basicEnergyPool = allSetCards.filter(c => c.supertype === 'Energy' && !c.rarity);
  const setCards = allSetCards
    .filter(c => !basicEnergyPool.some(e => e.id === c.id))
    .map(c => ({ id: c.id, rarity: c.rarity || 'Common' }));
  if (setCards.length === 0) return [];

  const col = collection ?? {};
  const ids = [...pickPackCards(setCards, collection)];

  if (basicEnergyPool.length > 0) {
    // Balance energy: no energy type more than min_energy_count + 10
    const minEnergyCount = basicEnergyPool.reduce((m, c) => Math.min(m, col[c.id] ?? 0), Infinity);
    const energyThreshold = (isFinite(minEnergyCount) ? minEnergyCount : 0) + 10;
    const balEnergy = basicEnergyPool.filter(c => (col[c.id] ?? 0) < energyThreshold);
    const energyPool = balEnergy.length > 0 ? balEnergy : basicEnergyPool;
    const pickEnergy = () => energyPool[Math.floor(Math.random() * energyPool.length)].id;
    ids.push(pickEnergy(), pickEnergy());
  }

  return ids;
}
