"use client";

// Scroll scene of the landing page (ported from prototype/scene.js, same phases and easing).
// One tall section with a pinned viewport; scrolling moves a progress value from 0 to 1 and each
// phase owns a slice of it. This only writes numbers (CSS variables) and a step name; the
// stylesheet does the drawing. On small screens the scene is not pinned and nothing shows.

import { Fragment, useEffect } from "react";

const PHASE = {
  words: [0.0, 0.11], // statement lights up word by word
  rise: [0.11, 0.17], // panel comes up from below, on the right
  slide: [0.21, 0.3], // panel travels left over the statement; stone grows, lines appear
  column: [0.33, 0.4], // intro line leaves, the steps list arrives
  steps: [0.4, 1.0], // four steps share this range
  record: [0.88, 0.98], // settlement record rises inside the panel (during the last step)
} as const;

const clamp = (value: number) => Math.min(1, Math.max(0, value));
const span = ([from, to]: readonly [number, number], progress: number) => clamp((progress - from) / (to - from));
// Same ease as the reference's scene transitions: cubic-bezier(.65, 0, .35, 1), approximated.
const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

/** Splits each paragraph into word spans so they can light up in order (server-rendered). */
export function StatementWords({ paragraphs }: { paragraphs: string[] }) {
  return (
    <>
      {paragraphs.map((paragraph, index) => {
        const words = paragraph.trim().split(/\s+/);
        return (
          <p key={index}>
            {words.map((word, wordIndex) => (
              <Fragment key={wordIndex}>
                <span className="w">{word}</span>
                {wordIndex < words.length - 1 ? " " : ""}
              </Fragment>
            ))}
          </p>
        );
      })}
    </>
  );
}

export function LandingScene() {
  useEffect(() => {
    const scene = document.getElementById("product");
    if (!scene) return;
    const words = [...scene.querySelectorAll<HTMLElement>("#statement .w")];
    const steps = [...scene.querySelectorAll<HTMLElement>(".step")];

    const sceneProgress = () => {
      const rect = scene.getBoundingClientRect();
      const travel = rect.height - window.innerHeight;
      return travel <= 0 ? 1 : clamp(-rect.top / travel);
    };

    let lastStep: string | null = null;
    const update = () => {
      const progress = sceneProgress();
      const lit = Math.round(span(PHASE.words, progress) * words.length);
      words.forEach((word, index) => {
        word.classList.toggle("on", index < lit);
      });

      const rise = ease(span(PHASE.rise, progress));
      const slide = ease(span(PHASE.slide, progress));
      scene.style.setProperty("--rise", rise.toFixed(4));
      scene.style.setProperty("--slide", slide.toFixed(4));
      scene.style.setProperty("--lines", span([0.24, 0.3], progress).toFixed(4));
      scene.style.setProperty("--col", ease(span(PHASE.column, progress)).toFixed(4));
      scene.style.setProperty("--doc", ease(span(PHASE.record, progress)).toFixed(4));
      // The right column sits under the panel until the panel has fully arrived.
      scene.classList.toggle("arrived", rise >= 1);

      const stepProgress = span(PHASE.steps, progress);
      const step =
        progress < PHASE.column[0] + 0.035 ? "intro" : String(Math.min(steps.length - 1, Math.floor(stepProgress * steps.length)));
      if (step !== lastStep) {
        lastStep = step;
        scene.dataset.step = step;
        const active = step === "intro" ? 0 : Number(step);
        steps.forEach((element, index) => {
          element.classList.toggle("active", index === active);
        });
      }
    };

    // Clicking a step scrolls to the middle of its slice.
    const buttons = [...scene.querySelectorAll<HTMLElement>("[data-go]")];
    const onGo = (event: Event) => {
      const index = Number((event.currentTarget as HTMLElement).dataset.go);
      const [from, to] = PHASE.steps;
      const target = from + ((index + 0.4) / steps.length) * (to - from);
      const travel = scene.offsetHeight - window.innerHeight;
      window.scrollTo({ top: scene.offsetTop + target * travel, behavior: "smooth" });
    };
    for (const button of buttons) button.addEventListener("click", onGo);

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
    return () => {
      for (const button of buttons) button.removeEventListener("click", onGo);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", update);
    };
  }, []);

  return null;
}
