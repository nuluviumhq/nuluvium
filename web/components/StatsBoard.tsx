"use client";

// Public stats: totals over everyone, read from the stats Worker (stats/, refreshed every 10
// minutes from chain events, the ASP's approved set and the relayer). Nothing here is per user:
// no addresses, no list of deposits or pieces. Layout 5A: one tabbed panel (Pieces, Deposits,
// Relayers), each with a column chart and its figures as a numbered list.

import { useEffect, useState } from "react";
import { PanelTabs } from "@/components/layoutsClient";
import { REASON_COPY, reasonCode, type ReasonCode } from "@/lib/reasons";

const STATS_URL = "https://stats.nuluvium.com/stats";
/** Below this many approved deposits, the page says plainly that privacy is weak. */
const SMALL_CROWD = 50;
/** Each relayer sends one Telegram alert below this gas balance (relayer/src, gas float alert). */
const GAS_ALERT_ETH = 0.0015;

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
  /** codes: refusals by stable code (summaries from before 2026-11-24 have only reasons, by text). */
  cleanFunds: { approved: number; rejected: number; waiting: number; reasons: Record<string, number>; codes?: Record<string, number> } | null;
  relayer: {
    feesTotal: Amount;
    swaps: number;
    currentFee: Amount | null;
    ethBalance: Amount | null;
    /** Each relayer's gas balance, main first (absent in summaries from before the second relayer). */
    relayers?: Array<{ url: string; name: string | null; address: string | null; ethBalance: Amount | null }>;
  };
  /** Router v2 protocol fee, 0.1% per piece (absent in summaries from before Router v2). */
  protocol?: { feesTotal: Amount; toRelayers: Amount; toTreasury: Amount; swaps: number };
}

/** "1234567" (6 decimals) → "1.23"; whole numbers with thousands separators. */
function formatUnits(value: Amount, decimals: number, digits: number): string {
  const number = Number(BigInt(value)) / 10 ** decimals;
  return number.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: digits });
}
const usdg = (value: Amount) => formatUnits(value, 6, 2);
const eth = (value: Amount | null) => (value ? <>{formatUnits(value, 18, 4)} <small>ETH</small></> : "–");

/** Refusals by reason code, with a plain label; older summaries are counted from the reason text. */
function refusalRows(cleanFunds: NonNullable<Stats["cleanFunds"]>): Array<[string, React.ReactNode]> {
  const codes: Record<string, number> = { ...cleanFunds.codes };
  if (!cleanFunds.codes) {
    for (const [reason, number] of Object.entries(cleanFunds.reasons)) {
      const code = reasonCode({ reason }) ?? "OTHER";
      codes[code] = (codes[code] ?? 0) + number;
    }
  }
  return Object.entries(codes).map(([code, number]) => [
    code in REASON_COPY ? REASON_COPY[code as ReasonCode].label : "Other",
    <>{count(number)} <small>{code}</small></>,
  ]);
}

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

interface Column {
  label: string;
  value: number;
  /** Shown above the column (the value, formatted). */
  shown: string;
}

/**
 * Column chart: heights relative to the largest column; an optional dashed line marks a threshold
 * (same unit as the values). Decorative for screen readers: the same figures are in the list below.
 */
