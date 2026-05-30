'use client';
import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { useGameStore } from '@/store/gameStore';
import type { CardData } from '@/engine/GameState';
import { BASIC_ENERGY_CARDS, ALL_CARDS } from '@/lib/cardUtils';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/authStore';
import { computeLevel } from '@/lib/progression';
import { STARTER_DECKS } from '@/lib/starterDecks';
import CardImage from '@/components/cards/CardImage';
import { generateAIDeck, DIFFICULTY_LABELS, DIFFICULTY_DESCRIPTIONS, DIFFICULTY_COLORS, type AIDifficulty } from '@/ai/deckGenerator';
import { getAITier, getStreakData, streakDisplay } from '@/lib/aiDifficulty';

const BROWSE_CARDS = [...ALL_CARDS, ...BASIC_ENERGY_CARDS];

// ── Notification helpers ──────────────────────────────────────────────────────
interface Notif { id: string; emoji: string; text: string; href: string; dismissible: boolean; }

function collectionPct(setName: string, coll: Record<string, number>): number {
  const cards = ALL_CARDS.filter(c => c.set === setName && c.supertype !== 'Energy');
  if (!cards.length) return 0;
  return cards.filter(c => (coll[c.id] ?? 0) > 0).length / cards.length;
}

const SET_NOTIFS = [
  { name: 'Jungle',        prereq: 'Base Set',      pct: 0.75 },
  { name: 'Fossil',        prereq: 'Jungle',         pct: 0.75 },
  { name: 'Team Rocket',   prereq: 'Fossil',         pct: 0.75 },
  { name: 'Gym Heroes',    prereq: 'Team Rocket',    pct: 0.75 },
  { name: 'Gym Challenge', prereq: 'Gym Heroes',     pct: 0.75 },
];

const DECK_NOTIFS = [
  { label: 'Jungle theme decks',       prereq: 'Base Set',    pct: 0.75 },
  { label: 'Fossil theme decks',       prereq: 'Jungle',      pct: 0.75 },
  { label: 'Base Set 2 theme decks',   prereq: 'Base Set',    pct: 1.00 },
  { label: 'Team Rocket theme decks',  prereq: 'Fossil',      pct: 0.75 },
  { label: 'Gym Heroes theme decks',   prereq: 'Gym Heroes',  pct: 0.75 },
  { label: 'Gym Challenge theme decks',prereq: 'Gym Challenge',pct: 0.75 },
];

function loadSeenNotifs(): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem('pokemon-tcg-seen-notifs') ?? '[]')); } catch { return new Set(); }
}
function persistDismiss(id: string) {
  try {
    const seen = loadSeenNotifs(); seen.add(id);
    localStorage.setItem('pokemon-tcg-seen-notifs', JSON.stringify([...seen]));
  } catch {}
}

const LAST_DECK_KEY = 'pokemon-tcg-last-deck';

interface LocalDeck { name: string; cardIds: string[]; }

function loadLocalDecks(): LocalDeck[] {
  try { return JSON.parse(localStorage.getItem('pokemon-tcg-decks') || '[]'); } catch { return []; }
}

function deckToCards(deck: LocalDeck): CardData[] {
  return deck.cardIds.map(id => BROWSE_CARDS.find(c => c.id === id)).filter(Boolean) as CardData[];
}

