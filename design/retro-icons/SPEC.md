# broke retro nav icons: shared spec

The app logo is a 2006 brick phone (`src/components/Logo.tsx`, `PhoneMark`). Every nav icon becomes a
small 2006-era glossy object in the same family: think Windows XP / Mac OS X Aqua icons, chunky and
shiny, not line icons. Each icon must still say what the page is at 18px.

## Palette (use only these)
- Gunmetal body gradient, left to right: `#3b4048` -> `#7a828e` -> `#3b4048`
- Outline: `#20242a`, stroke-width 1 (in a 24 viewBox)
- LCD screen gradient, top to bottom: `#c8d89a` -> `#9fb46a`; ink on LCD `#2b3315`
- Gold gradient, top to bottom: `#ffe680` -> `#e09a12`, its outline `#b07208`
- Gloss highlight: white, opacity .85 at top -> .05 at bottom, on the top ~40% of the main shape
- Accents: blue `#5b6cf0` / light blue `#8b98ff`, green `#3d8a55` / light green `#7fbf8f`, red `#e2492f`, white

## Rules
- `viewBox="0 0 24 24"`, fill the box (about 2px margin). Max 4 or 5 shapes per icon. Chunky, no thin detail under 1.5px.
- One gloss highlight per icon. One dark outline on the main shape.
- Must read on white (#ffffff) AND on near-black (#1d1d21). The gunmetal/outline keeps it visible on dark.
- Gradient ids must be unique per instance: use React `useId()` like `PhoneMark` does (strip nothing, just prefix).

## Code shape (match this exactly)
File: `src/components/retro/<YourFile>.tsx`. No `"use client"` needed unless you use hooks; `useId` works in server and client components, so leave it off.

```tsx
import { useId } from "react";

type P = { size?: number; strokeWidth?: number };

// Dashboard: a CRT monitor with green bars on its screen.
export function RetroDashboard({ size = 18 }: P) {
  const id = useId();
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden className="shrink-0">
      ...
    </svg>
  );
}
```
`strokeWidth` is accepted and ignored (Nav passes it). One short comment per icon saying what object it is.

## Check your work
1. Also write `design/retro-icons/<your-file>.html`: the same SVGs pasted as plain SVG markup, each shown at 18px, 36px and 96px, once on a white row and once on a `#1d1d21` row, with the label next to it.
2. Screenshot it: `"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --disable-gpu --hide-scrollbars --window-size=900,700 --force-device-scale-factor=2 --screenshot=<abs path>.png "file://<abs path>.html"`
3. Look at the PNG with Read. At 18px, can you tell what each one is? Fix and re-render until yes. Max 3 rounds.
4. `cd ~/Documents/broke && npx tsc --noEmit -p . 2>&1 | grep retro` must print nothing.

Do NOT edit any other file (Nav.tsx, Logo.tsx, other agents' files). Do not start the dev server.
Report back: file paths, the export names, one line per icon on what it is, and anything that still reads poorly at 18px.
