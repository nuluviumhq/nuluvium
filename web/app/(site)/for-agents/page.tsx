// Ported from prototype/for-agents.html. Layout "Network": giant hero, checkerboard tiles,
// big two-column rows (components/layouts.tsx).
import type { Metadata } from "next";
import Link from "next/link";
import { SiteBehaviour } from "@/components/SiteBehaviour";
import { SiteHeader, ClosingCards, SiteFooter } from "@/components/site";
import { MCP_EXAMPLE } from "@/lib/mcpExample";
import { BigRow, GiantHero, TileBoard } from "@/components/layouts";

export const metadata: Metadata = {
  title: "Agents",
  description: "Let an AI agent trade stock tokens without publishing its strategy: one tool call routes each order through fresh addresses.",
};

export default function Page() {
  return (
    <>
      <SiteHeader current="agents" />
      <main>
          <div className="wrap">
            <GiantHero
              kicker="Agents · live on testnet"
              lines={["Your agent’s", "strategy, kept", "to itself."]}
              lead="An agent that trades from one wallet publishes its rules one trade at a time. Through Nuluvium, one tool call routes each order through fresh addresses, split and spread over time."
              action={<Link className="button outline" href="/app/agents">Set up an agent</Link>}
            />

            {/* One tile per MCP client the docs cover; all lead to the same setup in Docs > Agents. */}
            <TileBoard tiles={[
              { label: "Claude", href: "/docs/agents" }, null, { label: "Codex", href: "/docs/agents" }, { art: "/art/owl-duo.webp" },
              { art: "/art/couriers-duo.webp" }, { label: "Cursor", href: "/docs/agents" }, { label: "Any MCP client", href: "/docs/agents" }, null,
            ]} />

            <div className="big-rows">
              <p className="mono soft">Connect an agent in three steps</p>
              <BigRow label="Give the agent its own secret">
                <p>Twelve words that only the agent&#39;s machine knows. They make its shielded balance and a fresh address for every piece. Nuluvium never sees them, and the agent never holds your wallet.</p>
              </BigRow>
              <BigRow label="Add the MCP server">
                <p>One block of configuration. The server runs on the agent&#39;s machine and works with Claude, Codex, Cursor or any other MCP client.</p>
                <pre className="code tinted"><code>{MCP_EXAMPLE}</code></pre>
              </BigRow>
              <BigRow label="Ask in plain words">
                <p>&quot;Buy 500 USDG of NVDA in five pieces over the next two hours.&quot; The agent calls one tool; the server plans the pieces and sends each one through the relayer.</p>
              </BigRow>
            </div>
          </div>

          <div className="wrap">
            <section className="kicker-row">
              <p className="mono">What an agent can do</p>
              <p>Six tools, all running on the agent&#39;s own machine.</p>
            </section>

            <section className="pair">
              <div className="box">
                <div className="box-head"><h2 className="title">Tools</h2><span className="mono soft">Live on testnet</span></div>
                <div className="scroll-x">
                  <table className="rows narrow">
                    <thead><tr><th>Tool</th><th>What it does</th></tr></thead>
                    <tbody>
                      <tr><td className="hash">get_balance</td><td>Read the agent&#39;s shielded balance</td></tr>
                    <tr><td className="hash">deposit</td><td>Move USDG from the agent&#39;s wallet into its shielded balance</td></tr>
                      <tr><td className="hash">route_order</td><td>Route a buy in pieces over a time window</td></tr>
                      <tr><td className="hash">cancel_order</td><td>Stop the pieces that have not gone out yet</td></tr>
                      <tr><td className="hash">get_orders</td><td>List the agent&#39;s own orders</td></tr>
                      <tr><td className="hash">get_fills</td><td>Read the pieces that went out and their transactions</td></tr>
                    </tbody>
                  </table>
                </div>
              </div>
              <div className="box">
                <div className="box-head"><h2 className="title">What stays with the agent</h2><span className="mono soft">By design</span></div>
                <div className="form-rows flush">
                  <div><span className="name"><span className="n">01</span>Its secret</span><span className="claim-state yes">Only on its machine</span></div>
                  <div><span className="name"><span className="n">02</span>Its order schedule</span><span className="claim-state yes">Only on its machine</span></div>
                  <div><span className="name"><span className="n">03</span>What Nuluvium sees</span><span className="claim-state yes">One piece at a time</span></div>
                  <div><span className="name"><span className="n">04</span>Access to your wallet</span><span className="claim-state yes">None</span></div>
                </div>
                <Link className="button outline" href="/app/agents">Set up an agent</Link>
              </div>
            </section>
          </div>

          <div className="wrap">
            <ClosingCards />
          </div>
        </main>
      <SiteFooter />
      <SiteBehaviour />
    </>
  );
}
