// Page curtain: the transition from the site into the app. Four green columns drop over the page
// (the same columns as the landing's opening sequence), the app route loads underneath, then the
// columns lift away. Skipped for people who ask for less motion, and for clicks that open a new tab.

const CURTAIN_ID = "page-curtain";
/** How long the columns take to cover the page before navigating (keep in step with the stylesheet). */
export const CURTAIN_COVER_MS = 650;

const lessMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Drops the curtain; resolves once the page is covered. Resolves at once when motion is reduced. */
export function dropCurtain(): Promise<void> {
  if (lessMotion() || document.getElementById(CURTAIN_ID)) return Promise.resolve();
  const curtain = document.createElement("div");
  curtain.id = CURTAIN_ID;
  curtain.className = "page-curtain";
  curtain.setAttribute("aria-hidden", "true");
  curtain.innerHTML = "<i></i><i></i><i></i><i></i>";
  document.body.appendChild(curtain);
  // Force a layout so the columns start above the screen, then let them animate down. (A reflow
  // instead of requestAnimationFrame, which does not run in a background tab.)
  void curtain.offsetHeight;
  curtain.classList.add("covering");
  return new Promise((resolve) => window.setTimeout(resolve, CURTAIN_COVER_MS));
}

/** Lifts a curtain left by dropCurtain (called once the next page is on screen), then removes it. */
export function liftCurtain() {
  const curtain = document.getElementById(CURTAIN_ID);
  if (!curtain) return;
  curtain.classList.add("lifting");
  window.setTimeout(() => curtain.remove(), 1000);
}

/** True for a plain left click that should navigate in this tab. */
export function isPlainClick(event: MouseEvent) {
  return event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;
}
