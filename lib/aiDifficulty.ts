/**
 * AI Difficulty progression system.
 * New players start at Tier 1.
 * 3 consecutive wins → move up a tier (max 5).
 * 3 consecutive losses → move down a tier (min 1).
 */

import type { AIDifficulty } from '@/ai/deckGenerator';

const TIER_KEY   = 'pokemon-tcg-ai-tier';
const STREAK_KEY = 'pokemon-tcg-ai-streak';

export interface StreakData {
  type: 'win' | 'loss' | null;
  count: number;
}

export interface GameResultOutcome {
  tier: AIDifficulty;
  promoted: boolean;
  demoted: boolean;
  streak: StreakData;
}

export function getAITier(): AIDifficulty {
  if (typeof window === 'undefined') return 1;
  try {
    const v = parseInt(localStorage.getItem(TIER_KEY) ?? '1', 10);
    if (v >= 1 && v <= 5) return v as AIDifficulty;
  } catch { /* ignore */ }
  return 1;
}

export function setAITier(tier: AIDifficulty): void {
  if (typeof window === 'undefined') return;
  try { localStorage.setItem(TIER_KEY, String(tier)); } catch { /* ignore */ }
}

export function getStreakData(): StreakData {
  if (typeof window === 'undefined') return { type: null, count: 0 };
  try {
    const raw = localStorage.getItem(STREAK_KEY);
    if (raw) return JSON.parse(raw) as StreakData;
  } catch { /* ignore */ }
  return { type: null, count: 0 };
}

function saveStreak(streak: StreakData): void {
  if (typeof window === 'undefined') return;
  try { localStorage.setItem(STREAK_KEY, JSON.stringify(streak)); } catch { /* ignore */ }
}

/**
 * Call after each vs-AI game to update streak + maybe advance/retreat tier.
 * Returns the new tier and whether the player was promoted or demoted.
 */
export function recordAIGameResult(won: boolean): GameResultOutcome {
  const current = getAITier();
  const streak   = getStreakData();

  const resultType: 'win' | 'loss' = won ? 'win' : 'loss';
  const newCount = streak.type === resultType ? streak.count + 1 : 1;

  let newTier   = current;
  let promoted  = false;
  let demoted   = false;
  let newStreak: StreakData = { type: resultType, count: newCount };

  if (newCount >= 3) {
    if (won && current < 5) {
      newTier  = (current + 1) as AIDifficulty;
      promoted = true;
    } else if (!won && current > 1) {
      newTier = (current - 1) as AIDifficulty;
      demoted = true;
    }
    // Reset streak after a tier change (or hitting cap)
    newStreak = { type: null, count: 0 };
  }

  setAITier(newTier);
  saveStreak(newStreak);

  return { tier: newTier, promoted, demoted, streak: newStreak };
}

/** Returns human-readable progress string, e.g. "🏆🏆⬜" */
export function streakDisplay(streak: StreakData): string {
  if (!streak.type || streak.count === 0) return '⬜⬜⬜';
  const icon = streak.type === 'win' ? '🏆' : '💀';
  const filled = Math.min(streak.count, 3);
  return icon.repeat(filled) + '⬜'.repeat(3 - filled);
}
