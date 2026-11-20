"use client";

// Interactive pieces of the landing sections (components/home.tsx). Each one renders readable
// content without JavaScript; the script only adds the motion and the interaction.
// Art is shown in the brand's green duotone; the colour original appears through a dot mask
// (the .dots-reveal styles), as if only the viewer gets to see the detail.
import { useEffect, useRef, useState } from "react";

const lessMotion = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * A duotone painting with a loupe that follows the pointer and shows the colour original, magnified
 * (mouse and pen only; on touch the painting is shown as is).
 */
export function Loupe({ base, color, alt, zoom = 2.2, caption, children }: { base: string; color: string; alt: string; zoom?: number; caption: string; children?: React.ReactNode }) {
  const frame = useRef<HTMLElement>(null);
  const lens = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const element = frame.current;
    const glass = lens.current;
    if (!element || !glass) return;
    const move = (event: PointerEvent) => {
      if (event.pointerType === "touch") return;
      const rect = element.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      glass.style.setProperty("--x", `${x}px`);
      glass.style.setProperty("--y", `${y}px`);
      // The point under the pointer sits in the middle of the lens.
      glass.style.backgroundSize = `${rect.width * zoom}px ${rect.height * zoom}px`;
      glass.style.backgroundPosition = `${glass.offsetWidth / 2 - x * zoom}px ${glass.offsetHeight / 2 - y * zoom}px`;
      element.classList.add("looking");
    };
    const leave = () => element.classList.remove("looking");
    element.addEventListener("pointermove", move);
    element.addEventListener("pointerleave", leave);
    return () => {
      element.removeEventListener("pointermove", move);
      element.removeEventListener("pointerleave", leave);
    };
  }, [zoom]);

  return (
    <figure className="loupe" ref={frame}>
      <img src={base} alt={alt} loading="lazy" />
      <span className="lens" ref={lens} style={{ backgroundImage: `url(${color})` }} aria-hidden="true" />
      {children}
      <figcaption>{caption}</figcaption>
    </figure>
  );
}

const TIMES = ["14:38", "15:02", "15:29", "15:51", "16:17"];
const AMOUNTS = ["96.40", "112.15", "88.70", "104.30", "98.45"];
/** Minutes after 14:31 of each piece in the sample 2 h window. */
const OFFSETS = [7, 31, 58, 80, 106];

const WAYS = {
  wallet: {
    label: "From one wallet",
    art: { base: "/art/babel-duo.webp", color: "/art/babel.webp", alt: "Bruegel's Tower of Babel: one huge building that everyone can see" },
    caption: "Pieter Bruegel the Elder, The Tower of Babel, 1563",
    facts: [["Linked to you", "Yes"], ["Size", "500 USDG, one swap"], ["Timing", "14:31, to the minute"]],
    line: "One swap from your wallet. Anyone can see who bought, how much and when, next to everything you did before.",
  },
  nuluvium: {
    label: "Through Nuluvium",
    art: { base: "/art/couriers-duo.webp", color: "/art/couriers.webp", alt: "Couriers leaving one house at once, each with one parcel, on different roads" },
    caption: "Couriers, after Bruegel · made for Nuluvium",
    facts: [["Linked to you", "No"], ["Size", "5 pieces, 5 fresh addresses"], ["Timing", "Random gaps over 2 h"]],
    line: "Five ordinary swaps from five fresh addresses. Nothing links them to each other, or to you. Relayer fee: 0.50 USDG.",
  },
} as const;
type Way = keyof typeof WAYS;

