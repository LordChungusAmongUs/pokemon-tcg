'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useGameStore } from '@/store/gameStore';
import type { CardData } from '@/engine/GameState';
import { BASIC_ENERGY_CARDS, ALL_CARDS, isSetUnlocked } from '@/lib/cardUtils';
import { getAvailableAIDecks } from '@/lib/starterDecks';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/authStore';
import { computeLevel } from '@/lib/progression';

const BROWSE_CARDS = [...ALL_CARDS, ...BASIC_ENERGY_CARDS];

interface LocalDeck { name: string; cardIds: string[]; }

function loadLocalDecks(): LocalDeck[] {
  try { return JSON.parse(localStorage.getItem('pokemon-tcg-decks') || '[]'); } catch { return []; }
}

function deckToCards(deck: LocalDeck): CardData[] {
  return deck.cardIds.map(id => BROWSE_CARDS.find(c => c.id === id)).filter(Boolean) as CardData[];
}

export default function HomePage() {
  const { user, profile, isLocalGuest, decks: cloudDecks, signOut, resetAccount, prereleaseInvites, freeVouchers, collection } = useAuthStore();
  const [localDecks, setLocalDecks] = useState<LocalDeck[]>([]);
  const [p1Deck, setP1Deck] = useState('');
  const [p2Deck, setP2Deck] = useState('');
  const [p1Name, setP1Name] = useState('Player 1');
  const [p2Name, setP2Name] = useState('CPU');
  const [mode, setMode] = useState<'vs-ai' | 'local-2p'>('vs-ai');
  const { startGame } = useGameStore();
  const router = useRouter();

  const allDecks: { name: string; cardIds: string[] }[] = (user && !isLocalGuest)
    ? cloudDecks.map(d => ({ name: d.name, cardIds: d.card_ids }))
    : localDecks;

  useEffect(() => {
    const saved = loadLocalDecks();
    setLocalDecks(saved);
    if (!user && saved[0]) { setP1Deck(saved[0].name); setP2Deck(saved[0].name); }
  }, []);

  useEffect(() => {
    if (user && cloudDecks[0]) { setP1Deck(cloudDecks[0].name); setP2Deck(cloudDecks[0].name); }
    if (user && profile?.display_name) setP1Name(profile.display_name);
  }, [user, cloudDecks, profile]);

  function handleStart() {
    const d1 = allDecks.find(d => d.name === p1Deck);
    if (!d1) { alert('Select a deck for Player 1 first.'); return; }
    const cards1 = deckToCards(d1);
    if (cards1.length < 20) { alert('Your deck needs at least 20 cards to play.'); return; }

    let cards2: CardData[];
    let p2NameFinal: string;
    if (mode === 'vs-ai') {
      const availableDecks = getAvailableAIDecks(collection, isSetUnlocked);
      const aiDeckDef = availableDecks[Math.floor(Math.random() * availableDecks.length)];
      cards2 = aiDeckDef.cardIds.map(id => BROWSE_CARDS.find(c => c.id === id)).filter(Boolean) as CardData[];
      p2NameFinal = 'CPU';
    } else {
      const d2 = allDecks.find(d => d.name === p2Deck);
      if (!d2) { alert('Select a deck for Player 2 first.'); return; }
      cards2 = deckToCards(d2);
      if (cards2.length < 20) { alert('Player 2 deck needs at least 20 cards to play.'); return; }
      p2NameFinal = p2Name;
    }

    startGame(p1Name, cards1, p2NameFinal, cards2, mode);
    router.push('/game');
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-950 via-indigo-950 to-purple-950 flex items-center justify-center p-4">
      <div className="max-w-md w-full space-y-6 text-white">
        {/* Title + auth */}
        <div className="text-center space-y-1">
          <h1 className="text-4xl font-black tracking-tight">
            <span className="text-yellow-400">Pokemon</span> TCG
          </h1>
          <p className="text-gray-400 text-sm">Old School Simulator</p>
          {user ? (() => {
            const { level, xpIntoLevel, xpForNext } = computeLevel(profile?.xp ?? 0);
            const pct = Math.round((xpIntoLevel / xpForNext) * 100);
            return (
              <div className="pt-2 space-y-1">
                <div className="flex items-center justify-center gap-3">
                  <span className="text-sm text-gray-300">{profile?.display_name ?? 'Trainer'}</span>
                  <span className="text-xs bg-yellow-500 text-black font-bold px-2 py-0.5 rounded-full">Lv{level}</span>
                  <span className="text-xs text-gray-400">Elo {profile?.elo ?? 1000}</span>
                  <button onClick={signOut} className="text-xs text-gray-500 hover:text-white">Sign out</button>
                  <button
                    onClick={() => { if (confirm('Reset account? This clears your collection, XP, and credits. You cannot undo this.')) resetAccount(); }}
                    className="text-xs text-red-700 hover:text-red-400"
                  >
                    Reset
                  </button>
                </div>
                <div className="max-w-[200px] mx-auto">
                  <div className="flex justify-between text-[10px] text-gray-500 mb-0.5">
                    <span>{xpIntoLevel} XP</span>
                    <span>{xpForNext} XP</span>
                  </div>
                  <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
                    <div className="h-full bg-yellow-400 rounded-full transition-all" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              </div>
            );
          })() : (
            <Link href="/login" className="inline-block mt-1 text-xs text-yellow-400 hover:text-yellow-300 underline">Sign in / Create account</Link>
          )}
        </div>

        {/* Quick links */}
        <div className="grid grid-cols-2 gap-3">
          <Link href="/collection" className="bg-white/10 hover:bg-white/20 rounded-2xl p-4 text-center transition-all">
            <div className="text-3xl">📖</div>
            <div className="font-semibold mt-1">Pokédex</div>
            <div className="text-xs text-gray-400">Cards discovered</div>
          </Link>
          <Link href="/deck-builder" className="bg-white/10 hover:bg-white/20 rounded-2xl p-4 text-center transition-all">
            <div className="text-3xl">🃏</div>
            <div className="font-semibold mt-1">Deck Builder</div>
            <div className="text-xs text-gray-400">{allDecks.length} saved decks</div>
          </Link>
          <Link href="/shop" className="bg-white/10 hover:bg-white/20 rounded-2xl p-4 text-center transition-all">
            <div className="text-3xl">🏪</div>
            <div className="font-semibold mt-1">Shop</div>
            <div className="text-xs text-yellow-400">{user ? `${profile?.credits ?? 0} credits` : 'Sign in to buy'}</div>
          </Link>
          {user ? (
            <Link href="/lobby" className="bg-yellow-500 hover:bg-yellow-400 text-black font-bold rounded-2xl p-4 text-center transition-all">
              <div className="text-3xl">🌐</div>
              <div className="font-bold mt-1">Lobby</div>
              <div className="text-xs">Online Play</div>
            </Link>
          ) : (
            <Link href="/login" className="bg-white/10 hover:bg-white/20 rounded-2xl p-4 text-center transition-all">
              <div className="text-3xl">🔑</div>
              <div className="font-semibold mt-1">Sign In</div>
              <div className="text-xs text-gray-400">Save progress</div>
            </Link>
          )}
          <Link href="/prerelease"
            className={`relative rounded-2xl p-4 text-center transition-all col-span-2 ${
              prereleaseInvites.length > 0
                ? 'bg-purple-600 hover:bg-purple-500 text-white'
                : 'bg-white/10 hover:bg-white/20'
            }`}
          >
            {prereleaseInvites.length > 0 && (
              <span className="absolute top-2 right-2 bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                {prereleaseInvites.length}
              </span>
            )}
            <div className="text-3xl">🎟</div>
            <div className="font-semibold mt-1">Prerelease</div>
            <div className="text-xs text-gray-300">
              {prereleaseInvites.length > 0
                ? `${prereleaseInvites.length} invite${prereleaseInvites.length > 1 ? 's' : ''} waiting!`
                : freeVouchers.length > 0
                ? `${freeVouchers.length} deck voucher${freeVouchers.length > 1 ? 's' : ''} in Shop`
                : 'Complete 60% of any set'}
            </div>
          </Link>
        </div>

        {/* Game setup */}
        <div className="bg-white/10 rounded-2xl p-5 space-y-4">
          <h2 className="text-lg font-bold">Start a Game</h2>

          {/* Mode */}
          <div className="flex gap-2">
            {(['vs-ai', 'local-2p'] as const).map(m => (
              <button
                key={m}
                onClick={() => {
                  setMode(m);
                  if (m === 'local-2p') setP2Name('Player 2');
                  else setP2Name('CPU');
                }}
                className={`flex-1 py-2 rounded-xl text-sm font-medium transition-all ${
                  mode === m ? 'bg-yellow-500 text-black' : 'bg-white/10 hover:bg-white/20'
                }`}
              >
                {m === 'vs-ai' ? '🤖 vs AI' : '👥 2 Player'}
              </button>
            ))}
          </div>

          {/* Player 1 */}
          <div className="space-y-1">
            <label className="text-xs text-gray-400">Player 1 Name</label>
            <input
              value={p1Name}
              onChange={e => setP1Name(e.target.value)}
              className="w-full bg-white/10 rounded-lg px-3 py-2 text-sm"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-gray-400">Player 1 Deck</label>
            {allDecks.length === 0 ? (
              <p className="text-sm text-yellow-400">
                No decks saved. <Link href="/deck-builder" className="underline">Build one first.</Link>
              </p>
            ) : (
              <select
                value={p1Deck}
                onChange={e => setP1Deck(e.target.value)}
                className="w-full bg-gray-800 rounded-lg px-3 py-2 text-sm"
              >
                {allDecks.map(d => <option key={d.name}>{d.name}</option>)}
              </select>
            )}
          </div>

          {/* Player 2 (only if local-2p) */}
          {mode === 'local-2p' && (
            <>
              <div className="space-y-1">
                <label className="text-xs text-gray-400">Player 2 Name</label>
                <input
                  value={p2Name}
                  onChange={e => setP2Name(e.target.value)}
                  className="w-full bg-white/10 rounded-lg px-3 py-2 text-sm"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-gray-400">Player 2 Deck</label>
                <select
                  value={p2Deck}
                  onChange={e => setP2Deck(e.target.value)}
                  className="w-full bg-gray-800 rounded-lg px-3 py-2 text-sm"
                >
                  {allDecks.map(d => <option key={d.name}>{d.name}</option>)}
                </select>
              </div>
            </>
          )}

          {/* Start button */}
          <button
            onClick={handleStart}
            disabled={allDecks.length === 0}
            className="w-full py-3 bg-yellow-500 hover:bg-yellow-400 disabled:opacity-40 disabled:cursor-not-allowed text-black font-bold rounded-xl text-lg transition-all"
          >
            Start Game (Local)
          </button>
        </div>
      </div>
    </div>
  );
}
