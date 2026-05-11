'use client';
import Image from 'next/image';
import type { CardData } from '@/engine/GameState';
import { cardImageSrc } from '@/lib/cardUtils';

interface Props {
  card: CardData;
  className?: string;
  onClick?: () => void;
  selected?: boolean;
  dimmed?: boolean;
  small?: boolean;
  large?: boolean;
}

export default function CardImage({ card, className = '', onClick, selected, dimmed, small, large }: Props) {
  const src = cardImageSrc(card);
  const size = small ? 'w-16 h-[90px]' : large ? 'w-48 h-[268px]' : 'w-28 h-40';

  return (
    <div
      className={`
        relative rounded-lg overflow-hidden cursor-pointer select-none
        transition-all duration-150
        ${size}
        ${selected ? 'ring-4 ring-yellow-400 scale-105 z-10' : ''}
        ${dimmed ? 'opacity-40' : ''}
        ${onClick ? 'hover:scale-105 hover:shadow-xl' : ''}
        ${className}
      `}
      onClick={onClick}
      title={card.name}
    >
      <Image
        src={src}
        alt={card.name}
        fill
        className="object-cover"
        unoptimized
        sizes="(max-width: 768px) 64px, 112px"
      />
    </div>
  );
}
