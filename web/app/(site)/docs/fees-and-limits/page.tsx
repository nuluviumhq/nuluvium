import type { Metadata } from "next";
import Link from "next/link";
import { DocSection, DocsPage } from "@/components/docs";

export const metadata: Metadata = {
  title: "Fees and limits · Docs",
  description: "The relayer fee, the deposit caps, order limits and where Nuluvium is not offered.",
};

export default function Page() {
  return (
    <DocsPage slug="fees-and-limits" lead="What a piece costs, how much you can deposit, and where the app is not offered.">
      <DocSection n={1} title="Relayer fee">
        <p>Each piece pays the relayer a fee in USDG from your shielded balance: the larger of 0.10 USDG and the piece&#39;s gas cost plus 20%. Gas on Robinhood Chain costs cents, so today the fee is 0.10 per piece. The app shows the total for all pieces before you route.</p>
        <p>The relayer pays the gas of every piece; the fresh addresses never need ETH. Selling from a fresh address pays the same fee, out of the USDG the sale brings. Your own wallet transactions (getting test USDG, approving, depositing, taking a deposit back) pay their gas in testnet ETH.</p>
      </DocSection>
      <DocSection n={2} title="Deposit caps">
        <p>Until an independent audit is published, the approved-set provider approves at most 1,000 USDG per deposit and 25,000 USDG in total across all deposits, first come first approved. The smallest deposit the pool accepts is 1 USDG.</p>
        <p>A deposit above a cap is not approved, so it cannot be traded. It can still be taken back to the wallet that made it (see <Link className="text-link" href="/docs/faq">Questions</Link>).</p>
      </DocSection>
      <DocSection n={3} title="Order limits">
        <div className="scroll-x">
          <table className="rows narrow">
            <thead><tr><th>Limit</th><th>Web app</th><th>Agents (MCP)</th></tr></thead>
            <tbody>
              <tr><td>Pieces per order</td><td>3, 5 or 8</td><td>1 to 20</td></tr>
              <tr><td>Time window</td><td>10 min, 30 min, 2 h or 6 h</td><td>1 minute to 24 hours</td></tr>
              <tr><td>Price protection per piece</td><td>1%</td><td>1% by default, adjustable</td></tr>
              <tr><td>Largest order</td><td colSpan={2}>Your largest approved deposit</td></tr>
              <tr><td>Tokens (testnet)</td><td colSpan={2}>MSTK, a mock stock</td></tr>
            </tbody>
          </table>
        </div>
      </DocSection>
      <DocSection n={4} title="Where Nuluvium is not offered">
        <p>The site is readable everywhere. The app and its API refuse visitors from these places, using the country Cloudflare detects for the request:</p>
        <ul>
          <li>The United States and its territories. Stock tokens are not for US persons.</li>
          <li>The places on the stock token issuer&#39;s prohibited list: Belarus, Cuba, Iran, Myanmar, North Korea, Russia, South Sudan, Sudan, Syria, Ukraine and Venezuela.</li>
          <li>Canada, Switzerland and the United Kingdom, which the issuer restricts.</li>
          <li>The European Union, until a legal opinion on the rules for it is in.</li>
          <li>Tor, where the country cannot be known.</li>
        </ul>
        <p>A VPN gets around a country check, which is why deposits are screened as well.</p>
      </DocSection>
    </DocsPage>
  );
}
