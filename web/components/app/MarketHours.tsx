"use client";

// Market hours card: the US stock market's session today on a 24 h UTC bar, live from the clock
// (lib/marketHours.ts). Stock-token pools trade around the clock; this says when their prices
// follow a live market.

import { useEffect, useState } from "react";
import { formatDuration, marketState, type MarketState } from "@/lib/marketHours";

const percent = (minute: number) => `${((minute / 1440) * 100).toFixed(2)}%`;
const hhmm = (minute: number) => `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;

export function MarketHours() {
  // Computed after mount only: the page is prerendered, and the clock differs per visitor.
  const [state, setState] = useState<MarketState | null>(null);
  useEffect(() => {
    const tick = () => setState(marketState());
    tick();
    const timer = window.setInterval(tick, 30_000);
    return () => window.clearInterval(timer);
  }, []);

  const status = !state
    ? "…"
    : state.open
      ? `Closes in ${formatDuration(state.next.getTime() - Date.now())}${state.earlyClose ? " · early close" : ""}`
      : `Opens in ${formatDuration(state.next.getTime() - Date.now())}`;
  const label = !state ? "Reading the clock" : state.open ? "US market open" : state.closedReason ? `Closed · ${state.closedReason}` : "US market closed";
  const session = state?.sessionUtc;

  return (
    <section className="clock" aria-label="Market hours">
      <div className="clock-head">
        <h2 className="title">Market hours</h2>
        <p>
          <span className={state?.open ? "state done" : "state expired"}>{label}</span>
          <span className="mono soft">{status}</span>
        </p>
      </div>
      <div
        className="day"
        role="img"
        aria-label={session ? `Today the US market is open from ${hhmm(session.start)} to ${hhmm(session.end)} UTC.` : "The US market is closed today."}
      >
        {session ? <span className="session" style={{ left: percent(session.start), width: percent(session.end - session.start) }}></span> : null}
        {state ? <span className="now" style={{ left: percent(state.nowUtcMinute) }}><i>{hhmm(state.nowUtcMinute)}</i></span> : null}
      </div>
      <div className="hours mono soft"><span>00</span><span>06</span><span>12</span><span>18</span><span>24 UTC</span></div>
      <p className="fine">
        Regular hours are 9:30 to 16:00 New York time on weekdays, except exchange holidays. Pools trade around the clock, but their prices drift from the real stock while the market is closed.
      </p>
    </section>
  );
}
