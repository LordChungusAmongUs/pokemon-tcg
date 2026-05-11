'use client';
import { useState, useMemo } from 'react';
import { ALL_CARDS } from '@/lib/cardUtils';
import CardImage from '@/components/cards/CardImage';
import CardDetail from '@/components/cards/CardDetail';
import type { CardData } from '@/engine/GameState';
import Link from 'next/link';
import { FORMATS } from '@/lib/formats';

const EXCLUDED = new Set(['Base Set 2', 'Diamond & Pearl']);
const PLAYABLE_CARDS = ALL_CARDS.filter(c => !EXCLUDED.has(c.set));
const SUPERTYPES = ['All', 'Pokémon', 'Trainer', 'Energy'];
const SETS = ['All', ...Array.from(new Set(PLAYABLE_CARDS.map(c => c.set))).sort()];

export default function CollectionPage() {
  const [search, setSearch] = useState('');
  const [supertype, setSupertype] = useState('All');
  const [set, setSet] = useState('All');
  const [format, setFormat] = useState('');
  const [detail, setDetail] = useState<CardData | null>(null);

  const activeFormat = FORMATS.find(f => f.id === format);
  const formatSetNames = activeFormat ? new Set(activeFormat.sets) : null;

  const filtered = useMemo(() => PLAYABLE_CARDS.filter(c => {
    if (supertype !== 'All' && c.supertype !== supertype) return false;
    if (formatSetNames) {
      if (c.set && !formatSetNames.has(c.set)) return false;
    } else {
      if (set !== 'All' && c.set !== set) return false;
    }
    if (search && !c.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  }), [search, supertype, set, format]);

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {detail && <CardDetail card={detail} onClose={() => setDetail(null)} />}

      {/* Header */}
      <div className="sticky top-0 bg-gray-900 border-b border-gray-800 z-10 p-3 space-y-2">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold">Card Collection</h1>
          <Link href="/" className="text-sm text-gray-400 hover:text-white">← Home</Link>
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
        </div>
      </div>

      {/* Grid */}
      <div className="p-3 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
        {filtered.map(card => (
          <div key={card.id} className="flex flex-col items-center gap-1">
            <CardImage
              card={card}
              onClick={() => setDetail(card)}
              large
            />
            <span className="text-xs text-gray-400 text-center truncate w-full px-1">{card.name}</span>
          </div>
        ))}
        {filtered.length === 0 && (
          <div className="col-span-full text-center text-gray-500 py-12">No cards found.</div>
        )}
      </div>
    </div>
  );
}
