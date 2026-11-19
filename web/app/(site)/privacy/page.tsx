// Ported from prototype/privacy.html.
import type { Metadata } from "next";
import Link from "next/link";
import { SiteBehaviour } from "@/components/SiteBehaviour";
import { SiteHeader } from "@/components/site";

export const metadata: Metadata = {
  title: "Privacy",
};

export default function Page() {
  return (
    <>
      <SiteHeader solid />
      <main className="wrap doc">
          <p className="mono">Draft · 16 Nov 2026</p>
          <h1 className="display">Privacy</h1>
          <p className="lead">What Nuluvium hides, from whom, and what it keeps.</p>
          <p className="notice">This is placeholder text for the testnet. It is not legal advice and must be replaced by reviewed terms before launch.</p>
          <section><h2><span className="n">01</span>What is hidden</h2><p>The link between your wallet and your trades, between the pieces of one order, and the timing pattern of your orders, from other people reading the chain.</p></section>
          <section><h2><span className="n">02</span>What is not hidden</h2><p>Each piece is a public swap. Robinhood, which runs the chain&#39;s sequencer and issues the stock tokens, can see every address and can block any of them. Nuluvium does not promise privacy from them.</p></section>
          <section><h2><span className="n">03</span>What we keep</h2><p>Nothing about your trades. Login is handled by Privy, which keeps your email or login wallet address, and for an email login the wallet it holds for you. Your Nuluvium keys, your notes, your fresh addresses and your orders stay in your browser; neither Nuluvium nor Privy receives them.</p></section>
          <section><h2><span className="n">04</span>Screening</h2><p>Deposits must prove they come from an approved set, and wallets are checked against the issuer&#39;s blocklist and sanctions lists. Access is blocked from restricted jurisdictions.</p></section>
          <section><h2><span className="n">05</span>Cookies</h2><p>Only what is needed to keep you logged in, set by Privy, and the encrypted keys and orders kept in your browser. No advertising trackers.</p></section>
          <section><h2><span className="n">06</span>Contact</h2><p>Questions about your data can be sent to the address published on this page at launch.</p></section>
          <p className="doc-links"><Link className="text-link" href="/">Back to the site</Link> · <Link className="text-link" href="/terms">Terms</Link> · <Link className="text-link" href="/privacy">Privacy</Link></p>
        </main>
      <SiteBehaviour />
    </>
  );
}
