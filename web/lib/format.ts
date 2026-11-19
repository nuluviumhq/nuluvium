import type { CSSProperties } from "react";
import type { OrderStatus } from "./orders";

export const usd = (value: number, digits = 0) =>
  "$" + value.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });

export const STATUS_LABEL: Record<OrderStatus, string> = {
  scheduled: "Scheduled",
  routing: "Routing",
  done: "Done",
  cancelled: "Cancelled",
  failed: "Failed",
};

/** Stylesheet class for a status (no new styles: "failed" uses the existing "expired" look). */
export const STATUS_CLASS: Record<OrderStatus, string> = {
  scheduled: "scheduled",
  routing: "routing",
  done: "done",
  cancelled: "cancelled",
  failed: "expired",
};

/** A different patch of the marble for each tile, the same for the same index (prototype rule). */
export const marble = (index: number): CSSProperties => ({
  backgroundPosition: `${32 + ((index * 37) % 36)}% ${34 + ((index * 53) % 30)}%`,
});

/** "14 Nov, 15:02" in the visitor's time zone, as in the prototype tables. */
export const shortTime = (unix: number) =>
  new Date(unix * 1000).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).replace(" at", ",");
