import { useId } from "react";

type P = { size?: number; strokeWidth?: number };

// Dashboard: a chunky CRT monitor with three green-LCD bar-chart bars on its screen.
export function RetroDashboard({ size = 18 }: P) {
  const id = useId();
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden className="shrink-0">
      <defs>
        <linearGradient id={`${id}body`} x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#3b4048" /><stop offset=".5" stopColor="#7a828e" /><stop offset="1" stopColor="#3b4048" /></linearGradient>
        <linearGradient id={`${id}lcd`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#c8d89a" /><stop offset="1" stopColor="#9fb46a" /></linearGradient>
        <linearGradient id={`${id}gloss`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#fff" stopOpacity=".85" /><stop offset="1" stopColor="#fff" stopOpacity=".05" /></linearGradient>
      </defs>
      <path d="M8 18h8l1.5 4h-11z" fill={`url(#${id}body)`} stroke="#20242a" strokeWidth="1" strokeLinejoin="round" />
      <rect x="1.5" y="2.5" width="21" height="16" rx="3.5" fill={`url(#${id}body)`} stroke="#20242a" strokeWidth="1" />
      <rect x="4.5" y="5.5" width="15" height="10" rx="1.5" fill={`url(#${id}lcd)`} stroke="#20242a" strokeWidth="1" />
      <path d="M6.5 10.5h2.5v3.5h-2.5zM10.75 8.5h2.5v5.5h-2.5zM15 7h2.5v7h-2.5z" fill="#2b3315" />
      <rect x="3" y="3.2" width="18" height="5.6" rx="2.6" fill={`url(#${id}gloss)`} />
    </svg>
  );
}

// Transactions: two chunky glossy arrows, green pointing right (money in) above red pointing left (money out).
export function RetroTransactions({ size = 18 }: P) {
  const id = useId();
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden className="shrink-0">
      <defs>
        <linearGradient id={`${id}in`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#7fbf8f" /><stop offset="1" stopColor="#3d8a55" /></linearGradient>
        <linearGradient id={`${id}gloss`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#fff" stopOpacity=".85" /><stop offset="1" stopColor="#fff" stopOpacity=".05" /></linearGradient>
      </defs>
      <path d="M1.5 4.8h11.5V1.5l9.5 5.3-9.5 5.3V8.8H1.5z" fill={`url(#${id}in)`} stroke="#20242a" strokeWidth="1" strokeLinejoin="round" />
      <path d="M22.5 15.2H11v-3.3l-9.5 5.3 9.5 5.3v-3.3h11.5z" fill="#e2492f" stroke="#20242a" strokeWidth="1" strokeLinejoin="round" />
      <path d="M2.3 5.5h11.4V3l6.5 3.6H2.3zM21.7 15.9H10.3v-2.5l-6.5 3.6h17.9z" fill={`url(#${id}gloss)`} />
    </svg>
  );
}

// Spending: a glossy pie chart, blue and light blue, with the gold slice pulled out.
export function RetroSpending({ size = 18 }: P) {
  const id = useId();
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden className="shrink-0">
      <defs>
        <linearGradient id={`${id}blue`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#8b98ff" /><stop offset="1" stopColor="#5b6cf0" /></linearGradient>
        <linearGradient id={`${id}gold`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#ffe680" /><stop offset="1" stopColor="#e09a12" /></linearGradient>
        <linearGradient id={`${id}gloss`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#fff" stopOpacity=".85" /><stop offset="1" stopColor="#fff" stopOpacity=".05" /></linearGradient>
      </defs>
      <path d="M10.5 13.5L19.5 13.5A9 9 0 0 1 2.7 18Z" fill="#5b6cf0" stroke="#20242a" strokeWidth="1" strokeLinejoin="round" />
      <path d="M10.5 13.5L2.7 18A9 9 0 0 1 10.5 4.5Z" fill="#8b98ff" stroke="#20242a" strokeWidth="1" strokeLinejoin="round" />
      <path d="M12.5 11.5V2.5A9 9 0 0 1 21.5 11.5Z" fill={`url(#${id}gold)`} stroke="#b07208" strokeWidth="1" strokeLinejoin="round" />
      <ellipse cx="10" cy="8.6" rx="6" ry="3.4" fill={`url(#${id}gloss)`} />
    </svg>
  );
}

// Budgets: a glossy blue gel wallet with a gold clasp dot and a green note peeking out.
export function RetroBudgets({ size = 18 }: P) {
  const id = useId();
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden className="shrink-0">
      <defs>
        <linearGradient id={`${id}blue`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#8b98ff" /><stop offset="1" stopColor="#5b6cf0" /></linearGradient>
        <linearGradient id={`${id}lcd`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#c8d89a" /><stop offset="1" stopColor="#9fb46a" /></linearGradient>
        <linearGradient id={`${id}gold`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#ffe680" /><stop offset="1" stopColor="#e09a12" /></linearGradient>
        <linearGradient id={`${id}gloss`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#fff" stopOpacity=".85" /><stop offset="1" stopColor="#fff" stopOpacity=".05" /></linearGradient>
      </defs>
      <rect x="4.5" y="2.5" width="12" height="7" rx="1" fill={`url(#${id}lcd)`} stroke="#20242a" strokeWidth="1" />
      <rect x="1.5" y="6" width="19" height="15.5" rx="3.5" fill={`url(#${id}blue)`} stroke="#20242a" strokeWidth="1" />
      <rect x="13.5" y="10.5" width="9" height="7" rx="2.5" fill="#5b6cf0" stroke="#20242a" strokeWidth="1" />
      <circle cx="17.2" cy="14" r="2" fill={`url(#${id}gold)`} stroke="#b07208" strokeWidth="1" />
      <rect x="3" y="7" width="16" height="5.5" rx="2.5" fill={`url(#${id}gloss)`} />
    </svg>
  );
}
