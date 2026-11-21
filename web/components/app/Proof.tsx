"use client";

// Proof (ported from prototype/proof.html): what you can check yourself, and what you cannot yet.
// Testnet addresses, the approved set and recent pieces are read live; claims are kept honest.

import { useEffect, useState } from "react";
import { formatUsdg, readRecentPieces, type PublicPiece } from "@/lib/chain";
import { CONTRACTS, OWNER_SAFE, PREVIOUS_OWNER } from "@/lib/contracts";
import { marble } from "@/lib/format";
import { type OwnerRoles, readOwnerRoles } from "@/lib/owners";
import { TOKENS } from "@/lib/tokens";
import { explorerAddress, explorerTx, shortAddress } from "@/lib/wallet";

const ASP_URL = "https://asp.nuluvium.com";

// The claims Nuluvium makes. "checkable" means a visitor can verify it today.
const CLAIMS = [
  { name: "Issuer rules on stock tokens", state: "Checked on chain", checkable: true },
  { name: "No order matching, no pooled stock tokens", state: "By design", checkable: true },
  { name: "Shielded pool contract", state: "Deployed on testnet", checkable: true },
  { name: "Clean-funds proofs", state: "Live on testnet", checkable: true },
  { name: "Independent audit", state: "Not done", checkable: false },
  { name: "Fresh-address routing", state: "Live on testnet", checkable: true },
  { name: "Sanctions screening", state: "Live on testnet", checkable: true },
  { name: "Token and burns", state: "No token yet", checkable: false },
  { name: "Open source code", state: "Published on GitHub", checkable: true },
];

const sameAddress = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

/** The owner address as an explorer link, named when it is the Safe. */
function ownerLink(address: string) {
  return (
    <a className="text-link mono" href={explorerAddress(address)} target="_blank" rel="noreferrer">
      {sameAddress(address, OWNER_SAFE) ? `Safe ${shortAddress(address)}` : shortAddress(address)}
    </a>
  );
}

interface ApprovedSetStatus {
  cid: string;
  tx: string;
  postedAt: string;
  approved?: number;
  rejected?: number;
}

