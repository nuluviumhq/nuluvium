// Route curtain helpers (components/RouteCurtain.tsx): which clicks get the curtain, and when the
// next page is ready to be shown. Modelled on page transitions that cover the page, load the next
// route underneath, and only reveal once its first screen has loaded.

/** How long the sheets take to cover the page before the route changes (keep in step with the CSS). */
export const CURTAIN_COVER_MS = 480;

export const lessMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** True for a plain left click that should navigate in this tab. */
export function isPlainClick(event: MouseEvent) {
  return event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;
}

const route = (path: string) => path.replace(/\/$/, "") || "/";
const inApp = (path: string) => route(path) === "/app" || path.startsWith("/app/");

/**
 * The same-origin destination of a link that should get the curtain, or null. Skipped: other sites,
 * new tabs, downloads, links to the same page (anchors), and moves between two app pages (a tool
 * people click through often; the curtain is for the site and for entering or leaving the app).
 */
export function curtainTarget(anchor: HTMLAnchorElement): URL | null {
  if (anchor.target === "_blank" || anchor.hasAttribute("download")) return null;
  const url = new URL(anchor.href, window.location.href);
  if (url.origin !== window.location.origin) return null;
  const from = window.location.pathname;
  if (route(url.pathname) === route(from)) return null;
  if (inApp(url.pathname) && inApp(from)) return null;
  return url;
}

/** Resolves when the promise settles or after `ms`, whichever is first. */
const capped = (promise: Promise<unknown>, ms: number) =>
  Promise.race([promise.catch(() => undefined), new Promise((resolve) => window.setTimeout(resolve, ms))]);

/**
 * Waits until the new page's first screen is ready: fonts, then the images in the first 1.2 screens
 * (made eager so they start at once). Every wait is capped so a slow image never holds the curtain.
 */
export async function pageReady() {
  await new Promise((resolve) => window.setTimeout(resolve, 60));
  await capped(document.fonts.ready, 300);
  const fold = window.innerHeight * 1.2;
  const firstScreen = [...document.images].filter((image) => image.getBoundingClientRect().top < fold);
  for (const image of firstScreen) image.loading = "eager";
  const loaded = (image: HTMLImageElement) =>
    new Promise<void>((resolve) => {
      if (image.complete) return resolve();
      image.addEventListener("load", () => resolve(), { once: true });
      image.addEventListener("error", () => resolve(), { once: true });
    });
  await capped(Promise.all(firstScreen.map(loaded)), 1200);
}
