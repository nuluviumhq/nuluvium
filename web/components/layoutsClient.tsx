"use client";

// Client parts of the inner-page layouts (see layouts.tsx): the tabbed panel and the live ticker.

import { type ReactNode, useEffect, useId, useState } from "react";
import { TickerStrip } from "@/components/layouts";

/** Tabs above one panel at a time (pattern A). Arrow keys move between tabs. */
export function PanelTabs({ tabs }: { tabs: Array<{ label: string; panel: ReactNode }> }) {
  const [active, setActive] = useState(0);
  const id = useId();
  const move = (event: React.KeyboardEvent, index: number) => {
    const step = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
    if (!step) return;
    const next = (index + step + tabs.length) % tabs.length;
    setActive(next);
    document.getElementById(`${id}-tab-${next}`)?.focus();
  };
  return (
    <div className="panel-tabs">
      <div className="tab-row" role="tablist">
        {tabs.map((tab, index) => (
          <button
            key={tab.label}
            id={`${id}-tab-${index}`}
            type="button"
            role="tab"
            aria-selected={index === active}
            aria-controls={`${id}-panel-${index}`}
            tabIndex={index === active ? 0 : -1}
            onClick={() => setActive(index)}
            onKeyDown={(event) => move(event, index)}
          >
            {tab.label}
          </button>
        ))}
      </div>
      {tabs.map((tab, index) => (
        <div key={tab.label} id={`${id}-panel-${index}`} role="tabpanel" aria-labelledby={`${id}-tab-${index}`} hidden={index !== active} className="tab-panel">
          {tab.panel}
        </div>
      ))}
    </div>
  );
}

const STATS_URL = "https://stats.nuluvium.com/stats";

interface LiveFigures {
  poolUsdg: string;
  crowd: { approvedDeposits: number | null };
  routed: { all: { pieces: number } };
}

const usdg = (units: string) => (Number(BigInt(units)) / 1e6).toLocaleString("en-US", { maximumFractionDigits: 2 });

/**
 * Ticker of facts that are always true (from the docs) plus live totals from the stats Worker
 * once they load. If the Worker cannot be reached, only the fixed facts show.
 */
export function LiveTicker({ label, facts }: { label: string; facts: Array<[string, string]> }) {
  const [live, setLive] = useState<Array<[string, string]>>([]);
  useEffect(() => {
    const controller = new AbortController();
    fetch(STATS_URL, { signal: controller.signal })
      .then((response) => (response.ok ? (response.json() as Promise<LiveFigures>) : null))
      .then((stats) => {
        if (!stats) return;
        const rows: Array<[string, string]> = [["In the pool", `${usdg(stats.poolUsdg)} USDG`], ["Pieces routed", stats.routed.all.pieces.toLocaleString("en-US")]];
        if (stats.crowd.approvedDeposits !== null) rows.unshift(["Approved deposits", stats.crowd.approvedDeposits.toLocaleString("en-US")]);
        setLive(rows);
      })
      .catch(() => {});
    return () => controller.abort();
  }, []);
  return <TickerStrip label={label} items={[...live, ...facts]} />;
}
