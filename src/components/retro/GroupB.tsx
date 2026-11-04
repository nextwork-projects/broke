import { useId } from "react";

type P = { size?: number; strokeWidth?: number };

// Recurring: a desk calendar with two binder rings and a refresh arrow on the page.
export function RetroRecurring({ size = 18 }: P) {
  const id = useId();
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden className="shrink-0">
      <defs>
        <linearGradient id={`${id}gl`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#fff" stopOpacity=".85" /><stop offset="1" stopColor="#fff" stopOpacity=".05" /></linearGradient>
        <linearGradient id={`${id}gm`} x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#3b4048" /><stop offset=".5" stopColor="#7a828e" /><stop offset="1" stopColor="#3b4048" /></linearGradient>
      </defs>
      <rect x="2.5" y="4.5" width="19" height="17" rx="2.5" fill="#fff" stroke="#20242a" strokeWidth="1" />
      <path d="M2.5 9.5V7a2.5 2.5 0 0 1 2.5-2.5h14A2.5 2.5 0 0 1 21.5 7v2.5Z" fill="#e2492f" stroke="#20242a" strokeWidth="1" />
      <path d="M3 9V7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v2Z" fill={`url(#${id}gl)`} />
      <g fill={`url(#${id}gm)`} stroke="#20242a" strokeWidth="1"><rect x="6" y="1.5" width="2.5" height="5.5" rx="1.25" /><rect x="15.5" y="1.5" width="2.5" height="5.5" rx="1.25" /></g>
      <path d="M9 14.4A3.2 3.2 0 1 0 12 12.3" fill="none" stroke="#5b6cf0" strokeWidth="2.2" strokeLinecap="round" />
      <path d="M9.9 12.3L12.9 10v4.6Z" fill="#5b6cf0" stroke="#5b6cf0" strokeWidth="1" strokeLinejoin="round" />
    </svg>
  );
}

// Accounts: a bank with a gold pediment roof, three columns and a base step.
export function RetroAccounts({ size = 18 }: P) {
  const id = useId();
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden className="shrink-0">
      <defs>
        <linearGradient id={`${id}gl`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#fff" stopOpacity=".85" /><stop offset="1" stopColor="#fff" stopOpacity=".05" /></linearGradient>
        <linearGradient id={`${id}au`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#ffe680" /><stop offset="1" stopColor="#e09a12" /></linearGradient>
        <linearGradient id={`${id}gm`} x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#3b4048" /><stop offset=".5" stopColor="#7a828e" /><stop offset="1" stopColor="#3b4048" /></linearGradient>
      </defs>
      <path d="M12 1.8L22 8.6H2Z" fill={`url(#${id}au)`} stroke="#b07208" strokeWidth="1" strokeLinejoin="round" />
      <path d="M12 3L18.5 7.4H5.5Z" fill={`url(#${id}gl)`} />
      <g fill="#fff" stroke="#20242a" strokeWidth="1"><rect x="4" y="9.6" width="3.4" height="8.4" rx=".6" /><rect x="10.3" y="9.6" width="3.4" height="8.4" rx=".6" /><rect x="16.6" y="9.6" width="3.4" height="8.4" rx=".6" /></g>
      <rect x="2" y="18" width="20" height="4" rx="1" fill={`url(#${id}gm)`} stroke="#20242a" strokeWidth="1" />
    </svg>
  );
}

// For you: a glowing gold glass light bulb on a gunmetal screw base.
export function RetroForYou({ size = 18 }: P) {
  const id = useId();
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden className="shrink-0">
      <defs>
        <linearGradient id={`${id}gl`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#fff" stopOpacity=".85" /><stop offset="1" stopColor="#fff" stopOpacity=".05" /></linearGradient>
        <linearGradient id={`${id}au`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#ffe680" /><stop offset="1" stopColor="#e09a12" /></linearGradient>
        <linearGradient id={`${id}gm`} x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#3b4048" /><stop offset=".5" stopColor="#7a828e" /><stop offset="1" stopColor="#3b4048" /></linearGradient>
        <radialGradient id={`${id}glow`}><stop offset=".55" stopColor="#ffe680" stopOpacity=".7" /><stop offset="1" stopColor="#ffe680" stopOpacity="0" /></radialGradient>
      </defs>
      <circle cx="12" cy="9.5" r="10.5" fill={`url(#${id}glow)`} />
      <path d="M8.5 15.5C6 14 4.6 12 4.6 9.4a7.4 7.4 0 0 1 14.8 0c0 2.6-1.4 4.6-3.9 6.1Z" fill={`url(#${id}au)`} stroke="#b07208" strokeWidth="1" strokeLinejoin="round" />
      <ellipse cx="10" cy="6.4" rx="3.8" ry="2.6" fill={`url(#${id}gl)`} />
      <rect x="8.2" y="15.5" width="7.6" height="5.2" rx="1.2" fill={`url(#${id}gm)`} stroke="#20242a" strokeWidth="1" />
      <path d="M8.6 18.1h6.8M10.2 21.6h3.6" stroke="#20242a" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

// Money plan: a gold clipboard with a gunmetal clip, white paper and two green checks.
export function RetroMoneyPlan({ size = 18 }: P) {
  const id = useId();
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden className="shrink-0">
      <defs>
        <linearGradient id={`${id}gl`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#fff" stopOpacity=".85" /><stop offset="1" stopColor="#fff" stopOpacity=".05" /></linearGradient>
        <linearGradient id={`${id}au`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#ffe680" /><stop offset="1" stopColor="#e09a12" /></linearGradient>
        <linearGradient id={`${id}gm`} x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#3b4048" /><stop offset=".5" stopColor="#7a828e" /><stop offset="1" stopColor="#3b4048" /></linearGradient>
      </defs>
      <rect x="3.5" y="3.5" width="17" height="19" rx="2.2" fill={`url(#${id}au)`} stroke="#b07208" strokeWidth="1" />
      <rect x="5.6" y="6.6" width="12.8" height="14" rx="1" fill="#fff" stroke="#20242a" strokeWidth="1" />
      <g fill="none" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M7.4 11l1.6 1.6 2.8-3.1M7.4 16.6l1.6 1.6 2.8-3.1" stroke="#3d8a55" /><path d="M13.6 11.4h3M13.6 17h3" stroke="#7a828e" strokeWidth="1.6" /></g>
      <rect x="7.5" y="1.5" width="9" height="4.5" rx="1.5" fill={`url(#${id}gm)`} stroke="#20242a" strokeWidth="1" />
      <rect x="8.2" y="2" width="7.6" height="1.9" rx=".9" fill={`url(#${id}gl)`} />
    </svg>
  );
}
