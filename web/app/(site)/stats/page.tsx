// Stats: Library hero and live ticker (components/layouts.tsx); the figures below are StatsBoard.
import type { Metadata } from "next";
import { SiteBehaviour } from "@/components/SiteBehaviour";
import { SiteFooter, SiteHeader } from "@/components/site";
import { StatsBoard } from "@/components/StatsBoard";
import { LiveTicker } from "@/components/layoutsClient";

export const metadata: Metadata = {
  title: "Stats",
  description: "Public totals for Nuluvium on testnet: crowd size, shielded balance, routed volume, piece sizes, the clean-funds check and the relayer.",
};

export default function Page() {
  return (
    <>
      <SiteHeader />
      <main>
        <div className="wrap">
          <section className="library-hero">
            <div className="inner">
              <p className="mono">Stats · live from testnet</p>
              <h1>Totals, never people.</h1>
              <p className="lead">How big the crowd is, how much is shielded and how much has been routed. Counted from public data, over everyone at once.</p>
            </div>
            <LiveTicker label="Now" facts={[["Relayer fee", "0.10 USDG a piece"], ["Refreshed", "Every 10 minutes"]]} />
          </section>
          <div style={{ padding: "4.5rem 0 6rem" }}>
            <StatsBoard />
          </div>
        </div>
      </main>
      <SiteFooter />
      <SiteBehaviour />
    </>
  );
}
