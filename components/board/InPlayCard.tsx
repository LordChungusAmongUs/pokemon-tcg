'use client';
import type { InPlayPokemon } from '@/engine/GameState';
import { cardImageSrc, typeEmoji, ENERGY_IMAGE_MAP } from '@/lib/cardUtils';
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
  const barW  = small ? 'w-14' : 'w-20';

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
      <div className={`${barW} bg-gray-700 rounded-full h-1.5`}>
        <div className={`${barColor} h-1.5 rounded-full transition-all`} style={{ width: `${pct}%` }} />
      </div>

      {/* HP text + status */}
      <div className="flex items-center gap-0.5 text-[10px] text-white leading-none">
        <span>{remaining}/{hp}</span>
        {pokemon.statusCondition && (
          <span className={`${STATUS_COLORS[pokemon.statusCondition]} px-1 rounded text-white text-[9px]`}>
            {pokemon.statusCondition.slice(0, 3)}
          </span>
        )}
      </div>

      {/* Energy stack */}
      {pokemon.attachedEnergy.length > 0 && (() => {
        const energies = pokemon.attachedEnergy;
        const cardH = small ? 26 : 36;
        const cardW = small ? 18 : 26;
        const offset = small ? 10 : 14;
        const totalW = cardW + (energies.length - 1) * offset;
        return (
          <div className="relative" style={{ width: totalW, height: cardH }}>
            {energies.map((e, idx) => {
              const imgSrc = ENERGY_IMAGE_MAP[e.type];
              return (
                <div
                  key={e.uid}
                  title={e.type}
                  className="absolute rounded overflow-hidden shadow border border-white/20"
                  style={{ left: idx * offset, width: cardW, height: cardH, zIndex: idx }}
                >
                  {imgSrc
                    ? <Image src={imgSrc} alt={e.type} fill className="object-cover" unoptimized sizes="26px" />
                    : <div className="w-full h-full flex items-center justify-center bg-gray-700 text-[8px]">{typeEmoji(e.type)}</div>
                  }
                </div>
              );
            })}
          </div>
        );
      })()}
    </div>
  );
}
