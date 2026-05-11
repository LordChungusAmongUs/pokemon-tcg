'use client';
import type { InPlayPokemon } from '@/engine/GameState';
import { cardImageSrc, typeEmoji } from '@/lib/cardUtils';
import Image from 'next/image';

interface Props {
  pokemon: InPlayPokemon;
  onClick?: () => void;
  selected?: boolean;
  isActive?: boolean;
  small?: boolean;
}

const STATUS_COLORS: Record<string, string> = {
  Poisoned: 'bg-purple-600',
  Asleep: 'bg-indigo-600',
  Paralyzed: 'bg-yellow-500',
  Burned: 'bg-red-600',
  Confused: 'bg-pink-500',
};

export default function InPlayCard({ pokemon, onClick, selected, isActive, small }: Props) {
  const hp = pokemon.card.hp ?? 1;
  const remaining = Math.max(0, hp - pokemon.damageTaken);
  const pct = Math.round((remaining / hp) * 100);
  const barColor = pct > 50 ? 'bg-green-500' : pct > 25 ? 'bg-yellow-400' : 'bg-red-500';

  const cardW = small ? 'w-14 h-20' : 'w-20 h-28';

  return (
    <div
      className={`
        relative flex flex-col items-center gap-0.5 cursor-pointer select-none
        transition-all duration-150
        ${selected ? 'scale-105 z-10' : ''}
        ${onClick ? 'hover:scale-105' : ''}
        ${isActive ? 'ring-2 ring-white rounded-xl' : ''}
      `}
      onClick={onClick}
    >
      <div className={`relative ${cardW} rounded-lg overflow-hidden shadow-lg`}>
        <Image
          src={cardImageSrc(pokemon.card)}
          alt={pokemon.card.name}
          fill
          className="object-cover"
          unoptimized
          sizes="80px"
        />
        {selected && (
          <div className="absolute inset-0 bg-yellow-400/30 border-2 border-yellow-400 rounded-lg" />
        )}
      </div>

      {/* HP bar */}
      <div className="w-20 bg-gray-700 rounded-full h-1.5">
        <div className={`${barColor} h-1.5 rounded-full transition-all`} style={{ width: `${pct}%` }} />
      </div>

      {/* HP text + status */}
      <div className="flex items-center gap-1 text-xs text-white">
        <span>{remaining}/{hp} HP</span>
        {pokemon.statusCondition && (
          <span className={`${STATUS_COLORS[pokemon.statusCondition]} px-1 rounded text-white text-[10px]`}>
            {pokemon.statusCondition.slice(0, 3)}
          </span>
        )}
      </div>

      {/* Energy dots */}
      <div className="flex flex-wrap gap-0.5 justify-center max-w-[80px]">
        {pokemon.attachedEnergy.map(e => (
          <span
            key={e.uid}
            title={e.type}
            className="text-[10px]"
          >
            {typeEmoji(e.type)}
          </span>
        ))}
      </div>
    </div>
  );
}
