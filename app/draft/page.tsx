'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/authStore';
import { useGameStore } from '@/store/gameStore';
import { ALL_CARDS, BASIC_ENERGY_CARDS, isBasicPokemon } from '@/lib/cardUtils';
import { generatePackCards, SET_PROGRESSION, EVENT_PROMO_IDS } from '@/lib/progression';
import { generateAIDeck } from '@/ai/deckGenerator';
import CardImage from '@/components/cards/CardImage';
import type { CardData, EnergyType } from '@/engine/GameState';

const BROWSE_CARDS = [...ALL_CARDS, ...BASIC_ENERGY_CARDS];
const ENERGY_TYPES: EnergyType[] = ['Fire', 'Water', 'Grass', 'Lightning', 'Psychic', 'Fighting', 'Colorless', 'Darkness', 'Metal'];
const DRAFT_PACKS = 5;
const NUM_PARTICIPANTS = 4; // 1 human + 3 AI
const DECK_SIZE = 40;
const BUILD_TIME = 600; // 10 minutes
const AI_NAMES = ['Trainer Red', 'Misty', 'Brock'] as const;

type DraftPhase = 'setup' | 'drafting' | 'complete' | 'building';

interface LastAIPick { name: string; cardName: string }

interface DraftState {
  setName: string;
  allPacks: string[][][];           // [round][participant] = card IDs
  packRound: number;                // 0 .. DRAFT_PACKS-1
  passDirection: 1 | -1;           // +1 = clockwise, -1 = counter-clockwise
  hands: string[][];                // [NUM_PARTICIPANTS] current hand per participant
  pools: string[][];                // [NUM_PARTICIPANTS] accumulated drafted cards
  humanDeck: string[];
  buildTimer: number;
  lastAIPicks: LastAIPick[];
}

function cardFromId(id: string): CardData | undefined {
  return BROWSE_CARDS.find(c => c.id === id);
}

// AI picks the best available card by rarity, falling back to random
function aiPick(hand: string[]): string {
  const rarityOrder = ['Rare Holo', 'Holo Rare', 'Rare', 'Uncommon', 'Common'];
  for (const rarity of rarityOrder) {
    const found = hand.find(id => ALL_CARDS.find(c => c.id === id)?.rarity === rarity);
    if (found) return found;
  }
  return hand[Math.floor(Math.random() * hand.length)];
}

