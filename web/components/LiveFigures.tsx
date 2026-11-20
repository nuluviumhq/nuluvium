"use client";

// Live testnet figures for the landing crowd scene, read from the stats Worker (same source as
// /stats). Totals only: the stats Worker never returns addresses.
import Link from "next/link";
import { useEffect, useState } from "react";
import { CountUp } from "@/components/homeInteractive";

const STATS_URL = "https://stats.nuluvium.com/stats";
/** Same threshold as /stats: below this many approved deposits we say plainly that privacy is weak. */
const SMALL_CROWD = 50;

interface Headline {
  updatedAt: number;
  crowd: { deposits: number; approvedDeposits: number | null; approvedDepositors: number | null };
  headline: { shieldedUsdg: string; piecesRouted: number };
}

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
  const figures: Array<[string, number | null]> = [
    ["approved deposits", approved],
    ["USDG shielded", stats ? Number(stats.headline.shieldedUsdg) : null],
    ["pieces routed", stats?.headline.piecesRouted ?? null],
  ];

  return (
    <div className="live-figures" aria-busy={!stats && !failed}>
      <dl className="big-figures">
        {figures.map(([label, value]) => (
          <div key={label}>
            <dd>{value === null ? "–" : <CountUp value={value} />}</dd>
            <dt>{label}</dt>
          </div>
        ))}
      </dl>
      <p className="live-note">
        <span className="live-dot" aria-hidden="true" />
        {stats ? `Testnet, updated ${ago(stats.updatedAt)}. ` : failed ? "Live figures are unavailable right now. " : "Reading the chain… "}
        {approved !== null && approved < SMALL_CROWD
          ? "The crowd is still small, so privacy is weak for now. It grows with every user."
          : "The bigger the crowd, the harder it is to point a piece to its deposit."}{" "}
        <Link className="text-link" href="/stats">All figures</Link>
      </p>
    </div>
  );
}
