import type { Metadata } from "next";
import Link from "next/link";
import { DocSection, DocsPage } from "@/components/docs";

export const metadata: Metadata = {
  title: "Agents (MCP) · Docs",
  description: "Run the Nuluvium MCP server on the agent's machine: setup, configuration, environment and the six tools.",
};

// Same block as the app's Agents page (docs/mcp.md).
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

const TOOLS = [
  { name: "get_balance", input: "none", does: "Shielded USDG per deposit with its status (approved, waiting, rejected), which deposits are busy, the deposit wallet's USDG and ETH, the tradable tokens" },
  { name: "deposit", input: "usdgAmount (1 to 1,000)", does: "Moves USDG from the deposit wallet into the shielded balance as a new deposit (public); usable once approved, usually within a minute" },
  { name: "route_order", input: "token, usdgAmount, pieces (1 to 20, default 5), windowMinutes (1 to 1440, default 10), maxSlippagePercent (default 1)", does: "Plans the pieces, stores the order and sends the pieces in the background; returns at once" },
  { name: "cancel_order", input: "orderId", does: "Cancels the pieces not sent yet" },
  { name: "get_orders", input: "onlyOpen", does: "Orders and the status of every piece" },
  { name: "get_fills", input: "orderId (optional)", does: "Pieces that went out: USDG spent, fee, tokens received, fresh address, transaction" },
];

export default function Page() {
  return (
    <DocsPage slug="agents" lead="An agent runs the Nuluvium MCP server on its own machine, with its own secret. Nothing about the agent is stored on a server.">
      <DocSection n={1} title="How it fits">
        <p>The MCP server is a small program that runs next to the agent and talks to it over stdio. It holds the agent&#39;s keys, keeps its order schedule in a local file, makes the proofs and sends each piece through the Nuluvium relayer. It works with Claude, Codex, Cursor or any other MCP client.</p>
      </DocSection>
      <DocSection n={2} title="Give the agent its own secret">
        <p>Twelve words (a BIP-39 mnemonic) that only the agent&#39;s machine knows. They make its shielded balance and its fresh addresses. Use a new testnet mnemonic, never a real wallet&#39;s.</p>
        <p>The same words also give the agent a normal wallet, its deposit wallet (<code>get_balance</code> shows the address). Send it USDG and a little ETH for gas, then call <code>deposit</code>. A deposit is public: anyone can see that this wallet put money in. What the agent buys with it afterwards is not linked to it.</p>
      </DocSection>
      <DocSection n={3} title="Install">
        <p>Node.js 22.18 or newer. Once, before adding the server to your client, run <code>npx -y @nuluvium/mcp --prepare</code>: it installs the package (<a className="text-link" href="https://www.npmjs.com/package/@nuluvium/mcp" target="_blank" rel="noreferrer">@nuluvium/mcp</a>) and downloads the circuit files for proofs (about 23 MB) into <code>~/.nuluvium/artifacts</code>, then exits. Without it the first start takes about a minute, longer than many clients wait. The Privacy Pools SDK checks every circuit file against its pinned hash before proving. The source is at <a className="text-link" href="https://github.com/nuluviumhq/nuluvium/tree/main/mcp" target="_blank" rel="noreferrer">github.com/nuluviumhq/nuluvium</a>.</p>
      </DocSection>
      <DocSection n={4} title="Configure">
        <p>Add this to your MCP client: <code>.mcp.json</code> in your project (Claude Code), <code>claude_desktop_config.json</code> (Claude Desktop), or the MCP settings of Cursor, Codex or any other client.</p>
        <pre className="code tinted"><code>{MCP_CONFIG}</code></pre>
        <p>Set the secret in the agent&#39;s environment, not in the file, then start the client:</p>
        <ul>
          <li><code>NULUVIUM_MNEMONIC</code>: the agent&#39;s twelve words (required). The server removes it from its environment after reading it and never returns it.</li>
          <li><code>NULUVIUM_RPC_URL</code>: your own testnet RPC, where your network blocks robinhood.com (optional).</li>
        </ul>
        <p>The same block is in the app under <Link className="text-link" href="/app/agents">Agents</Link>, with a copy button.</p>
      </DocSection>
      <DocSection n={5} title="Tools">
        <div className="scroll-x">
          <table className="rows narrow">
            <thead><tr><th>Tool</th><th>Input</th><th>What it does</th></tr></thead>
            <tbody>
              {TOOLS.map((tool) => (
                <tr key={tool.name}><td className="hash">{tool.name}</td><td>{tool.input}</td><td>{tool.does}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </DocSection>
      <DocSection n={6} title="Rules">
        <ul>
          <li>One order is paid from one deposit, the smallest free and approved one that covers it, so an order cannot exceed the agent&#39;s largest deposit. A new deposit can pay once the clean-funds check approves it, usually within a minute.</li>
          <li>Before each piece the note is rebuilt from the chain, so a restart or a crash cannot put it out of step.</li>
          <li>Each piece is tried up to 3 times, 20 seconds apart, then marked failed.</li>
          <li>Orders are kept in <code>~/.nuluvium/orders-&lt;network&gt;.json</code>. It holds no secret, but it links an order&#39;s fresh addresses: keep it on the machine.</li>
        </ul>
      </DocSection>
      <DocSection n={7} title="Try it">
        <p>Ask in plain words, for example: &quot;Check my Nuluvium balance, then buy 5 USDG of MSTK in 3 pieces over 4 minutes.&quot;</p>
      </DocSection>
    </DocsPage>
  );
}
