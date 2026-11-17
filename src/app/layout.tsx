import type { Metadata } from "next";
import { Figtree } from "next/font/google";
import "./globals.css";

const figtree = Figtree({ variable: "--font-figtree", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "broke",
  description: "Where your money went.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Apply the saved mode, theme and Hide balances before paint; no data-theme means follow the system. */}
        <script dangerouslySetInnerHTML={{ __html: `try{var d=document.documentElement,t=localStorage.getItem("theme");if(t==="light"||t==="dark")d.dataset.theme=t;if(localStorage.getItem("skin")==="retro")d.dataset.skin="retro";if(localStorage.getItem("hideMoney"))d.classList.add("hide-money")}catch(e){}` }} />
      </head>
      <body className={`${figtree.variable} antialiased`}>{children}</body>
    </html>
  );
}
