// Ported from prototype/privacy.html. Layout: a short rulebook (LegalPage).
import type { Metadata } from "next";
import { SiteBehaviour } from "@/components/SiteBehaviour";
import { LegalPage } from "@/components/layouts";
import { SiteHeader } from "@/components/site";

export const metadata: Metadata = {
  title: "Privacy",
};

export default function Page() {
  return (
    <>
      <SiteHeader solid />
      <LegalPage
        draft="Draft · 16 Nov 2026"
        title="Privacy"
        lead="What Nuluvium hides, from whom, and what it keeps."
        notice="This is placeholder text for the testnet. It is not legal advice and must be replaced by reviewed terms before launch."
        sections={[
          { title: "What is hidden", text: <>The link between your wallet and your trades, between the pieces of one order, and the timing pattern of your orders, from other people reading the chain.</> },
          { title: "What is not hidden", text: <>Each piece is a public swap. Robinhood, which runs the chain&#39;s sequencer and issues the stock tokens, can see every address and can block any of them. Nuluvium does not promise privacy from them.</> },
          { title: "What we keep", text: <>Nothing about your trades. Login is handled by Privy, which keeps your email or login wallet address, and for an email login the wallet it holds for you. Your Nuluvium keys, your notes, your fresh addresses and your orders stay in your browser; neither Nuluvium nor Privy receives them.</> },
          { title: "Screening", text: <>Deposits must prove they come from an approved set, and wallets are checked against the issuer&#39;s blocklist and sanctions lists. Access is blocked from restricted jurisdictions.</> },
          { title: "Cookies", text: <>Only what is needed to keep you logged in, set by Privy, and the encrypted keys and orders kept in your browser. No advertising trackers.</> },
          { title: "Contact", text: <>Questions about your data can be sent to the address published on this page at launch.</> },
        ]}
      />
      <SiteBehaviour />
    </>
  );
}
