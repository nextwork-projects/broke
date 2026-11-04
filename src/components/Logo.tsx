import { useId } from "react";

// broke's mark: a 2006 brick phone with "Credit: $0.00" on the screen (design/logo-2000s-2.html, G2).
// The LCD text only reads at the large size; small, it's the silhouette and the green screen.
export function PhoneMark({ size = 30 }: { size?: number }) {
  const id = useId();
  return (
    <svg width={(size * 120) / 210} height={size} viewBox="60 18 120 210" aria-hidden className="shrink-0">
      <defs>
        <linearGradient id={`${id}lcd`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#c8d89a" /><stop offset="1" stopColor="#9fb46a" /></linearGradient>
        <linearGradient id={`${id}body`} x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#3b4048" /><stop offset=".5" stopColor="#7a828e" /><stop offset="1" stopColor="#3b4048" /></linearGradient>
      </defs>
      <rect x="62" y="20" width="116" height="206" rx="26" fill={`url(#${id}body)`} stroke="#20242a" strokeWidth="3" />
      <rect x="78" y="44" width="84" height="74" rx="6" fill={`url(#${id}lcd)`} stroke="#222" strokeWidth="3" />
      {size >= 80 ? (
        <g fontFamily="Menlo, Courier New, monospace" fontWeight="700" fill="#2b3315">
          <text x="84" y="60" fontSize="9">▂▄▆ 1:37</text>
          <text x="120" y="84" textAnchor="middle" fontSize="18">broke</text>
          <text x="120" y="100" textAnchor="middle" fontSize="9">Credit: $0.00</text>
          <text x="84" y="113" fontSize="8">Menu</text>
          <text x="156" y="113" textAnchor="end" fontSize="8">Cry</text>
        </g>
      ) : (
        <rect x="92" y="76" width="56" height="12" rx="2" fill="#2b3315" opacity=".75" />
      )}
      <rect x="104" y="128" width="32" height="14" rx="7" fill="#2a2e35" />
      <g fill="#2a2e35">
        {[152, 170, 188].flatMap((y) => [80, 109, 138].map((x) => <rect key={`${x}-${y}`} x={x} y={y} width="22" height="12" rx="5" />))}
      </g>
    </svg>
  );
}

export function Logo() {
  return (
    <span className="flex items-center gap-2 font-semibold text-lg tracking-tight">
      <PhoneMark size={30} />
      broke
    </span>
  );
}
