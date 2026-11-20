import type { Metadata, Viewport } from "next";
import { DM_Mono, Hanken_Grotesk, Mrs_Saint_Delafield, Source_Serif_4 } from "next/font/google";
import { RouteCurtain } from "@/components/RouteCurtain";
import "./globals.css";

// Fonts are downloaded at build time and served from our own domain, so visitors' browsers never
// call Google (fits the privacy promise). The CSS tokens --serif/--sans/--mono point at these.
// Serif trial 2026-11-17: Source Serif 4 (was Newsreader). The optical size axis keeps large headings
// tighter than the text cut.
const serif = Source_Serif_4({ subsets: ["latin"], axes: ["opsz"], variable: "--font-serif", display: "swap" });
const hanken = Hanken_Grotesk({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-hanken", display: "swap" });
const dmMono = DM_Mono({ subsets: ["latin"], weight: "400", variable: "--font-dm-mono", display: "swap" });
const signature = Mrs_Saint_Delafield({ subsets: ["latin"], weight: "400", variable: "--font-signature", display: "swap" });

export const metadata: Metadata = {
  title: { default: "Nuluvium | The privacy layer for onchain stocks", template: "%s | Nuluvium" },
  description:
    "Nuluvium is the privacy layer for onchain stocks on Robinhood Chain. Trades by you or your agents don't trace back to you.",
  // Testnet build with sample data: keep it out of search engines.
  robots: { index: false, follow: false },
};

export const viewport: Viewport = { width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // suppressHydrationWarning: the landing page sets data-intro on <html> before React hydrates (IntroCurtain).
    <html lang="en" className={`${serif.variable} ${hanken.variable} ${dmMono.variable} ${signature.variable}`} suppressHydrationWarning>
      <body>
        {children}
        <RouteCurtain />
      </body>
    </html>
  );
}