export default function DraftPage() {
  const router = useRouter();
  const { user, profile, unopenedPacks, consumeOnePack, addToCollection, collection } = useAuthStore();
  const [participationPromoId, setParticipationPromoId] = useState<string | null>(null);
  const { startGame } = useGameStore();

  const [phase, setPhase] = useState<DraftPhase>('setup');
  const [draft, setDraft] = useState<DraftState | null>(null);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const collectionAddedRef = useRef(false);

  const clearTimer = useCallback(() => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
  }, []);

  // Build timer countdown
  useEffect(() => {
    if (phase !== 'building') return;
    clearTimer();
    timerRef.current = setInterval(() => {
      setDraft(prev => {
        if (!prev || prev.buildTimer <= 0) return prev;
        return { ...prev, buildTimer: prev.buildTimer - 1 };
      });
    }, 1000);
    return clearTimer;
  }, [phase, clearTimer]);

  // Detect draft completion (all hands empty on last round)
  useEffect(() => {
    if (phase !== 'drafting' || !draft) return;
    const allEmpty = draft.hands.every(h => h.length === 0);
    const lastRound = draft.packRound >= DRAFT_PACKS - 1;
    if (allEmpty && lastRound && !collectionAddedRef.current) {
      collectionAddedRef.current = true;
      addToCollection(draft.pools[0]);
      setPhase('complete');
    }
  }, [draft, phase, addToCollection]);

  // ── Start draft ────────────────────────────────────────────────────────────
  function startDraft(setName: string) {
    const available = unopenedPacks[setName] ?? 0;
    if (available < DRAFT_PACKS) {
      alert(`You need ${DRAFT_PACKS} unopened ${setName} packs to draft (you have ${available}).`);
      return;
    }
    for (let i = 0; i < DRAFT_PACKS; i++) consumeOnePack(setName);

    // Generate all packs upfront: allPacks[round][participant]
    // Human uses inventory packs; AI packs are generated free
    const tempCollection: Record<string, number> = { ...collection };
    const allPacks: string[][][] = [];
    for (let round = 0; round < DRAFT_PACKS; round++) {
      const roundPacks: string[][] = [];
      for (let p = 0; p < NUM_PARTICIPANTS; p++) {
        const ids = generatePackCards(setName, tempCollection);
        for (const id of ids) tempCollection[id] = (tempCollection[id] ?? 0) + 1;
        // Exclude basic energy — only Pokémon and Trainers enter the draft pool
        const nonEnergy = ids.filter(id => {
          const c = ALL_CARDS.find(x => x.id === id);
          return c && !(c.supertype === 'Energy' && !c.rarity);
        });
        roundPacks.push(nonEnergy);
      }
      allPacks.push(roundPacks);
    }

    // Award 1 Black Star Promo for participating in the draft (#1-20, #22-28)
    const promoPool = ALL_CARDS.filter(
      c => c.set === 'Wizards Black Star Promos' && EVENT_PROMO_IDS.includes(c.id)
    );
    if (promoPool.length > 0) {
      const pick = promoPool[Math.floor(Math.random() * promoPool.length)];
      addToCollection([pick.id]);
      setParticipationPromoId(pick.id);
    }

    collectionAddedRef.current = false;
    setDraft({
      setName,
      allPacks,
      packRound: 0,
      passDirection: 1,
      hands: allPacks[0].map(p => [...p]),
      pools: Array.from({ length: NUM_PARTICIPANTS }, () => []),
      humanDeck: [],
      buildTimer: BUILD_TIME,
      lastAIPicks: [],
    });
    setPhase('drafting');
  }

  // ── Human picks a card ─────────────────────────────────────────────────────
  function handleHumanPick(cardId: string) {
    setDraft(prev => {
      if (!prev) return prev;
      const { hands, pools, passDirection, packRound, allPacks } = prev;

      // Deep-copy
      const newPools = pools.map(p => [...p]);
      const newHands = hands.map(h => [...h]);

      // Human picks
      newPools[0] = [...newPools[0], cardId];
      newHands[0] = newHands[0].filter(id => id !== cardId);

      // AI participants each pick from their own hand simultaneously
      const lastAIPicks: LastAIPick[] = [];
      for (let i = 1; i < NUM_PARTICIPANTS; i++) {
        if (newHands[i].length === 0) continue;
        const picked = aiPick(newHands[i]);
        newPools[i] = [...newPools[i], picked];
        newHands[i] = newHands[i].filter(id => id !== picked);
        lastAIPicks.push({ name: AI_NAMES[i - 1], cardName: cardFromId(picked)?.name ?? picked });
      }

      // Everyone passes their remaining hand to their neighbor
      const passedHands: string[][] = Array.from({ length: NUM_PARTICIPANTS }, () => []);
      for (let i = 0; i < NUM_PARTICIPANTS; i++) {
        const dest = ((i + passDirection) + NUM_PARTICIPANTS) % NUM_PARTICIPANTS;
        passedHands[dest] = newHands[i];
      }

      // All hands empty → pack round complete
      const allEmpty = passedHands.every(h => h.length === 0);
      if (allEmpty) {
        const nextRound = packRound + 1;
        if (nextRound >= DRAFT_PACKS) {
          // All packs drafted — useEffect will handle transition to 'complete'
          return { ...prev, hands: passedHands, pools: newPools, lastAIPicks };
        }
        // Start next round: reverse direction, deal new packs
        return {
          ...prev,
          packRound: nextRound,
          passDirection: (passDirection * -1) as 1 | -1,
          hands: allPacks[nextRound].map(p => [...p]),
          pools: newPools,
          lastAIPicks,
        };
      }

      return { ...prev, hands: passedHands, pools: newPools, lastAIPicks };
    });
  }

  // ── Deck builder helpers ───────────────────────────────────────────────────
  function toggleDeckCard(cardId: string) {
    setDraft(prev => {
      if (!prev) return prev;
      const inDeck = prev.humanDeck.includes(cardId);
      if (inDeck) return { ...prev, humanDeck: prev.humanDeck.filter(id => id !== cardId) };
      if (prev.humanDeck.length >= DECK_SIZE) return prev;
      return { ...prev, humanDeck: [...prev.humanDeck, cardId] };
    });
  }

  function addEnergy(type: EnergyType) {
    setDraft(prev => {
      if (!prev || prev.humanDeck.length >= DECK_SIZE) return prev;
      const energyCard = BASIC_ENERGY_CARDS.find(e => e.types[0] === type);
      if (!energyCard) return prev;
      return { ...prev, humanDeck: [...prev.humanDeck, energyCard.id] };
    });
  }

  function removeEnergy(type: EnergyType) {
    setDraft(prev => {
      if (!prev) return prev;
      const energyCard = BASIC_ENERGY_CARDS.find(e => e.types[0] === type);
      if (!energyCard) return prev;
      const idx = prev.humanDeck.lastIndexOf(energyCard.id);
      if (idx === -1) return prev;
      const updated = [...prev.humanDeck];
      updated.splice(idx, 1);
      return { ...prev, humanDeck: updated };
    });
  }

  function startBattle() {
    if (!draft) return;
    const humanCards = draft.humanDeck.map(id => cardFromId(id)).filter(Boolean) as CardData[];
    if (!humanCards.some(c => isBasicPokemon(c))) {
      alert('Your deck needs at least one Basic Pokémon!');
      return;
    }
    const aiResult = generateAIDeck(2, collection);
    const playerName = profile?.display_name ?? user?.email?.split('@')[0] ?? 'Trainer';
    startGame(playerName, humanCards, aiResult.name, aiResult.cards, 'vs-ai', { type: 'draft', setName: draft.setName });
    router.push('/game');
  }

  // ── Setup ──────────────────────────────────────────────────────────────────
  if (phase === 'setup') {
    const draftSets = SET_PROGRESSION
      .filter(s => !['Base Set 2', 'Diamond & Pearl', 'Wizards Black Star Promos'].includes(s.name))
      .map(s => ({ name: s.name, count: unopenedPacks[s.name] ?? 0 }))
      .filter(s => s.count > 0);

    return (
      <div className="min-h-screen bg-gray-950 text-white p-4">
        <div className="max-w-md mx-auto space-y-6 pt-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-black text-yellow-400">Draft</h1>
              <p className="text-xs text-gray-400 mt-0.5">You + 3 AI · {DRAFT_PACKS} packs each · build &amp; battle</p>
            </div>
            <Link href="/" className="text-sm text-gray-400 hover:text-white">← Home</Link>
          </div>

          <div className="bg-gray-800 rounded-xl p-4 text-sm text-gray-300 space-y-1.5">
            <p className="font-bold text-white text-base">How Draft Works</p>
            <p>• Costs {DRAFT_PACKS} packs from your inventory</p>
            <p>• You + 3 AI opponents each open packs simultaneously</p>
            <p>• Pick 1 card, pass the rest to your neighbour</p>
            <p>• Direction reverses every new pack</p>
            <p>• After {DRAFT_PACKS} packs, build a {DECK_SIZE}-card deck from your picks</p>
            <p>• Battle vs an AI opponent with your drafted deck</p>
            <p className="text-yellow-400 font-bold">• You keep every card you draft!</p>
          </div>

          {draftSets.length === 0 ? (
            <div className="text-center space-y-3 py-8">
              <p className="text-gray-400">No unopened packs available.</p>
              <p className="text-sm text-gray-500">You need {DRAFT_PACKS} packs of the same set to draft.</p>
              <Link href="/shop" className="inline-block px-6 py-2 bg-yellow-500 rounded-xl text-black font-bold">
                Buy Packs →
              </Link>
            </div>
          ) : (
            <div className="space-y-3">
              <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider">Choose a Set</h3>
              {draftSets.map(({ name, count }) => (
                <div
                  key={name}
                  className={`rounded-xl p-4 border ${count >= DRAFT_PACKS ? 'bg-gray-800 border-gray-600' : 'bg-gray-900 border-gray-800 opacity-60'}`}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-bold">{name}</p>
                      <p className="text-xs text-gray-400 mt-0.5">{count} pack{count !== 1 ? 's' : ''} · needs {DRAFT_PACKS}</p>
                    </div>
                    <button
                      onClick={() => startDraft(name)}
                      disabled={count < DRAFT_PACKS}
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

  // ── Drafting ───────────────────────────────────────────────────────────────
  if (phase === 'drafting' && draft) {
    const humanHand = draft.hands[0];
    const passLabel = draft.passDirection === 1 ? '→' : '←';
    const passNeighbour = draft.passDirection === 1 ? AI_NAMES[0] : AI_NAMES[2];
    const pickNum = draft.pools[0].length + 1;
    const totalCards = draft.allPacks.reduce((s, r) => s + r.reduce((ss, p) => ss + p.length, 0), 0);
    const totalPicked = draft.pools.reduce((s, p) => s + p.length, 0);
    const progress = totalCards > 0 ? Math.round((totalPicked / totalCards) * 100) : 0;

    return (
      <div className="min-h-screen bg-gray-950 text-white p-4">
        <div className="max-w-2xl mx-auto space-y-4">

          {/* Header */}
          <div className="flex items-center justify-between">
            <div>
              <span className="text-xs text-gray-400 uppercase tracking-wider">
                Pack {draft.packRound + 1}/{DRAFT_PACKS} · Pick {pickNum}
              </span>
              <h2 className="text-xl font-black">Your Pick</h2>
            </div>
            <div className="text-right text-sm text-gray-400">
              <div>Passing {passLabel} to {passNeighbour}</div>
              <div>{humanHand.length} card{humanHand.length !== 1 ? 's' : ''} in hand</div>
            </div>
          </div>

          {/* Progress bar */}
          <div className="h-1.5 bg-gray-800 rounded-full">
            <div className="h-full bg-yellow-400 rounded-full transition-all" style={{ width: `${progress}%` }} />
          </div>

          {/* Pool counts */}
          <div className="flex flex-wrap gap-3 text-xs text-gray-400">
            <span>You: <span className="text-white font-bold">{draft.pools[0].length}</span></span>
            {AI_NAMES.map((name, i) => (
              <span key={name}>{name}: <span className="text-gray-300 font-bold">{draft.pools[i + 1].length}</span></span>
            ))}
          </div>

          {/* Last round AI picks */}
          {draft.lastAIPicks.length > 0 && (
            <div className="bg-gray-800/50 rounded-lg px-3 py-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-400">
              {draft.lastAIPicks.map((p, i) => (
                <span key={i}>
                  <span className="text-gray-200">{p.name}</span> picked{' '}
                  <span className="text-yellow-300 font-semibold">{p.cardName}</span>
                </span>
              ))}
            </div>
          )}

          {/* Cards to pick from */}
          {humanHand.length === 0 ? (
            <div className="text-center py-12 text-gray-500">Waiting for next pack…</div>
          ) : (
            <>
              <p className="text-sm text-gray-400">
                Pick one card — the rest pass {passLabel} to {passNeighbour}:
              </p>
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3">
                {humanHand.map(id => {
                  const card = cardFromId(id);
                  if (!card) return null;
                  return (
                    <div
                      key={id}
                      className="cursor-pointer hover:ring-2 ring-yellow-400 rounded-lg transition-all"
                      onClick={() => handleHumanPick(id)}
                    >
                      <CardImage card={card} small />
                      <p className="text-[9px] text-gray-400 text-center truncate mt-0.5">{card.name}</p>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </div>
    );
  }

  // ── Draft Complete ─────────────────────────────────────────────────────────
  if (phase === 'complete' && draft) {
    const humanPool = draft.pools[0];
    const rareCount = humanPool.filter(id => {
      const c = ALL_CARDS.find(x => x.id === id);
      return c?.rarity?.toLowerCase().includes('rare');
    }).length;
    const promoCard = participationPromoId ? ALL_CARDS.find(c => c.id === participationPromoId) : null;

    return (
      <div className="min-h-screen bg-gray-950 text-white flex items-center justify-center p-4">
        <div className="text-center space-y-6 max-w-sm w-full">
          <div className="text-6xl">✅</div>
          <div>
            <h2 className="text-2xl font-black">Draft Complete!</h2>
            <p className="text-gray-400 mt-2">
              You drafted{' '}
              <span className="text-white font-bold">{humanPool.length}</span> cards
              {rareCount > 0 && (
                <> including <span className="text-yellow-400 font-bold">{rareCount}</span> rare{rareCount !== 1 ? 's' : ''}</>
              )}.
            </p>
            <p className="text-xs text-gray-500 mt-1">They&apos;ve been added to your collection.</p>
          </div>
          {promoCard && (
            <div className="bg-yellow-900/30 border border-yellow-600/40 rounded-xl px-4 py-3 space-y-2">
              <p className="text-sm text-yellow-300 font-bold">⭐ Participation Reward</p>
              <p className="text-xs text-gray-300">1 × Wizards Black Star Promo added to your collection!</p>
              <div className="flex justify-center">
                <CardImage card={promoCard} />
              </div>
              <p className="text-sm font-bold text-white">{promoCard.name}</p>
            </div>
          )}
          <button
            onClick={() => setPhase('building')}
            className="w-full py-3 bg-yellow-500 hover:bg-yellow-400 text-black font-bold rounded-xl text-lg"
          >
            Build Your Deck →
          </button>
        </div>
      </div>
    );
  }

  // ── Deck Building ──────────────────────────────────────────────────────────
  if (phase === 'building' && draft) {
    const pool = draft.pools[0];
    const deck = draft.humanDeck;

    const energyCounts: Partial<Record<EnergyType, number>> = {};
    deck.forEach(id => {
      const e = BASIC_ENERGY_CARDS.find(c => c.id === id);
      if (e) energyCounts[e.types[0] as EnergyType] = (energyCounts[e.types[0] as EnergyType] ?? 0) + 1;
    });

    const mins = Math.floor(draft.buildTimer / 60);
    const secs = draft.buildTimer % 60;
    const timerColor = draft.buildTimer < 60 ? 'text-red-400' : draft.buildTimer < 120 ? 'text-yellow-400' : 'text-green-400';
    const remaining = DECK_SIZE - deck.length;

    return (
      <div className="min-h-screen bg-gray-950 text-white p-4">
        <div className="max-w-2xl mx-auto space-y-4">

          {/* Header */}
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-black">Build Your Deck</h2>
              <p className="text-xs text-gray-400">
                {deck.length}/{DECK_SIZE} selected · {pool.length} cards drafted
              </p>
            </div>
            <div className="text-right">
              <div className={`text-2xl font-black ${timerColor}`}>
                {mins}:{secs.toString().padStart(2, '0')}
              </div>
              <div className="text-xs text-gray-400">remaining</div>
            </div>
          </div>

          {/* Basic energy */}
          <div className="bg-gray-800 rounded-xl p-3 space-y-2">
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Add Basic Energy</p>
            <div className="flex flex-wrap gap-2">
              {ENERGY_TYPES.map(type => {
                const count = energyCounts[type] ?? 0;
                return (
                  <div key={type} className="flex items-center gap-1">
                    <button
                      onClick={() => removeEnergy(type)}
                      disabled={count === 0}
                      className="w-6 h-6 bg-gray-700 hover:bg-gray-600 disabled:opacity-30 rounded text-sm font-bold"
                    >−</button>
                    <span className="text-xs text-gray-300 min-w-[64px] text-center">
                      {type}{count > 0 ? ` ×${count}` : ''}
                    </span>
                    <button
                      onClick={() => addEnergy(type)}
                      disabled={deck.length >= DECK_SIZE}
                      className="w-6 h-6 bg-gray-700 hover:bg-gray-600 disabled:opacity-30 rounded text-sm font-bold"
                    >+</button>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Drafted pool */}
          <p className="text-xs text-gray-400">
            Click to add/remove from deck <span className="text-yellow-400">(yellow ring = in deck)</span>:
          </p>
          <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 gap-2">
            {pool.map(id => {
              const card = cardFromId(id);
              if (!card) return null;
              const inDeck = deck.includes(id);
              return (
                <div
                  key={id}
                  onClick={() => toggleDeckCard(id)}
                  className={`cursor-pointer rounded-lg transition-all ${
                    inDeck ? 'ring-2 ring-yellow-400 opacity-100' : 'opacity-55 hover:opacity-80'
                  }`}
                >
                  <CardImage card={card} small />
                </div>
              );
            })}
          </div>

          {/* Start battle */}
          <button
            onClick={startBattle}
            disabled={deck.length < DECK_SIZE}
            className="w-full py-3 bg-yellow-500 hover:bg-yellow-400 disabled:opacity-40 disabled:cursor-not-allowed text-black font-bold rounded-xl text-lg"
          >
            {deck.length >= DECK_SIZE
              ? '⚔️ Start Battle!'
              : `${remaining} more card${remaining !== 1 ? 's' : ''} needed`}
          </button>
        </div>
      </div>
    );
  }

  return null;
}
