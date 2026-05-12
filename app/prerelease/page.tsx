'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/authStore';
import { useGameStore } from '@/store/gameStore';
import { ALL_CARDS, BASIC_ENERGY_CARDS, isBasicPokemon } from '@/lib/cardUtils';
import { pickPackCards, SET_PROGRESSION } from '@/lib/progression';
import CardImage from '@/components/cards/CardImage';
import type { CardData, EnergyType } from '@/engine/GameState';

const BROWSE_CARDS = [...ALL_CARDS, ...BASIC_ENERGY_CARDS];

function buildSealedDeck(opened: CardData[]): CardData[] {
  const pokemon  = opened.filter(c => c.supertype === 'Pokémon');
  const trainers = opened.filter(c => c.supertype === 'Trainer');
  const energy   = opened.filter(c => c.supertype === 'Energy');

  let deck: CardData[] = [...pokemon, ...trainers, ...energy];

  // Determine which energy types our Pokémon need
  const typesNeeded = new Set(pokemon.flatMap(p => p.types as EnergyType[]));
  if (typesNeeded.size === 0) typesNeeded.add('Colorless');

  // Fill remaining slots with basic energy of needed types, round-robin
  const fillEnergy = BASIC_ENERGY_CARDS.filter(e => typesNeeded.has(e.types[0] as EnergyType));
  if (fillEnergy.length === 0) fillEnergy.push(...BASIC_ENERGY_CARDS);

  let idx = 0;
  while (deck.length < 40) {
    deck.push(fillEnergy[idx % fillEnergy.length]);
    idx++;
  }

  return deck.slice(0, 40);
}

