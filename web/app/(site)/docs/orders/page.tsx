import type { Metadata } from "next";
import { DocSection, DocsPage } from "@/components/docs";

export const metadata: Metadata = {
  title: "Placing an order · Docs",
  description: "Split a buy into pieces over a time window, each from a fresh address, cancel what has not gone out, then sell or move what the fresh addresses hold.",
};

export default function Page() {
  return (
    <DocsPage slug="orders" lead="One order, split into pieces and spread over time, each piece from its own fresh address.">
      <DocSection n={1} title="Choose the order">
        <p>On Trade, pick the token, the amount in tUSDG, the number of pieces (3, 5 or 8) and the time window (10 minutes, 30 minutes, 2 hours or 6 hours). The form shows about what you receive and the relayer fee for all pieces before you route.</p>
        <p>On the testnet the only token is MSTK, a mock stock at a fixed price of 180 tUSDG.</p>
      </DocSection>
      <DocSection n={2} title="Route it">
        <p>Choose Route order. The app plans random piece sizes and random times inside the window, so the pieces do not look alike. At each time, your browser makes the proof for that piece and hands it to the relayer, which sends it on chain. The tokens land at a fresh address made from your keys.</p>
        <p>Each piece accepts at most 1% less than the expected amount. If the price moves further, that piece fails instead of filling at a bad price.</p>
      </DocSection>
      <DocSection n={3} title="Keep the app open">
        <p>The order schedule lives in your browser, encrypted with your keys. Pieces only go out while the app is open and you are logged in. If you close the tab, the remaining pieces wait; when you log in again they resume, and a piece whose time has passed goes out at once.</p>
      </DocSection>
      <DocSection n={4} title="Which deposit pays">
        <p>One order is paid from one approved deposit: the smallest one that covers it and has no other order open. So an order cannot be larger than your largest approved deposit. What is left of the deposit after the order stays in your shielded balance.</p>
      </DocSection>
      <DocSection n={5} title="Follow and cancel">
        <p>Orders lists every order, each piece&#39;s status, its fresh address and its transaction. Cancelling stops the pieces that have not gone out. Pieces that went out are final.</p>
      </DocSection>
      <DocSection n={6} title="Sell and move out">
        <p>Holdings, on the Orders page, lists every fresh address of yours that holds something. It is rebuilt from your keys and the chain, so it also shows pieces sent from another browser.</p>
        <ul>
          <li>Sell: a fresh address sells all of one stock token for USDG in a single swap. It signs the order and the relayer sends it, so you pay no gas and get no wallet prompt; the relayer fee comes out of the USDG. The USDG stays on that fresh address, and the sale is not linked to you.</li>
          <li>Export key: shows the private key of one fresh address, to import it into a wallet such as Rabby or MetaMask and move what it holds. The key controls only that address. Sending it gas from your own wallet links the two on chain; on testnet, use the faucet.</li>
        </ul>
      </DocSection>
      <DocSection n={7} title="Not yet">
        <ul>
          <li>Selling in pieces over a window: a sale is one swap per fresh address, at once.</li>
          <li>Moving tokens or USDG out of a fresh address without gas, or back into your shielded balance.</li>
          <li>Real stock tokens: the testnet uses a mock. Mainnet will price each piece from a Uniswap quote.</li>
        </ul>
      </DocSection>
    </DocsPage>
  );
}
