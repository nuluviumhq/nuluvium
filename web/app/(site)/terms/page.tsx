// Ported from prototype/terms.html. Layout: a short rulebook (LegalPage).
import type { Metadata } from "next";
import { SiteBehaviour } from "@/components/SiteBehaviour";
import { LegalPage } from "@/components/layouts";
import { SiteHeader } from "@/components/site";

export const metadata: Metadata = {
  title: "Terms of use",
};

export default function Page() {
  return (
    <>
      <SiteHeader solid />
      <LegalPage
        draft="Draft · 15 Nov 2026"
        title="Terms of use"
        lead="The rules for using Nuluvium, in plain words."
        notice="This is placeholder text for the testnet. It is not legal advice and must be replaced by reviewed terms before launch."
        sections={[
          { title: "What Nuluvium is", text: <>Nuluvium is a privacy layer for stock tokens on Robinhood Chain. It routes your orders to existing public pools from fresh addresses, paid from a shielded USDG balance. It does not match buyers with sellers, it is not a broker or an exchange, and it gives no investment advice.</> },
          { title: "Who may use it", text: <>You may not use Nuluvium if you are a US person, or if you live in a jurisdiction where stock tokens are restricted. Wallets are checked against the stock token issuer&#39;s blocklist and sanctions lists.</> },
          { title: "Your shielded balance", text: <>USDG you deposit sits in the shielded pool contract. Spending it needs a proof that the funds come from an approved set. Deposits are capped until an independent audit is published.</> },
          { title: "Your orders", text: <>An order is split into pieces sent within the window you choose. Each piece is a normal swap on a public pool and is final once it lands. Prices can move between pieces. Cancelling stops only the pieces that have not gone out.</> },
          { title: "Fees", text: <>Each piece pays a small relayer fee in USDG, shown before you route the order. The relayer pays the gas. There is no Nuluvium token.</> },
          { title: "Risks and limits", text: <>Stock tokens and USDG are issued by third parties that can pause, block or burn them. Robinhood runs the chain and can see every address. Smart contracts can fail. You can lose money. Nuluvium is not affiliated with Robinhood.</> },
        ]}
      />
      <SiteBehaviour />
    </>
  );
}
