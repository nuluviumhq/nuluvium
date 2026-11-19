"use client";

// Agents (ported from prototype/agents.html, now the real setup): an agent runs the Nuluvium MCP
// server on its own machine with its own secret (docs/mcp.md). Nothing about an agent is stored on
// a server, so this page has no key list or activity feed: it explains the setup and gives the config.

import { useSession } from "./session";

const MCP_CONFIG = `{
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

export function Agents() {
  const { toast } = useSession();

  const copyConfig = async () => {
    try {
      await navigator.clipboard.writeText(MCP_CONFIG);
      toast("MCP configuration copied. Put it in .mcp.json at the root of the Nuluvium folder.");
    } catch {
      toast("Could not copy. Select the configuration below and copy it.");
    }
  };

  return (
    <>
      <header className="app-title">
        <h1 className="display">Agents</h1>
        <p className="lead">Let an AI agent trade without leaving a trail back to its strategy.</p>
      </header>

      <div className="stack">
        <div className="split">
          {/* The idea in one picture: agents on top, one tool call, pieces from fresh addresses below. */}
          <section className="stage" aria-label="How agents reach the pool">
            <div className="chips">
              <span className="chip-dot mine-filled">Claude</span>
              <span className="chip-dot mine-filled">Codex</span>
              <span className="chip-dot mine-filled">Cursor</span>
              <span className="chip-dot">Any MCP client</span>
            </div>
            <span className="dash"></span>
            <p className="stage-label">One tool call · route_order</p>
            <span className="dash"></span>
            {/* eslint-disable-next-line @next/next/no-img-element -- decorative, sized by CSS */}
            <span className="app-stone"><img src="/assets/stone.jpg" alt="" /></span>
            <div className="chips"><span className="chip-dot mine-sealed">Pieces from fresh addresses</span><span className="chip-dot mine-filled">Not linked to the agent</span></div>
          </section>

          <section className="ledger" aria-label="Connect an agent">
            <p className="ledger-intro">Let an agent trade without publishing its strategy.</p>
            <div className="form-rows">
              <div><span className="name"><span className="n">01</span>Give it its own secret</span><span className="claim-state">12 words, on its machine</span></div>
              <div><span className="name"><span className="n">02</span>Add the MCP server</span><span className="claim-state">One block of config</span></div>
              <div><span className="name"><span className="n">03</span>Ask in plain words</span><span className="claim-state">&quot;3 pieces over 10 min&quot;</span></div>
            </div>
            <button className="button full" type="button" onClick={() => void copyConfig()}>Copy MCP config</button>
            <p className="fine">The agent&#39;s secret makes its own shielded balance and fresh addresses, and never leaves its machine. Testnet. Run <code>npx -y @nuluvium/mcp --prepare</code> once first: it installs the server and its circuit files.</p>
          </section>
        </div>

        <div className="pair">
          <section className="box" aria-label="MCP configuration">
            <div className="box-head"><h2 className="title">MCP configuration</h2><span className="mono soft">Claude Code, .mcp.json</span></div>
            <pre className="code tinted"><code>{MCP_CONFIG}</code></pre>
            <p className="fine">Set NULUVIUM_MNEMONIC in the agent&#39;s environment, not in the file. Where your network blocks robinhood.com, also set NULUVIUM_RPC_URL to your own testnet RPC.</p>
          </section>

          <section className="box" aria-label="Tools an agent can call">
            <div className="box-head"><h2 className="title">Tools an agent can call</h2><span className="mono soft">Live on testnet</span></div>
            <div className="scroll-x">
              <table className="rows narrow">
                <thead><tr><th>Tool</th><th>What it does</th></tr></thead>
                <tbody>
                  <tr><td className="hash">get_balance</td><td>Read the agent&#39;s shielded balance, per deposit</td></tr>
                  <tr><td className="hash">deposit</td><td>Move USDG from the agent&#39;s wallet into its shielded balance</td></tr>
                  <tr><td className="hash">route_order</td><td>Buy in pieces over a time window, each from a fresh address</td></tr>
                  <tr><td className="hash">cancel_order</td><td>Stop the pieces that have not gone out yet</td></tr>
                  <tr><td className="hash">get_orders</td><td>List the agent&#39;s own orders and their pieces</td></tr>
                  <tr><td className="hash">get_fills</td><td>Read the pieces that went out and their transactions</td></tr>
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </div>
    </>
  );
}
