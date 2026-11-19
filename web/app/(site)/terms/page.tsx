// Ported from prototype/terms.html.
import type { Metadata } from "next";
import Link from "next/link";
import { SiteBehaviour } from "@/components/SiteBehaviour";
import { SiteHeader } from "@/components/site";

export const metadata: Metadata = {
  title: "Terms of use",
};

export default function Page() {
  return (
    <>
      <SiteHeader solid />
      <main className="wrap doc">
          <p className="mono">Draft · 15 Nov 2026</p>
          <h1 className="display">Terms of use</h1>
          <p className="lead">The rules for using Nuluvium, in plain words.</p>
          <p className="notice">This is placeholder text for the testnet. It is not legal advice and must be replaced by reviewed terms before launch.</p>
          <section><h2><span className="n">01</span>What Nuluvium is</h2><p>Nuluvium is a privacy layer for stock tokens on Robinhood Chain. It routes your orders to existing public pools from fresh addresses, paid from a shielded USDG balance. It does not match buyers with sellers, it is not a broker or an exchange, and it gives no investment advice.</p></section>
          <section><h2><span className="n">02</span>Who may use it</h2><p>You may not use Nuluvium if you are a US person, or if you live in a jurisdiction where stock tokens are restricted. Wallets are checked against the stock token issuer&#39;s blocklist and sanctions lists.</p></section>
          <section><h2><span className="n">03</span>Your shielded balance</h2><p>USDG you deposit sits in the shielded pool contract. Spending it needs a proof that the funds come from an approved set. Deposits are capped until an independent audit is published.</p></section>
          <section><h2><span className="n">04</span>Your orders</h2><p>An order is split into pieces sent within the window you choose. Each piece is a normal swap on a public pool and is final once it lands. Prices can move between pieces. Cancelling stops only the pieces that have not gone out.</p></section>
          <section><h2><span className="n">05</span>Fees</h2><p>Each piece pays a small relayer fee in USDG, shown before you route the order. The relayer pays the gas. There is no Nuluvium token.</p></section>
          <section><h2><span className="n">06</span>Risks and limits</h2><p>Stock tokens and USDG are issued by third parties that can pause, block or burn them. Robinhood runs the chain and can see every address. Smart contracts can fail. You can lose money. Nuluvium is not affiliated with Robinhood.</p></section>
          <p className="doc-links"><Link className="text-link" href="/">Back to the site</Link> · <Link className="text-link" href="/terms">Terms</Link> · <Link className="text-link" href="/privacy">Privacy</Link></p>
        </main>
      <SiteBehaviour />
    </>
  );
}
