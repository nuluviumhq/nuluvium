// Small line icons drawn with the text colour (currentColor); used instead of text arrows.

/** Arrow icon; `direction` "left" points back (previous page). Decorative: the link text says where it goes. */
export function ArrowIcon({ direction = "right" }: { direction?: "right" | "left" }) {
  return (
    <svg className={`icon-arrow${direction === "left" ? " left" : ""}`} viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
      <path d="M2.5 8h10.5M9 4l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Log out icon: a door with an arrow leaving it. Decorative; the button carries the label. */
export function LogoutIcon() {
  return (
    <svg className="icon-logout" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
      <path d="M6.5 2.5h-3a1 1 0 0 0-1 1v9a1 1 0 0 0 1 1h3M10 5l3 3-3 3M13 8H6" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Chevron pointing right, for rows that open a page. */
export function ChevronIcon() {
  return (
    <svg className="icon-chevron" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
      <path d="M6 3.5 10.5 8 6 12.5" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