/** "Pick how your order lands": switches one sample order between a public wallet and Nuluvium. */
export function OrderSelector() {
  const [way, setWay] = useState<Way>("wallet");
  const touched = useRef(false);
  const root = useRef<HTMLDivElement>(null);
  const current = WAYS[way];

  // Plays itself once: shortly after the selector comes into view, the order switches to Nuluvium
  // and splits into pieces, unless the visitor has already picked a side.
  useEffect(() => {
    const element = root.current;
    if (!element || lessMotion()) return;
    let timer = 0;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        observer.disconnect();
        timer = window.setTimeout(() => {
          if (!touched.current) setWay("nuluvium");
        }, 2200);
      },
      { threshold: 0.6 },
    );
    observer.observe(element);
    return () => {
      observer.disconnect();
      window.clearTimeout(timer);
    };
  }, []);

  const pick = (key: Way) => {
    touched.current = true;
    setWay(key);
  };

  return (
    <div className={`order-selector way-${way}`} ref={root}>
      <div className="selector-tabs" role="tablist" aria-label="How the sample order lands">
        {(Object.keys(WAYS) as Way[]).map((key) => (
          <button key={key} type="button" role="tab" aria-selected={way === key} className={way === key ? "on" : undefined} onClick={() => pick(key)}>
            <span className="tab-dot" aria-hidden="true" />
            {WAYS[key].label}
          </button>
        ))}
      </div>
      <div className="selector-stage" role="tabpanel" aria-label={current.label}>
        <figure className="selector-art">
          {(Object.keys(WAYS) as Way[]).map((key) => (
            <span key={key} className={`art-layer${way === key ? " on" : ""}`} aria-hidden={way !== key}>
              <img src={WAYS[key].art.base} alt={WAYS[key].art.alt} loading="lazy" />
              <img className="color" src={WAYS[key].art.color} alt="" loading="lazy" />
            </span>
          ))}
          <figcaption>{current.caption}</figcaption>
        </figure>
        <div className="selector-panel">
          <p className="mono soft">Sample · buy 500 USDG of NVDA</p>
          <div className="order-track" aria-hidden="true">
            {OFFSETS.map((offset, index) => (
              <span
                key={offset}
                className="piece"
                style={{ ["--x" as string]: `${(offset / 120) * 100}%`, ["--h" as string]: `${Number(AMOUNTS[index]) / 1.4}%`, ["--i" as string]: index }}
                title={`${AMOUNTS[index]} USDG at ${TIMES[index]}`}
              />
            ))}
            <span className="axis"><span>14:31</span><span>16:31</span></span>
          </div>
          <dl className="selector-facts">
            {current.facts.map(([term, value]) => (
              <div key={term}>
                <dt>{term}</dt>
                <dd key={`${way}-${value}`}>{value}</dd>
              </div>
            ))}
          </dl>
          <p key={way} className="selector-line">{current.line}</p>
        </div>
      </div>
    </div>
  );
}

/** A pillar card: duotone art that dissolves into its text on hover or focus, or on tap. */
export function PillarCard({ n, title, art, text, href }: { n: string; title: string; art: string; text: string; href: string }) {
  const [open, setOpen] = useState(false);
  return (
    <article className={`pillar${open ? " open" : ""}`} onPointerUp={(event) => event.pointerType === "touch" && setOpen((value) => !value)}>
      <img src={art} alt="" loading="lazy" />
      <div className="pillar-label"><span className="n">{n}</span>{title}</div>
      <div className="pillar-body">
        <span className="n">{n}</span>
        <h3>{title}</h3>
        <p>{text}</p>
        <a className="button light" href={href}>Read how</a>
      </div>
    </article>
  );
}

/** Copy pill for the MCP command, and plain-words requests that change every few seconds. */
export function AgentPrompt({ command, examples }: { command: string; examples: string[] }) {
  const [copied, setCopied] = useState(false);
  const [index, setIndex] = useState(0);
  useEffect(() => {
    if (lessMotion()) return;
    const timer = window.setInterval(() => setIndex((value) => (value + 1) % examples.length), 3400);
    return () => window.clearInterval(timer);
  }, [examples.length]);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(command);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard can be blocked; the command stays selectable.
    }
  };
  return (
    <div className="agent-prompt">
      <div className="command-pill">
        <code>{command}</code>
        <button type="button" className={copied ? "done" : undefined} onClick={copy}>{copied ? "Copied" : "Copy"}</button>
      </div>
      <p className="ask">
        <span className="mono soft">Then ask your agent</span>
        <span key={index} className="said">&ldquo;{examples[index]}&rdquo;</span>
      </p>
    </div>
  );
}

/** Counts a number up from zero the first time it scrolls into view (instantly with reduced motion). */
export function CountUp({ value }: { value: number }) {
  const [shown, setShown] = useState(0);
  const element = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const target = element.current;
    if (!target) return;
    if (lessMotion()) {
      setShown(value);
      return;
    }
    let frame = 0;
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return;
      observer.disconnect();
      const startedAt = performance.now();
      const tick = (now: number) => {
        const progress = Math.min(1, (now - startedAt) / 1400);
        setShown(Math.round(value * (1 - (1 - progress) ** 3)));
        if (progress < 1) frame = requestAnimationFrame(tick);
      };
      frame = requestAnimationFrame(tick);
    });
    observer.observe(target);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [value]);
  return <span ref={element}>{shown.toLocaleString("en-US")}</span>;
}

/**
 * A tall section whose stage stays pinned while it scrolls: sets --p (0 to 1) on the section so the
 * stylesheet can move the crowd fragments in from the edges. With reduced motion --p stays at 1.
 */
export function ScrollStage({ className, children }: { className: string; children: React.ReactNode }) {
  const section = useRef<HTMLElement>(null);
  useEffect(() => {
    const element = section.current;
    if (!element) return;
    if (lessMotion()) {
      element.style.setProperty("--p", "1");
      return;
    }
    let queued = false;
    const update = () => {
      queued = false;
      const rect = element.getBoundingClientRect();
      const travel = rect.height - window.innerHeight;
      const progress = travel <= 0 ? 1 : Math.min(1, Math.max(0, -rect.top / travel));
      element.style.setProperty("--p", progress.toFixed(3));
    };
    const onScroll = () => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);
  return <section className={className} ref={section}>{children}</section>;
}
