'use client';
export const dynamic = 'force-dynamic';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/authStore';
import { ALL_CARDS } from '@/lib/cardUtils';
import {
  SET_UNLOCK_LEVELS, isSetUnlocked, PACK_COST, THEME_DECK_COST,
  pickPackCards, computeLevel, singleCost,
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
  const [packResult, setPackResult] = useState<CardData[]>([]);
  const [packSet, setPackSet] = useState('');
  const [tab, setTab] = useState<'packs' | 'decks' | 'singles'>('packs');
  const [singlesSearch, setSinglesSearch] = useState('');
  const [singlesSet, setSinglesSet] = useState('All');

  const credits = profile?.credits ?? 0;
  const level = profile?.level ?? 1;

  async function buyPack(setName: string) {
    if (!user) { alert('Sign in to buy packs!'); return; }
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
        <div className="flex gap-2 mb-6 flex-wrap">
          {[
            { id: 'packs', label: '📦 Booster Packs' },
            { id: 'singles', label: '🎴 Singles' },
            { id: 'decks', label: '🃏 Theme Decks' },
          ].map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id as typeof tab)}
              className={`px-4 py-2 rounded-xl text-sm font-bold transition-all ${
                tab === t.id ? 'bg-yellow-500 text-black' : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
              }`}
            >
              {t.label}
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

        {tab === 'singles' && (() => {
          const EXCLUDED = new Set(['Base Set 2', 'Diamond & Pearl']);
          const singlesPool = ALL_CARDS.filter(c => !EXCLUDED.has(c.set) && isSetUnlocked(c.set ?? '', level));
          const setSingles = singlesSet === 'All' ? singlesPool : singlesPool.filter(c => c.set === singlesSet);
          const displayed = setSingles
            .filter(c => !singlesSearch || c.name.toLowerCase().includes(singlesSearch.toLowerCase()))
            .slice(0, 60);
          const singleSets = ['All', ...Array.from(new Set(singlesPool.map(c => c.set))).sort()];

          async function buySingle(card: CardData) {
            if (!user) { alert('Sign in to buy cards!'); return; }
            const cost = singleCost(card.rarity ?? '');
            if (credits < cost) { alert('Not enough credits!'); return; }
            await addCredits(-cost);
            alert(`Bought ${card.name}! (${cost} credits)`);
          }

          return (
            <div className="space-y-3">
              <div className="flex gap-2">
                <input
                  value={singlesSearch}
                  onChange={e => setSinglesSearch(e.target.value)}
                  placeholder="Search cards..."
                  className="flex-1 bg-gray-800 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 ring-yellow-500"
                />
                <select
                  value={singlesSet}
                  onChange={e => setSinglesSet(e.target.value)}
                  className="bg-gray-800 rounded-lg px-2 py-2 text-sm"
                >
                  {singleSets.map(s => <option key={s}>{s}</option>)}
                </select>
              </div>
              <div className="text-xs text-gray-500">Common 3cr · Uncommon 5cr · Rare 15cr · Holo 50cr · Promo 25cr</div>
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3">
                {displayed.map(card => {
                  const cost = singleCost(card.rarity ?? '');
                  const canAfford = credits >= cost;
                  return (
                    <div key={card.id} className="flex flex-col items-center gap-1">
                      <div className="relative">
                        <CardImage card={card} small dimmed={!canAfford} onClick={() => buySingle(card)} />
                        <span className="absolute bottom-1 left-0 right-0 text-center text-[10px] font-bold bg-black/70 text-yellow-300">
                          {cost}cr
                        </span>
                      </div>
                      <span className="text-[9px] text-gray-400 text-center w-full truncate">{card.name}</span>
                    </div>
                  );
                })}
              </div>
              {displayed.length === 0 && <p className="text-gray-500 text-sm text-center py-8">No cards found.</p>}
            </div>
          );
        })()}

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
