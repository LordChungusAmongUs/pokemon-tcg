'use client';
export const dynamic = 'force-dynamic';
import { useState } from 'react';
import Link from 'next/link';
import { useAuthStore } from '@/store/authStore';
import { ALL_CARDS, isSetUnlocked, setCompletionPct } from '@/lib/cardUtils';
import {
  SET_PROGRESSION, PACK_COST, PACK_BUNDLE_5, PACK_BUNDLE_10,
  THEME_DECK_COST, generatePackCards, singleCost, VOUCHER_THRESHOLD, UNLOCK_THRESHOLD,
} from '@/lib/progression';
import { STARTER_DECKS } from '@/lib/starterDecks';
import CardImage from '@/components/cards/CardImage';
import type { CardData } from '@/engine/GameState';

const EXCLUDED = new Set(['Base Set 2', 'Diamond & Pearl', 'Wizards Black Star Promos']);
const SHOP_SETS = SET_PROGRESSION.filter(s => !EXCLUDED.has(s.name));

export default function ShopPage() {
  const { user, profile, addCredits, addToCollection, collection, encountered, freeVouchers, redeemVoucher, saveDeck, isLocalGuest, packVouchers, usePackVoucher, unopenedPacks, addUnopenedPacks, consumeOnePack, completedPrereleases } = useAuthStore();
  const [packResult, setPackResult] = useState<CardData[]>([]);
  const [packLabel, setPackLabel] = useState('');
  const [openingSet, setOpeningSet] = useState<string | null>(null);
  const [previewSet, setPreviewSet] = useState<string | null>(null);
  const [previewDeckId, setPreviewDeckId] = useState<string | null>(null);
  const [previewSingleCard, setPreviewSingleCard] = useState<CardData | null>(null);
  const [tab, setTab] = useState<'packs' | 'decks' | 'singles'>('packs');
  const [singlesSearch, setSinglesSearch] = useState('');
  const [singlesSet, setSinglesSet] = useState('All');

  const credits = profile?.credits ?? 0;

  async function redeemPackVoucher(setName: string) {
    if (!user) { alert('Sign in first!'); return; }
    if (!isSetUnlocked(setName, collection)) { alert('This set is not unlocked yet.'); return; }
    usePackVoucher();
    addUnopenedPacks(setName, 1);
    alert(`1 ${setName} pack added to your inventory!`);
  }

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
    await addCredits(-cost);
    addUnopenedPacks(setName, count);
  }

  function openOnePack(setName: string) {
    if (!consumeOnePack(setName)) return;
    const ids = generatePackCards(setName, collection);
    const cards = ids.map(id => ALL_CARDS.find(c => c.id === id)).filter(Boolean) as CardData[];
    addToCollection(ids);
    setPackResult(cards);
    setPackLabel(`1 Pack — ${setName}`);
  }

  function openAllPacks(setName: string) {
    const count = unopenedPacks[setName] ?? 0;
    if (count === 0) return;
    const allIds: string[] = [];
    // Maintain a running temp collection so balance tracks across packs opened this session
    const tempCollection: Record<string, number> = { ...collection };
    for (let i = 0; i < count; i++) {
      consumeOnePack(setName);
      const packIds = generatePackCards(setName, tempCollection);
      for (const id of packIds) tempCollection[id] = (tempCollection[id] ?? 0) + 1;
      allIds.push(...packIds);
    }
    const cards = allIds.map(id => ALL_CARDS.find(c => c.id === id)).filter(Boolean) as CardData[];
    addToCollection(allIds);
    setPackResult(cards);
    setPackLabel(`${count} Pack${count > 1 ? 's' : ''} — ${setName}`);
  }

  function saveThemeDeckToBuilder(sd: typeof STARTER_DECKS[0]) {
    if (user && !isLocalGuest) {
      saveDeck(sd.name, sd.cardIds);
    } else {
      try {
        const key = 'pokemon-tcg-decks';
        const all: { name: string; cardIds: string[] }[] = JSON.parse(localStorage.getItem(key) || '[]');
        if (!all.find(d => d.name === sd.name)) {
          all.push({ name: sd.name, cardIds: sd.cardIds });
          localStorage.setItem(key, JSON.stringify(all));
        }
      } catch {}
    }
  }

  function showDeckCards(sd: typeof STARTER_DECKS[0], label: string) {
    const nonEnergyIds = sd.cardIds.filter(id => !id.startsWith('basic-'));
    const cards = nonEnergyIds.map(id => ALL_CARDS.find(c => c.id === id)).filter(Boolean) as CardData[];
    setPackResult(cards);
    setPackLabel(label);
  }

  function deckCollectionIds(sd: typeof STARTER_DECKS[0]): string[] {
    // Non-energy cards + one of each unique basic energy type (unlocks that type)
    const nonEnergy = sd.cardIds.filter(id => !id.startsWith('basic-energy-'));
    const energyTypes = [...new Set(sd.cardIds.filter(id => id.startsWith('basic-energy-')))];
    return [...nonEnergy, ...energyTypes];
  }

  async function handleBuyDeck(sd: typeof STARTER_DECKS[0]) {
    if (!user) { alert('Sign in to buy decks!'); return; }
    if (credits < THEME_DECK_COST) { alert('Not enough credits!'); return; }
    await addCredits(-THEME_DECK_COST);
    addToCollection(deckCollectionIds(sd));
    saveThemeDeckToBuilder(sd);
    showDeckCards(sd, `${sd.name} — Theme Deck`);
  }

  function handleRedeemVoucher(sd: typeof STARTER_DECKS[0]) {
    if (!user) { alert('Sign in first!'); return; }
    redeemVoucher(freeVouchers[0]);
    addToCollection(deckCollectionIds(sd));
    saveThemeDeckToBuilder(sd);
    showDeckCards(sd, `🎟 ${sd.name} — Voucher Redeemed`);
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white p-4">
      {/* Pack preview overlay */}
      {previewSet && (() => {
        const setCards = ALL_CARDS.filter(c => c.set === previewSet && c.supertype !== 'Energy');
        const seen = setCards.filter(c => encountered.has(c.id) || (collection[c.id] ?? 0) > 0);
        const unknownCount = setCards.length - seen.length;
        return (
          <div className="fixed inset-0 bg-black/85 z-50 flex items-center justify-center p-4">
            <div className="bg-gray-900 rounded-2xl p-5 max-w-2xl w-full max-h-[90vh] flex flex-col">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h2 className="text-lg font-bold text-yellow-400">{previewSet} — Set Preview</h2>
                  <p className="text-xs text-gray-400">
                    {seen.length} revealed · {unknownCount} unknown — own or encounter cards to reveal them
                  </p>
                </div>
                <button onClick={() => setPreviewSet(null)} className="text-gray-400 hover:text-white text-2xl leading-none ml-4">×</button>
              </div>
              <div className="overflow-y-auto flex-1 min-h-0">
                <div className="grid grid-cols-5 sm:grid-cols-6 gap-2">
                  {seen.map(card => <CardImage key={card.id} card={card} small />)}
                  {Array.from({ length: unknownCount }).map((_, i) => (
                    <div key={i} className="aspect-[2/3] bg-gray-800 rounded-lg border border-gray-700 flex items-center justify-center">
                      <span className="text-gray-600 text-xs">?</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Single card preview overlay */}
      {previewSingleCard && (() => {
        const card = previewSingleCard;
        const cost = singleCost(card.rarity ?? '');
        const canAfford = credits >= cost;
        const owned = collection[card.id] ?? 0;
        async function confirmBuy() {
          if (!user) { alert('Sign in to buy cards!'); return; }
          if (credits < cost) { alert('Not enough credits!'); return; }
          await addCredits(-cost);
          addToCollection([card.id]);
          setPreviewSingleCard(null);
        }
        return (
          <div className="fixed inset-0 bg-black/85 z-50 flex items-center justify-center p-4"
            onClick={() => setPreviewSingleCard(null)}>
            <div className="bg-gray-900 rounded-2xl p-5 max-w-xs w-full flex flex-col items-center gap-3"
              onClick={e => e.stopPropagation()}>
              <CardImage card={card} />
              <div className="text-center">
                <p className="font-bold text-white">{card.name}</p>
                <p className="text-xs text-gray-400">{card.set} · {card.rarity}</p>
                <p className="text-xs text-gray-500 mt-0.5">You own: {owned}</p>
              </div>
              <button
                onClick={confirmBuy}
                disabled={!canAfford || !user}
                className="w-full py-2.5 bg-yellow-500 hover:bg-yellow-400 disabled:opacity-40 disabled:cursor-not-allowed text-black font-bold rounded-xl"
              >
                {!user ? 'Sign in to buy' : !canAfford ? 'Not enough credits' : `Buy — ${cost} cr`}
              </button>
              <button onClick={() => setPreviewSingleCard(null)}
                className="w-full py-2 bg-gray-700 hover:bg-gray-600 text-white text-sm rounded-xl">
                Cancel
              </button>
            </div>
          </div>
        );
      })()}

      {/* Deck preview overlay */}
      {previewDeckId && (() => {
        const sd = STARTER_DECKS.find(d => d.id === previewDeckId);
        if (!sd) return null;
        const nonEnergyIds = sd.cardIds.filter(id => !id.startsWith('basic-'));
        const cards = nonEnergyIds.map(id => ALL_CARDS.find(c => c.id === id)).filter(Boolean) as CardData[];
        // Count unique energy types in deck
        const energyTypes = [...new Set(sd.cardIds.filter(id => id.startsWith('basic-energy-')).map(id => id.replace('basic-energy-', '')))];
        return (
          <div className="fixed inset-0 bg-black/85 z-50 flex items-center justify-center p-4"
            onClick={() => setPreviewDeckId(null)}>
            <div className="bg-gray-900 rounded-2xl p-5 max-w-2xl w-full max-h-[90vh] flex flex-col"
              onClick={e => e.stopPropagation()}>
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h2 className="text-lg font-bold text-yellow-400">{sd.name}</h2>
                  <p className="text-xs text-gray-400">{sd.description}</p>
                  {energyTypes.length > 0 && (
                    <p className="text-xs text-gray-500 mt-0.5">Energy: {energyTypes.join(', ')}</p>
                  )}
                </div>
                <button onClick={() => setPreviewDeckId(null)}
                  className="text-gray-400 hover:text-white text-2xl leading-none ml-4">×</button>
              </div>
              <div className="overflow-y-auto flex-1 min-h-0">
                <div className="grid grid-cols-5 sm:grid-cols-6 gap-2">
                  {cards.map((card, i) => <CardImage key={i} card={card} small />)}
                </div>
              </div>
            </div>
          </div>
        );
      })()}

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
              {packLabel.includes('Theme Deck') || packLabel.includes('Voucher') ? '✅ Take Deck' : '✅ Collect Cards'}
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
            {packVouchers > 0 && (
              <div className="bg-purple-500/20 border border-purple-500/50 rounded-xl px-3 py-2 text-center">
                <div className="text-lg font-bold text-purple-300">{packVouchers}</div>
                <div className="text-xs text-gray-400">Pack 🎟</div>
              </div>
            )}
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
          <div className="space-y-5">
            {/* Unopened pack inventory */}
            {Object.keys(unopenedPacks).length > 0 && (
              <div className="bg-blue-950 border border-blue-700 rounded-xl p-4 space-y-3">
                <h3 className="text-sm font-bold text-blue-300">📦 Your Unopened Packs</h3>
                <div className="space-y-2">
                  {Object.entries(unopenedPacks).filter(([, n]) => n > 0).map(([setName, count]) => (
                    <div key={setName} className="flex items-center justify-between bg-blue-900/50 rounded-lg px-3 py-2">
                      <div>
                        <span className="font-semibold text-white text-sm">{setName}</span>
                        <span className="ml-2 text-blue-300 text-sm">× {count}</span>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => openOnePack(setName)}
                          className="px-3 py-1 bg-yellow-500 hover:bg-yellow-400 text-black text-xs font-bold rounded-lg"
                        >
                          Open 1
                        </button>
                        {count > 1 && (
                          <button
                            onClick={() => openAllPacks(setName)}
                            className="px-3 py-1 bg-yellow-600 hover:bg-yellow-500 text-black text-xs font-bold rounded-lg"
                          >
                            Open All ({count})
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
                <p className="text-xs text-blue-400">Unopened packs can also be used to enter Draft and Sealed events.</p>
              </div>
            )}

            <div className="flex gap-4 text-xs text-gray-400 mb-2">
              <span>1 pack — {PACK_COST} cr</span>
              <span>5 packs — {PACK_BUNDLE_5} cr (save {PACK_COST * 5 - PACK_BUNDLE_5} cr)</span>
              <span>10 packs — {PACK_BUNDLE_10} cr (save {PACK_COST * 10 - PACK_BUNDLE_10} cr)</span>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {SHOP_SETS.map(({ name, prerequisite }) => {
                // Base Set requires completing the prerelease event first;
                // fall back to allowing access if player already owns Base Set cards (backward compat).
                const baseSetGate = name === 'Base'
                  ? (completedPrereleases.includes('Base') || Object.keys(collection).some(id => {
                      const c = ALL_CARDS.find(card => card.id === id);
                      return c?.set === 'Base' && (collection[id] ?? 0) > 0;
                    }))
                  : true;
                const unlocked = baseSetGate && isSetUnlocked(name, collection);
                const baseNotDone = name === 'Base' && !baseSetGate;
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
                        {baseNotDone && (
                        <div className="text-xs text-blue-400 mt-0.5">
                          🎮 Complete the Base Set Prerelease first!
                        </div>
                      )}
                      {!unlocked && !baseNotDone && prerequisite && (
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
                        {unlocked && (
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
                    {packVouchers > 0 && unlocked && (
                      <button
                        onClick={() => redeemPackVoucher(name)}
                        className="w-full mt-2 py-1.5 bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold rounded-lg"
                      >
                        🎟 Use Pack Voucher ({packVouchers} left)
                      </button>
                    )}
                    <button
                      onClick={() => setPreviewSet(name)}
                      className="w-full mt-1.5 py-1 bg-gray-700 hover:bg-gray-600 text-gray-300 text-xs rounded-lg"
                    >
                      👁 Preview Set ({ALL_CARDS.filter(c => c.set === name && c.supertype !== 'Energy' && (encountered.has(c.id) || (collection[c.id] ?? 0) > 0)).length} / {ALL_CARDS.filter(c => c.set === name && c.supertype !== 'Energy').length} revealed)
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {tab === 'singles' && (() => {
          // Only show cards the player has encountered in a match
          const singlesPool = ALL_CARDS.filter(c => !EXCLUDED.has(c.set) && encountered.has(c.id));
          const setSingles = singlesSet === 'All' ? singlesPool : singlesPool.filter(c => c.set === singlesSet);
          const displayed = setSingles
            .filter(c => !singlesSearch || c.name.toLowerCase().includes(singlesSearch.toLowerCase()));
          const singleSets = ['All', ...Array.from(new Set(singlesPool.map(c => c.set))).sort()];

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
                        <CardImage card={card} small dimmed={!canAfford} onClick={() => setPreviewSingleCard(card)} />
                        <span className="absolute bottom-1 left-0 right-0 text-center text-[10px] font-bold bg-black/70 text-yellow-300">
                          {cost}cr
                        </span>
                      </div>
                      <span className="text-[9px] text-gray-400 text-center w-full truncate">{card.name}</span>
                    </div>
                  );
                })}
              </div>
              {singlesPool.length === 0 && (
                <p className="text-gray-500 text-sm text-center py-8">
                  No cards discovered yet. Play games to encounter cards — they'll appear here to buy as singles.
                </p>
              )}
              {singlesPool.length > 0 && displayed.length === 0 && <p className="text-gray-500 text-sm text-center py-8">No cards found.</p>}
            </div>
          );
        })()}

        {tab === 'decks' && (() => {
          const starterDeck = STARTER_DECKS.find(d => d.id === 'custom-fists-and-fire');
          const themeDecks  = STARTER_DECKS.filter(d => d.id !== 'custom-fists-and-fire');
          const hasVoucher  = freeVouchers.length > 0;

          function isDeckUnlocked(sd: typeof STARTER_DECKS[0]): boolean {
            if (!sd.prerequisiteSet) return true;
            const pct = setCompletionPct(sd.prerequisiteSet, collection);
            return pct >= (sd.prerequisitePct ?? 0.75);
          }

          const DeckButtons = (sd: typeof STARTER_DECKS[0], unlocked: boolean) => (
            <div className="space-y-1.5">
              {hasVoucher && unlocked && (
                <button
                  onClick={() => handleRedeemVoucher(sd)}
                  className="w-full py-1.5 bg-purple-600 hover:bg-purple-500 text-white text-sm font-bold rounded-lg"
                >
                  🎟 Redeem Free Voucher ({freeVouchers.length} left)
                </button>
              )}
              <button
                onClick={() => handleBuyDeck(sd)}
                disabled={!unlocked || credits < THEME_DECK_COST || !user}
                className="w-full py-1.5 bg-yellow-500 hover:bg-yellow-400 disabled:opacity-40 disabled:cursor-not-allowed text-black text-sm font-bold rounded-lg"
              >
                {!unlocked ? '🔒 Locked' : !user ? 'Sign in to buy' : credits < THEME_DECK_COST ? 'Not enough credits' : `Buy Deck — ${THEME_DECK_COST} cr`}
              </button>
            </div>
          );

          // Whether the player has completed the Base Set prerelease (or already owns Base cards — backward compat)
          const basePrereleaseDone = completedPrereleases.includes('Base')
            || Object.keys(collection).some(id => {
                const c = ALL_CARDS.find(card => card.id === id);
                return c?.set === 'Base' && (collection[id] ?? 0) > 0;
              });

          // Explicit deck groups — order and membership controlled here
          const GROUPS: { label: string; ids: string[]; prereqSet: string | null; prereqPct: number; requiresPrerelease?: string }[] = [
            {
              label: 'Starter Set',
              ids: ['starter-machamp'],
              prereqSet: null, prereqPct: 0,
            },
            {
              label: 'Base Set',
              ids: ['starter-overgrowth', 'starter-zap', 'starter-brushfire', 'starter-blackout'],
              prereqSet: null, prereqPct: 0,
              requiresPrerelease: 'Base',
            },
            {
              label: 'Jungle',
              ids: ['jungle-water-blast', 'jungle-power-reserve'],
              prereqSet: 'Base', prereqPct: 0.75,
            },
            {
              label: 'Fossil',
              ids: ['fossil-lockdown', 'fossil-bodyguard'],
              prereqSet: 'Jungle', prereqPct: 0.75,
            },
            {
              label: 'Base Set 2',
              ids: ['bs2-grass-chopper', 'bs2-hot-water', 'starter-lightning-bug', 'jungle-psych-out'],
              prereqSet: 'Base', prereqPct: 1.0,
            },
            {
              label: 'Team Rocket',
              ids: ['rocket-devastation', 'rocket-trouble'],
              prereqSet: 'Fossil', prereqPct: 0.75,
            },
            {
              label: 'Gym Heroes',
              ids: ['gym1-brock', 'gym1-misty', 'gym1-surge', 'gym1-erika'],
              prereqSet: 'Team Rocket', prereqPct: 0.75,
            },
            {
              label: 'Gym Challenge',
              ids: ['gym2-blaine', 'gym2-giovanni', 'gym2-koga', 'gym2-sabrina'],
              prereqSet: 'Gym Heroes', prereqPct: 0.75,
            },
          ];

          return (
            <div className="space-y-6">
              {/* ── Starter Deck (always visible) ────────────── */}
              {starterDeck && (
                <div>
                  <h3 className="text-xs font-bold text-yellow-400 uppercase tracking-wider mb-2">Starter Deck</h3>
                  <div className="bg-gray-800 rounded-xl p-4 border border-yellow-600/50">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-bold text-lg">{starterDeck.name}</span>
                      <span className="text-[10px] bg-yellow-500 text-black font-bold px-1.5 py-0.5 rounded">STARTER</span>
                    </div>
                    <div className="text-sm text-gray-400 mb-3">{starterDeck.description}</div>
                    <span className="text-xs text-gray-500">{starterDeck.cardIds.filter(id => !id.startsWith('basic-')).length} collectible cards</span>
                    <button
                      onClick={() => setPreviewDeckId(starterDeck.id)}
                      className="w-full mt-2 mb-1 py-1 bg-gray-700 hover:bg-gray-600 text-gray-300 text-xs rounded-lg"
                    >
                      👁 Preview Deck
                    </button>
                    <div className="mt-1">{DeckButtons(starterDeck, true)}</div>
                  </div>
                </div>
              )}

              {/* ── Theme Deck groups ─────────────────────────── */}
              <p className="text-xs text-gray-500">Theme decks cost {THEME_DECK_COST} credits. Cards are added to your collection and the deck is saved to the builder.</p>
              {GROUPS.map(group => {
                const groupDecks = themeDecks.filter(sd => group.ids.includes(sd.id));
                if (groupDecks.length === 0) return null;
                const prereqPct = group.prereqSet ? Math.round(setCompletionPct(group.prereqSet, collection) * 100) : 100;
                const threshold  = Math.round(group.prereqPct * 100);
                const prereqMet  = group.prereqSet === null || prereqPct >= threshold;
                // Check prerelease gate (Base Set theme decks require completing the prerelease first)
                const prereqGateMet = !group.requiresPrerelease
                  || (group.requiresPrerelease === 'Base' ? basePrereleaseDone : true);
                const groupUnlocked = prereqMet && prereqGateMet;
                return (
                  <div key={group.label}>
                    <div className="flex items-center gap-2 mb-2">
                      <h3 className={`text-xs font-bold uppercase tracking-wider ${groupUnlocked ? 'text-gray-300' : 'text-gray-600'}`}>
                        {groupUnlocked ? '' : '🔒 '}{group.label} Decks
                      </h3>
                      {!groupUnlocked && !prereqGateMet && (
                        <span className="text-[10px] text-blue-500">
                          (Complete Base Set Prerelease first)
                        </span>
                      )}
                      {!groupUnlocked && prereqGateMet && group.prereqSet && (
                        <span className="text-[10px] text-yellow-600">
                          ({group.prereqSet}: {prereqPct}% / {threshold}% needed)
                        </span>
                      )}
                    </div>
                    <div className={`grid gap-3 sm:grid-cols-2 ${!groupUnlocked ? 'opacity-50 pointer-events-none' : ''}`}>
                      {groupDecks.map(sd => {
                        const unlocked = isDeckUnlocked(sd);
                        return (
                          <div key={sd.id} className="bg-gray-800 rounded-xl p-4 border border-gray-700">
                            <div className="font-bold mb-0.5">{sd.name}</div>
                            <div className="text-xs text-gray-500 mb-1">{sd.type}</div>
                            <div className="text-sm text-gray-400 mb-2">{sd.description}</div>
                            <div className="text-xs text-gray-500 mb-1">{sd.cardIds.filter(id => !id.startsWith('basic-')).length} collectible cards</div>
                            <button
                              onClick={() => setPreviewDeckId(sd.id)}
                              className="w-full mb-2 py-1 bg-gray-700 hover:bg-gray-600 text-gray-300 text-xs rounded-lg"
                            >
                              👁 Preview Deck
                            </button>
                            {DeckButtons(sd, unlocked)}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })()}
      </div>
    </div>
  );
}
