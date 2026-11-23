import type { Metadata } from "next";
import { DocSection, DocsPage } from "@/components/docs";
import { IconGrid } from "@/components/layouts";

export const metadata: Metadata = {
  title: "Security and risks · Docs",
  description: "What Nuluvium protects, what it cannot, and how to keep your keys safe.",
};

export default function Page() {
  return (
    <DocsPage slug="security" lead="What Nuluvium protects, what it cannot, and what you should do. Read this before you trade.">
      <DocSection n={1} title="Your keys">
        <p>With a wallet login, your Nuluvium keys come from your wallet&#39;s signature of the &quot;Nuluvium key&quot; message. Anyone who gets that signature can spend your shielded balance. Sign it only on this site, never on a page someone sent you.</p>
        <p>With an email login, your keys come from a 12-word recovery phrase made in your browser and kept there encrypted. Write it down when the app shows it and keep it offline: it is the only way back to your balance on another device. While logged in on this device you can see it again with Show recovery phrase. Anyone who has it can spend your shielded balance. Privy, which handles the login and holds your login wallet, never sees it, so it cannot rebuild your keys or find your fresh addresses.</p>
        <p>For an agent, the twelve words are the keys. Keep them in the agent&#39;s environment, never in a file you share or commit.</p>
      </DocSection>
      <DocSection n={2} title="Four limits to know">
        <IconGrid items={[
          { icon: "eye", title: "Private from the public, not from Robinhood", children: <p>Robinhood runs the chain&#39;s sequencer and issues the stock tokens. It can see and block every address. Nuluvium hides the link between your trades from other readers of the chain.</p> },
          { icon: "flag", title: "The issuer controls stock tokens", children: <p>The stock token contract lets its issuer pause, block or burn tokens at any address, fresh addresses included. Nuluvium cannot prevent that. USDG can also be frozen by its issuer.</p> },
          { icon: "crowd", title: "Privacy needs a crowd", children: <p>Fresh addresses only hide you among the other people using the pool. While few people use it, it is easier to guess which deposit paid for which piece. More pieces over a longer window make the guess harder.</p> },
          { icon: "lock", title: "Not audited yet", children: <p>Nuluvium&#39;s Router, relayer registry and services have not had an independent audit yet. Deposits are capped until one is published. Smart contracts can fail, and you can lose money.</p> },
        ]} />
      </DocSection>
      <DocSection n={3} title="Testnet">
        <p>Everything here runs on Robinhood Chain testnet with test tokens that have no value. Do not send real funds to these addresses.</p>
      </DocSection>
    </DocsPage>
  );
}
