'use client';
import { useState, useMemo } from 'react';
import { ALL_CARDS } from '@/lib/cardUtils';
import CardImage from '@/components/cards/CardImage';
import CardDetail from '@/components/cards/CardDetail';
import type { CardData } from '@/engine/GameState';
import Link from 'next/link';
import { FORMATS } from '@/lib/formats';
import { useAuthStore } from '@/store/authStore';
import { pokedexNumber, SET_RELEASE_ORDER } from '@/lib/pokedex';

const EXCLUDED = new Set(['Base Set 2', 'Diamond & Pearl']);
const PLAYABLE_CARDS = ALL_CARDS.filter(c => !EXCLUDED.has(c.set));
const SUPERTYPES = ['All', 'Pokémon', 'Trainer', 'Energy'];
const SETS = ['All', ...Array.from(new Set(PLAYABLE_CARDS.map(c => c.set))).sort()];

// Type order for Japanese-set-style sorting
const TYPE_ORDER: string[] = ['Grass', 'Fire', 'Water', 'Lightning', 'Psychic', 'Fighting', 'Colorless', 'Darkness', 'Metal', 'Dragon', 'Fairy'];

function japaneseSort(cards: typeof PLAYABLE_CARDS): typeof PLAYABLE_CARDS {
  return [...cards].sort((a, b) => {
    const supertypeOrder = (s: string) => s === 'Pokémon' ? 0 : s === 'Trainer' ? 1 : 2;
    if (supertypeOrder(a.supertype) !== supertypeOrder(b.supertype))
      return supertypeOrder(a.supertype) - supertypeOrder(b.supertype);

    if (a.supertype === 'Pokémon') {
      // 1. Energy type
      const aTypeIdx = TYPE_ORDER.indexOf(a.types?.[0] ?? 'Colorless');
      const bTypeIdx = TYPE_ORDER.indexOf(b.types?.[0] ?? 'Colorless');
      if (aTypeIdx !== bTypeIdx) return (aTypeIdx === -1 ? 99 : aTypeIdx) - (bTypeIdx === -1 ? 99 : bTypeIdx);
      // 2. Pokédex number
      const aDex = pokedexNumber(a.name);
      const bDex = pokedexNumber(b.name);
      if (aDex !== bDex) return aDex - bDex;
      // 3. Set release order
      const aSet = SET_RELEASE_ORDER[a.set] ?? 99;
      const bSet = SET_RELEASE_ORDER[b.set] ?? 99;
      if (aSet !== bSet) return aSet - bSet;
      // 4. Card number within set
      const aNum = parseInt(a.number ?? '9999', 10) || 9999;
      const bNum = parseInt(b.number ?? '9999', 10) || 9999;
      return aNum - bNum;
    }

    // Trainers and Energy: alphabetical by name
    return a.name.localeCompare(b.name);
  });
}

