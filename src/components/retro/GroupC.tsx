import { useId } from "react";

type P = { size?: number; strokeWidth?: number };

// Optimize: a magic wand with a big gold sparkle star.
export function RetroOptimize({ size = 18 }: P) {
  const id = useId();
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden className="shrink-0">
      <defs>
        <linearGradient id={`${id}m`} x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stopColor="#3b4048" />
      <stop offset=".5" stopColor="#7a828e" />
      <stop offset="1" stopColor="#3b4048" />
      </linearGradient>
      <linearGradient id={`${id}o`} x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stopColor="#ffe680" />
      <stop offset="1" stopColor="#e09a12" />
      </linearGradient>
      <linearGradient id={`${id}s`} x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stopColor="#fff" stopOpacity=".85" />
      <stop offset="1" stopColor="#fff" stopOpacity=".05" />
      </linearGradient>
      </defs>
        <rect x="6.2" y="8.6" width="3.8" height="15" rx="1.3" transform="rotate(45 8.1 16.1)" fill={`url(#${id}m)`} stroke="#20242a" strokeWidth="1" />
      <rect x="6.2" y="8.6" width="3.8" height="4" rx="1.3" transform="rotate(45 8.1 16.1)" fill="#fff" stroke="#20242a" strokeWidth="1" />
      <path d="M15.5 1 Q16.5 7.5 23 8.5 Q16.5 9.5 15.5 16 Q14.5 9.5 8 8.5 Q14.5 7.5 15.5 1Z" fill={`url(#${id}o)`} stroke="#b07208" strokeWidth="1" />
      <ellipse cx="15.5" cy="5.5" rx="1.2" ry="3.3" fill={`url(#${id}s)`} />
    </svg>
  );
}

// Cards: a glossy blue credit card with a gold chip and a white stripe.
export function RetroCards({ size = 18 }: P) {
  const id = useId();
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden className="shrink-0">
      <defs>
        <linearGradient id={`${id}b`} x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stopColor="#8b98ff" />
      <stop offset="1" stopColor="#5b6cf0" />
      </linearGradient>
      <linearGradient id={`${id}o`} x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stopColor="#ffe680" />
      <stop offset="1" stopColor="#e09a12" />
      </linearGradient>
      <linearGradient id={`${id}s`} x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stopColor="#fff" stopOpacity=".85" />
      <stop offset="1" stopColor="#fff" stopOpacity=".05" />
      </linearGradient>
      </defs>
        <rect x="2" y="4.5" width="20" height="15" rx="2.5" fill={`url(#${id}b)`} stroke="#20242a" strokeWidth="1" />
      <rect x="4.5" y="9.5" width="5.5" height="4.5" rx="1" fill={`url(#${id}o)`} stroke="#b07208" strokeWidth="1" />
      <rect x="11.5" y="15" width="8" height="2.2" rx="1.1" fill="#fff" />
      <rect x="3" y="5.3" width="18" height="5.6" rx="2" fill={`url(#${id}s)`} />
    </svg>
  );
}

// Ask AI: a retro robot head with an LCD face and a red-ball antenna.
export function RetroBot({ size = 18 }: P) {
  const id = useId();
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden className="shrink-0">
      <defs>
        <linearGradient id={`${id}m`} x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stopColor="#3b4048" />
      <stop offset=".5" stopColor="#7a828e" />
      <stop offset="1" stopColor="#3b4048" />
      </linearGradient>
      <linearGradient id={`${id}l`} x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stopColor="#c8d89a" />
      <stop offset="1" stopColor="#9fb46a" />
      </linearGradient>
      <linearGradient id={`${id}s`} x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stopColor="#fff" stopOpacity=".85" />
      <stop offset="1" stopColor="#fff" stopOpacity=".05" />
      </linearGradient>
      </defs>
        <path d="M12 7V3.5" stroke="#7a828e" strokeWidth="2" strokeLinecap="round" />
      <circle cx="12" cy="3.2" r="2" fill="#e2492f" stroke="#20242a" strokeWidth="1" />
      <rect x="3" y="7" width="18" height="15" rx="3" fill={`url(#${id}m)`} stroke="#20242a" strokeWidth="1" />
      <rect x="5.5" y="10" width="13" height="9.5" rx="1.5" fill={`url(#${id}l)`} stroke="#20242a" strokeWidth="1" />
      <path d="M8 12.5h2.6v3.2H8zM13.4 12.5H16v3.2h-2.6z" fill="#2b3315" />
      <rect x="4" y="7.8" width="16" height="5" rx="2.5" fill={`url(#${id}s)`} />
    </svg>
  );
}

// Settings: a glossy gunmetal gear with a gold centre.
export function RetroSettings({ size = 18 }: P) {
  const id = useId();
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden className="shrink-0">
      <defs>
        <linearGradient id={`${id}m`} x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stopColor="#3b4048" />
      <stop offset=".5" stopColor="#7a828e" />
      <stop offset="1" stopColor="#3b4048" />
      </linearGradient>
      <linearGradient id={`${id}o`} x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stopColor="#ffe680" />
      <stop offset="1" stopColor="#e09a12" />
      </linearGradient>
      <linearGradient id={`${id}s`} x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stopColor="#fff" stopOpacity=".85" />
      <stop offset="1" stopColor="#fff" stopOpacity=".05" />
      </linearGradient>
      </defs>
        <path d="M9.58 4.17 L10.14 1.16 L13.86 1.16 L14.42 4.17 L15.83 4.75 L18.35 3.02 L20.98 5.65 L19.25 8.17 L19.83 9.58 L22.84 10.14 L22.84 13.86 L19.83 14.42 L19.25 15.83 L20.98 18.35 L18.35 20.98 L15.83 19.25 L14.42 19.83 L13.86 22.84 L10.14 22.84 L9.58 19.83 L8.17 19.25 L5.65 20.98 L3.02 18.35 L4.75 15.83 L4.17 14.42 L1.16 13.86 L1.16 10.14 L4.17 9.58 L4.75 8.17 L3.02 5.65 L5.65 3.02 L8.17 4.75Z" fill={`url(#${id}m)`} stroke="#20242a" strokeWidth="1" strokeLinejoin="round" />
      <circle cx="12" cy="12" r="4" fill={`url(#${id}o)`} stroke="#b07208" strokeWidth="1" />
      <ellipse cx="12" cy="7" rx="6.5" ry="3.6" fill={`url(#${id}s)`} />
    </svg>
  );
}

// More: three glossy gunmetal gel dots, an Aqua "..." button.
export function RetroMore({ size = 18 }: P) {
  const id = useId();
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden className="shrink-0">
      <defs>
        <linearGradient id={`${id}m`} x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stopColor="#3b4048" />
      <stop offset=".5" stopColor="#7a828e" />
      <stop offset="1" stopColor="#3b4048" />
      </linearGradient>
      <linearGradient id={`${id}s`} x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stopColor="#fff" stopOpacity=".85" />
      <stop offset="1" stopColor="#fff" stopOpacity=".05" />
      </linearGradient>
      </defs>
        <g fill={`url(#${id}m)`} stroke="#20242a" strokeWidth="1">
      <circle cx="5" cy="12" r="3" />
      <circle cx="12" cy="12" r="3" />
      <circle cx="19" cy="12" r="3" />
      </g>
      <g fill={`url(#${id}s)`}>
      <ellipse cx="5" cy="10.4" rx="1.9" ry="1.2" />
      <ellipse cx="12" cy="10.4" rx="1.9" ry="1.2" />
      <ellipse cx="19" cy="10.4" rx="1.9" ry="1.2" />
      </g>
    </svg>
  );
}
