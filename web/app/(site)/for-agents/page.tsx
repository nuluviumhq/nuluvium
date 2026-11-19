// Ported from prototype/for-agents.html.
import type { Metadata } from "next";
import Link from "next/link";
import { SiteBehaviour } from "@/components/SiteBehaviour";
import { SiteHeader, ClosingCards, SiteFooter } from "@/components/site";

export const metadata: Metadata = {
  title: "Agents",
  description: "Let an AI agent trade stock tokens without publishing its strategy: one tool call routes each order through fresh addresses.",
};

// The real setup (docs/mcp.md): a local stdio server; the secret comes from the agent's environment.
const MCP_EXAMPLE = `{
  "mcpServers": {
    "nuluvium": {
      "command": "npx",
      "args": ["-y", "@nuluvium/mcp"],
      "env": {
        "NULUVIUM_MNEMONIC": "\${NULUVIUM_MNEMONIC}",
        "NULUVIUM_NETWORK": "robinhood-testnet"
      }
    }
  }
}`;

export default function Page() {
  return (
    <>
      <SiteHeader current="agents" />
      <main>
          <div className="wrap">
            <section className="page-hero">
              <p className="mono soft">Agents · live on testnet</p>
              <h1 className="display">Your agent&#39;s strategy, kept to itself</h1>
              <p className="lead">An agent that trades from one wallet publishes its rules one trade at a time. Through Nuluvium, one tool call routes each order through fresh addresses, split and spread over time.</p>
            </section>
          </div>

          <section className="steps-scene" data-scroll-steps data-active="0">
            <div className="pin">
              <div className="wrap">
                <div className="stage views" aria-hidden="true">
                  <div className="view">
                    <p className="stage-label">The agent&#39;s own secret · on its machine</p>
                    <div className="sheet">
                      <div className="form-rows">
                        <div><span className="name"><span className="n">01</span>Secret</span><span className="value">Its own 12 words</span></div>
                        <div><span className="name"><span className="n">02</span>Kept</span><span className="value">On the agent&#39;s machine</span></div>
                        <div><span className="name"><span className="n">03</span>Spends from</span><span className="value">Its shielded balance</span></div>
                      </div>
                    </div>
                    <div className="chips"><span className="chip-dot mine-filled">Never sent to Nuluvium</span><span className="chip-dot">Runs locally</span></div>
                  </div>
                  <div className="view">
                    <p className="stage-label">MCP configuration · Claude Code, .mcp.json</p>
                    <pre className="code sheet wide"><code>{MCP_EXAMPLE}</code></pre>
                    <div className="chips"><span className="chip-dot mine-filled">Claude</span><span className="chip-dot mine-filled">Codex</span><span className="chip-dot mine-filled">Cursor</span><span className="chip-dot">Any MCP client</span></div>
                  </div>
                  <div className="view">
                    <p className="stage-label">One tool call · route_order</p>
                    <div className="tiles three"><span className="tile mine-filled" style={{ backgroundPosition: "32% 34%" }}></span><span className="tile"></span><span className="tile mine-filled" style={{ backgroundPosition: "34% 50%" }}></span><span className="tile"></span><span className="tile mine-filled" style={{ backgroundPosition: "36% 36%" }}></span><span className="tile mine-filled" style={{ backgroundPosition: "37% 59%" }}></span><span className="tile"></span><span className="tile mine-filled" style={{ backgroundPosition: "39% 45%" }}></span><span className="tile"></span></div>
                    <div className="chips"><span className="chip-dot mine-filled">5 pieces · 5 fresh addresses</span><span className="chip-dot mine-sealed">Not linked to the agent</span></div>
                  </div>
                </div>
                <div className="step-list">
                  <p className="intro-line">Connect an agent in three steps:</p>
                  <article className="step active">
                    <button type="button"><span className="n">01</span><span className="t">Give the agent its own secret</span></button>
                    <div className="body"><div><p>Twelve words that only the agent&#39;s machine knows. They make its shielded balance and a fresh address for every piece. Nuluvium never sees them, and the agent never holds your wallet.</p></div></div>
                  </article>
                  <article className="step">
                    <button type="button"><span className="n">02</span><span className="t">Add the MCP server</span></button>
                    <div className="body"><div><p>One block of configuration. The server runs on the agent&#39;s machine and works with Claude, Codex, Cursor or any other MCP client.</p></div></div>
                  </article>
                  <article className="step">
                    <button type="button"><span className="n">03</span><span className="t">Ask in plain words</span></button>
                    <div className="body"><div><p>"Buy 500 USDG of NVDA in five pieces over the next two hours." The agent calls one tool; the server plans the pieces and sends each one through the relayer.</p></div></div>
                  </article>
                </div>
              </div>
            </div>
          </section>

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
