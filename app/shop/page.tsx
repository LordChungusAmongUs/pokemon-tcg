'use client';
export const dynamic = 'force-dynamic';
import { useState } from 'react';
import Link from 'next/link';
import { useAuthStore } from '@/store/authStore';
import { ALL_CARDS, isSetUnlocked, setCompletionPct } from '@/lib/cardUtils';
import {
  SET_PROGRESSION, PACK_COST, PACK_BUNDLE_5, PACK_BUNDLE_10,
  THEME_DECK_COST, pickPackCards, singleCost, VOUCHER_THRESHOLD, UNLOCK_THRESHOLD,
} from '@/lib/progression';
import { STARTER_DECKS } from '@/lib/starterDecks';
import CardImage from '@/components/cards/CardImage';
import type { CardData } from '@/engine/GameState';

const EXCLUDED = new Set(['Base Set 2', 'Diamond & Pearl']);
const SHOP_SETS = SET_PROGRESSION.filter(s => !EXCLUDED.has(s.name));

export default function ShopPage() {
  const { user, profile, addCredits, addToCollection, collection, freeVouchers, redeemVoucher } = useAuthStore();
  const [packResult, setPackResult] = useState<CardData[]>([]);
  const [packLabel, setPackLabel] = useState('');
  const [tab, setTab] = useState<'packs' | 'decks' | 'singles'>('packs');
  const [singlesSearch, setSinglesSearch] = useState('');
  const [singlesSet, setSinglesSet] = useState('All');

  const credits = profile?.credits ?? 0;

  async function buyPacks(setName: string, count: number) {
    if (!user) { alert('Sign in to buy packs!'); return; }
    const cost = count === 1 ? PACK_COST : count === 5 ? PACK_BUNDLE_5 : PACK_BUNDLE_10;
    if (credits < cost) { alert('Not enough credits!'); return; }
    if (!isSetUnlocked(setName, collection)) {
      const entry = SET_PROGRESSION.find(s => s.name === setName);
      const pct = Math.round(setCompletionPct(entry?.prerequisite ?? '', collection) * 100);
      alert(`Complete 75% of ${entry?.prerequisite} to unlock this set (you have ${pct}%).`);
      return;
    }

    const allSetCards = ALL_CARDS.filter(c => c.set === setName);

    // Basic energy cards (rarity='') are a dedicated pack slot, not commons
    const basicEnergyPool = allSetCards.filter(c => c.supertype === 'Energy' && !c.rarity);
    const setCards = allSetCards
      .filter(c => !basicEnergyPool.some(e => e.id === c.id))
      .map(c => ({ id: c.id, rarity: c.rarity || 'Common' }));

    if (setCards.length === 0) { alert('No cards found for this set.'); return; }

    const pickEnergy = () => basicEnergyPool[Math.floor(Math.random() * basicEnergyPool.length)].id;

    const allIds: string[] = [];
    for (let i = 0; i < count; i++) {
      allIds.push(...pickPackCards(setCards));
      if (basicEnergyPool.length > 0) {
        allIds.push(pickEnergy(), pickEnergy());
      }
    }

    const pickedCards = allIds
      .map(id => ALL_CARDS.find(c => c.id === id))
      .filter(Boolean) as CardData[];

    await addCredits(-cost);
    addToCollection(allIds);
    setPackResult(pickedCards);
    setPackLabel(`${count === 1 ? '1 Pack' : `${count} Packs`} — ${setName}`);
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white p-4">
      {/* Pack result overlay */}
      {packResult.length > 0 && (
        <div className="fixed inset-0 bg-black/85 z-50 flex items-center justify-center p-4">
          <div className="bg-gray-900 rounded-2xl p-6 max-w-2xl w-full max-h-[90vh] flex flex-col overflow-hidden">
            <h2 className="text-xl font-bold text-yellow-400 mb-1">{packLabel}</h2>
            <p className="text-sm text-gray-400 mb-4">{packResult.length} cards received</p>
            <div className="overflow-y-auto flex-1 min-h-0">
              <div className="grid grid-cols-5 sm:grid-cols-6 gap-2">
                {packResult.map((card, i) => (
                  <CardImage key={i} card={card} small />
                ))}
              </div>
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

      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-black text-yellow-400">Shop</h1>
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

        {tab === 'packs' && (
          <div className="space-y-3">
            <div className="flex gap-4 text-xs text-gray-400 mb-2">
              <span>1 pack — {PACK_COST} cr</span>
              <span>5 packs — {PACK_BUNDLE_5} cr (save {PACK_COST * 5 - PACK_BUNDLE_5} cr)</span>
              <span>10 packs — {PACK_BUNDLE_10} cr (save {PACK_COST * 10 - PACK_BUNDLE_10} cr)</span>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {SHOP_SETS.map(({ name, prerequisite }) => {
                const unlocked = isSetUnlocked(name, collection);
                const pct = prerequisite ? Math.round(setCompletionPct(prerequisite, collection) * 100) : 100;
                const voucherPct = Math.round(VOUCHER_THRESHOLD * 100);
                const unlockPct = Math.round(UNLOCK_THRESHOLD * 100);
                const hasVoucher = freeVouchers.includes(name);
                return (
                  <div
                    key={name}
                    className={`rounded-xl p-4 border transition-all ${
                      unlocked ? 'bg-gray-800 border-gray-700' : 'bg-gray-900 border-gray-800 opacity-70'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex-1">
                        <div className="font-bold text-sm">{name}</div>
                        {!unlocked && prerequisite && (
                          <>
                            <div className="text-xs text-yellow-500 mt-0.5">
                              🔒 {prerequisite}: {pct}% / {unlockPct}% to unlock
                            </div>
                            {pct < voucherPct && (
                              <div className="text-[10px] text-gray-500 mt-0.5">
                                At {voucherPct}%: free deck voucher + prerelease invite
                              </div>
                            )}
                          </>
                        )}
                        {unlocked && prerequisite && (
                          <div className="text-xs text-green-500 mt-0.5">✓ Unlocked</div>
                        )}
                        {hasVoucher && (
                          <div className="text-xs text-purple-400 mt-0.5">🎟 Free deck voucher available!</div>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      {[
                        { count: 1, cost: PACK_COST, label: '1 Pack' },
                        { count: 5, cost: PACK_BUNDLE_5, label: '5 Packs' },
                        { count: 10, cost: PACK_BUNDLE_10, label: '10 Packs' },
                      ].map(({ count, cost, label }) => (
                        <button
                          key={count}
                          onClick={() => buyPacks(name, count)}
                          disabled={!unlocked || credits < cost}
                          className="flex-1 py-1.5 bg-yellow-500 hover:bg-yellow-400 disabled:opacity-40 disabled:cursor-not-allowed text-black text-xs font-bold rounded-lg"
                        >
                          {label}
                          <br />
                          <span className="font-normal">{cost} cr</span>
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {tab === 'singles' && (() => {
          const singlesPool = ALL_CARDS.filter(c => !EXCLUDED.has(c.set) && isSetUnlocked(c.set ?? '', collection));
          const setSingles = singlesSet === 'All' ? singlesPool : singlesPool.filter(c => c.set === singlesSet);
          const displayed = setSingles
            .filter(c => !singlesSearch || c.name.toLowerCase().includes(singlesSearch.toLowerCase()));
          const singleSets = ['All', ...Array.from(new Set(singlesPool.map(c => c.set))).sort()];

          async function buySingle(card: CardData) {
            if (!user) { alert('Sign in to buy cards!'); return; }
            const cost = singleCost(card.rarity ?? '');
            if (credits < cost) { alert('Not enough credits!'); return; }
            await addCredits(-cost);
            addToCollection([card.id]);
            alert(`Bought ${card.name}!`);
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

        {tab === 'decks' && (() => {
          const starterDeck = STARTER_DECKS.find(d => d.id === 'custom-fists-and-fire');
          const themeDecks  = STARTER_DECKS.filter(d => d.id !== 'custom-fists-and-fire');

          function DeckButtons({ sd }: { sd: typeof STARTER_DECKS[0] }) {
            // Find which set this deck belongs to — check if any voucher covers it
            const matchingVoucher = freeVouchers.find(v =>
              sd.cardIds.some(id => {
                const card = [...(typeof window !== 'undefined' ? [] : [])];
                void card;
                return id.startsWith('base') && id.split('-')[0];
              })
            ) ?? null;
            // Simpler: any voucher can redeem any theme deck (player chooses which deck to use it on)
            const hasAnyVoucher = freeVouchers.length > 0;
            return (
              <div className="space-y-1.5">
                {hasAnyVoucher && (
                  <button
                    onClick={() => {
                      if (!user) { alert('Sign in first!'); return; }
                      redeemVoucher(freeVouchers[0]);
                      addToCollection(sd.cardIds.filter(id => !id.startsWith('basic-')));
                      alert(`🎟 Voucher used! ${sd.name} added to your collection!`);
                    }}
                    className="w-full py-1.5 bg-purple-600 hover:bg-purple-500 text-white text-sm font-bold rounded-lg"
                  >
                    🎟 Redeem Free Voucher ({freeVouchers.length} left)
                  </button>
                )}
                <button
                  onClick={async () => {
                    if (!user) { alert('Sign in to buy decks!'); return; }
                    if (credits < THEME_DECK_COST) { alert('Not enough credits!'); return; }
                    await addCredits(-THEME_DECK_COST);
                    addToCollection(sd.cardIds.filter(id => !id.startsWith('basic-')));
                    alert(`${sd.name} added to your collection!`);
                  }}
                  disabled={credits < THEME_DECK_COST || !user}
                  className="w-full py-1.5 bg-yellow-500 hover:bg-yellow-400 disabled:opacity-40 disabled:cursor-not-allowed text-black text-sm font-bold rounded-lg"
                >
                  {!user ? 'Sign in to buy' : credits < THEME_DECK_COST ? 'Not enough credits' : 'Buy Deck'}
                </button>
              </div>
            );
          }

          return (
            <div className="space-y-5">
              {/* ── Starter Deck ─────────────────────────────── */}
              {starterDeck && (
                <div>
                  <h3 className="text-xs font-bold text-yellow-400 uppercase tracking-wider mb-2">Starter Deck</h3>
                  <div className="bg-gray-800 rounded-xl p-4 border border-yellow-600/50">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-bold text-lg">{starterDeck.name}</span>
                      <span className="text-[10px] bg-yellow-500 text-black font-bold px-1.5 py-0.5 rounded">STARTER</span>
                    </div>
                    <div className="text-sm text-gray-400 mb-3">{starterDeck.description}</div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-yellow-400 text-sm font-bold">{THEME_DECK_COST} credits</span>
                      <span className="text-xs text-gray-500">{starterDeck.cardIds.length} cards</span>
                    </div>
                    <DeckButtons sd={starterDeck} />
                    <Link href="/deck-builder" className="mt-2 block text-center py-1 text-xs text-gray-400 hover:text-white">
                      Use in Builder →
                    </Link>
                  </div>
                </div>
              )}

              {/* ── Theme Decks ───────────────────────────────── */}
              <div>
                <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Theme Decks</h3>
                <p className="text-xs text-gray-500 mb-3">Each costs {THEME_DECK_COST} credits.</p>
                <div className="grid gap-3 sm:grid-cols-2">
                  {themeDecks.map(sd => (
                    <div key={sd.id} className="bg-gray-800 rounded-xl p-4 border border-gray-700">
                      <div className="font-bold mb-1">{sd.name}</div>
                      <div className="text-sm text-gray-400 mb-3">{sd.description}</div>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-yellow-400 text-sm font-bold">{THEME_DECK_COST} credits</span>
                        <span className="text-xs text-gray-500">{sd.cardIds.length} cards</span>
                      </div>
                      <DeckButtons sd={sd} />
                      <Link href="/deck-builder" className="mt-2 block text-center py-1 text-xs text-gray-400 hover:text-white">
                        Use in Builder →
                      </Link>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          );
        })()}
      </div>
    </div>
  );
}
