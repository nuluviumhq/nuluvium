"use client";

// Opening sequence of the landing page, once per browser session:
//   1. four green columns lift away in turn,
//   2. "Nulu [mark] vium" settles in the middle,
//   3. the mark opens into a framed view of the hero painting and the two halves part,
//   4. the frame grows past the screen and fades into the real hero, whose own entrance
//      (headline lines rising, rule drawing) starts right then.
// The timeline lives in the stylesheet (.opening*). INTRO_SCRIPT runs before first paint and decides
// whether to play it: never with reduced motion, never twice in one session. Without JavaScript the
// overlay stays hidden, so the page never depends on it. A click, tap or key skips it.
import { useEffect } from "react";

/** Total length of the CSS timeline in ms; keep in step with the .opening keyframes. */
const INTRO_MS = 3300;
const SEEN_KEY = "nuluvium-intro";

/**
 * Inline, before paint: html[data-intro] shows the overlay, html[data-intro-ran] delays the hero entrance.
 * Data attributes, not classes: React owns the html className and would report a hydration mismatch.
 */
export const INTRO_SCRIPT = `try{if(!matchMedia("(prefers-reduced-motion: reduce)").matches&&!sessionStorage.getItem("${SEEN_KEY}")){sessionStorage.setItem("${SEEN_KEY}","1");var d=document.documentElement.dataset;d.intro="play";d.introRan=""}}catch(e){}`;

export function IntroCurtain() {
  useEffect(() => {
    const root = document.documentElement;
    if (root.dataset.intro === undefined) return;
    const finish = () => {
      delete root.dataset.intro;
    };
    const timer = window.setTimeout(finish, INTRO_MS);
    // Skipping fades the overlay out quickly; the hero entrance then plays at once.
    const skip = () => {
      window.clearTimeout(timer);
      root.dataset.intro = "skip";
      delete root.dataset.introRan;
      window.setTimeout(finish, 350);
    };
    window.addEventListener("pointerdown", skip, { once: true });
    window.addEventListener("keydown", skip, { once: true });
    // No finish() here: the html data attributes only act while .opening is in the page (see the
    // stylesheet), so a leftover one is harmless, and React's dev double mount does not cut the sequence short.
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("pointerdown", skip);
      window.removeEventListener("keydown", skip);
    };
  }, []);

  return (
    <div className="opening" aria-hidden="true">
      <div className="opening-columns"><i /><i /><i /><i /></div>
      <div className="opening-stage">
        <span className="opening-word">Nulu</span>
        <span className="opening-frame">
          <img src="/assets/hero-poster.jpg" alt="" />
          <i className="corner top-left" /><i className="corner top-right" />
          <i className="corner bottom-left" /><i className="corner bottom-right" />
        </span>
        <span className="opening-mark"><img src="/brand/mark.png" alt="" /></span>
        <span className="opening-word">vium</span>
      </div>
    </div>
  );
}