function ColumnChart({ columns, caption, line }: { columns: Column[]; caption: string; line?: { value: number; label: string } }) {
  const top = Math.max(...columns.map((column) => column.value), line?.value ?? 0) || 1;
  return (
    <figure className="stat-chart">
      <div className="stat-columns" aria-hidden="true">
        {line ? <span className="stat-line" style={{ bottom: `${(line.value / top) * 100}%` }}><span>{line.label}</span></span> : null}
        {columns.map((column, index) => (
          <div key={column.label} className="stat-column" style={{ ["--h" as string]: `${column.value ? Math.max(2, (column.value / top) * 100) : 0}%`, ["--i" as string]: index }}>
            <span className="stat-value">{column.shown}</span>
            <span className="stat-bar" />
          </div>
        ))}
      </div>
      <div className="stat-labels mono" aria-hidden="true">
        {columns.map((column) => <span key={column.label}>{column.label}</span>)}
      </div>
      <figcaption className="mono soft">{caption}</figcaption>
    </figure>
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
  const tokens = Object.entries(stats.routed.all.byToken);
  const relayers = stats.relayer.relayers?.length
    ? stats.relayer.relayers.map((entry, index) => ({ name: entry.name ?? `relayer ${index + 1}`, eth: entry.ethBalance }))
    : [{ name: "relayer", eth: stats.relayer.ethBalance }];
  const ethNumber = (value: Amount | null) => (value ? Number(BigInt(value)) / 1e18 : 0);

  const pieces = (
    <div className="stat-tab">
      <ColumnChart
        caption="Buy pieces by size, USDG per piece, all time"
        columns={stats.pieceSizes.map((bucket) => ({ label: bucket.to === null ? `${bucket.from}+` : `${bucket.from}–${bucket.to}`, value: bucket.pieces, shown: count(bucket.pieces) }))}
      />
      <div className="stat-figures">
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
        <p className="fine">Orders are split into pieces of random size, so no single trade shows the order&#39;s full amount.</p>
      </div>
    </div>
  );

  const deposits = (
    <div className="stat-tab">
      {stats.cleanFunds ? (
        <ColumnChart
          caption="Deposits by clean-funds decision"
          columns={[
            { label: "Approved", value: stats.cleanFunds.approved, shown: count(stats.cleanFunds.approved) },
            { label: "Not approved", value: stats.cleanFunds.rejected, shown: count(stats.cleanFunds.rejected) },
            { label: "Waiting", value: stats.cleanFunds.waiting, shown: count(stats.cleanFunds.waiting) },
          ]}
        />
      ) : (
        <p className="fine">The approved set could not be read in the last count.</p>
      )}
      <div className="stat-figures">
        <Figures
          rows={[
            ["Approved deposits", count(approved)],
            ["Wallets behind them", count(stats.crowd.approvedDepositors)],
            ["All deposits", count(stats.crowd.deposits)],
            ["In the pool now", <>{usdg(stats.poolUsdg)} <small>USDG</small></>],
            ["Deposited, all time", <>{usdg(stats.flows.deposited)} <small>USDG</small></>],
            ["Spent on pieces", <>{usdg(stats.flows.withdrawnToPieces)} <small>USDG</small></>],
            ["Taken back", <>{usdg(stats.flows.takenBack)} <small>USDG</small></>],
          ]}
        />
        {stats.cleanFunds && refusalRows(stats.cleanFunds).length > 0 ? (
          <>
            <p className="fine">Why not approved, by reason code:</p>
            <Figures rows={refusalRows(stats.cleanFunds)} />
          </>
        ) : null}
        <p className="fine">
          A piece hides among the approved deposits it could have come from. {approved !== null && approved < SMALL_CROWD
            ? `With ${approved} of them, the crowd is small and privacy is weak: timing and amounts can still point a piece to its deposit. It grows with every user.`
            : "The bigger this number, the harder it is to tell which deposit paid for a piece."}{" "}
          Deposits and take-backs are public; which deposit paid for which piece is not. Every deposit is checked against sanctions lists, the stock issuer&#39;s blocklist and the beta caps.
        </p>
      </div>
    </div>
  );

  const relayerTab = (
    <div className="stat-tab">
      <ColumnChart
        caption="Gas balance per relayer, ETH (dashed: the alert line)"
        line={{ value: GAS_ALERT_ETH, label: `alert ${GAS_ALERT_ETH}` }}
        columns={relayers.map((relayer) => ({ label: relayer.name, value: ethNumber(relayer.eth), shown: relayer.eth ? formatUnits(relayer.eth, 18, 4) : "–" }))}
      />
      <div className="stat-figures">
        <Figures
          rows={[
            ["Gas fee per piece now", stats.relayer.currentFee ? <>{usdg(stats.relayer.currentFee)} <small>USDG</small></> : "–"],
            ["Gas fees taken, all time", <>{usdg(stats.relayer.feesTotal)} <small>USDG</small></>],
            ["Protocol fee, 0.1% per piece", stats.protocol ? <>{formatUnits(stats.protocol.feesTotal, 6, 4)} <small>USDG</small></> : "–"],
            ["Of which to relayers", stats.protocol ? <>{formatUnits(stats.protocol.toRelayers, 6, 4)} <small>USDG</small></> : "–"],
            ["Of which to the treasury Safe", stats.protocol ? <>{formatUnits(stats.protocol.toTreasury, 6, 4)} <small>USDG</small></> : "–"],
            ["Transactions sent", count(stats.relayer.swaps)],
            ...gasRows(stats.relayer),
          ]}
        />
        <p className="fine">The protocol fee counts Router v2 pieces only (from 23 Nov 2026); it is paid in USDG from each piece, half to the relayer that sent it and half to the treasury Safe. Success rate and timing are not measured: the relayers keep no logs on purpose, so failed attempts are not recorded anywhere.</p>
      </div>
    </div>
  );

  return (
    <>
      <p className="mono soft">
        {stats.network} · updated {ago(stats.updatedAt)}
        {stats.caughtUp ? "" : " · still reading the chain's history, totals are partial"}
      </p>

      <div className="stat-panel">
        <PanelTabs
          tabs={[
            { label: "Pieces", panel: pieces },
            { label: "Deposits", panel: deposits },
            { label: "Relayers", panel: relayerTab },
          ]}
        />
      </div>

      <p className="fine" style={{ marginTop: "2rem" }}>
        Every number here is a total over everyone, counted from public chain data, the approved set and the relayers. There are no per-wallet stats: Nuluvium does not know which fresh addresses belong to whom.
      </p>
    </>
  );
}
