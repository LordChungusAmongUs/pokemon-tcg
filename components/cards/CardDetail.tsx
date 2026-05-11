'use client';
import type { CardData } from '@/engine/GameState';
import { cardImageSrc, typeColor, typeEmoji } from '@/lib/cardUtils';
import Image from 'next/image';

interface Props {
  card: CardData;
  onClose: () => void;
}

export default function CardDetail({ card, onClose }: Props) {
  return (
    <div
      className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl max-w-sm w-full overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <div className="relative h-64">
          <Image
            src={cardImageSrc(card)}
            alt={card.name}
            fill
            className="object-contain p-2"
            unoptimized
          />
        </div>
        <div className="p-4 space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold">{card.name}</h2>
            {card.hp && <span className="text-red-600 font-bold">{card.hp} HP</span>}
          </div>
          <div className="flex gap-1 flex-wrap text-sm text-gray-500">
            <span>{card.set}</span>
            <span>·</span>
            <span>{card.rarity}</span>
            {card.supertype && <span>· {card.supertype}</span>}
            {card.subtype && <span>· {card.subtype}</span>}
          </div>
          {card.types.length > 0 && (
            <div className="flex gap-1">
              {card.types.map(t => (
                <span key={t} className={`px-2 py-0.5 rounded text-white text-xs font-medium ${typeColor(t)}`}>
                  {typeEmoji(t)} {t}
                </span>
              ))}
            </div>
          )}
          {card.evolvesFrom && (
            <p className="text-sm text-gray-500">Evolves from: {card.evolvesFrom}</p>
          )}
          {card.attacks.map(atk => (
            <div key={atk.name} className="border rounded p-2 space-y-1">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1">
                  {atk.cost.map((t, i) => (
                    <span key={i} className={`w-5 h-5 rounded-full inline-block ${typeColor(t)}`} title={t} />
                  ))}
                  <span className="font-semibold ml-1">{atk.name}</span>
                </div>
                <span className="font-bold text-gray-700">{atk.damageStr || atk.damage || '—'}</span>
              </div>
              {atk.text && <p className="text-xs text-gray-500">{atk.text}</p>}
            </div>
          ))}
          {card.weaknesses.length > 0 && (
            <div className="text-sm flex gap-4">
              <span>Weak: {card.weaknesses.map(w => `${typeEmoji(w.type)}${w.value}`).join(', ')}</span>
              {card.resistances.length > 0 && (
                <span>Resist: {card.resistances.map(r => `${typeEmoji(r.type)}${r.value}`).join(', ')}</span>
              )}
              <span>Retreat: {card.retreatCost.length || 0}</span>
            </div>
          )}
          {card.rules.map((r, i) => (
            <p key={i} className="text-xs text-gray-500 italic">{r}</p>
          ))}
        </div>
        <button
          onClick={onClose}
          className="w-full py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium"
        >
          Close
        </button>
      </div>
    </div>
  );
}
