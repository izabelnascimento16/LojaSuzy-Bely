import {useState} from 'react';
import {Gem} from 'lucide-react';

export function BrandMark({className = 'w-6 h-6'}: {className?: string}) {
  return (
    <svg
      viewBox="0 0 36 30"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <path
        d="M9.5 3H26.5L33 11.2L18 27L3 11.2L9.5 3Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path d="M3 11.2H33" stroke="currentColor" strokeWidth="1.5" />
      <path d="M9.5 3L13 11.2L18 27L23 11.2L26.5 3" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
    </svg>
  );
}

interface ResilientImageProps {
  src: string;
  alt: string;
  className?: string;
  priority?: boolean;
}

export function ResilientImage({
  src,
  alt,
  className = 'w-full h-full object-cover',
  priority = false,
}: ResilientImageProps) {
  const [failed, setFailed] = useState(false);

  if (failed || !src) {
    return (
      <div
        className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-[#FFE6D0] via-[#FFF9F4] to-[#F2D2B6] text-[#9A6B50] p-4 text-center"
        role="img"
        aria-label={alt}
      >
        <Gem className="w-7 h-7 text-[#EA580C]/75 mb-2" />
        <span className="text-xs font-medium line-clamp-2">{alt}</span>
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      loading={priority ? 'eager' : 'lazy'}
      decoding="async"
      fetchPriority={priority ? 'high' : 'auto'}
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className={className}
    />
  );
}
