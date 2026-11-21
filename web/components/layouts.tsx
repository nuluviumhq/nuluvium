// Per-page layout pieces for the inner site pages, in four patterns (A Library, B Rulebook,
// C Network, D Ledger). The system stays the same; each page gets its own hero,
// width and one signature component. Styles: "inner-page layouts" block at the end of globals.css.

import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowIcon } from "@/components/icons";

/**
 * Giant staggered headline (pattern C): three lines, the middle one pushed right.
 * Lines rise in one after another, like the landing hero.
 */
export function GiantHero({ kicker, lines, lead, action }: { kicker: string; lines: [string, string, string]; lead: string; action: ReactNode }) {
  return (
    <section className="giant-hero">
      <p className="mono soft">{kicker}</p>
      <h1>
        {lines.map((line, index) => (
          <span key={line} className={index === 1 ? "line indent" : "line"}>
            <span style={{ animationDelay: `${index * 0.12}s` }}>{line}</span>
          </span>
        ))}
      </h1>
      <div className="after">
        <p className="lead">{lead}</p>
        {action}
      </div>
    </section>
  );
}

/** One big filled call to action: title, one line under it, arrow (pattern A). */
export function ButtonCard({ href, title, note }: { href: string; title: string; note: string }) {
  return (
    <Link className="button-card" href={href}>
      <span><strong>{title}</strong><small>{note}</small></span>
      <ArrowIcon />
    </Link>
  );
}

/** Three mono facts between two hairlines (pattern B). */
export function MetaStrip({ items }: { items: string[] }) {
  return (
    <p className="meta-strip mono">
      {items.map((item) => <span key={item}>{item}</span>)}
    </p>
  );
}

/** A label and a row of facts that scrolls sideways without end (pattern A). Pauses on hover. */
export function TickerStrip({ label, items }: { label: string; items: Array<[string, string]> }) {
  const row = (hidden: boolean) => (
    <span className="run" aria-hidden={hidden || undefined}>
      {items.map(([key, value]) => (
        <span className="item" key={key}><span className="k">{key}</span><span className="v">{value}</span></span>
      ))}
    </span>
  );
  return (
    <div className="ticker-strip">
      <span className="label mono">{label}</span>
      <div className="track-wrap">
        {/* The row is drawn twice so the loop has no seam; the copy is hidden from screen readers. */}
        <div className="track">{row(false)}{row(true)}</div>
      </div>
    </div>
  );
}

/** Round seal for split heroes: the logo mark inside a ring of mono text (pattern B). */
export function Seal({ text }: { text: string }) {
  return (
    <div className="doc-seal" aria-hidden="true">
      <svg viewBox="0 0 200 200" aria-hidden="true">
        <defs><path id="seal-ring" d="M100 100m-78 0a78 78 0 1 1 156 0a78 78 0 1 1-156 0" /></defs>
        <circle cx="100" cy="100" r="96" className="outer" />
        <circle cx="100" cy="100" r="64" className="inner" />
        <text><textPath href="#seal-ring">{text}</textPath></text>
      </svg>
      <img src="/brand/mark.png" alt="" width={80} height={80} />
    </div>
  );
}

/** Note with a bar on its left, under a block (pattern B). */
export function Footnote({ children }: { children: ReactNode }) {
  return <p className="footnote">{children}</p>;
}

/** Two halves side by side, the second tinted, with label/value rows (pattern B). */
export function CompareCard({ sides }: { sides: Array<{ numeral: string; title: string; text: string; rows: Array<[string, string]> }> }) {
  return (
    <div className="compare-card">
      {sides.map((side) => (
        <div key={side.title}>
          <p className="numeral">{side.numeral}</p>
          <h3>{side.title}</h3>
          <p>{side.text}</p>
          <dl>
            {side.rows.map(([label, value]) => (
              <div key={label}><dt>{label}</dt><dd>{value}</dd></div>
            ))}
          </dl>
        </div>
      ))}
    </div>
  );
}

