import type { Metadata } from "next";
import Link from "next/link";
import { DocSection, DocsPage } from "@/components/docs";

export const metadata: Metadata = {
  title: "Questions · Docs",
  description: "Answers to common questions and problems: approval, balances, devices, blocked networks and countries.",
};

export default function Page() {
  return (
    <DocsPage slug="faq" lead="Common questions, and what to do when something does not work.">
      <DocSection n={1} title="My deposit stays &quot;waiting for approval&quot;">
        <p>The approved-set provider checks every minute, so approval usually takes a minute or two. A deposit above 1,000 USDG, past the 25,000 total, from a screened-out wallet, or paid for with USDG from a screened-out wallet (10% of the deposit or more) is never approved.</p>
        <p>An unapproved deposit can be taken back, in full, to the wallet that made it: Take back, next to the deposit on Overview. This is called ragequit and is part of the Privacy Pools contracts. It works for approved deposits too, and is public: anyone can see the wallet got that deposit back.</p>
      </DocSection>
      <DocSection n={2} title="My balance is 0 after logging in">
        <p>With a wallet login, your keys belong to one wallet address: log in with the wallet that made the deposit, on Robinhood Chain Testnet. With an email login, your keys come from your recovery phrase: on a new device choose &quot;I have a recovery phrase&quot;, not &quot;make new keys&quot;, which starts an empty balance.</p>
      </DocSection>
      <DocSection n={3} title="Can I use another device?">
        <p>Yes. The same wallet gives the same keys; with an email login, enter your recovery phrase on the new device. Your balance is rebuilt from the chain. Open orders are not: their schedule is stored only in the browser that placed them.</p>
      </DocSection>
      <DocSection n={4} title="&quot;No approved deposit of yours covers this amount&quot;">
        <p>One order is paid from one approved deposit. Make the order smaller than your largest free deposit, wait for a new deposit to be approved, or wait for an open order on that deposit to finish.</p>
      </DocSection>
      <DocSection n={5} title="&quot;Your wallet has no testnet ETH for gas&quot;">
        <p>Your own transactions need a little testnet ETH. Get some from <code>faucet.testnet.chain.robinhood.com</code>. Pieces never need it: the relayer pays their gas.</p>
      </DocSection>
      <DocSection n={6} title="My network blocks robinhood.com">
        <p>The web app reads the chain through Nuluvium&#39;s own RPC address, so it keeps working. Agents should set <code>NULUVIUM_RPC_URL</code> to their own testnet RPC, or use a VPN.</p>
      </DocSection>
      <DocSection n={7} title="The app says it is not available where I am">
        <p>The app is not offered in some countries, and refuses them with HTTP 451. The list is under <Link className="text-link" href="/docs/fees-and-limits">Fees and limits</Link>.</p>
      </DocSection>
      <DocSection n={8} title="Where are my stock tokens?">
        <p>At the fresh address of each piece. Holdings, on the Orders page, lists what each one holds, with Sell and Export key. Only your keys control those addresses.</p>
      </DocSection>
      <DocSection n={9} title="Is there a Nuluvium token?">
        <p>No.</p>
      </DocSection>
    </DocsPage>
  );
}
