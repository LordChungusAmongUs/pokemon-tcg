'use client';
import { useState, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/authStore';
import { useGameStore } from '@/store/gameStore';
import { ALL_CARDS, BASIC_ENERGY_CARDS, isBasicPokemon, isSetUnlocked } from '@/lib/cardUtils';
import { getAvailableAIDecks } from '@/lib/starterDecks';
import { pickPackCards, SET_PROGRESSION } from '@/lib/progression';
import { pokedexNumber, SET_RELEASE_ORDER } from '@/lib/pokedex';
import CardImage from '@/components/cards/CardImage';
import CardDetail from '@/components/cards/CardDetail';
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

const TYPE_ORDER: string[] = ['Grass', 'Fire', 'Water', 'Lightning', 'Psychic', 'Fighting', 'Colorless', 'Darkness', 'Metal'];

// Sets that pull from multiple pools instead of just their own set
const MIXED_PACK_SETS: Record<string, Array<{ set: string; count: number }>> = {
  'Jungle':  [{ set: 'Jungle', count: 5 }, { set: 'Base', count: 5 }],
  'Fossil':  [{ set: 'Fossil', count: 5 }, { set: 'Base', count: 5 }],
};

type SortMode = 'number' | 'type' | 'name' | 'japanese';

// Japanese-style sort for the pool
function japaneseSort(cards: CardData[]): CardData[] {
  return [...cards].sort((a, b) => {
    const supertypeOrder = (s: string) => s === 'Pokémon' ? 0 : s === 'Trainer' ? 1 : 2;
    if (supertypeOrder(a.supertype) !== supertypeOrder(b.supertype))
      return supertypeOrder(a.supertype) - supertypeOrder(b.supertype);
    if (a.supertype === 'Pokémon') {
      const aTypeIdx = TYPE_ORDER.indexOf(a.types?.[0] ?? 'Colorless');
      const bTypeIdx = TYPE_ORDER.indexOf(b.types?.[0] ?? 'Colorless');
      if (aTypeIdx !== bTypeIdx) return (aTypeIdx === -1 ? 99 : aTypeIdx) - (bTypeIdx === -1 ? 99 : bTypeIdx);
      const aDex = pokedexNumber(a.name);
      const bDex = pokedexNumber(b.name);
      if (aDex !== bDex) return aDex - bDex;
      const aSet = SET_RELEASE_ORDER[a.set] ?? 99;
      const bSet = SET_RELEASE_ORDER[b.set] ?? 99;
      if (aSet !== bSet) return aSet - bSet;
      return (parseInt(a.number ?? '9999', 10) || 9999) - (parseInt(b.number ?? '9999', 10) || 9999);
    }
    return a.name.localeCompare(b.name);
  });
}

export default function PrereleasePage() {
  const router = useRouter();
  const { user, prereleaseInvites, usePrereleaseInvite, addCompletedPrerelease, addToCollection, collection } = useAuthStore();
  const { startGame } = useGameStore();

  const [phase, setPhase] = useState<'list' | 'opening' | 'building'>('list');
  const [activeSet, setActiveSet] = useState<string | null>(null);
  const [openedCards, setOpenedCards] = useState<CardData[]>([]);
  const [buildingDeck, setBuildingDeck] = useState<CardData[]>([]);
  const [sortMode, setSortMode] = useState<SortMode>('number');
  const [search, setSearch] = useState('');
  const [previewCard, setPreviewCard] = useState<CardData | null>(null);
  const [detail, setDetail] = useState<CardData | null>(null);

  // ── Pool counts: how many of each card ID were opened ───────────────────────
  const poolCounts = useMemo<Record<string, number>>(() => {
    const counts: Record<string, number> = {};
    for (const c of openedCards) {
      if (c.supertype !== 'Energy') counts[c.id] = (counts[c.id] ?? 0) + 1;
    }
    return counts;
  }, [openedCards]);

  // ── Unique non-energy pool cards, filtered + sorted ──────────────────────────
  const nonEnergyPool = useMemo(() => {
    const unique = Object.keys(poolCounts)
      .map(id => ALL_CARDS.find(c => c.id === id))
      .filter(Boolean) as CardData[];

    const filtered = search
      ? unique.filter(c => c.name.toLowerCase().includes(search.toLowerCase()))
      : unique;

    if (sortMode === 'japanese') return japaneseSort(filtered);
    if (sortMode === 'number') {
      return [...filtered].sort((a, b) => {
        const setOrder = (SET_RELEASE_ORDER[a.set] ?? 99) - (SET_RELEASE_ORDER[b.set] ?? 99);
        if (setOrder !== 0) return setOrder;
        return (parseInt(a.number) || 0) - (parseInt(b.number) || 0);
      });
    }
    if (sortMode === 'type') {
      return [...filtered].sort((a, b) => {
        const ta = a.supertype === 'Pokémon' ? (a.types?.[0] ?? '') : a.supertype;
        const tb = b.supertype === 'Pokémon' ? (b.types?.[0] ?? '') : b.supertype;
        if (ta !== tb) return ta.localeCompare(tb);
        return a.name.localeCompare(b.name);
      });
    }
    // name
    return [...filtered].sort((a, b) => a.name.localeCompare(b.name));
  }, [openedCards, sortMode, search, poolCounts]);

  // ── Hooks must all be above early returns ────────────────────────────────────

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
    // Running temp collection so balance applies across all packs opened in this session
    const tempCollection: Record<string, number> = { ...collection };

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
        if (packableCards.length > 0) {
          const packIds = pickPackCards(packableCards, tempCollection);
          for (const id of packIds) tempCollection[id] = (tempCollection[id] ?? 0) + 1;
          allIds.push(...packIds);
        }
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
    // Start with all non-energy cards from pool pre-added
    setBuildingDeck([]);
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
            <p>• Click cards from your pool to add them to your deck</p>
            <p>• Search, sort, and filter your pool like the deck builder</p>
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

  // ── Deck Builder ─────────────────────────────────────────────────────────────
  const deckCount = buildingDeck.length;
  const deckHasBasic = buildingDeck.some(c => isBasicPokemon(c));
  const canStart = deckCount >= 20 && deckHasBasic;

  // Per-card helpers
  function countInDeck(card: CardData) {
    return buildingDeck.filter(c => c.id === card.id).length;
  }
  function poolCount(card: CardData) {
    return poolCounts[card.id] ?? 0;
  }
  function addCard(card: CardData) {
    if (deckCount >= 60) return;
    if (countInDeck(card) >= poolCount(card)) return; // can't exceed copies in pool
    setBuildingDeck(prev => [...prev, card]);
  }
  function removeCard(card: CardData) {
    const idx = buildingDeck.map(c => c.id).lastIndexOf(card.id);
    if (idx < 0) return;
    setBuildingDeck(prev => { const a = [...prev]; a.splice(idx, 1); return a; });
  }

  // Energy helpers
  function countEnergyInDeck(type: EnergyType): number {
    return buildingDeck.filter(c => c.supertype === 'Energy' && c.types?.[0] === type).length;
  }
  function addEnergy(type: EnergyType) {
    if (deckCount >= 60) return;
    const card = BASIC_ENERGY_CARDS.find(e => e.types[0] === type);
    if (card) setBuildingDeck(prev => [...prev, card]);
  }
  function removeEnergy(type: EnergyType) {
    const card = BASIC_ENERGY_CARDS.find(e => e.types[0] === type);
    if (!card) return;
    const idx = buildingDeck.map(c => c.id).lastIndexOf(card.id);
    if (idx >= 0) setBuildingDeck(prev => { const a = [...prev]; a.splice(idx, 1); return a; });
  }

  // Deck summary grouped by id
  const deckCounts = buildingDeck.reduce((acc, c) => {
    acc[c.id] = (acc[c.id] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  const uniqueInDeck = Object.entries(deckCounts)
    .map(([id, count]) => ({ card: BROWSE_CARDS.find(c => c.id === id)!, count }))
    .filter(x => x.card)
    .sort((a, b) => {
      const order = (c: CardData) => c.supertype === 'Pokémon' ? 0 : c.supertype === 'Trainer' ? 1 : 2;
      if (order(a.card) !== order(b.card)) return order(a.card) - order(b.card);
      return a.card.name.localeCompare(b.card.name);
    });

  const previewInDeck = previewCard ? countInDeck(previewCard) : 0;
  const previewInPool = previewCard ? poolCount(previewCard) : 0;
  const previewIsEnergy = previewCard?.supertype === 'Energy';
  const previewCanAdd = previewCard ? (previewIsEnergy || previewInDeck < previewInPool) && deckCount < 60 : false;
  const previewCanRemove = previewCard ? previewInDeck > 0 : false;

  return (
    <div className="min-h-screen bg-gray-950 text-white flex flex-col md:flex-row">
      {detail && <CardDetail card={detail} onClose={() => setDetail(null)} />}

      {/* Card preview modal */}
      {previewCard && (
        <div
          className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4"
          onClick={() => setPreviewCard(null)}
        >
          <div
            className="bg-gray-900 rounded-2xl p-4 flex flex-col items-center gap-3 max-w-xs w-full"
            onClick={e => e.stopPropagation()}
          >
            <CardImage card={previewCard} />
            <p className="font-bold text-center">{previewCard.name}</p>
            <p className="text-xs text-gray-400 text-center">{previewCard.set} · {previewCard.rarity}</p>
            {!previewIsEnergy && (
              <p className="text-xs text-gray-400">
                In pool: {previewInPool} · In deck: {previewInDeck}
              </p>
            )}
            <div className="flex gap-2 w-full">
              <button
                disabled={!previewCanAdd}
                onClick={() => addCard(previewCard)}
                className="flex-1 py-2 bg-green-600 hover:bg-green-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-bold rounded-lg"
              >
                + Add
              </button>
              <button
                disabled={!previewCanRemove}
                onClick={() => removeCard(previewCard)}
                className="flex-1 py-2 bg-red-700 hover:bg-red-600 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-bold rounded-lg"
              >
                − Remove
              </button>
            </div>
            <button
              onClick={() => { setPreviewCard(null); setDetail(previewCard); }}
              className="w-full py-1.5 bg-gray-700 hover:bg-gray-600 text-white text-xs rounded-lg"
            >
              View Card Details
            </button>
            <button onClick={() => setPreviewCard(null)} className="w-full py-2 bg-gray-700 hover:bg-gray-600 text-white text-sm rounded-lg">
              Done
            </button>
          </div>
        </div>
      )}

      {/* Left: pool browser */}
      <div className="flex-1 flex flex-col min-h-0">
        {/* Sticky header */}
        <div className="sticky top-0 bg-gray-900 border-b border-gray-800 z-10 p-3 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <h1 className="text-base font-bold truncate">{activeSet} Prerelease — Build Deck</h1>
            <Link href="/" className="text-sm text-gray-400 hover:text-white shrink-0">← Home</Link>
          </div>
          <input
            type="text"
            placeholder="Search pool..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full bg-gray-800 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 ring-yellow-500"
          />
          {/* Sort mode */}
          <div className="flex gap-1">
            {(['number', 'type', 'name', 'japanese'] as SortMode[]).map(m => (
              <button
                key={m}
                onClick={() => setSortMode(m)}
                className={`flex-1 py-1 rounded text-[10px] font-bold transition-all ${
                  sortMode === m ? 'bg-yellow-500 text-black' : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
                }`}
              >
                {m === 'number' ? '#' : m === 'type' ? 'Type' : m === 'name' ? 'A-Z' : 'JP'}
              </button>
            ))}
          </div>
          {/* Basic Energy row */}
          <div className="flex flex-wrap gap-1.5">
            {ALL_ENERGY_TYPES.map(type => {
              const count = countEnergyInDeck(type);
              const colorClass = ENERGY_COLORS[type] ?? 'bg-gray-600 hover:bg-gray-500';
              return (
                <div key={type} className="flex items-center gap-0.5">
                  <button
                    onClick={() => addEnergy(type)}
                    disabled={deckCount >= 60}
                    className={`px-2 py-0.5 rounded text-[10px] font-bold text-white disabled:opacity-40 ${colorClass}`}
                  >
                    +{type}
                  </button>
                  {count > 0 && (
                    <>
                      <span className="text-[10px] text-gray-300 font-bold">×{count}</span>
                      <button onClick={() => removeEnergy(type)} className="text-[10px] text-gray-500 hover:text-red-400 px-0.5">−</button>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Pool grid */}
        <div className="p-2 grid grid-cols-3 sm:grid-cols-4 gap-2 overflow-y-auto">
          {nonEnergyPool.length === 0 && (
            <div className="col-span-full text-center py-12 text-gray-500 text-sm">
              {search ? 'No cards match your search.' : 'No cards in pool.'}
            </div>
          )}
          {nonEnergyPool.map(card => {
            const inDeck = countInDeck(card);
            const inPool = poolCount(card);
            const maxed = inDeck >= inPool;
            return (
              <div key={card.id} className="flex flex-col items-center gap-1">
                <div className="relative w-full">
                  <CardImage
                    card={card}
                    small
                    dimmed={maxed}
                    onClick={() => setPreviewCard(card)}
                  />
                  {/* In-deck badge */}
                  {inDeck > 0 && (
                    <span className="absolute top-1 right-1 bg-yellow-500 text-black text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
                      {inDeck}
                    </span>
                  )}
                  {/* Pool count badge */}
                  <span className="absolute bottom-1 left-1 text-[9px] font-bold text-white bg-black/70 rounded px-0.5">
                    ×{inPool}
                  </span>
                </div>
                <span className="text-[9px] text-gray-400 text-center w-full truncate">{card.name}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Right: deck list */}
      <div className="w-full md:w-72 bg-gray-900 border-l border-gray-800 flex flex-col">
        <div className="p-3 space-y-2 border-b border-gray-800">
          <div className="flex items-center justify-between">
            <span className={`text-sm font-bold tabular-nums ${
              deckCount >= 40 ? 'text-green-400' : deckCount >= 20 ? 'text-yellow-400' : 'text-gray-400'
            }`}>
              {deckCount} / 40 cards
            </span>
            <button
              onClick={startBattle}
              disabled={!canStart}
              className="px-4 py-1.5 bg-red-600 hover:bg-red-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-bold rounded-lg"
            >
              ⚔️ Start Battle
            </button>
          </div>
          {/* Progress bar */}
          <div className="w-full bg-gray-700 rounded-full h-1.5">
            <div
              className={`h-1.5 rounded-full transition-all ${deckCount >= 40 ? 'bg-green-500' : 'bg-yellow-500'}`}
              style={{ width: `${Math.min(100, (deckCount / 40) * 100)}%` }}
            />
          </div>
          {!canStart && (
            <p className="text-[10px] text-gray-500">
              {!deckHasBasic ? '⚠ Add at least 1 Basic Pokémon. ' : ''}
              {deckCount < 20 ? `⚠ Need ${20 - deckCount} more cards to battle.` : ''}
            </p>
          )}
        </div>

        {/* Deck list */}
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {uniqueInDeck.length === 0 && (
            <p className="text-gray-500 text-sm text-center py-4">Click pool cards to add them</p>
          )}
          {uniqueInDeck.map(({ card, count }) => (
            <div key={card.id} className="flex items-center gap-2 bg-gray-800 rounded-lg px-2 py-1">
              <span className="text-yellow-400 font-bold text-sm w-5 text-center">{count}</span>
              <span className="flex-1 text-sm truncate">{card.name}</span>
              <button onClick={() => addCard(card)} disabled={countInDeck(card) >= poolCount(card)} className="text-gray-500 hover:text-green-400 disabled:opacity-30 text-xs w-4 h-4 flex items-center justify-center">+</button>
              <button onClick={() => removeCard(card)} className="text-red-400 hover:text-red-300 text-xs px-1">−</button>
            </div>
          ))}
        </div>

        <div className="p-2 border-t border-gray-800">
          <Link href="/" className="block text-center text-xs text-gray-600 hover:text-white py-1">← Home</Link>
        </div>
      </div>
    </div>
  );
}
