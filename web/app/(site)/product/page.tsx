// Product: the "Library" layout (components/layouts.tsx):
// narrow hero with one card button and a ticker of facts on its edge, the four parts as one
// tabbed panel, poster cards to the next pages.
import type { Metadata } from "next";
import Link from "next/link";
import { SiteBehaviour } from "@/components/SiteBehaviour";
import { SiteHeader, SiteFooter } from "@/components/site";
import { ButtonCard } from "@/components/layouts";
import { LiveTicker, PanelTabs } from "@/components/layoutsClient";

export const metadata: Metadata = {
  title: "Product",
  description: "How Nuluvium works: a shielded balance, fresh addresses, orders split and spread over time, routed to the public pools on Robinhood Chain.",
};

/** Fixed facts for the ticker, from Docs > Fees and limits. Update them when fees or limits change. */
const FACTS: Array<[string, string]> = [
  ["Relayer fee", "0.10 USDG a piece"],
  ["Pieces per order", "3, 5 or 8"],
  ["Time window", "10 min to 6 h"],
  ["Price protection", "1% a piece"],
  ["Deposit cap", "1,000 USDG"],
];

const PARTS = [
  {
    label: "Shielded balance",
    panel: (
      <section className="feature">
        <div className="stage" aria-hidden="true">
          <p className="stage-label">Your shielded balance</p>
          <div className="sheet"><div className="form-rows">
            <div><span className="name"><span className="n">01</span>Balance</span><span className="value">12,400 <small>USDG</small></span></div>
            <div><span className="name"><span className="n">02</span>Clean-funds proof</span><span className="value">Valid</span></div>
            <div><span className="name"><span className="n">03</span>Linked to your wallet</span><span className="value">Nothing</span></div>
          </div></div>
          <div className="chips"><span className="chip-dot mine-sealed">One of 214 deposits · sample</span></div>
        </div>
        <div className="feature-text">
          <h2><span className="n">01</span>Shielded balance</h2>
          <p className="lead">Money that can&#39;t be followed back.</p>
          <p>Deposit USDG into the shielded pool. When you spend it, a proof shows it comes from approved, clean funds, without showing which deposit is yours. The code is a fork of Privacy Pools v1.</p>
        </div>
      </section>
    ),
  },
  {
    label: "Fresh addresses",
    panel: (
      <section className="feature">
        <div className="stage" aria-hidden="true">
          <p className="stage-label">One order · five fresh addresses</p>
          <div className="tiles three"><span className="tile"></span><span className="tile mine-filled" style={{ backgroundPosition: "33% 57%" }}></span><span className="tile"></span><span className="tile mine-filled" style={{ backgroundPosition: "35% 43%" }}></span><span className="tile mine-filled" style={{ backgroundPosition: "36% 36%" }}></span><span className="tile"></span><span className="tile mine-filled" style={{ backgroundPosition: "38% 52%" }}></span><span className="tile"></span><span className="tile mine-filled" style={{ backgroundPosition: "40% 38%" }}></span></div>
          <div className="chips"><span className="chip-dot mine-filled">Used once</span><span className="chip-dot">Never linked to each other</span></div>
        </div>
        <div className="feature-text">
          <h2><span className="n">02</span>Fresh addresses</h2>
          <p className="lead">A new address for every piece.</p>
          <p>Each piece of an order is sent from an address used once. A relayer pays its gas, so the address never touches your wallet. To anyone reading the chain, it is a stranger.</p>
        </div>
      </section>
    ),
  },
  {
    label: "Split and spread",
    panel: (
      <section className="feature">
        <div className="stage" aria-hidden="true">
          <p className="stage-label">Buy 8,000 USDG of NVDA · 5 pieces over 6 h</p>
          <div className="sheet wide">
            <div className="day">
              <span className="session" style={{ left: "60.42%", width: "27.08%" }}></span>
              <span className="now" style={{ left: "61.5%" }}><i>14:46</i></span>
              <span className="now" style={{ left: "67.4%" }}><i>16:10</i></span>
              <span className="now" style={{ left: "71.9%" }}><i>17:15</i></span>
              <span className="now" style={{ left: "79.6%" }}><i>19:06</i></span>
              <span className="now" style={{ left: "85.1%" }}><i>20:25</i></span>
            </div>
            <div className="hours mono soft"><span>00</span><span>06</span><span>12</span><span>18</span><span>24 UTC</span></div>
          </div>
          <div className="chips"><span className="chip-dot mine-filled">Random gaps</span><span className="chip-dot mine-sealed">Inside US market hours</span></div>
        </div>
        <div className="feature-text">
          <h2><span className="n">03</span>Split and spread</h2>
          <p className="lead">No size, no pattern.</p>
          <p>The order is cut into pieces and each one goes out at a random gap inside the window you choose. A big buy stops looking big, and a strategy stops looking like a schedule.</p>
        </div>
      </section>
    ),
  },
  {
    label: "Proof afterwards",
    panel: (
      <section className="feature">
        <div className="stage" aria-hidden="true">
          <p className="stage-label">9 claims · 7 checkable today</p>
          <div className="tiles three"><span className="tile mine-filled" style={{ backgroundPosition: "32% 34%" }}></span><span className="tile mine-filled" style={{ backgroundPosition: "33% 57%" }}></span><span className="tile mine-filled" style={{ backgroundPosition: "34% 50%" }}></span><span className="tile mine-filled" style={{ backgroundPosition: "35% 43%" }}></span><span className="tile"></span><span className="tile mine-filled" style={{ backgroundPosition: "37% 59%" }}></span><span className="tile mine-filled" style={{ backgroundPosition: "38% 52%" }}></span><span className="tile"></span><span className="tile mine-filled" style={{ backgroundPosition: "40% 45%" }}></span></div>
          <div className="chips"><span className="chip-dot mine-filled">You can check it today</span><span className="chip-dot">Not yet</span></div>
        </div>
        <div className="feature-text">
          <h2><span className="n">04</span>Proof afterwards</h2>
          <p className="lead">Public pieces, private link.</p>
          <p>Every piece is a normal swap on a public pool, checkable by anyone. The Proof page lists every claim Nuluvium makes and says plainly which ones you can check today. <Link className="text-link" href="/app/proof">See the claims</Link></p>
        </div>
      </section>
    ),
  },
];

