// Small line icons drawn with the text colour (currentColor); used instead of text arrows.

/** Arrow icon; `direction` "left" points back (previous page). Decorative: the link text says where it goes. */
export function ArrowIcon({ direction = "right" }: { direction?: "right" | "left" }) {
  return (
    <svg className={`icon-arrow${direction === "left" ? " left" : ""}`} viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
      <path d="M2.5 8h10.5M9 4l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
