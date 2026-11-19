import type { Metadata } from "next";
import { SiteBehaviour } from "@/components/SiteBehaviour";
import { SiteFooter, SiteHeader } from "@/components/site";
import { StatsBoard } from "@/components/StatsBoard";

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
          <section className="page-hero">
            <p className="mono soft">Stats</p>
            <h1 className="display">Totals, never people</h1>
            <p className="lead">How big the crowd is, how much is shielded and how much has been routed. Counted from public data, over everyone at once.</p>
          </section>
          <div style={{ paddingBottom: "6rem" }}>
            <StatsBoard />
          </div>
        </div>
      </main>
      <SiteFooter />
      <SiteBehaviour />
    </>
  );
}