/** Notched card with dashed rules: a worked-out figure, like a receipt (pattern B). */
export function ReceiptCard({ title, rows, foot }: { title: string; rows: Array<[string, string]>; foot: [string, string] }) {
  return (
    <div className="receipt-card">
      <p className="head"><span className="mono">{title}</span><span className="star" aria-hidden="true">✳</span></p>
      <dl>
        {rows.map(([label, value]) => (
          <div key={label}><dt>{label}</dt><dd>{value}</dd></div>
        ))}
      </dl>
      <p className="foot mono"><span>{foot[0]}</span><span>{foot[1]}</span></p>
    </div>
  );
}

const ICONS = {
  eye: <><path d="M2 12s3.6-6 10-6 10 6 10 6-3.6 6-10 6S2 12 2 12Z" /><circle cx="12" cy="12" r="3" /></>,
  lock: <><rect x="4.5" y="10.5" width="15" height="10" rx="1.5" /><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" /></>,
  crowd: <><circle cx="8" cy="9" r="3" /><circle cx="16.5" cy="9.5" r="2.5" /><path d="M2.5 19.5c.8-3 3-4.5 5.5-4.5s4.7 1.5 5.5 4.5M14 15.2c2.6-.6 5 .8 6 3.8" /></>,
  flag: <><path d="M5 21V4" /><path d="M5 4.5h11l-2 3.5 2 3.5H5" /></>,
} as const;

/** Two-by-two grid of short points, each with a line icon (pattern B). */
export function IconGrid({ items }: { items: Array<{ icon: keyof typeof ICONS; title: string; children: ReactNode }> }) {
  return (
    <div className="icon-grid">
      {items.map((item) => (
        <div key={item.title}>
          <svg viewBox="0 0 24 24" aria-hidden="true">{ICONS[item.icon]}</svg>
          <h3>{item.title}</h3>
          {item.children}
        </div>
      ))}
    </div>
  );
}

/** Large two-column row: serif label on the left, text on the right (pattern C). */
export function BigRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="big-row">
      <h3>{label}</h3>
      <div>{children}</div>
    </div>
  );
}

/** Checkerboard of tiles (pattern C): labelled link tiles, picture tiles and empty cells. */
export type Tile = { label: string; href: string } | { art: string } | null;
export function TileBoard({ tiles }: { tiles: Tile[] }) {
  return (
    <div className="tile-board">
      {tiles.map((tile, index) => {
        if (!tile) return <span key={index} className="gap" aria-hidden="true" />;
        if ("art" in tile) return <span key={index} className="art" aria-hidden="true" style={{ backgroundImage: `url(${tile.art})` }} />;
        return (
          <Link key={index} className={index % 3 === 0 ? "tile-link deep" : "tile-link"} href={tile.href}>
            <span>{tile.label}</span>
            <span className="go"><ArrowIcon /></span>
          </Link>
        );
      })}
    </div>
  );
}

/**
 * Legal page as a short rulebook (pattern B): kicker, title, meta strip, the placeholder note as a
 * footnote, and a list of the sections beside the text, like the Docs.
 */
export function LegalPage({ draft, title, lead, notice, sections }: { draft: string; title: string; lead: string; notice: string; sections: Array<{ title: string; text: ReactNode }> }) {
  const number = (index: number) => String(index + 1).padStart(2, "0");
  return (
    <div className="wrap docs legal">
      <aside className="docs-nav">
        <p className="mono">On this page</p>
        <nav aria-label={title}>
          {sections.map((section, index) => (
            <a key={section.title} href={`#section-${number(index)}`}>
              <span className="n">{number(index)}</span>
              <span className="t">{section.title}</span>
            </a>
          ))}
        </nav>
      </aside>
      <main className="doc">
        <p className="mono">Nuluvium · {title}</p>
        <h1 className="display">{title}</h1>
        <p className="lead">{lead}</p>
        <MetaStrip items={[draft, `${sections.length} sections`, "Testnet"]} />
        <p className="footnote top">{notice}</p>
        {sections.map((section, index) => (
          <section key={section.title} id={`section-${number(index)}`}>
            <h2><span className="n">{number(index)}</span>{section.title}</h2>
            <p>{section.text}</p>
          </section>
        ))}
        <p className="doc-links"><Link className="text-link" href="/">Back to the site</Link> · <Link className="text-link" href="/terms">Terms</Link> · <Link className="text-link" href="/privacy">Privacy</Link></p>
      </main>
    </div>
  );
}
