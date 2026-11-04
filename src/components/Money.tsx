"use client";

import { createContext, useContext, useMemo } from "react";
import { fmtWith, US_FMT, type Fmt } from "@/lib/format";

// The user's currency and locale for client components; the app layout sets it from their profile.
const Ctx = createContext<Fmt>(US_FMT);
export const MoneyProvider = ({ fmt, children }: { fmt: Fmt; children: React.ReactNode }) => <Ctx.Provider value={fmt}>{children}</Ctx.Provider>;
export function useMoney() {
  const f = useContext(Ctx);
  return useMemo(() => fmtWith(f), [f]);
}