export default function PrereleasePage() {
  const router = useRouter();
  const { user, prereleaseInvites, usePrereleaseInvite, addToCollection } = useAuthStore();
  const { startGame } = useGameStore();

  const [phase, setPhase] = useState<'list' | 'opening' | 'ready'>('list');
  const [activeSet, setActiveSet] = useState<string | null>(null);
  const [openedCards, setOpenedCards] = useState<CardData[]>([]);

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

  if (prereleaseInvites.length === 0) {
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

  function openPacks(setName: string) {
    const setCards = ALL_CARDS.filter(c => c.set === setName);
    if (setCards.length === 0) return;

    const basicEnergyPool = setCards.filter(c => c.supertype === 'Energy' && !c.rarity);
    const packableCards = setCards
      .filter(c => !basicEnergyPool.some(e => e.id === c.id))
      .map(c => ({ id: c.id, rarity: c.rarity || 'Common' }));

    const pickEnergy = () =>
      basicEnergyPool.length > 0
        ? basicEnergyPool[Math.floor(Math.random() * basicEnergyPool.length)].id
        : null;

    const allIds: string[] = [];
    for (let i = 0; i < 5; i++) {
      if (packableCards.length > 0) allIds.push(...pickPackCards(packableCards));
      const e1 = pickEnergy(); if (e1) allIds.push(e1);
      const e2 = pickEnergy(); if (e2) allIds.push(e2);
    }

    const cards = allIds.map(id => ALL_CARDS.find(c => c.id === id)).filter(Boolean) as CardData[];

    usePrereleaseInvite(setName);
    addToCollection(allIds);
    setOpenedCards(cards);
    setActiveSet(setName);
    setPhase('opening');
  }

  function startBattle() {
    if (!activeSet || openedCards.length === 0) return;

    // Build AI deck from a random starter
    const { STARTER_DECKS } = require('@/lib/starterDecks');
    const aiDeckDef = STARTER_DECKS[Math.floor(Math.random() * STARTER_DECKS.length)];
    const aiDeck = (aiDeckDef.cardIds as string[])
      .map((id: string) => BROWSE_CARDS.find(c => c.id === id))
      .filter(Boolean) as CardData[];

    const playerDeck = buildSealedDeck(openedCards);

    // Ensure player deck has at least 1 basic
    const hasBasic = playerDeck.some(c => isBasicPokemon(c));
    if (!hasBasic) {
      // fallback: add a starter deck pokemon
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
            Open 5 packs from the upcoming set and battle with your sealed pool!
          </p>
          <div className="space-y-3">
            {prereleaseInvites.map(setName => {
              const entry = SET_PROGRESSION.find(s => s.name === setName);
              const hasCards = ALL_CARDS.some(c => c.set === setName);
              return (
                <div key={setName} className="bg-gray-800 border border-yellow-600/50 rounded-xl p-4 space-y-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-lg">{setName}</span>
                      <span className="text-[10px] bg-yellow-500 text-black font-bold px-1.5 py-0.5 rounded">PRERELEASE</span>
                    </div>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {entry?.prerequisite ? `Unlocked by completing ${entry.prerequisite}` : ''}
                    </p>
                  </div>
                  <ul className="text-sm text-gray-300 space-y-0.5">
                    <li>• Receive 5 booster packs from {setName}</li>
                    <li>• Build a 40-card sealed deck from your pool</li>
                    <li>• Battle an AI opponent</li>
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
    return (
      <div className="min-h-screen bg-gray-950 text-white p-4">
        <div className="max-w-2xl mx-auto space-y-4 pt-4">
          <h1 className="text-xl font-black text-yellow-400">
            {activeSet} Prerelease — Your 5 Packs
          </h1>
          <p className="text-sm text-gray-400">{openedCards.length} cards received. These have been added to your collection.</p>
          <div className="grid grid-cols-5 sm:grid-cols-6 gap-2">
            {openedCards.map((card, i) => (
              <CardImage key={i} card={card} small />
            ))}
          </div>
          <div className="bg-gray-800 rounded-xl p-4 text-sm text-gray-300 space-y-1">
            <p className="font-bold text-white">Your sealed deck will be auto-built:</p>
            <p>• All Pokémon + Trainers from your pool</p>
            <p>• Filled to 40 cards with basic energy matching your types</p>
          </div>
          <button
            onClick={() => setPhase('ready')}
            className="w-full py-3 bg-yellow-500 hover:bg-yellow-400 text-black font-bold rounded-xl text-lg"
          >
            Build Deck & Battle →
          </button>
        </div>
      </div>
    );
  }

  // ── Ready to battle ────────────────────────────────────────────────────────
  const deck = buildSealedDeck(openedCards);
  const pokemon = deck.filter(c => c.supertype === 'Pokémon');
  const trainers = deck.filter(c => c.supertype === 'Trainer');
  const energy = deck.filter(c => c.supertype === 'Energy');

  return (
    <div className="min-h-screen bg-gray-950 text-white p-4">
      <div className="max-w-md mx-auto space-y-4 pt-4">
        <h1 className="text-xl font-black text-yellow-400">Your Sealed Deck</h1>
        <div className="bg-gray-800 rounded-xl p-4 space-y-2 text-sm">
          <div className="flex justify-between"><span className="text-gray-400">Pokémon</span><span className="font-bold">{pokemon.length}</span></div>
          <div className="flex justify-between"><span className="text-gray-400">Trainers</span><span className="font-bold">{trainers.length}</span></div>
          <div className="flex justify-between"><span className="text-gray-400">Energy</span><span className="font-bold">{energy.length}</span></div>
          <div className="flex justify-between border-t border-gray-700 pt-2 mt-2"><span className="text-gray-400">Total</span><span className="font-bold">{deck.length}</span></div>
        </div>
        <div className="grid grid-cols-5 gap-1.5">
          {pokemon.map((card, i) => <CardImage key={i} card={card} small />)}
        </div>
        <button
          onClick={startBattle}
          className="w-full py-3 bg-red-600 hover:bg-red-500 text-white font-bold rounded-xl text-lg"
        >
          ⚔️ Start Prerelease Battle
        </button>
        <Link href="/" className="block text-center text-sm text-gray-500 hover:text-white">← Home</Link>
      </div>
    </div>
  );
}
