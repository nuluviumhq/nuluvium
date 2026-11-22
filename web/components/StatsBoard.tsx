"use client";

// Public stats: totals over everyone, read from the stats Worker (stats/, refreshed every 10
// minutes from chain events, the ASP's approved set and the relayer). Nothing here is per user:
// no addresses, no list of deposits or pieces. Existing classes only (box, ledger, rows); the
// piece-size bars are inline widths.

import { useEffect, useState } from "react";

const STATS_URL = "https://stats.nuluvium.com/stats";
/** Below this many approved deposits, the page says plainly that privacy is weak. */
const SMALL_CROWD = 50;

type Amount = string; // token units as a decimal string (USDG: 6 decimals; ETH: 18)
interface Window {
  pieces: number;
  usdg: Amount;
  sells: number;
  sellUsdg: Amount;
  byToken: Record<string, { pieces: number; usdg: Amount }>;
}
interface Stats {
  network: string;
  updatedAt: number;
  caughtUp: boolean;
  poolUsdg: Amount;
  crowd: { deposits: number; approvedDeposits: number | null; approvedDepositors: number | null };
  flows: { deposited: Amount; withdrawnToPieces: Amount; takenBack: Amount };
  routed: Record<"24h" | "7d" | "all", Window>;
  pieceSizes: Array<{ from: number; to: number | null; pieces: number }>;
  cleanFunds: { approved: number; rejected: number; waiting: number; reasons: Record<string, number> } | null;
  relayer: {
    feesTotal: Amount;
    swaps: number;
    currentFee: Amount | null;
    ethBalance: Amount | null;
    /** Each relayer's gas balance, main first (absent in summaries from before the second relayer). */
    relayers?: Array<{ url: string; name: string | null; address: string | null; ethBalance: Amount | null }>;
  };
}

/** "1234567" (6 decimals) → "1.23"; whole numbers with thousands separators. */
function formatUnits(value: Amount, decimals: number, digits: number): string {
  const number = Number(BigInt(value)) / 10 ** decimals;
  return number.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: digits });
}
const usdg = (value: Amount) => formatUnits(value, 6, 2);
const eth = (value: Amount | null) => (value ? <>{formatUnits(value, 18, 4)} <small>ETH</small></> : "–");

/** One gas-balance row per relayer; older summaries only carry the main relayer's balance. */
function gasRows(relayer: Stats["relayer"]): Array<[string, React.ReactNode]> {
  if (!relayer.relayers?.length) return [["Gas balance", eth(relayer.ethBalance)]];
  return relayer.relayers.map((entry, index) => [`Gas balance, ${entry.name ?? `relayer ${index + 1}`}`, eth(entry.ethBalance)]);
}
const count = (value: number | null) => (value === null ? "–" : value.toLocaleString("en-US"));

function ago(unix: number): string {
  const minutes = Math.max(0, Math.round((Date.now() / 1000 - unix) / 60));
  return minutes < 1 ? "just now" : minutes < 60 ? `${minutes} min ago` : `${Math.round(minutes / 60)} h ago`;
}

