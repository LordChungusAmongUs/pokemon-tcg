'use client';
import { useState, useMemo, useEffect } from 'react';
import { ALL_CARDS, BASIC_ENERGY_CARDS } from '@/lib/cardUtils';
import CardImage from '@/components/cards/CardImage';
import CardDetail from '@/components/cards/CardDetail';
import type { CardData } from '@/engine/GameState';
import type { Deck } from '@/types/database';
import Link from 'next/link';
import { useAuthStore } from '@/store/authStore';
import { isSetUnlocked, SET_UNLOCK_LEVELS } from '@/lib/progression';
import { STARTER_DECKS } from '@/lib/starterDecks';
import { FORMATS } from '@/lib/formats';

// Excluded sets (Base Set 2, Diamond & Pearl and beyond)
const EXCLUDED_SETS = new Set(['Base Set 2', 'Diamond & Pearl']);

const ALL_PLAYABLE_CARDS = ALL_CARDS.filter(c => !EXCLUDED_SETS.has(c.set));
const BROWSE_CARDS = [...ALL_PLAYABLE_CARDS, ...BASIC_ENERGY_CARDS];
const ALL_SETS = Array.from(new Set(ALL_PLAYABLE_CARDS.map(c => c.set))).sort();

interface LocalDeck { name: string; cardIds: string[]; }

function saveLocalDeck(deck: LocalDeck) {
  const all = loadLocalDecks();
  const idx = all.findIndex(d => d.name === deck.name);
  if (idx >= 0) all[idx] = deck; else all.push(deck);
  localStorage.setItem('pokemon-tcg-decks', JSON.stringify(all));
}
function loadLocalDecks(): LocalDeck[] {
  try { return JSON.parse(localStorage.getItem('pokemon-tcg-decks') || '[]'); } catch { return []; }
}

function deckToCards(cardIds: string[]): CardData[] {
  return cardIds.map(id => BROWSE_CARDS.find(c => c.id === id)).filter(Boolean) as CardData[];
}

