export interface RankTier {
  name: string;
  minElo: number;
  color: string;
  emoji: string;
}

export const RANK_TIERS: RankTier[] = [
  { name: 'Bronze',   minElo: 0,    color: 'text-orange-700', emoji: '🥉' },
  { name: 'Silver',   minElo: 400,  color: 'text-gray-400',   emoji: '🥈' },
  { name: 'Gold',     minElo: 700,  color: 'text-yellow-400', emoji: '🥇' },
  { name: 'Platinum', minElo: 1000, color: 'text-cyan-400',   emoji: '💎' },
  { name: 'Diamond',  minElo: 1400, color: 'text-blue-400',   emoji: '💠' },
  { name: 'Master',   minElo: 1800, color: 'text-purple-400', emoji: '👑' },
];

export function getRank(elo: number): RankTier {
  for (let i = RANK_TIERS.length - 1; i >= 0; i--) {
    if (elo >= RANK_TIERS[i].minElo) return RANK_TIERS[i];
  }
  return RANK_TIERS[0];
}

export function calcEloChange(winnerElo: number, loserElo: number, won: boolean): number {
  const K = 32;
  const expected = 1 / (1 + Math.pow(10, (loserElo - winnerElo) / 400));
  const actual = won ? 1 : 0;
  return Math.round(K * (actual - expected));
}

export type AIDifficulty = 'easy' | 'medium' | 'hard' | 'expert';

export function getAIDifficulty(playerElo: number): AIDifficulty {
  if (playerElo < 400)  return 'easy';
  if (playerElo < 800)  return 'medium';
  if (playerElo < 1300) return 'hard';
  return 'expert';
}