export default function Page() {
  return (
    <>
      <SiteHeader current="product" />
      <main>
        <div className="wrap">
          <section className="library-hero">
            <div className="inner">
              <p className="mono">Product · live on testnet</p>
              <h1>Trades that don&#39;t trace back to you.</h1>
              <p className="lead">Nuluvium routes each order through fresh addresses funded from a shielded balance. Every piece is a normal public trade; what nobody can see is that they are yours.</p>
              <ButtonCard href="/app" title="Open the app" note="Testnet, with test tokens that have no value" />
            </div>
            <LiveTicker label="Testnet" facts={FACTS} />
          </section>

          <div className="panel-tabs-intro">
            <p className="mono">Four parts, one trade</p>
            <p>Shield it, split it, route it, prove it.</p>
          </div>
          <PanelTabs tabs={PARTS} />

          <section className="poster-cards" aria-label="Read next">
            <article className="poster-card">
              <div className="picture" style={{ backgroundImage: "url(/art/hare-duo.webp)" }} role="img" aria-label="Duerer's Young Hare in green duotone" />
              <p className="tags"><span>Why</span><span>Public wallets</span></p>
              <h2>What a public order gives away</h2>
              <p>A public wallet shows its whole history: every trade, its size and its timing, and who reads it.</p>
              <Link className="button" href="/why">Read why</Link>
            </article>
            <article className="poster-card">
              <div className="picture" style={{ backgroundImage: "url(/art/owl-duo.webp)" }} role="img" aria-label="A brass clockwork owl in green duotone" />
              <p className="tags"><span>Agents</span><span>MCP</span></p>
              <h2>For agents</h2>
              <p>An agent that trades from one wallet publishes its strategy. With one tool call, Nuluvium routes its orders from fresh addresses instead.</p>
              <Link className="button" href="/for-agents">Connect an agent</Link>
            </article>
          </section>
        </div>
      </main>
      <SiteFooter />
      <SiteBehaviour />
    </>
  );
}