export default function PokedexPage() {
  const { collection, encountered } = useAuthStore();
  const [search, setSearch] = useState('');
  const [supertype, setSupertype] = useState('All');
  const [set, setSet] = useState('All');
  const [format, setFormat] = useState('');
  const [tab, setTab] = useState<'owned' | 'seen' | 'all'>('owned');
  const [detail, setDetail] = useState<CardData | null>(null);
  const [sortMode, setSortMode] = useState<'default' | 'japanese'>('default');

  const activeFormat = FORMATS.find(f => f.id === format);
  const formatSetNames = activeFormat ? new Set(activeFormat.sets) : null;

  const filtered = useMemo(() => {
    const base = PLAYABLE_CARDS.filter(c => {
    const ownedQty = collection[c.id] ?? 0;
    const seen = encountered.has(c.id);

    if (tab === 'owned' && ownedQty === 0) return false;
    if (tab === 'seen' && !seen) return false;
    if (tab === 'all' && ownedQty === 0 && !seen) return false;

    if (supertype !== 'All' && c.supertype !== supertype) return false;
    if (formatSetNames) {
      if (c.set && !formatSetNames.has(c.set)) return false;
    } else {
      if (set !== 'All' && c.set !== set) return false;
    }
      if (search && !c.name.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
    return sortMode === 'japanese' ? japaneseSort(base) : base;
  }, [search, supertype, set, format, tab, collection, encountered, sortMode]);

  const ownedCount = PLAYABLE_CARDS.filter(c => (collection[c.id] ?? 0) > 0).length;
  const seenCount  = PLAYABLE_CARDS.filter(c => encountered.has(c.id)).length;

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {detail && <CardDetail card={detail} onClose={() => setDetail(null)} />}

      {/* Header */}
      <div className="sticky top-0 bg-gray-900 border-b border-gray-800 z-10 p-3 space-y-2">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-yellow-400">Pokédex</h1>
            <p className="text-xs text-gray-400">{ownedCount} owned · {seenCount} encountered</p>
          </div>
          <Link href="/" className="text-sm text-gray-400 hover:text-white">← Home</Link>
        </div>

        {/* Tabs */}
        <div className="flex gap-2">
          {([
            { id: 'owned', label: `Owned (${ownedCount})` },
            { id: 'seen',  label: `Seen (${seenCount})` },
            { id: 'all',   label: 'All discovered' },
          ] as const).map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                tab === t.id ? 'bg-yellow-500 text-black' : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <input
          type="text"
          placeholder="Search cards..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full bg-gray-800 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 ring-yellow-500"
        />
        <div className="flex gap-2 overflow-x-auto pb-1">
          <select
            value={supertype}
            onChange={e => setSupertype(e.target.value)}
            className="bg-gray-800 rounded-lg px-2 py-1 text-sm"
          >
            {SUPERTYPES.map(s => <option key={s}>{s}</option>)}
          </select>
          <select
            value={set}
            onChange={e => setSet(e.target.value)}
            className="bg-gray-800 rounded-lg px-2 py-1 text-sm max-w-48"
          >
            {SETS.map(s => <option key={s}>{s}</option>)}
          </select>
          <span className="text-gray-400 text-sm py-1 whitespace-nowrap">
            {filtered.length} cards
          </span>
          <button
            onClick={() => setSortMode(m => m === 'default' ? 'japanese' : 'default')}
            className={`px-2 py-1 rounded-lg text-xs font-bold whitespace-nowrap transition-all ${
              sortMode === 'japanese' ? 'bg-yellow-500 text-black' : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
            }`}
          >
            {sortMode === 'japanese' ? '🇯🇵 JP Order' : '🔢 JP Order'}
          </button>
        </div>
      </div>

      {/* Grid */}
      <div className="p-3 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
        {filtered.length === 0 && (
          <div className="col-span-full text-center text-gray-500 py-12 space-y-2">
            {tab === 'owned' ? (
              <>
                <p>No cards owned yet.</p>
                <Link href="/shop" className="text-yellow-400 hover:text-yellow-300 underline text-sm">
                  Buy packs in the Shop →
                </Link>
              </>
            ) : tab === 'seen' ? (
              <p>Play some games to encounter cards!</p>
            ) : (
              <p>No cards found.</p>
            )}
          </div>
        )}
        {filtered.map(card => {
          const ownedQty = collection[card.id] ?? 0;
          const seen = encountered.has(card.id);
          const isOwned = ownedQty > 0;
          return (
            <div key={card.id} className="flex flex-col items-center gap-1">
              <div className="relative">
                <CardImage
                  card={card}
                  onClick={() => setDetail(card)}
                  large
                  dimmed={!isOwned}
                />
                {/* Owned quantity badge */}
                {isOwned && (
                  <span className="absolute top-1 right-1 bg-yellow-500 text-black text-[10px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1">
                    ×{ownedQty}
                  </span>
                )}
                {/* "Seen" indicator for unowned but encountered cards */}
                {!isOwned && seen && (
                  <span className="absolute top-1 right-1 bg-gray-600 text-white text-[9px] font-bold rounded-full px-1 h-[16px] flex items-center">
                    seen
                  </span>
                )}
              </div>
              <span className="text-xs text-gray-400 text-center truncate w-full px-1">{card.name}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
