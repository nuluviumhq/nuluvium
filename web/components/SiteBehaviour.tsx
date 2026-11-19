"use client";

// Behaviour shared by every site page (ported from prototype/page.js, same rules and timings):
// - the header wordmark folds to its first letter once the page is scrolled
// - the hero video is paused for people who ask for less motion
// - the two closing cards swap roles
// - the live tile field in the agents card
// - "scroll steps" scenes: a pinned panel whose view follows a numbered list
// It works on the rendered markup (classes from the stylesheet); it renders nothing itself.

import { useEffect } from "react";

const clamp = (value: number) => Math.min(1, Math.max(0, value));

export function SiteBehaviour() {
  useEffect(() => {
    const cleanups: Array<() => void> = [];
    const lessMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const header = document.querySelector<HTMLElement>(".site-header");

    // People who ask for less motion get the still poster instead of the moving hero.
    const heroVideo = document.getElementById("hero-video") as HTMLVideoElement | null;
    if (heroVideo && lessMotion) {
      heroVideo.removeAttribute("autoplay");
      heroVideo.pause();
    }

    // Closing cards: the one under the pointer (or focused) opens, the other closes.
    // On phones both are shown open by the stylesheet, so this has no visible effect there.
    const cards = [...document.querySelectorAll<HTMLElement>("#closing .card")];
    const openCard = (card: HTMLElement) => {
      for (const other of cards) other.classList.toggle("open", other === card);
    };
    for (const card of cards) {
      const onEnter = () => openCard(card);
      // A tap or click on a closed card opens it first; links inside work once it is open.
      const onClick = (event: MouseEvent) => {
        if (!card.classList.contains("open")) {
          event.preventDefault();
          openCard(card);
        }
      };
      card.addEventListener("pointerenter", onEnter);
      card.addEventListener("focusin", onEnter);
      card.addEventListener("click", onClick);
      cleanups.push(() => {
        card.removeEventListener("pointerenter", onEnter);
        card.removeEventListener("focusin", onEnter);
        card.removeEventListener("click", onClick);
      });
    }

    // Live tile field: every so often an order arrives (an empty tile fills with marble and rings
    // briefly) or a filled one leaves, keeping about two thirds full. Only while on screen, the tab
    // is visible, and the visitor has not asked for less motion. Decoration; not real numbers.
    const fields = [...document.querySelectorAll<HTMLElement>(".tile-art")];
    if (fields.length && !lessMotion) {
      const visible = new Set<Element>();
      const observer = new IntersectionObserver((entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) visible.add(entry.target);
          else visible.delete(entry.target);
        }
      });
      for (const field of fields) observer.observe(field);

      const tick = (field: Element) => {
        const tiles = [...field.children] as HTMLElement[];
        const filled = tiles.filter((tile) => tile.classList.contains("m"));
        // Keep the filled share near 65%: fill more often below it, empty more often above.
        const fill = Math.random() < (filled.length / tiles.length < 0.65 ? 0.75 : 0.35);
        const pool = tiles.filter((tile) => tile.classList.contains("m") !== fill);
        const tile = pool[Math.floor(Math.random() * pool.length)];
        if (!tile) return;
        if (fill) {
          // A new order takes a different patch of the stone each time.
          tile.style.backgroundPosition = `${(32 + Math.random() * 36).toFixed(0)}% ${(34 + Math.random() * 30).toFixed(0)}%`;
          tile.classList.add("m", "fresh");
          setTimeout(() => tile.classList.remove("fresh"), 1200);
        } else {
          tile.classList.remove("m", "fresh");
        }
      };

      // A slightly irregular rhythm reads as live data; a fixed interval reads as a loop.
      let timer = 0;
      const schedule = () => {
        timer = window.setTimeout(() => {
          if (!document.hidden) visible.forEach(tick);
          schedule();
        }, 280 + Math.random() * 520);
      };
      schedule();
      cleanups.push(() => {
        clearTimeout(timer);
        observer.disconnect();
      });
    }

    // Scroll steps: <section data-scroll-steps> holds a pinned frame with .step items. How far the
    // section has scrolled picks the active step; the stylesheet shows the matching .view from the
    // section's data-active attribute.
    const scenes = [...document.querySelectorAll<HTMLElement>("[data-scroll-steps]")].map((section) => ({
      section,
      steps: [...section.querySelectorAll<HTMLElement>(".step")],
      active: -1,
    }));
    for (const scene of scenes) {
      scene.steps.forEach((step, index) => {
        const button = step.querySelector("button");
        if (!button) return;
        // Clicking a step scrolls to the middle of its slice of the section.
        const onClick = () => {
          const travel = scene.section.offsetHeight - window.innerHeight;
          if (travel <= 0) return;
          const top = scene.section.getBoundingClientRect().top + window.scrollY;
          window.scrollTo({ top: top + ((index + 0.5) / scene.steps.length) * travel, behavior: "smooth" });
        };
        button.addEventListener("click", onClick);
        cleanups.push(() => button.removeEventListener("click", onClick));
      });
    }

    const update = () => {
      if (header) {
        // With a painting hero the wordmark folds after the hero; elsewhere almost at once.
        const threshold = document.querySelector(".hero-section") ? window.innerHeight * 0.6 : 120;
        header.classList.toggle("compact", window.scrollY > threshold);
      }
      for (const scene of scenes) {
        const rect = scene.section.getBoundingClientRect();
        const travel = rect.height - window.innerHeight;
        const progress = travel <= 0 ? 0 : clamp(-rect.top / travel);
        const index = Math.min(scene.steps.length - 1, Math.floor(progress * scene.steps.length));
        if (index === scene.active) continue;
        scene.active = index;
        scene.section.dataset.active = String(index);
        scene.steps.forEach((step, stepIndex) => {
        step.classList.toggle("active", stepIndex === index);
      });
      }
    };

    let queued = false;
    const onScroll = () => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => {
        queued = false;
        update();
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", update);
    update();
    cleanups.push(() => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", update);
    });

    return () => {
      for (const cleanup of cleanups) cleanup();
    };
  }, []);

  return null;
}