function Figures({ rows }: { rows: Array<[string, React.ReactNode]> }) {
  return (
    <div className="ledger">
      <dl>
        {rows.map(([label, value], index) => (
          <div key={label}>
            <dt><span className="n">{String(index + 1).padStart(2, "0")}</span>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function Box({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <section className="box">
      <div className="box-head"><h2 className="title">{title}</h2>{note ? <span className="mono soft">{note}</span> : null}</div>
      {children}
    </section>
  );
}

export function StatsBoard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    fetch(STATS_URL)
      .then((response) => (response.ok ? (response.json() as Promise<Stats>) : Promise.reject(new Error(String(response.status)))))
      .then((body) => live && setStats(body))
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, []);

  if (!stats) {
    return <p className="fine" role="status">{failed ? "The stats are not available right now (the first count may still be running). Try again in a few minutes." : "Reading the stats…"}</p>;
  }

  const approved = stats.crowd.approvedDeposits;
  const largestBucket = Math.max(1, ...stats.pieceSizes.map((bucket) => bucket.pieces));
  const tokens = Object.entries(stats.routed.all.byToken);

  return (
    <>
      <p className="mono soft">
        {stats.network} · updated {ago(stats.updatedAt)}
        {stats.caughtUp ? "" : " · still reading the chain's history, totals are partial"}
      </p>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 26rem), 1fr))", gap: "1.5rem", marginTop: "1.5rem" }}>
        <Box title="Crowd size" note="How private it is today">
          <Figures
            rows={[
              ["Approved deposits", count(approved)],
              ["Wallets behind them", count(stats.crowd.approvedDepositors)],
              ["All deposits", count(stats.crowd.deposits)],
            ]}
          />
          <p className="fine">
            A piece hides among the approved deposits it could have come from. {approved !== null && approved < SMALL_CROWD
              ? `With ${approved} of them, the crowd is small and privacy is weak: timing and amounts can still point a piece to its deposit. It grows with every user.`
              : "The bigger this number, the harder it is to tell which deposit paid for a piece."}
          </p>
        </Box>

        <Box title="Shielded balance" note="USDG in the pool">
          <Figures
            rows={[
              ["In the pool now", <>{usdg(stats.poolUsdg)} <small>USDG</small></>],
              ["Deposited, all time", <>{usdg(stats.flows.deposited)} <small>USDG</small></>],
              ["Spent on pieces", <>{usdg(stats.flows.withdrawnToPieces)} <small>USDG</small></>],
              ["Taken back", <>{usdg(stats.flows.takenBack)} <small>USDG</small></>],
            ]}
          />
          <p className="fine">Deposits and take-backs are public; which deposit paid for which piece is not.</p>
        </Box>

        <Box title="Routed" note="Buy pieces through the relayer">
          <div className="scroll-x">
            <table className="rows narrow">
              <thead><tr><th></th><th>24 hours</th><th>7 days</th><th>All time</th></tr></thead>
              <tbody>
                <tr><td>Pieces</td><td>{count(stats.routed["24h"].pieces)}</td><td>{count(stats.routed["7d"].pieces)}</td><td>{count(stats.routed.all.pieces)}</td></tr>
                <tr><td>USDG routed</td><td>{usdg(stats.routed["24h"].usdg)}</td><td>{usdg(stats.routed["7d"].usdg)}</td><td>{usdg(stats.routed.all.usdg)}</td></tr>
                <tr><td>Sells</td><td>{count(stats.routed["24h"].sells)}</td><td>{count(stats.routed["7d"].sells)}</td><td>{count(stats.routed.all.sells)}</td></tr>
                <tr><td>USDG from sells</td><td>{usdg(stats.routed["24h"].sellUsdg)}</td><td>{usdg(stats.routed["7d"].sellUsdg)}</td><td>{usdg(stats.routed.all.sellUsdg)}</td></tr>
              </tbody>
            </table>
          </div>
          {tokens.length > 0 ? (
            <p className="fine">By token, all time: {tokens.map(([symbol, item]) => `${symbol} ${count(item.pieces)} pieces, ${usdg(item.usdg)} USDG`).join(" · ")}.</p>
          ) : null}
        </Box>

        <Box title="Piece sizes" note="Buy pieces, all time">
          <div className="scroll-x">
            <table className="rows narrow">
              <thead><tr><th>USDG per piece</th><th style={{ width: "55%" }}></th><th>Pieces</th></tr></thead>
              <tbody>
                {stats.pieceSizes.map((bucket) => (
                  <tr key={bucket.from}>
                    <td>{bucket.to === null ? `${bucket.from}+` : `${bucket.from} to ${bucket.to}`}</td>
                    <td style={{ textAlign: "left" }}>
                      <span
                        aria-hidden="true"
                        style={{ display: "block", height: "0.6rem", borderRadius: "0.25rem", background: "var(--green)", opacity: bucket.pieces ? 1 : 0.12, width: `${bucket.pieces ? Math.max(4, (bucket.pieces / largestBucket) * 100) : 100}%` }}
                      />
                    </td>
                    <td>{count(bucket.pieces)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="fine">Orders are split into pieces of random size, so no single trade shows the order&#39;s full amount.</p>
        </Box>

        <Box title="Clean-funds check" note="Approved-set provider">
          {stats.cleanFunds ? (
            <>
              <Figures
                rows={[
                  ["Approved", count(stats.cleanFunds.approved)],
                  ["Not approved", count(stats.cleanFunds.rejected)],
                  ["Waiting for the check", count(stats.cleanFunds.waiting)],
                ]}
              />
              {Object.keys(stats.cleanFunds.reasons).length > 0 ? (
                <p className="fine">Why not approved: {Object.entries(stats.cleanFunds.reasons).map(([reason, number]) => `${reason} (${number})`).join(" · ")}.</p>
              ) : null}
            </>
          ) : (
            <p className="fine">The approved set could not be read in the last count.</p>
          )}
          <p className="fine">Every deposit is checked against sanctions lists, the stock issuer&#39;s blocklist and the beta caps before it can pay for a piece.</p>
        </Box>

        <Box title="Relayers" note="Send every piece; the app falls back to the second">
          <Figures
            rows={[
              ["Fee per piece now", stats.relayer.currentFee ? <>{usdg(stats.relayer.currentFee)} <small>USDG</small></> : "–"],
              ["Fees taken, all time", <>{usdg(stats.relayer.feesTotal)} <small>USDG</small></>],
              ["Transactions sent", count(stats.relayer.swaps)],
              ...gasRows(stats.relayer),
            ]}
          />
          <p className="fine">Success rate and timing are not measured: the relayers keep no logs on purpose, so failed attempts are not recorded anywhere.</p>
        </Box>
      </div>

      <p className="fine" style={{ marginTop: "2rem" }}>
        Every number here is a total over everyone, counted from public chain data, the approved set and the relayers. There are no per-wallet stats: Nuluvium does not know which fresh addresses belong to whom.
      </p>
    </>
  );
}
