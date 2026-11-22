import type { Metadata } from "next";
import Link from "next/link";
import { DocSection, DocsPage } from "@/components/docs";
import { CONTRACTS, explorerAddress } from "@/lib/contracts";

export const metadata: Metadata = {
  title: "Contracts · Docs",
  description: "Nuluvium's contracts and services on Robinhood Chain testnet, with explorer links.",
};

// The ragequit verifier is not on the Proof page; it belongs with the full list here (docs/testnet.md).
const ALL_CONTRACTS = [...CONTRACTS, { name: "Deposit proof verifier (ragequit)", address: "0x1df3124F265B398Cd84630eA70eBb65d30Cc1c3a" }];

const SERVICES = [
  { name: "Approved-set provider", url: "https://asp.nuluvium.com", does: "Screens deposits, publishes the approved set, posts its root" },
  { name: "Relayer 1 (main)", url: "https://relayer.nuluvium.com", does: "Quotes the fee (GET /quote), sends pieces (POST /piece)" },
  { name: "Relayer 2 (fallback)", url: "https://relayer2.nuluvium.com", does: "Same API; the app and SDK use it when relayer 1 does not answer" },
];

export default function Page() {
  return (
    <DocsPage slug="contracts" lead="Everything Nuluvium runs on Robinhood Chain testnet (chain 46630), so you can check it yourself.">
      <DocSection n={1} title="Contracts">
        <div className="ledger-box"><div className="scroll-x">
          <table className="rows narrow">
            <thead><tr><th>Contract</th><th>Address</th></tr></thead>
            <tbody>
              {ALL_CONTRACTS.map((row) => (
                <tr key={row.address}>
                  <td>{row.name}</td>
                  <td className="hash" style={{ overflowWrap: "anywhere" }}><a className="text-link" href={explorerAddress(row.address)} target="_blank" rel="noreferrer">{row.address}</a></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div></div>
        <p>The Privacy Pools v1.3.0 contracts (pool, Entrypoint, verifiers) are deployed unchanged. The Router is Nuluvium&#39;s own: it checks the order signed by the fresh address, swaps on Uniswap v3 for allowlisted tokens only, and can be paused by its owner.</p>
      </DocSection>
      <DocSection n={2} title="Services">
        <div className="ledger-box"><div className="scroll-x">
          <table className="rows narrow">
            <thead><tr><th>Service</th><th>Address</th><th>What it does</th></tr></thead>
            <tbody>
              {SERVICES.map((row) => (
                <tr key={row.name}><td>{row.name}</td><td className="hash"><a className="text-link" href={row.url} target="_blank" rel="noreferrer">{row.url.replace("https://", "")}</a></td><td>{row.does}</td></tr>
              ))}
            </tbody>
          </table>
        </div></div>
        <p>The live approved set, with its content hash and the transaction that posted its root, is on the app&#39;s <Link className="text-link" href="/app/proof">Proof</Link> page.</p>
      </DocSection>
      <DocSection n={3} title="Source code">
        <p>Contracts, approved-set provider, relayer, SDK, MCP server and this site are public at <a className="text-link" href="https://github.com/nuluviumhq/nuluvium" target="_blank" rel="noreferrer">github.com/nuluviumhq/nuluvium</a>. The forked Privacy Pools contracts come in unchanged as a git submodule. The independent audit comes before mainnet.</p>
      </DocSection>
    </DocsPage>
  );
}
