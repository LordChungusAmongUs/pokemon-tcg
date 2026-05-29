'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
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
const PACKS_PER_PLAYER = 5;
const TOTAL_PACKS = PACKS_PER_PLAYER * 2;
const DECK_SIZE = 40;
const BUILD_TIME = 600; // 10 minutes in seconds

type DraftPhase = 'setup' | 'drafting' | 'handoff' | 'p1-building' | 'p2-building' | 'battle';

interface DraftState {
  setName: string;
  packs: string[][];           // 10 packs of card IDs
  currentPackIndex: number;    // 0-9
  currentCards: string[];      // remaining cards in current pack
  currentPicker: number;       // 0=P1, 1=P2
  p1Pool: string[];
  p2Pool: string[];
  p1Deck: string[];
  p2Deck: string[];
  energyAdded: Record<EnergyType, number>; // for current builder
  pickTimer: number;
  buildTimer: number;
}

function cardFromId(id: string): CardData | undefined {
  return BROWSE_CARDS.find(c => c.id === id);
}

function packOpener(packIndex: number): number {
  // Even packs (0,2,4,6,8) opened by P1; odd packs by P2
  return packIndex % 2 === 0 ? 0 : 1;
}

export default function DraftPage() {
  const router = useRouter();
  const { user, unopenedPacks, consumeOnePack, addToCollection, collection } = useAuthStore();
  const { startGame } = useGameStore();

  const [phase, setPhase] = useState<DraftPhase>('setup');
  const [handoffMsg, setHandoffMsg] = useState('');
  const [draft, setDraft] = useState<DraftState | null>(null);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const clearTimer = useCallback(() => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
  }, []);

  // Pick timer countdown
  useEffect(() => {
    if (phase !== 'drafting' || !draft) return;
    clearTimer();
    timerRef.current = setInterval(() => {
      setDraft(prev => {
        if (!prev) return prev;
        if (prev.pickTimer <= 1) {
          // Auto-pick first card when time runs out
          autoPick(prev);
          return prev;
        }
        return { ...prev, pickTimer: prev.pickTimer - 1 };
      });
    }, 1000);
    return clearTimer;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, draft?.currentPackIndex, draft?.currentPicker]);

  // Build timer countdown
  useEffect(() => {
    if (phase !== 'p1-building' && phase !== 'p2-building') return;
    clearTimer();
    timerRef.current = setInterval(() => {
      setDraft(prev => {
        if (!prev) return prev;
        if (prev.buildTimer <= 0) return prev;
        return { ...prev, buildTimer: prev.buildTimer - 1 };
      });
    }, 1000);
    return clearTimer;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  function autoPick(state: DraftState) {
    if (state.currentCards.length === 0) return;
    handlePick(state.currentCards[0], state);
  }

  function startDraft(setName: string) {
    // Consume 10 packs (5 per player from shared inventory)
    const available = unopenedPacks[setName] ?? 0;
    if (available < TOTAL_PACKS) {
      alert(`You need ${TOTAL_PACKS} unopened ${setName} packs to start a draft (you have ${available}).`);
      return;
    }
    for (let i = 0; i < TOTAL_PACKS; i++) consumeOnePack(setName);

    // Generate all packs with balance tracking across the draft session
    const packs: string[][] = [];
    const tempCollection: Record<string, number> = { ...collection };
    for (let i = 0; i < TOTAL_PACKS; i++) {
      const allIds = generatePackCards(setName, tempCollection);
      for (const id of allIds) tempCollection[id] = (tempCollection[id] ?? 0) + 1;
      // Only non-energy cards go into the draft pool
      const nonEnergy = allIds.filter(id => {
        const c = ALL_CARDS.find(x => x.id === id);
        return c && !(c.supertype === 'Energy' && !c.rarity);
      });
      packs.push(nonEnergy);
    }

    const firstPack = packs[0];
    const initDraft: DraftState = {
      setName,
      packs,
      currentPackIndex: 0,
      currentCards: [...firstPack],
      currentPicker: packOpener(0), // P1 opens pack 0
      p1Pool: [],
      p2Pool: [],
      p1Deck: [],
      p2Deck: [],
      energyAdded: {} as Record<EnergyType, number>,
      pickTimer: firstPack.length * 5,
      buildTimer: BUILD_TIME,
    };

    setDraft(initDraft);
    setPhase('drafting');
  }

  function handlePick(cardId: string, state?: DraftState) {
    const d = state ?? draft;
    if (!d) return;

    const remaining = d.currentCards.filter(id => id !== cardId);
    const picker = d.currentPicker;

    const newP1Pool = picker === 0 ? [...d.p1Pool, cardId] : d.p1Pool;
    const newP2Pool = picker === 1 ? [...d.p2Pool, cardId] : d.p2Pool;

    if (remaining.length === 0) {
      // Pack exhausted — move to next pack
      const nextPackIndex = d.currentPackIndex + 1;
      if (nextPackIndex >= TOTAL_PACKS) {
        // All packs done — go to deck building
        clearTimer();
        setDraft(prev => prev ? { ...prev, p1Pool: newP1Pool, p2Pool: newP2Pool } : prev);
        setHandoffMsg('Drafting complete! Pass to Player 1 to build their deck.');
        setPhase('handoff');
        return;
      }
      const nextPack = d.packs[nextPackIndex];
      const nextOpener = packOpener(nextPackIndex);
      setDraft({
        ...d,
        p1Pool: newP1Pool,
        p2Pool: newP2Pool,
        currentPackIndex: nextPackIndex,
        currentCards: [...nextPack],
        currentPicker: nextOpener,
        pickTimer: nextPack.length * 5,
      });
    } else {
      // Pass remaining cards to other player
      const nextPicker = picker === 0 ? 1 : 0;
      setDraft({
        ...d,
        p1Pool: newP1Pool,
        p2Pool: newP2Pool,
        currentCards: remaining,
        currentPicker: nextPicker,
        pickTimer: remaining.length * 5,
      });
    }
  }

  function toggleDeckCard(cardId: string, isBuilding: 'p1' | 'p2') {
    setDraft(prev => {
      if (!prev) return prev;
      const deckKey = isBuilding === 'p1' ? 'p1Deck' : 'p2Deck';
      const deck = prev[deckKey];
      const inDeck = deck.includes(cardId);
      if (inDeck) {
        return { ...prev, [deckKey]: deck.filter(id => id !== cardId) };
      } else {
        if (deck.length >= DECK_SIZE) return prev; // can't add more
        return { ...prev, [deckKey]: [...deck, cardId] };
      }
    });
  }

  function addEnergy(type: EnergyType, isBuilding: 'p1' | 'p2') {
    setDraft(prev => {
      if (!prev) return prev;
      const deckKey = isBuilding === 'p1' ? 'p1Deck' : 'p2Deck';
      if (prev[deckKey].length >= DECK_SIZE) return prev;
      const energyCard = BASIC_ENERGY_CARDS.find(e => e.types[0] === type);
      if (!energyCard) return prev;
      return { ...prev, [deckKey]: [...prev[deckKey], energyCard.id] };
    });
  }

  function removeEnergy(type: EnergyType, isBuilding: 'p1' | 'p2') {
    setDraft(prev => {
      if (!prev) return prev;
      const deckKey = isBuilding === 'p1' ? 'p1Deck' : 'p2Deck';
      const deck = prev[deckKey];
      const energyCard = BASIC_ENERGY_CARDS.find(e => e.types[0] === type);
      if (!energyCard) return prev;
      const idx = deck.lastIndexOf(energyCard.id);
      if (idx === -1) return prev;
      const updated = [...deck];
      updated.splice(idx, 1);
      return { ...prev, [deckKey]: updated };
    });
  }

  function finishBuilding(player: 'p1' | 'p2') {
    if (!draft) return;
    const deck = player === 'p1' ? draft.p1Deck : draft.p2Deck;
    if (deck.length < DECK_SIZE) {
      alert(`Deck must be exactly ${DECK_SIZE} cards. You have ${deck.length}.`);
      return;
    }
    clearTimer();
    if (player === 'p1') {
      // Add drafted cards to collection
      addToCollection(draft.p1Pool);
      setHandoffMsg('Pass device to Player 2 to build their deck.');
      setPhase('handoff');
    } else {
      addToCollection(draft.p2Pool);
      startBattle();
    }
  }

  function startBattle() {
    if (!draft) return;
    const p1Cards = draft.p1Deck.map(id => cardFromId(id)).filter(Boolean) as CardData[];
    const p2Cards = draft.p2Deck.map(id => cardFromId(id)).filter(Boolean) as CardData[];

    const hasBasic1 = p1Cards.some(c => isBasicPokemon(c));
    const hasBasic2 = p2Cards.some(c => isBasicPokemon(c));
    if (!hasBasic1 || !hasBasic2) {
      alert('Both decks need at least one Basic Pokémon!');
      return;
    }
    startGame('Player 1', p1Cards, 'Player 2', p2Cards, 'local-2p');
    router.push('/game');
  }

  // ── Setup phase ────────────────────────────────────────────────────────────
  if (phase === 'setup') {
    const draftSets = SET_PROGRESSION
      .filter(s => !['Base Set 2', 'Diamond & Pearl'].includes(s.name))
      .map(s => ({ name: s.name, count: unopenedPacks[s.name] ?? 0 }))
      .filter(s => s.count > 0);

    return (
      <div className="min-h-screen bg-gray-950 text-white p-4">
        <div className="max-w-md mx-auto space-y-6 pt-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-black text-yellow-400">Draft</h1>
              <p className="text-xs text-gray-400 mt-0.5">2 players · 5 packs each · 45 drafted cards</p>
            </div>
            <Link href="/" className="text-sm text-gray-400 hover:text-white">← Home</Link>
          </div>

          <div className="bg-gray-800 rounded-xl p-4 text-sm text-gray-300 space-y-1.5">
            <p className="font-bold text-white text-base">How Draft Works</p>
            <p>• Requires {TOTAL_PACKS} unopened packs ({PACKS_PER_PLAYER} per player)</p>
            <p>• Packs open one at a time — the owner picks first, then passes left</p>
            <p>• Timer: 5 sec × remaining cards in pack</p>
            <p>• Direction rotates after each pack is exhausted</p>
            <p>• Each player drafts 45 cards, then builds a 40-card deck</p>
            <p>• 10 minutes to build your deck</p>
            <p>• You keep every card you draft!</p>
          </div>

          {draftSets.length === 0 ? (
            <div className="text-center space-y-3 py-8">
              <p className="text-gray-400">No unopened packs available.</p>
              <p className="text-sm text-gray-500">You need {TOTAL_PACKS} packs of the same set to draft.</p>
              <Link href="/shop" className="inline-block px-6 py-2 bg-yellow-500 rounded-xl text-black font-bold">
                Buy Packs →
              </Link>
            </div>
          ) : (
            <div className="space-y-3">
              <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider">Choose a Set</h3>
              {draftSets.map(({ name, count }) => (
                <div key={name} className={`rounded-xl p-4 border ${count >= TOTAL_PACKS ? 'bg-gray-800 border-gray-600' : 'bg-gray-900 border-gray-800 opacity-60'}`}>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-bold">{name}</p>
                      <p className="text-xs text-gray-400 mt-0.5">{count} packs available · needs {TOTAL_PACKS}</p>
                    </div>
                    <button
                      onClick={() => startDraft(name)}
                      disabled={count < TOTAL_PACKS}
                      className="px-4 py-2 bg-yellow-500 hover:bg-yellow-400 disabled:opacity-40 disabled:cursor-not-allowed text-black font-bold rounded-xl text-sm"
                    >
                      Draft!
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

  // ── Handoff screen ─────────────────────────────────────────────────────────
  if (phase === 'handoff') {
    const isPostDraft = handoffMsg.includes('complete');
    const isP2Turn = handoffMsg.includes('Player 2');
    return (
      <div className="min-h-screen bg-gray-950 text-white flex items-center justify-center p-4">
        <div className="text-center space-y-6 max-w-sm w-full">
          <div className="text-6xl">{isPostDraft ? '✅' : '🤝'}</div>
          <h2 className="text-2xl font-black">{handoffMsg}</h2>
          <button
            onClick={() => {
              setDraft(prev => prev ? { ...prev, buildTimer: BUILD_TIME, energyAdded: {} as Record<EnergyType, number> } : prev);
              setPhase(isP2Turn ? 'p2-building' : 'p1-building');
            }}
            className="w-full py-3 bg-yellow-500 hover:bg-yellow-400 text-black font-bold rounded-xl text-lg"
          >
            I&apos;m Ready — Build Deck
          </button>
        </div>
      </div>
    );
  }

  // ── Drafting phase ─────────────────────────────────────────────────────────
  if (phase === 'drafting' && draft) {
    const pickerName = draft.currentPicker === 0 ? 'Player 1' : 'Player 2';
    const pool = draft.currentPicker === 0 ? draft.p1Pool : draft.p2Pool;
    const timerColor = draft.pickTimer <= 10 ? 'text-red-400' : draft.pickTimer <= 20 ? 'text-yellow-400' : 'text-green-400';
    const totalCards = draft.packs.reduce((s, p) => s + p.length, 0);
    const pickedTotal = draft.p1Pool.length + draft.p2Pool.length;
    const progress = Math.round((pickedTotal / totalCards) * 100);

    return (
      <div className="min-h-screen bg-gray-950 text-white p-4">
        <div className="max-w-2xl mx-auto space-y-4">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div>
              <span className="text-xs text-gray-400 uppercase tracking-wider">Pack {draft.currentPackIndex + 1}/{TOTAL_PACKS}</span>
              <h2 className="text-xl font-black">{pickerName}&apos;s Pick</h2>
            </div>
            <div className="text-right">
              <div className={`text-3xl font-black ${timerColor}`}>{draft.pickTimer}s</div>
              <div className="text-xs text-gray-400">{draft.currentCards.length} cards left in pack</div>
            </div>
          </div>

          {/* Progress bar */}
          <div className="h-1.5 bg-gray-800 rounded-full">
            <div className="h-full bg-yellow-400 rounded-full transition-all" style={{ width: `${progress}%` }} />
          </div>

          {/* Pool counts */}
          <div className="flex gap-4 text-sm text-gray-400">
            <span>P1 drafted: <span className="text-white font-bold">{draft.p1Pool.length}</span></span>
            <span>P2 drafted: <span className="text-white font-bold">{draft.p2Pool.length}</span></span>
            <span>Pool: <span className="text-white font-bold">{pool.length}</span> cards</span>
          </div>

          {/* Cards to pick from */}
          <p className="text-sm text-gray-400">Pick one card — the rest pass to the other player:</p>
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3">
            {draft.currentCards.map(id => {
              const card = cardFromId(id);
              if (!card) return null;
              return (
                <div
                  key={id}
                  className="cursor-pointer hover:ring-2 ring-yellow-400 rounded-lg transition-all"
                  onClick={() => handlePick(id)}
                >
                  <CardImage card={card} small />
                  <p className="text-[9px] text-gray-400 text-center truncate mt-0.5">{card.name}</p>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  // ── Deck building phase ────────────────────────────────────────────────────
  if ((phase === 'p1-building' || phase === 'p2-building') && draft) {
    const isP1 = phase === 'p1-building';
    const playerName = isP1 ? 'Player 1' : 'Player 2';
    const pool = isP1 ? draft.p1Pool : draft.p2Pool;
    const deck = isP1 ? draft.p1Deck : draft.p2Deck;
    const buildKey = isP1 ? 'p1' : 'p2';

    const deckNonEnergy = deck.filter(id => !id.startsWith('basic-'));
    const energyCounts: Partial<Record<EnergyType, number>> = {};
    deck.forEach(id => {
      const e = BASIC_ENERGY_CARDS.find(c => c.id === id);
      if (e) energyCounts[e.types[0] as EnergyType] = (energyCounts[e.types[0] as EnergyType] ?? 0) + 1;
    });

    const mins = Math.floor(draft.buildTimer / 60);
    const secs = draft.buildTimer % 60;
    const timerColor = draft.buildTimer < 60 ? 'text-red-400' : draft.buildTimer < 120 ? 'text-yellow-400' : 'text-green-400';

    // Auto-submit when timer hits 0
    if (draft.buildTimer === 0 && deck.length < DECK_SIZE) {
      // Fill remaining slots with first energy type from pool pokémon
      const pTypes = new Set(pool.map(id => {
        const c = ALL_CARDS.find(x => x.id === id);
        return c?.types?.[0];
      }).filter(Boolean) as EnergyType[]);
      const fillType = pTypes.values().next().value ?? 'Colorless';
      const toFill = DECK_SIZE - deck.length;
      for (let i = 0; i < toFill; i++) addEnergy(fillType, buildKey);
    }

    return (
      <div className="min-h-screen bg-gray-950 text-white p-4">
        <div className="max-w-2xl mx-auto space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-black">{playerName} — Build Your Deck</h2>
              <p className="text-xs text-gray-400">Select {DECK_SIZE} cards · {deck.length}/{DECK_SIZE} chosen</p>
            </div>
            <div className="text-right">
              <div className={`text-2xl font-black ${timerColor}`}>{mins}:{secs.toString().padStart(2, '0')}</div>
              <div className="text-xs text-gray-400">remaining</div>
            </div>
          </div>

          {/* Energy adder */}
          <div className="bg-gray-800 rounded-xl p-3 space-y-2">
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Add Basic Energy</p>
            <div className="flex flex-wrap gap-2">
              {ENERGY_TYPES.map(type => {
                const count = energyCounts[type] ?? 0;
                return (
                  <div key={type} className="flex items-center gap-1">
                    <button
                      onClick={() => removeEnergy(type, buildKey)}
                      disabled={count === 0}
                      className="w-6 h-6 bg-gray-700 hover:bg-gray-600 disabled:opacity-30 rounded text-sm font-bold"
                    >−</button>
                    <span className="text-xs text-gray-300 min-w-[60px] text-center">{type} {count > 0 ? `×${count}` : ''}</span>
                    <button
                      onClick={() => addEnergy(type, buildKey)}
                      disabled={deck.length >= DECK_SIZE}
                      className="w-6 h-6 bg-gray-700 hover:bg-gray-600 disabled:opacity-30 rounded text-sm font-bold"
                    >+</button>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Drafted cards */}
          <p className="text-xs text-gray-400">Click to add/remove from deck (highlighted = in deck):</p>
          <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 gap-2">
            {pool.map(id => {
              const card = cardFromId(id);
              if (!card) return null;
              const inDeck = deck.includes(id);
              return (
                <div
                  key={id}
                  onClick={() => toggleDeckCard(id, buildKey)}
                  className={`cursor-pointer rounded-lg transition-all ${inDeck ? 'ring-2 ring-yellow-400 opacity-100' : 'opacity-60 hover:opacity-80'}`}
                >
                  <CardImage card={card} small />
                </div>
              );
            })}
          </div>

          <button
            onClick={() => finishBuilding(buildKey)}
            disabled={deck.length !== DECK_SIZE}
            className="w-full py-3 bg-yellow-500 hover:bg-yellow-400 disabled:opacity-40 disabled:cursor-not-allowed text-black font-bold rounded-xl text-lg"
          >
            {deck.length === DECK_SIZE ? (isP1 ? 'Done — Pass to Player 2 →' : 'Start Battle! ⚔️') : `${DECK_SIZE - deck.length} more cards needed`}
          </button>
        </div>
      </div>
    );
  }

  return null;
}
