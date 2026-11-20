"use client";

// Route curtain: the transition between pages, for the whole site and for entering or leaving the
// app (not between two app pages). A click on an internal link draws four green sheets over the
// page with four small paintings, the mark and a progress line; the route changes underneath; the
// sheets open once the new page's first screen has loaded (lib/pageCurtain.ts). Hovering a link
// prefetches its route. With reduced motion the click navigates at once.
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { CURTAIN_COVER_MS, curtainTarget, isPlainClick, lessMotion, pageReady } from "@/lib/pageCurtain";

type State = "idle" | "cover" | "reveal";

/** Duotone fragments of the landing paintings, one per sheet. */
const ART = ["/art/frag-1.webp", "/art/frag-6.webp", "/art/frag-2.webp", "/art/frag-3.webp"];

export function RouteCurtain() {
  const router = useRouter();
  const pathname = usePathname();
  const [state, setState] = useState<State>("idle");
  const target = useRef<string | null>(null);

  // Intercept internal link clicks (capture phase, before Next's own Link handler).
  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || !isPlainClick(event) || lessMotion()) return;
      const anchor = (event.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      const url = anchor ? curtainTarget(anchor) : null;
      if (!url || target.current) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      const href = url.pathname + url.search + url.hash;
      target.current = url.pathname;
      router.prefetch(href);
      setState("cover");
      window.setTimeout(() => router.push(href), CURTAIN_COVER_MS);
    };
    const onHover = (event: PointerEvent) => {
      const anchor = (event.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      const url = anchor ? curtainTarget(anchor) : null;
      if (url) router.prefetch(url.pathname);
    };
    document.addEventListener("click", onClick, true);
    document.addEventListener("pointerover", onHover, { passive: true });
    return () => {
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("pointerover", onHover);
    };
  }, [router]);

  // The route changed under the curtain: wait for the first screen, then open.
  useEffect(() => {
    if (!target.current || pathname !== target.current) return;
    let cancelled = false;
    void pageReady().then(() => {
      if (cancelled) return;
      target.current = null;
      setState("reveal");
    });
    return () => {
      cancelled = true;
    };
  }, [pathname]);

  // After the sheets have left, reset them above the screen for the next time.
  useEffect(() => {
    if (state !== "reveal") return;
    const timer = window.setTimeout(() => setState("idle"), 900);
    return () => window.clearTimeout(timer);
  }, [state]);

  return (
    <div className="route-curtain" data-state={state} aria-hidden={state === "idle"} role="status" aria-label={state === "cover" ? "Loading the page" : undefined}>
      {[0, 1, 2, 3].map((index) => (
        <div key={index} className="ink-sheet" style={{ ["--i" as string]: index }}>
          <img src={ART[index]} alt="" />
        </div>
      ))}
      <div className="route-mark">
        <img src="/brand/mark.png" alt="" />
        <span className="route-name">Nuluvium</span>
        <span className="route-caption">The privacy layer for onchain stocks</span>
        <span className="route-progress" />
      </div>
    </div>
  );
}