export function Proof() {
  const checkable = CLAIMS.filter((claim) => claim.checkable).length;
  const [set, setSet] = useState<ApprovedSetStatus | null | "failed">(null);
  const [recent, setRecent] = useState<PublicPiece[] | null>(null);
  const [owners, setOwners] = useState<OwnerRoles | null | "failed">(null);

  useEffect(() => {
    readRecentPieces(6).then(setRecent, () => setRecent([]));
    readOwnerRoles().then(setOwners, () => setOwners("failed"));
    (async () => {
      const status = (await (await fetch(`${ASP_URL}/`)).json()) as { latest?: { cid: string; tx: string; postedAt: string } };
      if (!status.latest) throw new Error("no set yet");
      const document = (await (await fetch(`${ASP_URL}/sets/${status.latest.cid}`)).json()) as { approvedLabels: string[]; rejected: unknown[] };
      setSet({ ...status.latest, approved: document.approvedLabels.length, rejected: document.rejected.length });
    })().catch(() => setSet("failed"));
  }, []);

  return (
    <>
      <header className="app-title">
        <h1 className="display">Proof</h1>
        <p className="lead">What you can check yourself, and what you cannot yet.</p>
      </header>

      <div className="stack">
        <div className="split">
          {/* One tile per claim. Marble: you can check it today. Empty: not yet. */}
          <section className="stage" aria-label="Claims at a glance">
            <p className="stage-label">{CLAIMS.length} claims · {checkable} checkable today</p>
            <div className="tiles three" role="img" aria-label="Claims, checked ones in marble">
              {CLAIMS.map((claim, index) =>
                claim.checkable ? (
                  <span key={claim.name} className="tile mine-filled" style={marble(index)} title={claim.name} />
                ) : (
                  <span key={claim.name} className="tile" title={claim.name} />
                ),
              )}
            </div>
            <div className="chips">
              <span className="chip-dot mine-filled">You can check it today</span>
              <span className="chip-dot">Not yet</span>
            </div>
          </section>

          <section className="ledger" aria-label="Claims">
            <p className="ledger-intro">Every claim, and where it stands.</p>
            <div className="form-rows">
              {CLAIMS.map((claim, index) => (
                <div key={claim.name}>
                  <span className="name"><span className="n">0{index + 1}</span>{claim.name}</span>
                  <span className={claim.checkable ? "claim-state yes" : "claim-state"}>{claim.state}</span>
                </div>
              ))}
            </div>
          </section>
        </div>

        <section className="box" aria-label="Known limits">
          <div className="box-head"><h2 className="title">Known limits</h2><span className="mono soft">Read before trading</span></div>
          <dl className="limits">
            <div><dt>The issuer controls stock tokens</dt><dd>Robinhood&#39;s token contract lets the issuer pause, block or burn stock tokens. Nuluvium cannot prevent that. Checked against the token&#39;s verified source code on 14 Nov 2026.</dd></div>
            <div><dt>Private from the public, not from Robinhood</dt><dd>Robinhood runs the chain&#39;s sequencer and issues the stock tokens; it can see and block every address. Nuluvium hides the link between your trades from other readers of the chain.</dd></div>
            <div><dt>Who can trade</dt><dd>Not available to US persons, in restricted countries or in the European Union. Deposits are screened against sanctions lists and the issuer&#39;s blocklist.</dd></div>
            <div><dt>Before the audit</dt><dd>Deposits are capped at 1,000 per deposit and 25,000 in total until an independent audit is published here. USDG itself can be frozen by its issuer. This is a testnet with test tokens.</dd></div>
          </dl>
        </section>

        <div className="pair">
          <section className="box" aria-label="Contracts">
            <div className="box-head"><h2 className="title">Contracts</h2><span className="mono soft">Robinhood Chain testnet</span></div>
            <div className="scroll-x">
              <table className="rows narrow">
                <thead><tr><th>Contract</th><th>Address</th></tr></thead>
                <tbody>
                  {CONTRACTS.map((row) => (
                    <tr key={row.address}>
                      <td>{row.name}</td>
                      <td className="hash"><a className="text-link" href={explorerAddress(row.address)} target="_blank" rel="noreferrer">{shortAddress(row.address)}</a></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="box" aria-label="Approved set">
            <div className="box-head"><h2 className="title">Approved set</h2><span className="mono soft">Clean-funds check</span></div>
            <div className="form-rows flush">
              {set && set !== "failed" ? (
                <>
                  <div><span className="name"><span className="n">01</span>Approved deposits</span><span className="value">{set.approved}</span></div>
                  <div><span className="name"><span className="n">02</span>Not approved</span><span className="value">{set.rejected}</span></div>
                  <div><span className="name"><span className="n">03</span>Published list</span><a className="text-link mono" href={`${ASP_URL}/sets/${set.cid}`} target="_blank" rel="noreferrer">{set.cid.slice(0, 12)}…</a></div>
                  <div><span className="name"><span className="n">04</span>Root on chain</span><a className="text-link mono" href={explorerTx(set.tx)} target="_blank" rel="noreferrer">{shortAddress(set.tx)}</a></div>
                </>
              ) : (
                <div><span className="name">{set === "failed" ? "Could not read the approved set" : "Reading the approved set…"}</span></div>
              )}
            </div>
            <p className="fine">Every deposit is screened (OFAC list, the stock token issuer&#39;s blocklist, the caps). The list is published under its content hash, and its root is posted on chain; a withdrawal must prove its deposit is in it.</p>
          </section>
        </div>

        <section className="box" aria-label="Owner">
          <div className="box-head"><h2 className="title">Owner</h2><span className="mono soft">Read from the chain</span></div>
          <div className="form-rows flush">
            {owners && owners !== "failed" ? (
              <>
                <div><span className="name"><span className="n">01</span>Router owner</span>{ownerLink(owners.routerOwner)}</div>
                <div><span className="name"><span className="n">02</span>Entrypoint owner role</span><span className="value">{owners.safeHasEntrypointOwnerRole ? "Held by the Safe" : "Not held by the Safe"}</span></div>
                <div><span className="name"><span className="n">03</span>Signatures needed</span><span className="value">{owners.safeThreshold} of {owners.safeSigners}</span></div>
                <div><span className="name"><span className="n">04</span>Deployer, owner until 21 Nov 2026</span><span className="value">{owners.previousOwnerHasEntrypointOwnerRole || sameAddress(owners.routerOwner, PREVIOUS_OWNER) ? "Still holds a role" : "No role"}</span></div>
              </>
            ) : (
              <div><span className="name">{owners === "failed" ? "Could not read the owner" : "Reading the owner…"}</span></div>
            )}
          </div>
          <p className="fine">The owner can allow or remove stock tokens, pause Router swaps, upgrade the Entrypoint and wind down the pool. It cannot move anyone&#39;s deposit or tokens, change a signed order or stop a depositor taking a deposit back (ragequit).</p>
        </section>

        <section className="box" aria-label="Recent pieces">
          <div className="box-head"><h2 className="title">Recent pieces</h2><span className="mono soft">Public, from the chain</span></div>
          <div className="scroll-x">
            <table className="rows">
              <thead><tr><th>Block</th><th>Token</th><th>Size</th><th>Received</th><th>From</th></tr></thead>
              <tbody>
                {(recent ?? []).map((row) => {
                  const token = TOKENS.find((item) => item.address.toLowerCase() === row.token.toLowerCase());
                  return (
                    <tr key={row.tx}>
                      <td>{row.block.toString()}</td>
                      <td className="tok">{token?.symbol ?? "?"}</td>
                      <td>{formatUsdg(row.usdgIn)}</td>
                      <td>{(Number(row.tokenOut) / 10 ** (token?.decimals ?? 18)).toFixed(4)}</td>
                      <td className="hash"><a className="text-link" href={explorerTx(row.tx)} target="_blank" rel="noreferrer">{shortAddress(row.owner)}</a></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="empty" hidden={recent === null || recent.length > 0}>No pieces in the last blocks.</p>
        </section>
      </div>
    </>
  );
}
