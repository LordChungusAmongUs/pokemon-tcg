'use client';
import type { InPlayPokemon } from '@/engine/GameState';
import { cardImageSrc, ENERGY_IMAGE_MAP } from '@/lib/cardUtils';
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

const TYPE_BG: Record<string, string> = {
  Fire: 'bg-orange-500', Water: 'bg-blue-500', Grass: 'bg-green-500',
  Lightning: 'bg-yellow-400', Psychic: 'bg-purple-500', Fighting: 'bg-orange-700',
  Darkness: 'bg-gray-800', Metal: 'bg-gray-400', Colorless: 'bg-gray-300',
  Dragon: 'bg-indigo-600', Fairy: 'bg-pink-400',
};

const TYPE_TEXT: Record<string, string> = {
  Fire: 'R', Water: 'W', Grass: 'G', Lightning: 'L', Psychic: 'P',
  Fighting: 'F', Darkness: 'D', Metal: 'M', Colorless: 'C', Dragon: 'N', Fairy: 'Y',
};

export default function InPlayCard({ pokemon, onClick, selected, isActive, small }: Props) {
  const hp = pokemon.card.hp ?? 1;
  const remaining = Math.max(0, hp - pokemon.damageTaken);
  const pct = Math.round((remaining / hp) * 100);
  const barColor = pct > 50 ? 'bg-green-500' : pct > 25 ? 'bg-yellow-400' : 'bg-red-500';

  const cardW = small ? 56 : 80;
  const cardH = small ? 80 : 112;
  const stackOff = 3; // px offset per card in evolution stack
  const prevCards = pokemon.evolvedFrom ?? [];
  const depth = prevCards.length;

  // Container is larger when there's an evolution stack (cards peek out from behind/above)
  const containerW = cardW + depth * stackOff;
  const containerH = cardH + depth * stackOff;

  const badgeSz = small ? 14 : 18;
  const badgeOff = small ? 9 : 12;

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
      {/* Card stack (evolution chain behind, current card on top) */}
      <div className="relative" style={{ width: containerW, height: containerH }}>
        {prevCards.map((prev, i) => (
          <div
            key={i}
            className="absolute rounded-lg overflow-hidden shadow border border-white/20 opacity-75"
            style={{
              width: cardW, height: cardH,
              top: (depth - i) * stackOff,
              left: (depth - i) * stackOff,
              zIndex: i,
            }}
          >
            <Image
              src={cardImageSrc(prev)}
              alt={prev.name}
              fill
              className="object-cover"
              unoptimized
              sizes={`${cardW}px`}
            />
          </div>
        ))}
        {/* Current card on top */}
        <div
          className="absolute rounded-lg overflow-hidden shadow-lg"
          style={{ width: cardW, height: cardH, top: 0, left: 0, zIndex: depth }}
        >
          <Image
            src={cardImageSrc(pokemon.card)}
            alt={pokemon.card.name}
            fill
            className="object-cover"
            unoptimized
            sizes={`${cardW}px`}
          />
          {selected && (
            <div className="absolute inset-0 bg-yellow-400/30 border-2 border-yellow-400 rounded-lg" />
          )}
        </div>
      </div>

      {/* HP bar */}
      <div className="bg-gray-700 rounded-full h-1.5" style={{ width: containerW }}>
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

      {/* Energy badges (colored circles stacked) */}
      {pokemon.attachedEnergy.length > 0 && (() => {
        const energies = pokemon.attachedEnergy;
        const totalW = badgeSz + (energies.length - 1) * badgeOff;
        return (
          <div className="relative" style={{ width: totalW, height: badgeSz }}>
            {energies.map((e, idx) => {
              const imgSrc = ENERGY_IMAGE_MAP[e.type];
              return (
                <div
                  key={e.uid}
                  title={e.type}
                  className={`absolute rounded-full overflow-hidden shadow border border-white/40
                    ${!imgSrc ? (TYPE_BG[e.type] || 'bg-gray-600') : ''}`}
                  style={{ left: idx * badgeOff, width: badgeSz, height: badgeSz, zIndex: idx }}
                >
                  {imgSrc ? (
                    <Image src={imgSrc} alt={e.type} fill className="object-cover" unoptimized sizes={`${badgeSz}px`} />
                  ) : (
                    <span
                      className="flex items-center justify-center w-full h-full text-white font-bold"
                      style={{ fontSize: badgeSz * 0.5 }}
                    >
                      {TYPE_TEXT[e.type] ?? '?'}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        );
      })()}
    </div>
  );
}
