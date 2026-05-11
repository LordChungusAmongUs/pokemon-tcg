interface Props {
  className?: string;
  small?: boolean;
  count?: number;
}

export default function CardBack({ className = '', small, count }: Props) {
  const size = small ? 'w-16 h-22' : 'w-28 h-40';
  return (
    <div
      className={`
        relative ${size} rounded-lg overflow-hidden select-none
        bg-gradient-to-br from-blue-900 to-blue-700
        border-2 border-blue-400
        flex items-center justify-center
        ${className}
      `}
    >
      <div className="text-blue-300 text-2xl font-bold">
        {count !== undefined ? count : '🎴'}
      </div>
    </div>
  );
}
