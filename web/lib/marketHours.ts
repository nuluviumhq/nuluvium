// US stock market hours (NYSE core session), computed in the browser from the clock.
// Regular hours: 9:30 a.m. to 4:00 p.m. New York time, Monday to Friday, except exchange holidays;
// early closes at 1:00 p.m. Source: nyse.com/markets/hours-calendars (checked 2026-11-19).
// The holiday list covers 2026 and 2027; add the next year's dates from the same page before 2028.

const ZONE = "America/New_York";
const OPEN_MINUTE = 9 * 60 + 30;
const CLOSE_MINUTE = 16 * 60;
const EARLY_CLOSE_MINUTE = 13 * 60;

/** Full-day closures (New York dates). */
export const HOLIDAYS: Record<string, string> = {
  "2026-01-01": "New Year's Day",
  "2026-01-19": "Martin Luther King, Jr. Day",
  "2026-02-16": "Washington's Birthday",
  "2026-04-03": "Good Friday",
  "2026-05-25": "Memorial Day",
  "2026-06-19": "Juneteenth",
  "2026-07-03": "Independence Day (observed)",
  "2026-09-07": "Labor Day",
  "2026-11-26": "Thanksgiving Day",
  "2026-12-25": "Christmas Day",
  "2027-01-01": "New Year's Day",
  "2027-01-18": "Martin Luther King, Jr. Day",
  "2027-02-15": "Washington's Birthday",
  "2027-03-26": "Good Friday",
  "2027-05-31": "Memorial Day",
  "2027-06-18": "Juneteenth (observed)",
  "2027-07-05": "Independence Day (observed)",
  "2027-09-06": "Labor Day",
  "2027-11-25": "Thanksgiving Day",
  "2027-12-24": "Christmas Day (observed)",
};

/** Days the market closes at 1:00 p.m. New York time. */
export const EARLY_CLOSES = new Set(["2026-11-27", "2026-12-24", "2027-11-26"]);

interface WallTime { date: string; weekday: number; minute: number }

const formatter = new Intl.DateTimeFormat("en-US", {
  timeZone: ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
  weekday: "short",
});
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function wallTime(at: Date): WallTime & { asUtcMs: number } {
  const parts = Object.fromEntries(formatter.formatToParts(at).map((part) => [part.type, part.value]));
  const [year, month, day, hour, minute, second] = ["year", "month", "day", "hour", "minute", "second"].map((key) => Number(parts[key]));
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    weekday: WEEKDAYS.indexOf(parts.weekday!),
    minute: hour! * 60 + minute!,
    // The New York wall time read as if it were UTC: the difference to `at` is the zone offset.
    asUtcMs: Date.UTC(year!, month! - 1, day!, hour!, minute!, second!),
  };
}

/** The UTC instant of a New York wall time (date + minute of day), DST-aware. */
function newYorkInstant(date: string, minute: number): Date {
  const [year, month, day] = date.split("-").map(Number);
  const guess = Date.UTC(year!, month! - 1, day!, Math.floor(minute / 60), minute % 60);
  // Offset at the guessed instant; one correction is enough away from the 2 a.m. DST switch.
  const offset = wallTime(new Date(guess)).asUtcMs - guess;
  return new Date(guess - offset);
}

function sessionOf(date: string, weekday: number): { open: number; close: number } | { closedReason: string } {
  if (weekday === 0 || weekday === 6) return { closedReason: "Weekend" };
  const holiday = HOLIDAYS[date];
  if (holiday) return { closedReason: holiday };
  return { open: OPEN_MINUTE, close: EARLY_CLOSES.has(date) ? EARLY_CLOSE_MINUTE : CLOSE_MINUTE };
}

export interface MarketState {
  open: boolean;
  /** Why the market is closed today (weekend or holiday name), when it has no session today. */
  closedReason?: string;
  earlyClose: boolean;
  /** Next change: the close while open, the next open while closed. */
  next: Date;
  /** Today's session in UTC minutes of the day (for the 24 h bar), when there is one today. */
  sessionUtc?: { start: number; end: number };
  nowUtcMinute: number;
}

const utcMinute = (at: Date) => at.getUTCHours() * 60 + at.getUTCMinutes();

export function marketState(now: Date = new Date()): MarketState {
  const today = wallTime(now);
  const session = sessionOf(today.date, today.weekday);
  const nowUtcMinute = utcMinute(now);

  let sessionUtc: MarketState["sessionUtc"];
  if ("open" in session) {
    sessionUtc = { start: utcMinute(newYorkInstant(today.date, session.open)), end: utcMinute(newYorkInstant(today.date, session.close)) };
    if (today.minute >= session.open && today.minute < session.close) {
      return { open: true, earlyClose: session.close !== CLOSE_MINUTE, next: newYorkInstant(today.date, session.close), sessionUtc, nowUtcMinute };
    }
  }

  // Closed: find the next session open, today (before the open) or on a following day.
  for (let days = 0; days < 14; days += 1) {
    const probe = wallTime(new Date(now.getTime() + days * 86_400_000));
    const next = sessionOf(probe.date, probe.weekday);
    if (!("open" in next)) continue;
    if (days === 0 && today.minute >= next.open) continue;
    return {
      open: false,
      closedReason: "closedReason" in session ? session.closedReason : undefined,
      earlyClose: false,
      next: newYorkInstant(probe.date, next.open),
      sessionUtc,
      nowUtcMinute,
    };
  }
  throw new Error("No market session in the next two weeks");
}

/** "3 h 12 min", "45 min", "2 d 4 h". */
export function formatDuration(ms: number): string {
  const minutes = Math.max(0, Math.round(ms / 60_000));
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const rest = minutes % 60;
  if (days > 0) return `${days} d ${hours} h`;
  if (hours > 0) return `${hours} h ${rest} min`;
  return `${rest} min`;
}
