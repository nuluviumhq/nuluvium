import type { Metadata } from "next";
import Link from "next/link";
import { DocSection, DocsPage } from "@/components/docs";

export const metadata: Metadata = {
  title: "Getting started · Docs",
  description: "Log in with email or a wallet, get test USDG and make your first deposit on Robinhood Chain testnet.",
};

export default function Page() {
  return (
    <DocsPage slug="getting-started" variant="roman" lead="From a wallet to a shielded balance you can trade from, in about five minutes.">
      <DocSection n={1} title="What you need">
        <ul>
          <li>An email address, or a browser wallet such as MetaMask or Rabby.</li>
          <li>A little testnet ETH for the gas of your own transactions (getting test USDG, approving, depositing). Get it from the faucet at <code>faucet.testnet.chain.robinhood.com</code>.</li>
          <li>To be somewhere Nuluvium is offered. See <Link className="text-link" href="/docs/fees-and-limits">Fees and limits</Link>.</li>
        </ul>
      </DocSection>
      <DocSection n={2} title="Log in">
        <p>Open the app and choose Log in. Login is handled by Privy: use your email or connect a wallet.</p>
        <p><strong>With email,</strong> Privy makes a wallet for you, used for your deposits. The first time on a device, the app makes your Nuluvium keys and shows a 12-word recovery phrase: write it down. It is the only way to use your balance on another device or after clearing this browser. Privy never sees it. On this device the app unlocks by itself next time.</p>
        <p><strong>With a wallet,</strong> it asks you to sign a message called &quot;Nuluvium key&quot;. It is not a transaction and costs nothing. The signature becomes your Nuluvium keys, in your browser. The first time, the app asks you to sign twice: it checks that your wallet signs the same way each time, so the same wallet always gives the same keys.</p>
        <p>Either way, your keys are made in your browser and never sent to a server.</p>
      </DocSection>
      <DocSection n={3} title="Add the testnet">
        <p>The app asks your wallet to add Robinhood Chain Testnet (chain 46630) and to switch to it. The network it adds reads the chain through Nuluvium&#39;s own RPC address, so it works on networks that block robinhood.com. With an email login the wallet is already on the testnet.</p>
      </DocSection>
      <DocSection n={4} title="Get test funds">
        <p>On the Overview, choose Get test funds. The Nuluvium faucet sends 100 tUSDG, a mock of USDG for the testnet, to your wallet, plus a little testnet ETH for gas when the wallet has almost none. You sign nothing and pay nothing. It works once a day per wallet; more ETH is at the official faucet, faucet.testnet.chain.robinhood.com.</p>
      </DocSection>
      <DocSection n={5} title="Deposit">
        <p>Enter an amount, up to 1,000 tUSDG per deposit, and choose Deposit. Your wallet asks for two transactions: an approval for the pool to take the tUSDG, then the deposit itself.</p>
        <p>Every deposit is a separate note in your shielded balance. Only your keys can spend it.</p>
      </DocSection>
      <DocSection n={6} title="Wait for approval">
        <p>The deposit shows &quot;waiting for approval&quot; until the approved-set provider has screened it. It checks every minute, so this usually takes a minute or two, and the page updates by itself. Then the deposit is part of your tradable balance.</p>
        <p>Next: <Link className="text-link" href="/docs/orders">place an order</Link>.</p>
      </DocSection>
    </DocsPage>
  );
}