export default function DeckBuilderPage() {
  const { user, profile, decks: cloudDecks, saveDeck: saveCloudDeck, deleteDeck: deleteCloudDeck, refreshDecks, collection } = useAuthStore();
  const playerLevel = profile?.level ?? 1;

  const [search, setSearch] = useState('');
  const [format, setFormat] = useState('');
  const [set, setSet] = useState('All');
  const [detail, setDetail] = useState<CardData | null>(null);
  const [deck, setDeck] = useState<CardData[]>([]);
  const [deckName, setDeckName] = useState('My Deck');
  const [editingDeckId, setEditingDeckId] = useState<string | undefined>();
  const [localDecks, setLocalDecks] = useState<LocalDeck[]>([]);

  useEffect(() => {
    setLocalDecks(loadLocalDecks());
    if (user) refreshDecks();
  }, [user]);

  const unlockedSets = useMemo(
    () => ALL_SETS.filter(s => isSetUnlocked(s, playerLevel)),
    [playerLevel],
  );

  const activeFormat = FORMATS.find(f => f.id === format);
  const formatSetNames = activeFormat ? new Set(activeFormat.sets) : null;

  // How many of a card the player owns (basic energy is unlimited)
  function owned(card: CardData): number {
    if (card.supertype === 'Energy' && card.subtype === 'Basic') return 99;
    return collection[card.id] ?? 0;
  }

  const filtered = useMemo(() => {
    return BROWSE_CARDS.filter(c => {
      const isBasicEnergy = c.supertype === 'Energy' && c.subtype === 'Basic';
      // Must own at least one copy (basic energy always passes)
      if (!isBasicEnergy && (collection[c.id] ?? 0) === 0) return false;
      // Locked sets still blocked
      if (!isBasicEnergy && c.set && !isSetUnlocked(c.set, playerLevel)) return false;
      // Format/set/search filters
      if (formatSetNames && c.set && !formatSetNames.has(c.set) && !isBasicEnergy) return false;
      if (!formatSetNames && set !== 'All' && c.set !== set) return false;
      if (search && !c.name.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [search, set, format, playerLevel, collection]);

  function countInDeck(cardId: string) {
    return deck.filter(c => c.id === cardId).length;
  }

  function addCard(card: CardData) {
    if (deck.length >= 60) return;
    const isBasicEnergy = card.supertype === 'Energy' && card.subtype === 'Basic';
    if (!isBasicEnergy && countInDeck(card.id) >= 4) return;
    if (!isBasicEnergy && countInDeck(card.id) >= owned(card)) return; // can't add more than you own
    if (card.set && !isSetUnlocked(card.set, playerLevel) && !isBasicEnergy) return;
    setDeck([...deck, card]);
  }

  function removeCard(card: CardData) {
    const idx = deck.findLastIndex(c => c.id === card.id);
    if (idx < 0) return;
    setDeck(deck.filter((_, i) => i !== idx));
  }

  function loadStarterDeck(id: string) {
    const sd = STARTER_DECKS.find(s => s.id === id);
    if (!sd) return;
    setDeck(deckToCards(sd.cardIds));
    setDeckName(sd.name);
    setEditingDeckId(undefined);
  }

  async function handleSave() {
    const cardIds = deck.map(c => c.id);
    if (user) {
      await saveCloudDeck(deckName, cardIds, editingDeckId);
    } else {
      saveLocalDeck({ name: deckName, cardIds });
      setLocalDecks(loadLocalDecks());
    }
    alert(`Deck "${deckName}" saved!`);
  }

  function handleLoadCloud(d: Deck) {
    setDeck(deckToCards(d.card_ids));
    setDeckName(d.name);
    setEditingDeckId(d.id);
  }

  function handleLoadLocal(d: LocalDeck) {
    setDeck(deckToCards(d.cardIds));
    setDeckName(d.name);
    setEditingDeckId(undefined);
  }

  const deckCounts = deck.reduce((acc, c) => {
    acc[c.id] = (acc[c.id] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const uniqueInDeck = Object.entries(deckCounts).map(([id, count]) => ({
    card: BROWSE_CARDS.find(c => c.id === id)!,
    count,
  })).filter(x => x.card);

  const setOptions = ['All', ...ALL_SETS.map(s => {
    const locked = !isSetUnlocked(s, playerLevel);
    return { value: s, label: locked ? `${s} (Lv${SET_UNLOCK_LEVELS[s]})` : s, locked };
  })];

  return (
    <div className="min-h-screen bg-gray-950 text-white flex flex-col md:flex-row">
      {detail && <CardDetail card={detail} onClose={() => setDetail(null)} />}

      {/* Left: card browser */}
      <div className="flex-1 flex flex-col">
        <div className="sticky top-0 bg-gray-900 border-b border-gray-800 z-10 p-3 space-y-2">
          <div className="flex items-center justify-between">
            <h1 className="text-lg font-bold">Deck Builder</h1>
            <div className="flex items-center gap-3">
              {profile && (
                <span className="text-xs text-yellow-400">Lv{playerLevel}</span>
              )}
              <Link href="/" className="text-sm text-gray-400 hover:text-white">← Home</Link>
            </div>
          </div>
          <input
            type="text"
            placeholder="Search..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full bg-gray-800 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 ring-yellow-500"
          />
          {/* Format filter */}
          <select
            value={format}
            onChange={e => { setFormat(e.target.value); setSet('All'); }}
            className="w-full bg-gray-800 rounded-lg px-2 py-1 text-sm"
          >
            <option value="">— All Formats —</option>
            {FORMATS.map(f => (
              <option key={f.id} value={f.id}>{f.name}</option>
            ))}
          </select>

          {/* Set filter (disabled when a format is active) */}
          {!format && (
            <select
              value={set}
              onChange={e => setSet(e.target.value)}
              className="w-full bg-gray-800 rounded-lg px-2 py-1 text-sm"
            >
              {setOptions.map(s => (
                typeof s === 'string'
                  ? <option key={s} value={s}>All Sets</option>
                  : <option key={s.value} value={s.value} disabled={s.locked}>{s.label}</option>
              ))}
            </select>
          )}
        </div>

        <div className="p-2 grid grid-cols-3 sm:grid-cols-4 gap-2 overflow-y-auto">
          {filtered.length === 0 && (
            <div className="col-span-full text-center py-12 text-gray-500 text-sm space-y-2">
              <p>No cards in your collection yet.</p>
              <Link href="/shop" className="text-yellow-400 hover:text-yellow-300 underline">
                Buy packs or singles in the Shop
              </Link>
            </div>
          )}
          {filtered.map(card => {
            const inDeck = countInDeck(card.id);
            const isBasicEnergy = card.supertype === 'Energy' && card.subtype === 'Basic';
            const ownedQty = owned(card);
            const maxed = inDeck >= Math.min(4, ownedQty) || deck.length >= 60;
            return (
              <div key={card.id} className="flex flex-col items-center gap-1">
                <div className="relative">
                  <CardImage
                    card={card}
                    onClick={() => addCard(card)}
                    dimmed={maxed}
                    small
                  />
                  {/* In-deck count */}
                  {inDeck > 0 && (
                    <span className="absolute top-1 right-1 bg-yellow-500 text-black text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
                      {inDeck}
                    </span>
                  )}
                  {/* Owned quantity (bottom-left) */}
                  {!isBasicEnergy && (
                    <span className="absolute bottom-1 left-1 text-[9px] font-bold text-white bg-black/70 rounded px-0.5">
                      ×{ownedQty}
                    </span>
                  )}
                </div>
                <span
                  className="text-[9px] text-gray-400 text-center w-full truncate cursor-pointer hover:text-white"
                  onContextMenu={e => { e.preventDefault(); setDetail(card); }}
                >
                  {card.name}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Right: deck list */}
      <div className="w-full md:w-72 bg-gray-900 border-l border-gray-800 flex flex-col">
        <div className="p-3 space-y-2 border-b border-gray-800">
          <input
            type="text"
            value={deckName}
            onChange={e => setDeckName(e.target.value)}
            className="w-full bg-gray-800 rounded-lg px-3 py-2 text-sm font-bold"
          />
          <div className="flex gap-2">
            <span className={`text-sm font-bold ${deck.length === 60 ? 'text-green-400' : deck.length > 60 ? 'text-red-400' : 'text-gray-400'}`}>
              {deck.length}/60
            </span>
            <button
              onClick={handleSave}
              disabled={deck.length !== 60}
              className="flex-1 px-3 py-1.5 bg-yellow-500 hover:bg-yellow-400 disabled:opacity-40 disabled:cursor-not-allowed text-black text-sm font-bold rounded-lg"
            >
              Save Deck
            </button>
          </div>
        </div>

        {/* Starter decks */}
        <div className="p-2 border-b border-gray-800">
          <p className="text-xs text-gray-400 mb-1">Starter Decks</p>
          <div className="grid grid-cols-2 gap-1">
            {STARTER_DECKS.map(sd => (
              <button
                key={sd.id}
                onClick={() => loadStarterDeck(sd.id)}
                className="text-left px-2 py-1 bg-gray-800 hover:bg-gray-700 rounded text-xs"
              >
                {sd.name}
              </button>
            ))}
          </div>
        </div>

        {/* Cloud decks (signed in) */}
        {user && cloudDecks.length > 0 && (
          <div className="p-2 border-b border-gray-800">
            <p className="text-xs text-gray-400 mb-1">☁️ Your Decks</p>
            <div className="space-y-1">
              {cloudDecks.map(d => (
                <div key={d.id} className="flex items-center gap-1">
                  <button
                    onClick={() => handleLoadCloud(d)}
                    className="flex-1 text-left px-2 py-1 bg-gray-800 hover:bg-gray-700 rounded text-sm"
                  >
                    {d.name} ({d.card_ids.length})
                  </button>
                  <button
                    onClick={() => deleteCloudDeck(d.id)}
                    className="text-red-400 hover:text-red-300 text-xs px-1"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
        {/* Local decks (guest/offline) */}
        {!user && localDecks.length > 0 && (
          <div className="p-2 border-b border-gray-800">
            <p className="text-xs text-gray-400 mb-1">Saved Decks</p>
            <div className="space-y-1">
              {localDecks.map(d => (
                <button
                  key={d.name}
                  onClick={() => handleLoadLocal(d)}
                  className="w-full text-left px-2 py-1 bg-gray-800 hover:bg-gray-700 rounded text-sm"
                >
                  {d.name} ({d.cardIds.length})
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Deck list */}
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {uniqueInDeck.length === 0 && (
            <p className="text-gray-500 text-sm text-center py-4">Click cards to add them</p>
          )}
          {uniqueInDeck.map(({ card, count }) => (
            <div key={card.id} className="flex items-center gap-2 bg-gray-800 rounded-lg px-2 py-1">
              <span className="text-yellow-400 font-bold text-sm w-5 text-center">{count}</span>
              <span className="flex-1 text-sm truncate">{card.name}</span>
              <button
                onClick={() => removeCard(card)}
                className="text-red-400 hover:text-red-300 text-xs px-1"
              >
                −
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
