# Paper brief: broke retro styles

Paper file "broke logos", fileId `01M5FXP9XFNDEPD1J1JTXWY8N0`.
- Page **Retro icon styles** pageId `p-2-0`: one artboard per icon style.
- Page **Retro UI** pageId `p-3-0`: one full dashboard per UI direction.
Pass fileId and pageId on every call. Other agents are writing artboards on the same pages at the same time:
only touch artboards you created. Call `get_guide({topic:"paper-mcp-instructions"})` once first, and
`finish_working_on_nodes` with your artboard ids when done.

The app: broke, a money app. Its logo is a 2006 brick phone with a green LCD
(`src/components/Logo.tsx`). Real screens to base everything on (Read them):
- `design/retro-icons/sidebar-live.png`: the real sidebar with the current Aqua retro icons
- `design/retro-icons/all.png`: those icons large
- the current Aqua icon SVG code: `src/components/retro/GroupA.tsx`, `GroupB.tsx`, `GroupC.tsx`
(all paths under ~/Documents/broke)

## The 13 icons (every icon style must draw all of them)
Dashboard, Transactions, Spending, Budgets, Recurring, then the "Grow" group: Accounts, For you,
Money plan, Optimize, Cards, then Ask broke ai (robot), Settings (gear), More (three dots).
Plus that style's version of the brick-phone logo next to the word "broke".

## Icon-style artboard shape (page p-2-0)
Artboard 440px wide, height fit-content, named "<Style name> icons".
1. Header: style name big, era + one line on the look, small.
2. A sidebar mock in that style: logo row, the 10 nav rows (Dashboard active), "Grow" label, "Ask broke ai"
   button, rows exactly like sidebar-live.png. Icons at the real size (18-20px) here.
3. Below: all 13 icons at 48px in a wrapping row, each with its name under it.
Draw icons as inline SVG. They must still say what the page is at 18px.

## UI artboard shape (page p-3-0)
Artboard 1440 x 900 (fit-content if it runs over), named "Retro UI · <direction>".
The dashboard, with made-up numbers.

## Writing rules for any copy you add
No em dashes. Plain short words. Labels lowercase or sentence case like the app.
