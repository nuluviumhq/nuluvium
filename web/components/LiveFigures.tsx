"use client";

// Landing page strip of live testnet figures, read from the stats Worker (same source as /stats).
// Totals only: the stats Worker never returns addresses.
import Link from "next/link";
import { useEffect, useState } from "react";

const STATS_URL = "https://stats.nuluvium.com/stats";
/** Same threshold as /stats: below this many approved deposits we say plainly that privacy is weak. */
const SMALL_CROWD = 50;

interface Headline {
  updatedAt: number;
  crowd: { approvedDeposits: number | null; approvedDepositors: number | null };
  headline: { shieldedUsdg: string; piecesRouted: number };
}

const whole = (value: number | null | undefined) => (value === null || value === undefined ? "–" : value.toLocaleString("en-US"));

function ago(unix: number): string {
  const minutes = Math.max(0, Math.round((Date.now() / 1000 - unix) / 60));
  return minutes < 1 ? "just now" : minutes < 60 ? `${minutes} min ago` : `${Math.round(minutes / 60)} h ago`;
}

export function LiveFigures() {
  const [stats, setStats] = useState<Headline | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    fetch(STATS_URL, { signal: controller.signal })
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error(String(response.status)))))
      .then((data) => setStats(data as Headline))
      .catch(() => {
        if (!controller.signal.aborted) setFailed(true);
      });
    return () => controller.abort();
  }, []);

  const approved = stats?.crowd.approvedDeposits ?? null;
  const shielded = stats ? Number(stats.headline.shieldedUsdg) : null;
  const figures: Array<[string, string]> = [
    ["Approved deposits", whole(approved)],
    ["People behind them", whole(stats?.crowd.approvedDepositors)],
    ["USDG in the shielded pool", whole(shielded)],
    ["Pieces routed", whole(stats?.headline.piecesRouted)],
  ];

  return (
    <section className="box live-figures" aria-busy={!stats && !failed}>
      <div className="box-head">
        <h2 className="title">The crowd, today</h2>
        <span className="mono soft">{stats ? `Testnet · updated ${ago(stats.updatedAt)}` : failed ? "Testnet · figures unavailable" : "Testnet · loading"}</span>
      </div>
      <dl className="figures">
        {figures.map(([label, value]) => (
          <div key={label} className={stats ? undefined : "loading"}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      <div className="figures-foot">
        <p>
          {approved !== null && approved < SMALL_CROWD
            ? `With ${approved} approved deposits the crowd is small, so privacy is weak: timing and amounts can still point a piece to its deposit. It grows with every user.`
            : "Privacy grows with the crowd: the more deposits there are, the harder it is to point a piece to one of them."}
        </p>
        <Link className="button outline" href="/stats">All figures</Link>
      </div>
    </section>
  );
}
