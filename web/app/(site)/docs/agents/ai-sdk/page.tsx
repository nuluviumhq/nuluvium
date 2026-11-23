import type { Metadata } from "next";
import Link from "next/link";
import { DocSection, DocsPage } from "@/components/docs";

export const metadata: Metadata = {
  title: "Vercel AI SDK · Docs",
  description: "Give a Vercel AI SDK agent Nuluvium's tools with @nuluvium/ai-sdk: install, environment, code and limits.",
};

// Same example as ai-sdk/README.md and the AI SDK tools registry entry; keep them in step.
const INSTALL = `npm install @nuluvium/ai-sdk ai
npx -y @nuluvium/mcp --prepare`;

const EXAMPLE = `import { generateText, stepCountIs } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { createNuluviumTools } from "@nuluvium/ai-sdk";

const nuluvium = await createNuluviumTools(); // reads NULUVIUM_MNEMONIC
try {
  const { text } = await generateText({
    model: anthropic("claude-sonnet-5-5"),
    tools: nuluvium.tools,
    stopWhen: stepCountIs(5),
    prompt: "Show my shielded balance, then buy 10 USDG of MSTK in 3 pieces over 10 minutes.",
  });
  console.log(text);
} finally {
  await nuluvium.close();
}`;

export default function Page() {
  return (
    <DocsPage slug="agents/ai-sdk" lead="Agents built with the Vercel AI SDK get Nuluvium's six tools from one package. The keys stay on the agent's machine.">
      <DocSection n={1} title="How it fits">
        <p><a className="text-link" href="https://www.npmjs.com/package/@nuluvium/ai-sdk" target="_blank" rel="noreferrer">@nuluvium/ai-sdk</a> starts the Nuluvium MCP server on the same machine, over stdio, with the AI SDK&#39;s MCP client, and returns its tools for <code>generateText</code> or <code>streamText</code>. The agent&#39;s secret goes only to that local process, which makes the keys, the proofs and the order schedule there. It runs on Node.js, not in a browser or an edge function.</p>
      </DocSection>
      <DocSection n={2} title="Install">
        <p>Node.js 22.18 or newer. The second line runs once: it downloads the circuit files for proofs (about 23 MB) into <code>~/.nuluvium/artifacts</code>, so the first call does not wait for them.</p>
        <pre className="code tinted"><code>{INSTALL}</code></pre>
      </DocSection>
      <DocSection n={3} title="Environment">
        <ul>
          <li><code>NULUVIUM_MNEMONIC</code>: the agent&#39;s own twelve words (required). Use a new testnet mnemonic, never a real wallet&#39;s. The same words give the agent its deposit wallet; <code>get_balance</code> shows the address.</li>
          <li><code>NULUVIUM_NETWORK</code>: <code>robinhood-testnet</code> (the default).</li>
          <li><code>NULUVIUM_RPC_URL</code>: your own testnet RPC, where your network blocks robinhood.com (optional).</li>
        </ul>
        <p><code>createNuluviumTools</code> also takes these as options: <code>mnemonic</code>, <code>network</code>, <code>rpcUrl</code>, <code>relayers</code>, <code>home</code>.</p>
      </DocSection>
      <DocSection n={4} title="Code">
        <pre className="code tinted"><code>{EXAMPLE}</code></pre>
        <p>Any AI SDK model works. Pieces go out in the background while the server runs, so keep the process alive until the order window has passed, then call <code>close()</code>.</p>
      </DocSection>
      <DocSection n={5} title="Tools">
        <p><code>get_balance</code>, <code>deposit</code>, <code>route_order</code>, <code>cancel_order</code>, <code>get_orders</code> and <code>get_fills</code>, the same as the MCP server. Their inputs and rules are on <Link className="text-link" href="/docs/agents">Agents (MCP)</Link>.</p>
      </DocSection>
      <DocSection n={6} title="Limits">
        <ul>
          <li>Robinhood Chain testnet only, with test USDG and a mock stock token (MSTK). Nothing here has real value.</li>
          <li>The contracts and services are not audited.</li>
          <li>A deposit is public: anyone can see that the deposit wallet put money in. What the agent buys with it afterwards is not linked to it.</li>
          <li>Privacy is from other readers of the chain, not from Robinhood.</li>
        </ul>
      </DocSection>
    </DocsPage>
  );
}
