import type { Metadata } from "next";
import Link from "next/link";
import { DocSection, DocsPage } from "@/components/docs";

export const metadata: Metadata = {
  title: "Docs",
  description: "How Nuluvium works and how to use it: shielded balance, private routing through fresh addresses, and the MCP server for agents.",
};

export default function Page() {
  return (
    <DocsPage slug="" lead="Nuluvium routes your stock token orders through fresh addresses, paid from a shielded balance, so your trades do not trace back to you.">
      <DocSection n={1} title="What Nuluvium is">
        <p>A privacy layer for stock tokens on Robinhood Chain. You keep a shielded USDG balance. Each order is split into pieces, and every piece is bought on a public Uniswap pool from a fresh address that has never been used before.</p>
        <p>Readers of the chain see the pieces. They do not see that the pieces belong together, or that they come from you.</p>
      </DocSection>
      <DocSection n={2} title="What it is not">
        <ul>
          <li>Not an exchange: Nuluvium never matches buyers with sellers. Every piece is a normal swap on a public pool.</li>
          <li>Not a custodian of stock tokens: no Nuluvium contract holds them. They go straight to your fresh address.</li>
          <li>Not private from Robinhood: Robinhood runs the chain and issues the stock tokens, and can see every address.</li>
          <li>No token: there is no Nuluvium token.</li>
        </ul>
      </DocSection>
      <DocSection n={3} title="Who it is for">
        <p>People who trade from the web app, and AI agents that trade through the Nuluvium MCP server on their own machine. Both work the same way: their own secret, their own shielded balance, their own fresh addresses.</p>
      </DocSection>
      <DocSection n={4} title="Where to start">
        <ul>
          <li><Link className="text-link" href="/docs/getting-started">Getting started</Link>: log in, get test USDG, deposit.</li>
          <li><Link className="text-link" href="/docs/orders">Placing an order</Link>: pieces, time window, cancelling.</li>
          <li><Link className="text-link" href="/docs/how-it-works">How it works</Link>: the shielded pool, the approved set, the relayer and the Router.</li>
          <li><Link className="text-link" href="/docs/agents">Agents (MCP)</Link>: connect Claude, Codex, Cursor or any MCP client.</li>
          <li><Link className="text-link" href="/docs/security">Security and risks</Link>: read this before you trade.</li>
        </ul>
      </DocSection>
    </DocsPage>
  );
}
