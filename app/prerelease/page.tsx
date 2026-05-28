'use client';
import { useState, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/authStore';
import { useGameStore } from '@/store/gameStore';
import { ALL_CARDS, BASIC_ENERGY_CARDS, isBasicPokemon, isSetUnlocked } from '@/lib/cardUtils';
import { getAvailableAIDecks } from '@/lib/starterDecks';
import { pickPackCards, SET_PROGRESSION } from '@/lib/progression';
import CardImage from '@/components/cards/CardImage';
import type { CardData, EnergyType } from '@/engine/GameState';

const BROWSE_CARDS = [...ALL_CARDS, ...BASIC_ENERGY_CARDS];

const ALL_ENERGY_TYPES: EnergyType[] = ['Fire', 'Water', 'Grass', 'Lightning', 'Psychic', 'Fighting'];
const ENERGY_COLORS: Partial<Record<EnergyType, string>> = {
  Fire:      'bg-red-600 hover:bg-red-500',
  Water:     'bg-blue-600 hover:bg-blue-500',
  Grass:     'bg-green-600 hover:bg-green-500',
  Lightning: 'bg-yellow-500 hover:bg-yellow-400 text-black',
  Psychic:   'bg-purple-600 hover:bg-purple-500',
  Fighting:  'bg-orange-700 hover:bg-orange-600',
};

// Sets that pull from multiple pools instead of just their own set
const MIXED_PACK_SETS: Record<string, Array<{ set: string; count: number }>> = {
  'Jungle':  [{ set: 'Jungle', count: 5 }, { set: 'Base', count: 5 }],
  'Fossil':  [{ set: 'Fossil', count: 5 }, { set: 'Base', count: 5 }],
};

type SortMode = 'number' | 'type' | 'name';

export default function PrereleasePage() {
  const router = useRouter();
  const { user, prereleaseInvites, usePrereleaseInvite, addCompletedPrerelease, addToCollection, collection } = useAuthStore();
  const { startGame } = useGameStore();

  const [phase, setPhase] = useState<'list' | 'opening' | 'building'>('list');
  const [activeSet, setActiveSet] = useState<string | null>(null);
  const [openedCards, setOpenedCards] = useState<CardData[]>([]);
  const [buildingDeck, setBuildingDeck] = useState<CardData[]>([]);
  const [sortMode, setSortMode] = useState<SortMode>('number');

  if (!user) {
    return (
      <div className="min-h-screen bg-gray-950 text-white flex items-center justify-center">
        <div className="text-center space-y-3">
          <p className="text-xl">Sign in to access Prerelease events.</p>
          <Link href="/" className="px-4 py-2 bg-yellow-500 rounded-xl text-black font-bold">← Home</Link>
        </div>
      </div>
    );
  }

  if (prereleaseInvites.length === 0 && phase === 'list') {
    return (
      <div className="min-h-screen bg-gray-950 text-white p-4">
        <div className="max-w-md mx-auto pt-12 text-center space-y-4">
          <h1 className="text-2xl font-black text-yellow-400">Prerelease Events</h1>
          <p className="text-gray-400">No invitations yet. Collect 60% of a set to earn a prerelease invite for the next set.</p>
          <Link href="/shop" className="inline-block px-6 py-3 bg-yellow-500 rounded-xl text-black font-bold">
            Visit Shop
          </Link>
          <br />
          <Link href="/" className="text-sm text-gray-500 hover:text-white">← Home</Link>
        </div>
      </div>
    );
  }

  // ── Open packs for a given set (supports mixed-set pools) ───────────────────
  function openPacks(setName: string) {
    const allIds: string[] = [];

    const mixedSets = MIXED_PACK_SETS[setName];
    const packGroups = mixedSets ?? [{ set: setName, count: 10 }];

    for (const { set, count } of packGroups) {
      const setCards = ALL_CARDS.filter(c => c.set === set);
      if (setCards.length === 0) continue;

      const basicEnergyPool = setCards.filter(c => c.supertype === 'Energy' && !c.rarity);
      const packableCards = setCards
        .filter(c => !basicEnergyPool.some(e => e.id === c.id))
        .map(c => ({ id: c.id, rarity: c.rarity || 'Common' }));

      const pickEnergy = () =>
        basicEnergyPool.length > 0
          ? basicEnergyPool[Math.floor(Math.random() * basicEnergyPool.length)].id
          : null;

      for (let i = 0; i < count; i++) {
        if (packableCards.length > 0) allIds.push(...pickPackCards(packableCards));
        const e1 = pickEnergy(); if (e1) allIds.push(e1);
        const e2 = pickEnergy(); if (e2) allIds.push(e2);
      }
    }

    const cards = allIds.map(id => ALL_CARDS.find(c => c.id === id)).filter(Boolean) as CardData[];

    usePrereleaseInvite(setName);
    addCompletedPrerelease(setName);   // unlock set content in shop
    addToCollection(allIds);
    setOpenedCards(cards);
    setActiveSet(setName);
    setPhase('opening');
  }

  function goToBuilding() {
    const nonEnergy = openedCards.filter(c => c.supertype !== 'Energy');
    setBuildingDeck(nonEnergy);
    setPhase('building');
  }

  function startBattle() {
    if (!activeSet || buildingDeck.length === 0) return;

    const availableDecks = getAvailableAIDecks(collection, isSetUnlocked);
    const aiDeckDef = availableDecks[Math.floor(Math.random() * availableDecks.length)];
    const aiDeck = aiDeckDef.cardIds
      .map(id => BROWSE_CARDS.find(c => c.id === id))
      .filter(Boolean) as CardData[];

    const playerDeck = [...buildingDeck];
    const hasBasic = playerDeck.some(c => isBasicPokemon(c));
    if (!hasBasic) {
      const fallback = BROWSE_CARDS.find(c => isBasicPokemon(c));
      if (fallback) playerDeck.unshift(fallback);
    }

    startGame('You', playerDeck, 'CPU', aiDeck, 'vs-ai');
    router.push('/game');
  }

  // ── List of invites ────────────────────────────────────────────────────────
  if (phase === 'list') {
    return (
      <div className="min-h-screen bg-gray-950 text-white p-4">
        <div className="max-w-md mx-auto space-y-6 pt-4">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-black text-yellow-400">Prerelease Events</h1>
            <Link href="/" className="text-sm text-gray-400 hover:text-white">← Home</Link>
          </div>
          <p className="text-sm text-gray-400">
            Open 10 packs and battle with your sealed pool!
          </p>
          <div className="space-y-3">
            {prereleaseInvites.map(setName => {
              const entry = SET_PROGRESSION.find(s => s.name === setName);
              const mixed = MIXED_PACK_SETS[setName];
              const hasCards = mixed
                ? mixed.every(({ set }) => ALL_CARDS.some(c => c.set === set))
                : ALL_CARDS.some(c => c.set === setName);

              const packDescription = mixed
                ? mixed.map(({ set, count }) => `${count}× ${set}`).join(' + ')
                : `10× ${setName}`;

              return (
                <div key={setName} className="bg-gray-800 border border-yellow-600/50 rounded-xl p-4 space-y-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-lg">{setName}</span>
                      <span className="text-[10px] bg-yellow-500 text-black font-bold px-1.5 py-0.5 rounded">PRERELEASE</span>
                    </div>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {entry?.prerequisite ? `Follows ${entry.prerequisite}` : 'First prerelease event'}
                    </p>
                  </div>
                  <ul className="text-sm text-gray-300 space-y-0.5">
                    <li>• Receive {packDescription}</li>
                    <li>• Build a 40-card sealed deck from your pool</li>
                    <li>• Battle an AI opponent</li>
                    <li>• Unlocks {setName} boosters &amp; theme decks in Shop</li>
                  </ul>
                  <button
                    onClick={() => openPacks(setName)}
                    disabled={!hasCards}
                    className="w-full py-2.5 bg-yellow-500 hover:bg-yellow-400 disabled:opacity-40 text-black font-bold rounded-xl"
                  >
                    {hasCards ? 'Accept Invitation' : 'Set not yet available'}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  // ── Pack opening result ────────────────────────────────────────────────────
  if (phase === 'opening') {
    const mixedInfo = activeSet ? MIXED_PACK_SETS[activeSet] : null;
    const packLabel = mixedInfo
      ? mixedInfo.map(({ set, count }) => `${count}× ${set}`).join(' + ')
      : `10 packs`;

    return (
      <div className="min-h-screen bg-gray-950 text-white p-4">
        <div className="max-w-2xl mx-auto space-y-4 pt-4">
          <h1 className="text-xl font-black text-yellow-400">
            {activeSet} Prerelease — {packLabel}
          </h1>
          <p className="text-sm text-gray-400">{openedCards.length} cards received. Added to your collection. {activeSet} boosters &amp; theme decks are now unlocked!</p>
          <div className="grid grid-cols-5 sm:grid-cols-7 gap-1.5">
            {openedCards.map((card, i) => (
              <CardImage key={i} card={card} small />
            ))}
          </div>
          <div className="bg-gray-800 rounded-xl p-4 text-sm text-gray-300 space-y-1">
            <p className="font-bold text-white">Build your sealed deck:</p>
            <p>• Click cards from your pool to add them</p>
            <p>• Cards can be sorted by number, type, or name</p>
            <p>• Add unlimited basic energy of any type</p>
            <p>• Aim for 40 cards (min. 20 to battle)</p>
          </div>
          <button
            onClick={goToBuilding}
            className="w-full py-3 bg-yellow-500 hover:bg-yellow-400 text-black font-bold rounded-xl text-lg"
          >
            Build My Deck →
          </button>
        </div>
      </div>
    );
  }

  // ── Deck Builder ────────────────────────────────────────────────────────────
  const deckCount = buildingDeck.length;
  const deckHasBasic = buildingDeck.some(c => isBasicPokemon(c));
  const canStart = deckCount >= 20 && deckHasBasic;

  function countInDeck(card: CardData) {
    return buildingDeck.filter(c => c.id === card.id).length;
  }
  function countInPool(card: CardData) {
    return openedCards.filter(c => c.id === card.id).length;
  }
  function addCardToDeck(card: CardData) {
    if (buildingDeck.length >= 60) return;
    setBuildingDeck(prev => [...prev, card]);
  }
  function removeCardFromDeck(card: CardData) {
    const idx = buildingDeck.map(c => c.id).lastIndexOf(card.id);
    if (idx < 0) return;
    setBuildingDeck(prev => { const a = [...prev]; a.splice(idx, 1); return a; });
  }
  function addEnergy(type: EnergyType) {
    if (buildingDeck.length >= 60) return;
    const energyCard = BASIC_ENERGY_CARDS.find(e => e.types[0] === type);
    if (energyCard) setBuildingDeck(prev => [...prev, energyCard]);
  }
  function removeEnergy(type: EnergyType) {
    const energyCard = BASIC_ENERGY_CARDS.find(e => e.types[0] === type);
    if (!energyCard) return;
    const idx = buildingDeck.map(c => c.id).lastIndexOf(energyCard.id);
    if (idx >= 0) setBuildingDeck(prev => { const a = [...prev]; a.splice(idx, 1); return a; });
  }

  // Unique pool non-energy cards, sorted by current sortMode
  const nonEnergyPool = useMemo(() => {
    const unique = openedCards.filter((card, i, arr) =>
      arr.findIndex(c => c.id === card.id) === i && card.supertype !== 'Energy',
    );
    return [...unique].sort((a, b) => {
      if (sortMode === 'number') {
        // Sort by set name first (so mixed-set pools group by set), then card number
        const setOrder = a.set.localeCompare(b.set);
        if (setOrder !== 0) return setOrder;
        return (parseInt(a.number) || 0) - (parseInt(b.number) || 0);
      }
      if (sortMode === 'type') {
        const ta = a.supertype === 'Pokémon' ? (a.types?.[0] ?? '') : a.supertype;
        const tb = b.supertype === 'Pokémon' ? (b.types?.[0] ?? '') : b.supertype;
        if (ta !== tb) return ta.localeCompare(tb);
        return a.name.localeCompare(b.name);
      }
      // name
      return a.name.localeCompare(b.name);
    });
  }, [openedCards, sortMode]);

  // Deck summary
  const deckByName: Record<string, { card: CardData; count: number }> = {};
  for (const c of buildingDeck) {
    if (!deckByName[c.id]) deckByName[c.id] = { card: c, count: 0 };
    deckByName[c.id].count++;
  }
  const deckEntries = Object.values(deckByName).sort((a, b) => {
    const order = (c: CardData) =>
      c.supertype === 'Pokémon' ? 0 : c.supertype === 'Trainer' ? 1 : 2;
    if (order(a.card) !== order(b.card)) return order(a.card) - order(b.card);
    // JP-style: sort by set then number within deck too
    const setOrder = a.card.set.localeCompare(b.card.set);
    if (setOrder !== 0) return setOrder;
    return (parseInt(a.card.number) || 0) - (parseInt(b.card.number) || 0);
  });

  // Energy in deck
  const energyInDeck: Partial<Record<EnergyType, number>> = {};
  for (const c of buildingDeck) {
    if (c.supertype === 'Energy' && c.types[0]) {
      const t = c.types[0] as EnergyType;
      energyInDeck[t] = (energyInDeck[t] ?? 0) + 1;
    }
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white p-3">
      <div className="max-w-5xl mx-auto space-y-4">

        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h1 className="text-xl font-black text-yellow-400">{activeSet} Prerelease — Build Deck</h1>
          <div className="flex items-center gap-3">
            <span className={`text-sm font-bold ${deckCount >= 40 ? 'text-green-400' : deckCount >= 20 ? 'text-yellow-400' : 'text-gray-400'}`}>
              {deckCount} / 40 cards
            </span>
            <button
              onClick={startBattle}
              disabled={!canStart}
              className="px-4 py-2 bg-red-600 hover:bg-red-500 disabled:opacity-40 text-white font-bold rounded-xl"
            >
              ⚔️ Start Battle
            </button>
          </div>
        </div>

        {!canStart && (
          <p className="text-xs text-gray-500">
            {!deckHasBasic ? '⚠ Add at least 1 Basic Pokémon. ' : ''}
            {deckCount < 20 ? `⚠ Add ${20 - deckCount} more cards (min 20 to battle).` : ''}
          </p>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

          {/* Left: Pool + Energy */}
          <div className="lg:col-span-2 space-y-4">

            {/* Basic Energy */}
            <div className="bg-gray-800 rounded-xl p-3">
              <h2 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Basic Energy (unlimited)</h2>
              <div className="flex flex-wrap gap-2">
                {ALL_ENERGY_TYPES.map(type => {
                  const count = energyInDeck[type] ?? 0;
                  const colorClass = ENERGY_COLORS[type] ?? 'bg-gray-600 hover:bg-gray-500';
                  return (
                    <div key={type} className="flex items-center gap-1">
                      <button
                        onClick={() => addEnergy(type)}
                        disabled={deckCount >= 60}
                        className={`px-2 py-1 rounded-lg text-xs font-bold text-white disabled:opacity-40 ${colorClass}`}
                      >
                        + {type}
                      </button>
                      {count > 0 && (
                        <>
                          <span className="text-xs text-gray-300 font-bold">×{count}</span>
                          <button
                            onClick={() => removeEnergy(type)}
                            className="text-xs text-gray-500 hover:text-red-400 px-1"
                          >
                            −
                          </button>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Pool Cards */}
            <div className="bg-gray-800 rounded-xl p-3">
              <div className="flex items-center justify-between mb-2">
                <h2 className="text-xs font-bold text-gray-400 uppercase tracking-wider">
                  Your Pool ({openedCards.filter(c => c.supertype !== 'Energy').length} cards)
                </h2>
                {/* Sort toggle */}
                <div className="flex gap-1">
                  {(['number', 'type', 'name'] as SortMode[]).map(m => (
                    <button
                      key={m}
                      onClick={() => setSortMode(m)}
                      className={`px-2 py-0.5 rounded text-[10px] font-bold transition-all ${
                        sortMode === m
                          ? 'bg-yellow-500 text-black'
                          : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
                      }`}
                    >
                      {m === 'number' ? '#' : m === 'type' ? 'Type' : 'A-Z'}
                    </button>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-5 sm:grid-cols-6 md:grid-cols-7 gap-1.5">
                {nonEnergyPool.map(card => {
                  const inDeck = countInDeck(card);
                  const inPool = countInPool(card);
                  const maxed = inDeck >= inPool;
                  return (
                    <div key={card.id} className="relative">
                      <button
                        onClick={() => !maxed ? addCardToDeck(card) : removeCardFromDeck(card)}
                        className={`w-full relative ${maxed ? 'opacity-40' : 'hover:ring-2 hover:ring-yellow-400'} rounded-lg overflow-hidden`}
                        title={`${card.name} #${card.number} (${card.set})${maxed ? ' — all copies in deck' : ''}`}
                      >
                        <CardImage card={card} small />
                      </button>
                      {inDeck > 0 && (
                        <div className="absolute top-0.5 right-0.5 bg-yellow-500 text-black text-[10px] font-black rounded-full w-4 h-4 flex items-center justify-center leading-none">
                          {inDeck}
                        </div>
                      )}
                      {/* Card number badge in set-number sort mode */}
                      {sortMode === 'number' && (
                        <div className="absolute bottom-0.5 left-0.5 bg-black/70 text-white text-[8px] px-0.5 rounded leading-tight">
                          #{card.number}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Right: Deck List */}
          <div className="bg-gray-800 rounded-xl p-3">
            <h2 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">
              Your Deck ({deckCount} cards)
            </h2>
            {/* Progress bar */}
            <div className="w-full bg-gray-700 rounded-full h-1.5 mb-3">
              <div
                className={`h-1.5 rounded-full transition-all ${deckCount >= 40 ? 'bg-green-500' : 'bg-yellow-500'}`}
                style={{ width: `${Math.min(100, (deckCount / 40) * 100)}%` }}
              />
            </div>
            <div className="space-y-0.5 max-h-[60vh] overflow-y-auto pr-1">
              {deckEntries.length === 0 && (
                <p className="text-xs text-gray-600 text-center py-4">Click pool cards or energy buttons to add</p>
              )}
              {deckEntries.map(({ card, count }) => (
                <div key={card.id} className="flex items-center justify-between bg-gray-700/50 rounded px-2 py-1">
                  <div className="flex-1 min-w-0">
                    <span className="text-xs truncate block">{card.name}</span>
                    <span className="text-[9px] text-gray-500">#{card.number} {card.set}</span>
                  </div>
                  <div className="flex items-center gap-1 ml-1">
                    <span className="text-xs text-gray-400 font-bold">×{count}</span>
                    <button
                      onClick={() => removeCardFromDeck(card)}
                      className="text-gray-500 hover:text-red-400 text-xs w-4 h-4 flex items-center justify-center"
                    >−</button>
                    <button
                      onClick={() => addCardToDeck(card)}
                      disabled={countInDeck(card) >= countInPool(card)}
                      className="text-gray-500 hover:text-green-400 disabled:opacity-30 text-xs w-4 h-4 flex items-center justify-center"
                    >+</button>
                  </div>
                </div>
              ))}
            </div>
            <button
              onClick={startBattle}
              disabled={!canStart}
              className="w-full mt-3 py-2.5 bg-red-600 hover:bg-red-500 disabled:opacity-40 text-white font-bold rounded-xl"
            >
              ⚔️ Start Battle
            </button>
            <Link href="/" className="block text-center text-xs text-gray-600 hover:text-white mt-2">← Home</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