export default function HomePage() {
  const { user, profile, isLocalGuest, decks: cloudDecks, signOut, resetAccount, prereleaseInvites, freeVouchers, collection, pendingLevelUp, dismissLevelUp, onboardingStep, onboardingPromoCardId, advanceOnboarding, unopenedPacks, dailyBonusPending, clearDailyBonus } = useAuthStore();
  const [seenNotifs, setSeenNotifs] = useState<Set<string>>(new Set());
  useEffect(() => { setSeenNotifs(loadSeenNotifs()); }, []);

  const notifs = useMemo<Notif[]>(() => {
    const out: Notif[] = [];
    // Always-show (auto-clear when resolved)
    if (unopenedPacks.length > 0)
      out.push({ id: 'packs', emoji: '📦', text: `${unopenedPacks.length} booster pack${unopenedPacks.length > 1 ? 's' : ''} waiting to open!`, href: '/shop', dismissible: false });
    if (freeVouchers.length > 0)
      out.push({ id: 'vouchers', emoji: '🎟', text: `${freeVouchers.length} free deck voucher${freeVouchers.length > 1 ? 's' : ''} ready to redeem!`, href: '/shop', dismissible: false });
    if (prereleaseInvites.length > 0)
      out.push({ id: 'prerelease', emoji: '🎮', text: `${prereleaseInvites.length} prerelease event${prereleaseInvites.length > 1 ? 's' : ''} available!`, href: '/prerelease', dismissible: false });
    // Dismissible unlock notifications
    for (const s of SET_NOTIFS) {
      if (!seenNotifs.has(`set:${s.name}`) && collectionPct(s.prereq, collection) >= s.pct)
        out.push({ id: `set:${s.name}`, emoji: '✨', text: `${s.name} booster packs now in Shop!`, href: '/shop', dismissible: true });
    }
    for (const g of DECK_NOTIFS) {
      if (!seenNotifs.has(`decks:${g.label}`) && collectionPct(g.prereq, collection) >= g.pct)
        out.push({ id: `decks:${g.label}`, emoji: '🃏', text: `${g.label} now available in Shop!`, href: '/shop', dismissible: true });
    }
    return out.filter(n => !n.dismissible || !seenNotifs.has(n.id));
  }, [collection, unopenedPacks, freeVouchers, prereleaseInvites, seenNotifs]);

  function dismissNotif(id: string) {
    persistDismiss(id);
    setSeenNotifs(prev => new Set([...prev, id]));
  }

  const shopBadge = notifs.filter(n => n.href === '/shop').length;
  const [localDecks, setLocalDecks] = useState<LocalDeck[]>([]);
  const [p1Deck, setP1Deck] = useState('');
  const [p2Deck, setP2Deck] = useState('');
  const [p1Name, setP1Name] = useState('Player 1');
  const [p2Name, setP2Name] = useState('CPU');
  const [mode, setMode] = useState<'vs-ai' | 'local-2p'>('vs-ai');
  const [aiTier, setAiTier] = useState<AIDifficulty>(1);
  const [streak, setStreak] = useState({ type: null as 'win' | 'loss' | null, count: 0 });
  const { startGame } = useGameStore();
  const router = useRouter();

  // Load AI difficulty + streak from localStorage on mount
  useEffect(() => {
    setAiTier(getAITier());
    setStreak(getStreakData());
  }, []);

  const allDecks: { name: string; cardIds: string[] }[] = (user && !isLocalGuest)
    ? cloudDecks.map(d => ({ name: d.name, cardIds: d.card_ids }))
    : localDecks;

  useEffect(() => {
    const saved = loadLocalDecks();
    setLocalDecks(saved);
    // Apply last-deck preference for all local/guest users on mount
    if (saved.length > 0) {
      const lastDeck = localStorage.getItem(LAST_DECK_KEY);
      const target = (lastDeck && saved.find(d => d.name === lastDeck)) ? lastDeck : saved[0].name;
      setP1Deck(target);
      setP2Deck(target);
    }
  }, []);

  useEffect(() => {
    // Cloud-authenticated users: prefer last deck from their cloud decks
    if (user && !isLocalGuest && cloudDecks.length > 0) {
      const lastDeck = localStorage.getItem(LAST_DECK_KEY);
      const target = (lastDeck && cloudDecks.find(d => d.name === lastDeck)) ? lastDeck : cloudDecks[0].name;
      setP1Deck(target);
      setP2Deck(target);
    }
    if (user && profile?.display_name) setP1Name(profile.display_name);
  }, [user, isLocalGuest, cloudDecks, profile]);

  function handleStart() {
    const d1 = allDecks.find(d => d.name === p1Deck);
    if (!d1) { alert('Select a deck for Player 1 first.'); return; }
    const cards1 = deckToCards(d1);
    if (cards1.length !== 60) { alert(`Your deck has ${cards1.length} cards — it must be exactly 60 to play.\n\nEdit it in the Deck Builder first.`); return; }

    let cards2: CardData[];
    let p2NameFinal: string;
    if (mode === 'vs-ai') {
      const generated = generateAIDeck(aiTier, collection);
      cards2 = generated.cards;
      p2NameFinal = `CPU (${DIFFICULTY_LABELS[aiTier]})`;
    } else {
      const d2 = allDecks.find(d => d.name === p2Deck);
      if (!d2) { alert('Select a deck for Player 2 first.'); return; }
      cards2 = deckToCards(d2);
      if (cards2.length !== 60) { alert(`Player 2 deck has ${cards2.length} cards — it must be exactly 60 to play.`); return; }
      p2NameFinal = p2Name;
    }

    localStorage.setItem(LAST_DECK_KEY, p1Deck);
    startGame(p1Name, cards1, p2NameFinal, cards2, mode);
    router.push('/game');
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-950 via-indigo-950 to-purple-950 flex items-center justify-center p-4">

      {/* ── Onboarding modals ── */}
      {onboardingStep === 1 && (() => {
        const deck = STARTER_DECKS.find(d => d.id === 'custom-fists-and-fire');
        const allIds = deck?.cardIds.filter(id => !id.startsWith('basic-')) ?? [];
        const allCards = allIds.map(id => BROWSE_CARDS.find(c => c.id === id)).filter(Boolean) as import('@/engine/GameState').CardData[];
        return (
          <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-50 p-4">
            <div className="bg-gray-900 border-2 border-yellow-500 rounded-2xl p-6 max-w-2xl w-full text-center space-y-4">
              <p className="text-xs text-yellow-400 uppercase tracking-widest font-bold">Welcome, Trainer!</p>
              <h2 className="text-2xl font-black text-white">Starter Deck</h2>
              <p className="text-sm text-gray-300">You received the <span className="text-yellow-300 font-bold">Fists &amp; Fire</span> deck — Machamp and Fire-type Pokémon ready to battle!</p>
              <div className="grid grid-cols-5 sm:grid-cols-6 gap-2 max-h-[55vh] overflow-y-auto p-1">
                {allCards.map((c, i) => <CardImage key={i} card={c} small />)}
              </div>
              <button onClick={() => advanceOnboarding()} className="w-full py-3 bg-yellow-500 hover:bg-yellow-400 text-black font-bold rounded-xl text-lg">
                Awesome! →
              </button>
            </div>
          </div>
        );
      })()}

      {onboardingStep === 2 && (
        <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 border-2 border-blue-500 rounded-2xl p-6 max-w-sm w-full text-center space-y-4">
            <p className="text-xs text-blue-400 uppercase tracking-widest font-bold">You&apos;re Invited!</p>
            <h2 className="text-2xl font-black text-white">Base Set Prerelease</h2>
            <div className="flex justify-center py-2">
              <div className="w-24 h-24 bg-gradient-to-b from-blue-600 to-indigo-900 rounded-2xl border-2 border-blue-400 flex items-center justify-center text-5xl shadow-lg">🎮</div>
            </div>
            <p className="text-sm text-gray-300">
              You have a <span className="text-blue-300 font-bold">Base Set Prerelease</span> invite waiting!
            </p>
            <p className="text-sm text-gray-400">
              Open 10 packs, build a 40-card deck, and battle. Completing it <span className="text-yellow-300 font-bold">unlocks Base Set boosters &amp; theme decks</span> in the Shop.
            </p>
            <button onClick={() => advanceOnboarding()} className="w-full py-3 bg-blue-500 hover:bg-blue-400 text-white font-bold rounded-xl text-lg">
              Let&apos;s Go! 🎴
            </button>
          </div>
        </div>
      )}

      {onboardingStep === 3 && (() => {
        const promoCard = onboardingPromoCardId ? BROWSE_CARDS.find(c => c.id === onboardingPromoCardId) : null;
        return (
          <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-50 p-4">
            <div className="bg-gray-900 border-2 border-purple-500 rounded-2xl p-6 max-w-sm w-full text-center space-y-4">
              <p className="text-xs text-purple-400 uppercase tracking-widest font-bold">Special Card!</p>
              <h2 className="text-2xl font-black text-white">Black Star Promo</h2>
              <p className="text-sm text-gray-300">You received an exclusive <span className="text-purple-300 font-bold">Wizards Black Star Promo</span> card!</p>
              {promoCard && (
                <div className="flex justify-center">
                  <CardImage card={promoCard} />
                </div>
              )}
              <button onClick={() => advanceOnboarding(true)} className="w-full py-3 bg-purple-600 hover:bg-purple-500 text-white font-bold rounded-xl text-lg">
                Add to Collection! ✨
              </button>
            </div>
          </div>
        );
      })()}

      {onboardingStep === 4 && (
        <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 border-2 border-green-500 rounded-2xl p-6 max-w-sm w-full text-center space-y-4">
            <p className="text-xs text-green-400 uppercase tracking-widest font-bold">Bonus!</p>
            <h2 className="text-2xl font-black text-white">Theme Deck Voucher</h2>
            <div className="text-6xl py-2">🎟</div>
            <p className="text-sm text-gray-300">You received a <span className="text-green-300 font-bold">Theme Deck Voucher</span> — redeem it in the Shop to get any theme deck for free!</p>
            <button onClick={() => advanceOnboarding()} className="w-full py-3 bg-green-600 hover:bg-green-500 text-white font-bold rounded-xl text-lg">
              Let&apos;s Play! 🎉
            </button>
          </div>
        </div>
      )}

      {/* Level-up reward modal */}
      {pendingLevelUp && (
        <div className="fixed inset-0 bg-black/85 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 border-2 border-yellow-500 rounded-2xl p-6 max-w-xs w-full text-center space-y-4">
            <div>
              <p className="text-xs text-yellow-400 uppercase tracking-widest font-bold">Level Up!</p>
              <p className="text-4xl font-black text-white mt-1">Lv {pendingLevelUp.level}</p>
            </div>
            <div className="bg-gray-800 rounded-xl px-4 py-3">
              <p className="text-xs text-gray-400 mb-1">Reward</p>
              <p className="text-lg font-bold text-yellow-300">{pendingLevelUp.reward.label}</p>
            </div>
            {pendingLevelUp.cardId && (() => {
              const card = ALL_CARDS.find(c => c.id === pendingLevelUp!.cardId);
              return card ? (
                <div className="flex justify-center">
                  <CardImage card={card} />
                </div>
              ) : null;
            })()}
            <button
              onClick={dismissLevelUp}
              className="w-full py-3 bg-yellow-500 hover:bg-yellow-400 text-black font-bold rounded-xl text-lg"
            >
              Awesome!
            </button>
          </div>
        </div>
      )}

      {/* Daily bonus toast */}
      {dailyBonusPending && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 bg-yellow-500 text-black font-bold px-5 py-3 rounded-2xl shadow-2xl animate-bounce">
          <span className="text-2xl">🌅</span>
          <span>Daily bonus: +100 credits!</span>
          <button onClick={clearDailyBonus} className="ml-2 text-black/60 hover:text-black text-xl leading-none">×</button>
        </div>
      )}

      <div className="max-w-md w-full space-y-6 text-white">
        {/* Title + auth */}
        <div className="text-center space-y-1">
          <div className="flex items-center justify-center gap-3">
            <h1 className="text-4xl font-black tracking-tight">
              <span className="text-yellow-400">Pokemon</span> TCG
            </h1>
            <button
              onClick={() => {
                if (!document.fullscreenElement) {
                  document.documentElement.requestFullscreen?.();
                } else {
                  document.exitFullscreen?.();
                }
              }}
              className="text-gray-500 hover:text-yellow-400 transition-colors text-xl"
              title="Toggle Fullscreen"
            >⛶</button>
          </div>
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

        {/* ── What's New panel ── */}
        {notifs.length > 0 && (
          <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-2xl p-3 space-y-2">
            <p className="text-xs text-yellow-400 font-bold uppercase tracking-widest">🔔 What's New</p>
            {notifs.map(n => (
              <div key={n.id} className="flex items-center gap-2">
                <Link href={n.href} className="flex-1 flex items-center gap-2 text-sm text-white hover:text-yellow-300 transition-colors">
                  <span>{n.emoji}</span>
                  <span>{n.text}</span>
                </Link>
                {n.dismissible && (
                  <button onClick={() => dismissNotif(n.id)}
                    className="flex-none text-gray-500 hover:text-white text-lg leading-none px-1">×</button>
                )}
              </div>
            ))}
          </div>
        )}

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
          <Link href="/shop" className="relative bg-white/10 hover:bg-white/20 rounded-2xl p-4 text-center transition-all">
            {shopBadge > 0 && (
              <span className="absolute top-2 right-2 bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                {shopBadge}
              </span>
            )}
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
            className={`relative rounded-2xl p-4 text-center transition-all ${
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
          <Link href="/draft" className="bg-white/10 hover:bg-white/20 rounded-2xl p-4 text-center transition-all">
            <div className="text-3xl">🎴</div>
            <div className="font-semibold mt-1">Draft</div>
            <div className="text-xs text-gray-400">5 packs per player</div>
          </Link>
          <Link href="/sealed" className="bg-white/10 hover:bg-white/20 rounded-2xl p-4 text-center transition-all">
            <div className="text-3xl">📦</div>
            <div className="font-semibold mt-1">Sealed</div>
            <div className="text-xs text-gray-400">10 packs, build a deck</div>
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

          {/* AI Difficulty (vs-ai only) */}
          {mode === 'vs-ai' && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs text-gray-400">AI Difficulty</label>
                <span className="text-xs text-gray-500">3 wins = ↑ tier • 3 losses = ↓ tier</span>
              </div>
              {/* Tier display */}
              <div className="bg-black/30 rounded-xl px-4 py-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className={`font-bold text-base ${DIFFICULTY_COLORS[aiTier]}`}>
                    Tier {aiTier} — {DIFFICULTY_LABELS[aiTier]}
                  </span>
                  <span className="text-lg tracking-wider">{streakDisplay(streak)}</span>
                </div>
                <p className="text-xs text-gray-400">{DIFFICULTY_DESCRIPTIONS[aiTier]}</p>
                {/* Streak progress */}
                {streak.count > 0 && (
                  <p className="text-xs text-gray-500">
                    {streak.type === 'win'
                      ? `${streak.count}/3 wins toward Tier ${Math.min(5, aiTier + 1)}`
                      : `${streak.count}/3 losses — next loss drops to Tier ${Math.max(1, aiTier - 1)}`}
                  </p>
                )}
              </div>
              {/* Manual override arrows */}
              <div className="flex gap-2">
                <button
                  onClick={() => { const t = Math.max(1, aiTier - 1) as AIDifficulty; setAiTier(t); import('@/lib/aiDifficulty').then(m => m.setAITier(t)); }}
                  disabled={aiTier <= 1}
                  className="flex-1 py-1.5 bg-white/10 hover:bg-white/20 disabled:opacity-30 rounded-lg text-xs font-medium transition-all"
                >
                  ◀ Easier
                </button>
                <button
                  onClick={() => { const t = Math.min(5, aiTier + 1) as AIDifficulty; setAiTier(t); import('@/lib/aiDifficulty').then(m => m.setAITier(t)); }}
                  disabled={aiTier >= 5}
                  className="flex-1 py-1.5 bg-white/10 hover:bg-white/20 disabled:opacity-30 rounded-lg text-xs font-medium transition-all"
                >
                  Harder ▶
                </button>
              </div>
            </div>
          )}

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
