interface Props {
  label?: string;
  onClick?: () => void;
  highlight?: boolean;
  small?: boolean;
}

export default function EmptySlot({ label, onClick, highlight, small }: Props) {
  const size = small ? 'w-14 h-20' : 'w-20 h-28';
  return (
    <div
      onClick={onClick}
      className={`
        ${size} rounded-lg border-2 border-dashed flex items-center justify-center
        text-xs text-center p-1 transition-all select-none
        ${highlight
          ? 'border-yellow-400 text-yellow-300 bg-yellow-400/10 cursor-pointer hover:bg-yellow-400/20 animate-pulse'
          : 'border-gray-600 text-gray-600 cursor-default'
        }
      `}
    >
      {label || '+'}
    </div>
  );
}
