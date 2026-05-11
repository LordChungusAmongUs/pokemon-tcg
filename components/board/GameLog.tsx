'use client';
import { useEffect, useRef } from 'react';

interface Props {
  entries: string[];
  className?: string;
}

export default function GameLog({ entries, className = '' }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [entries]);

  return (
    <div
      ref={ref}
      className={`h-16 overflow-y-auto bg-black/40 rounded-lg p-1.5 text-xs text-gray-300 space-y-0.5 ${className}`}
    >
      {entries.map((e, i) => (
        <div key={i} className={e.startsWith('---') ? 'text-yellow-400 font-semibold' : ''}>
          {e}
        </div>
      ))}
    </div>
  );
}
