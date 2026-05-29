'use client';
import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/authStore';
import { useGameStore } from '@/store/gameStore';
import { ALL_CARDS, BASIC_ENERGY_CARDS, isBasicPokemon, isSetUnlocked } from '@/lib/cardUtils';
import { generatePackCards, SET_PROGRESSION } from '@/lib/progression';
import { getAvailableAIDecks } from '@/lib/starterDecks';
import CardImage from '@/components/cards/CardImage';
import type { CardData, EnergyType } from '@/engine/GameState';

const BROWSE_CARDS = [...ALL_CARDS, ...BASIC_ENERGY_CARDS];
const ENERGY_TYPES: EnergyType[] = ['Fire', 'Water', 'Grass', 'Lightning', 'Psychic', 'Fighting', 'Colorless', 'Darkness', 'Metal'];
const REQUIRED_PACKS = 10;
const DECK_SIZE = 40;
const BUILD_TIME = 600; // 10 minutes

type SealedPhase = 'setup' | 'opening' | 'building' | 'battle';

function cardFromId(id: string): CardData | undefined {
  return BROWSE_CARDS.find(c => c.id === id);
}

export default function SealedPage() {
  const router = useRouter();
  const { user, unopenedPacks, consumeOnePack, addToCollection, collection } = useAuthStore();
  const { startGame } = useGameStore();

  const [phase, setPhase] = useState<SealedPhase>('setup');
  const [pool, setPool] = useState<string[]>([]);      // all opened card IDs
  const [deck, setDeck] = useState<string[]>([]);
  const [buildTimer, setBuildTimer] = useState(BUILD_TIME);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (phase !== 'building') return;
    timerRef.current = setInterval(() => {
      setBuildTimer(t => {
        if (t <= 1) { clearInterval(timerRef.current!); return 0; }
        return t - 1;
      });
    }, 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [phase]);

  function openPacks(setName: string) {
    const allIds: string[] = [];
    const tempCollection: Record<string, number> = { ...collection };
    for (let i = 0; i < REQUIRED_PACKS; i++) {
      consumeOnePack(setName);
      const packIds = generatePackCards(setName, tempCollection);
      for (const id of packIds) tempCollection[id] = (tempCollection[id] ?? 0) + 1;
      allIds.push(...packIds);
    }
    addToCollection(allIds); // keep all opened cards
    setPool(allIds);
    setPhase('opening');
  }

  function toggleCard(id: string) {
    setDeck(prev => {
      if (prev.includes(id)) return prev.filter(x => x !== id);
      if (prev.length >= DECK_SIZE) return prev;
      return [...prev, id];
    });
  }

  function addEnergy(type: EnergyType) {
    if (deck.length >= DECK_SIZE) return;
    const e = BASIC_ENERGY_CARDS.find(c => c.types[0] === type);
    if (e) setDeck(prev => [...prev, e.id]);
  }

  function removeEnergy(type: EnergyType) {
    const e = BASIC_ENERGY_CARDS.find(c => c.types[0] === type);
    if (!e) return;
    setDeck(prev => {
      const idx = prev.lastIndexOf(e.id);
      if (idx === -1) return prev;
      const next = [...prev];
      next.splice(idx, 1);
      return next;
    });
  }

  function startBattle() {
    if (deck.length !== DECK_SIZE) { alert(`Deck must be exactly ${DECK_SIZE} cards.`); return; }
    const deckCards = deck.map(id => cardFromId(id)).filter(Boolean) as CardData[];
    const hasBasic = deckCards.some(c => isBasicPokemon(c));
    if (!hasBasic) { alert('Your deck needs at least one Basic Pokémon!'); return; }

    const availableAI = getAvailableAIDecks(collection, isSetUnlocked);
    const aiDef = availableAI[Math.floor(Math.random() * availableAI.length)];
    const aiDeck = aiDef.cardIds.map(id => BROWSE_CARDS.find(c => c.id === id)).filter(Boolean) as CardData[];

    startGame('You', deckCards, 'CPU', aiDeck, 'vs-ai');
    router.push('/game');
  }

  const energyCounts: Partial<Record<EnergyType, number>> = {};
  deck.forEach(id => {
    const e = BASIC_ENERGY_CARDS.find(c => c.id === id);
    if (e) energyCounts[e.types[0] as EnergyType] = (energyCounts[e.types[0] as EnergyType] ?? 0) + 1;
  });

  // ── Setup ──────────────────────────────────────────────────────────────────
  if (phase === 'setup') {
    const sealedSets = SET_PROGRESSION
      .filter(s => !['Base Set 2', 'Diamond & Pearl'].includes(s.name))
      .map(s => ({ name: s.name, count: unopenedPacks[s.name] ?? 0 }))
      .filter(s => s.count > 0);

    return (
      <div className="min-h-screen bg-gray-950 text-white p-4">
        <div className="max-w-md mx-auto space-y-6 pt-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-black text-yellow-400">Sealed</h1>
              <p className="text-xs text-gray-400 mt-0.5">10 packs · build a 40-card deck · battle AI</p>
            </div>
            <Link href="/" className="text-sm text-gray-400 hover:text-white">← Home</Link>
          </div>

          <div className="bg-gray-800 rounded-xl p-4 text-sm text-gray-300 space-y-1.5">
            <p className="font-bold text-white text-base">How Sealed Works</p>
            <p>• Bring {REQUIRED_PACKS} unopened packs from one set</p>
            <p>• Open all {REQUIRED_PACKS} packs at once</p>
            <p>• Add as many basic energy as you want</p>
            <p>• Build a {DECK_SIZE}-card deck in 10 minutes</p>
            <p>• Battle an AI opponent</p>
            <p>• You keep all {REQUIRED_PACKS} × 11 cards you opened!</p>
          </div>

          {sealedSets.length === 0 ? (
            <div className="text-center space-y-3 py-8">
              <p className="text-gray-400">No unopened packs available.</p>
              <p className="text-sm text-gray-500">You need {REQUIRED_PACKS} packs of the same set.</p>
              <Link href="/shop" className="inline-block px-6 py-2 bg-yellow-500 rounded-xl text-black font-bold">
                Buy Packs →
              </Link>
            </div>
          ) : (
            <div className="space-y-3">
              <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider">Choose a Set</h3>
              {sealedSets.map(({ name, count }) => (
                <div key={name} className={`rounded-xl p-4 border ${count >= REQUIRED_PACKS ? 'bg-gray-800 border-gray-600' : 'bg-gray-900 border-gray-800 opacity-60'}`}>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-bold">{name}</p>
                      <p className="text-xs text-gray-400 mt-0.5">{count} packs · needs {REQUIRED_PACKS}</p>
                    </div>
                    <button
                      onClick={() => openPacks(name)}
                      disabled={count < REQUIRED_PACKS}
                      className="px-4 py-2 bg-yellow-500 hover:bg-yellow-400 disabled:opacity-40 disabled:cursor-not-allowed text-black font-bold rounded-xl text-sm"
                    >
                      Open!
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── Pack opening result ────────────────────────────────────────────────────
  if (phase === 'opening') {
    const openedCards = pool.map(id => cardFromId(id)).filter(Boolean) as CardData[];
    return (
      <div className="min-h-screen bg-gray-950 text-white p-4">
        <div className="max-w-2xl mx-auto space-y-4 pt-4">
          <h1 className="text-xl font-black text-yellow-400">Your {REQUIRED_PACKS} Packs</h1>
          <p className="text-sm text-gray-400">{openedCards.length} cards received — all added to your collection!</p>
          <div className="grid grid-cols-5 sm:grid-cols-6 gap-2 max-h-[55vh] overflow-y-auto p-1">
            {openedCards.map((card, i) => <CardImage key={i} card={card} small />)}
          </div>
          <button
            onClick={() => { setPhase('building'); setBuildTimer(BUILD_TIME); }}
            className="w-full py-3 bg-yellow-500 hover:bg-yellow-400 text-black font-bold rounded-xl text-lg"
          >
            Build My Deck →
          </button>
        </div>
      </div>
    );
  }

  // ── Deck building ──────────────────────────────────────────────────────────
  if (phase === 'building') {
    const poolCards = pool.map(id => cardFromId(id)).filter(Boolean) as CardData[];
    const nonEnergyPool = poolCards.filter(c => !(c.supertype === 'Energy' && !c.rarity));
    const mins = Math.floor(buildTimer / 60);
    const secs = buildTimer % 60;
    const timerColor = buildTimer < 60 ? 'text-red-400' : buildTimer < 120 ? 'text-yellow-400' : 'text-green-400';

    return (
      <div className="min-h-screen bg-gray-950 text-white p-4">
        <div className="max-w-2xl mx-auto space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-black">Build Your Sealed Deck</h2>
              <p className="text-xs text-gray-400">{deck.length}/{DECK_SIZE} cards selected</p>
            </div>
            <div className="text-right">
              <div className={`text-2xl font-black ${timerColor}`}>{mins}:{secs.toString().padStart(2, '0')}</div>
              <div className="text-xs text-gray-400">remaining</div>
            </div>
          </div>

          {/* Energy adder */}
          <div className="bg-gray-800 rounded-xl p-3 space-y-2">
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Basic Energy (unlimited)</p>
            <div className="flex flex-wrap gap-2">
              {ENERGY_TYPES.map(type => {
                const count = energyCounts[type] ?? 0;
                return (
                  <div key={type} className="flex items-center gap-1">
                    <button onClick={() => removeEnergy(type)} disabled={count === 0} className="w-6 h-6 bg-gray-700 hover:bg-gray-600 disabled:opacity-30 rounded text-sm font-bold">−</button>
                    <span className="text-xs text-gray-300 min-w-[64px] text-center">{type} {count > 0 ? `×${count}` : ''}</span>
                    <button onClick={() => addEnergy(type)} disabled={deck.length >= DECK_SIZE} className="w-6 h-6 bg-gray-700 hover:bg-gray-600 disabled:opacity-30 rounded text-sm font-bold">+</button>
                  </div>
                );
              })}
            </div>
          </div>

          <p className="text-xs text-gray-400">Click cards to add/remove (highlighted = in deck):</p>
          <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 gap-2 max-h-[45vh] overflow-y-auto p-1">
            {nonEnergyPool.map((card, i) => {
              const inDeck = deck.includes(card.id);
              return (
                <div
                  key={i}
                  onClick={() => toggleCard(card.id)}
                  className={`cursor-pointer rounded-lg transition-all ${inDeck ? 'ring-2 ring-yellow-400 opacity-100' : 'opacity-60 hover:opacity-80'}`}
                >
                  <CardImage card={card} small />
                </div>
              );
            })}
          </div>

          <button
            onClick={startBattle}
            disabled={deck.length !== DECK_SIZE}
            className="w-full py-3 bg-red-600 hover:bg-red-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold rounded-xl text-lg"
          >
            {deck.length === DECK_SIZE ? '⚔️ Start Sealed Battle!' : `${DECK_SIZE - deck.length} more cards needed`}
          </button>
        </div>
      </div>
    );
  }

  return null;
}
