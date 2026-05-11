'use client';
export const dynamic = 'force-dynamic';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/authStore';
import { ALL_CARDS } from '@/lib/cardUtils';
import {
  SET_UNLOCK_LEVELS, isSetUnlocked, PACK_COST, THEME_DECK_COST,
  pickPackCards, computeLevel,
} from '@/lib/progression';
import { STARTER_DECKS } from '@/lib/starterDecks';
import CardImage from '@/components/cards/CardImage';
import type { CardData } from '@/engine/GameState';

const EXCLUDED = new Set(['Base Set 2', 'Diamond & Pearl']);
const SHOP_SETS = Object.entries(SET_UNLOCK_LEVELS)
  .filter(([s]) => !EXCLUDED.has(s))
  .sort((a, b) => a[1] - b[1])
  .map(([name, level]) => ({ name, level }));

export default function ShopPage() {
  const { user, profile, addCredits, addXP } = useAuthStore();
  const router = useRouter();
  const [packResult, setPackResult] = useState<CardData[]>([]);
  const [packSet, setPackSet] = useState('');
  const [tab, setTab] = useState<'packs' | 'decks'>('packs');

  const credits = profile?.credits ?? 0;
  const level = profile?.level ?? 1;

  if (!user) {
    return (
      <div className="min-h-screen bg-gray-950 text-white flex items-center justify-center">
        <div className="text-center space-y-4">
          <p className="text-gray-400">Sign in to access the shop.</p>
          <Link href="/login" className="text-yellow-400 underline">Sign in</Link>
        </div>
      </div>
    );
  }

  async function buyPack(setName: string) {
    if (credits < PACK_COST) { alert('Not enough credits!'); return; }
    if (!isSetUnlocked(setName, level)) { alert(`Unlock this set at level ${SET_UNLOCK_LEVELS[setName]}!`); return; }

    const setCards = ALL_CARDS
      .filter(c => c.set === setName)
      .map(c => ({ id: c.id, rarity: c.rarity || 'Common' }));

    if (setCards.length === 0) { alert('No cards found for this set.'); return; }

    const pickedIds = pickPackCards(setCards);
    const pickedCards = pickedIds
      .map(id => ALL_CARDS.find(c => c.id === id))
      .filter(Boolean) as CardData[];

    await addCredits(-PACK_COST);
    await addXP(25); // bonus XP for opening a pack
    setPackResult(pickedCards);
    setPackSet(setName);
  }

  async function buyThemeDeck(deckId: string) {
    const sd = STARTER_DECKS.find(s => s.id === deckId);
    if (!sd) return;
    if (credits < THEME_DECK_COST) { alert('Not enough credits!'); return; }
    await addCredits(-THEME_DECK_COST);
    alert(`${sd.name} theme deck is now available in the Deck Builder!`);
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white p-4">
      {/* Header */}
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-black text-yellow-400">Shop</h1>
            <p className="text-sm text-gray-400">Level {level} Trainer</p>
          </div>
          <div className="flex items-center gap-4">
            <div className="bg-yellow-500/20 border border-yellow-500/50 rounded-xl px-4 py-2 text-center">
              <div className="text-xl font-bold text-yellow-400">{credits}</div>
              <div className="text-xs text-gray-400">Credits</div>
            </div>
            <Link href="/" className="text-gray-400 hover:text-white text-sm">← Home</Link>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-6">
          {(['packs', 'decks'] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-2 rounded-xl text-sm font-bold capitalize transition-all ${
                tab === t ? 'bg-yellow-500 text-black' : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
              }`}
            >
              {t === 'packs' ? '📦 Booster Packs' : '🃏 Theme Decks'}
            </button>
          ))}
        </div>

        {/* Pack result overlay */}
        {packResult.length > 0 && (
          <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
            <div className="bg-gray-900 rounded-2xl p-6 max-w-lg w-full">
              <h2 className="text-xl font-bold text-yellow-400 mb-1">{packSet} Pack Opened!</h2>
              <p className="text-sm text-gray-400 mb-4">You received {packResult.length} cards</p>
              <div className="grid grid-cols-5 gap-2">
                {packResult.map((card, i) => (
                  <CardImage key={i} card={card} small />
                ))}
              </div>
              <button
                onClick={() => setPackResult([])}
                className="mt-4 w-full py-2 bg-yellow-500 hover:bg-yellow-400 text-black font-bold rounded-xl"
              >
                Collect Cards
              </button>
            </div>
          </div>
        )}

        {tab === 'packs' && (
          <div className="space-y-3">
            <p className="text-sm text-gray-400">Each pack contains 10 cards (1 rare, 2 uncommon, 7 common).</p>
            <div className="grid gap-3 sm:grid-cols-2">
              {SHOP_SETS.map(({ name, level: reqLevel }) => {
                const unlocked = isSetUnlocked(name, level);
                return (
                  <div
                    key={name}
                    className={`rounded-xl p-4 border transition-all ${
                      unlocked
                        ? 'bg-gray-800 border-gray-700'
                        : 'bg-gray-900 border-gray-800 opacity-60'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div>
                        <div className="font-bold text-sm">{name}</div>
                        {!unlocked && (
                          <div className="text-xs text-yellow-500">Unlocks at Level {reqLevel}</div>
                        )}
                      </div>
                      <span className="text-yellow-400 font-bold text-sm">{PACK_COST} cr</span>
                    </div>
                    <button
                      onClick={() => buyPack(name)}
                      disabled={!unlocked || credits < PACK_COST}
                      className="w-full py-1.5 bg-yellow-500 hover:bg-yellow-400 disabled:opacity-40 disabled:cursor-not-allowed text-black text-sm font-bold rounded-lg"
                    >
                      {unlocked ? 'Buy Pack' : `Level ${reqLevel} Required`}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {tab === 'decks' && (
          <div className="space-y-3">
            <p className="text-sm text-gray-400">Theme decks are pre-built 60-card decks, always available in the Deck Builder.</p>
            <div className="grid gap-3 sm:grid-cols-2">
              {STARTER_DECKS.map(sd => (
                <div key={sd.id} className="bg-gray-800 rounded-xl p-4 border border-gray-700">
                  <div className="font-bold mb-1">{sd.name}</div>
                  <div className="text-sm text-gray-400 mb-3">{sd.description}</div>
                  <div className="flex items-center justify-between">
                    <span className="text-green-400 text-sm font-bold">Always Free</span>
                    <span className="text-xs text-gray-500">60 cards</span>
                  </div>
                  <Link
                    href="/deck-builder"
                    className="mt-2 block text-center py-1.5 bg-yellow-500 hover:bg-yellow-400 text-black text-sm font-bold rounded-lg"
                  >
                    Use in Builder
                  </Link>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
