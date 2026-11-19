// Shared parts of the site pages (landing, Product, Why, Agents, legal pages, 404).
// Markup ported from prototype/*.html; styles in app/globals.css (prototype/styles.css).

import Link from "next/link";
import type { CSSProperties } from "react";

type Section = "agents" | "product" | "why" | "docs";

/** Banner shown on the landing page only. */
export function Banner() {
  return (
    <Link className="banner" href="/app">
      <span>Nuluvium runs on testnet with test tokens. Figures on this site are examples</span>
      <span aria-hidden="true">→</span>
    </Link>
  );
}

/**
 * Site header. The default wordmark folds to its first letter on scroll (SiteBehaviour);
 * `solid` is the plain variant used on the legal pages and the 404.
 */
export function SiteHeader({ current, solid = false }: { current?: Section; solid?: boolean }) {
  const link = (section: Section, href: string, label: string) => (
    <Link className="link" href={href} aria-current={current === section ? "page" : undefined}>
      {label}
    </Link>
  );
  return (
    <header className={solid ? "site-header solid" : "site-header"}>
      <div className="wrap">
        {/* The logo mark sits before the wordmark; decorative, the wordmark carries the name. */}
        <Link className="brand-mark" href="/" aria-hidden="true" tabIndex={-1}>
          <img src="/brand/mark.png" alt="" width={80} height={80} />
        </Link>
        {solid ? (
          <Link className="wordmark" href="/">Nuluvium</Link>
        ) : (
          <Link className="wordmark" href="/" aria-label="Nuluvium">
            N<span className="rest">uluvium</span>
          </Link>
        )}
        <nav className="site-nav" aria-label="Main">
          {link("agents", "/for-agents", "Agents")}
          {link("product", "/product", "Product")}
          {link("why", "/why", "Why")}
          {link("docs", "/docs", "Docs")}
          <Link className="button" href="/app">Go to app</Link>
        </nav>
      </div>
    </header>
  );
}

// Live tile field of the agents card: [background position, animation delay] per filled tile.
const TILES: Array<[string, string] | null> = [["32% 34%", "0.0s"], null, null, ["36% 52%", "-1.8s"], ["49% 38%", "-2.4s"], ["63% 54%", "-3.0s"], null, ["53% 55%", "0.0s"], ["67% 41%", "-0.6s"], ["44% 57%", "-1.2s"], ["57% 43%", "-1.8s"], ["35% 59%", "-2.4s"], null, ["61% 61%", "-3.6s"], null, ["52% 63%", "-0.6s"], ["65% 48%", "-1.2s"], ["42% 34%", "-1.8s"], ["56% 50%", "-2.4s"], ["33% 36%", "-3.0s"], ["46% 52%", "-3.6s"], ["60% 38%", "0.0s"], ["37% 54%", "-0.6s"], ["50% 40%", "-1.2s"], ["64% 56%", "-1.8s"], ["41% 42%", "-2.4s"], null, ["68% 43%", "-3.6s"], null, null, ["36% 61%", "-1.2s"], ["49% 47%", "-1.8s"], ["62% 63%", "-2.4s"], ["40% 49%", "-3.0s"], ["53% 35%", "-3.6s"], null, ["44% 36%", "-0.6s"], null, ["34% 38%", "-1.8s"], ["47% 54%", "-2.4s"], ["61% 40%", "-3.0s"], ["38% 56%", "-3.6s"], ["51% 42%", "0.0s"], null, ["42% 44%", "-1.2s"]];

/** The two closing cards that swap roles on hover (SiteBehaviour), shared by the main pages. */
export function ClosingCards() {
  return (
    <section className="closing" id="closing">
      {/* biome-ignore lint/a11y/noNoninteractiveTabindex: the cards open on focus (SiteBehaviour), so keyboards can reach their content */}
      <article className="card open" id="why" tabIndex={0}>
        <h2 className="title">What a public order gives away</h2>
        <div className="wide">
          <p className="lead">A public wallet shows its whole history: every trade, its size and its timing. Trades routed through Nuluvium don&#39;t trace back to you.</p>
          <p className="push"><Link className="button outline" href="/app/trade">Try an order</Link></p>
          {/* The shielded pool as a diagram: every small cube is a deposit; the solid one is yours. */}
          <svg className="pool-diagram" viewBox="0 0 400 330" aria-hidden="true">
            <defs>
              <pattern id="dot-grid" width="9" height="9" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r="0.7" /></pattern>
              <clipPath id="pool-shape"><path d="M178 14L318 96L336 236L226 322L58 258L98 118Z" /></clipPath>
              <symbol id="wire-cube" viewBox="0 0 20 22" width="16" height="17.6" overflow="visible">
                <path d="M10 1L19 6V16L10 21L1 16V6Z" style={{ fill: "var(--cube-fill, #fff)", stroke: "rgba(12, 54, 40, 0.6)", strokeWidth: "1", strokeLinejoin: "round" } as CSSProperties} />
                <path d="M1 6L10 11L19 6M10 11V21" style={{ fill: "none", stroke: "var(--cube-line, rgba(12, 54, 40, 0.6))", strokeWidth: "1", strokeLinejoin: "round" } as CSSProperties} />
              </symbol>
            </defs>
            <rect className="dots" width="400" height="330" fill="url(#dot-grid)" clipPath="url(#pool-shape)" />
            <path className="outline" d="M178 14L318 96L336 236L226 322L58 258L98 118Z" />
            <g className="cubes">
              <use href="#wire-cube" x="196" y="96" style={{ animationDelay: "0.0s" }} />
              <use href="#wire-cube" x="150" y="132" style={{ animationDelay: "-0.7s" }} />
              <use href="#wire-cube" x="232" y="150" className="mine" style={{ animationDelay: "-1.4s" }} />
              <use href="#wire-cube" x="118" y="182" style={{ animationDelay: "-2.1s" }} />
              <use href="#wire-cube" x="176" y="190" style={{ animationDelay: "-2.8s" }} />
              <use href="#wire-cube" x="262" y="204" style={{ animationDelay: "-3.5s" }} />
              <use href="#wire-cube" x="214" y="236" style={{ animationDelay: "-4.2s" }} />
              <use href="#wire-cube" x="142" y="246" style={{ animationDelay: "-4.9s" }} />
              <use href="#wire-cube" x="292" y="258" style={{ animationDelay: "-5.6s" }} />
              <use href="#wire-cube" x="96" y="268" style={{ animationDelay: "-6.3s" }} />
              <use href="#wire-cube" x="246" y="286" style={{ animationDelay: "-7.0s" }} />
              <use href="#wire-cube" x="180" y="292" style={{ animationDelay: "-7.7s" }} />
            </g>
            <g className="nodes">
              <rect x="174.5" y="10.5" width="7" height="7" /><rect x="314.5" y="92.5" width="7" height="7" />
              <rect x="332.5" y="232.5" width="7" height="7" /><rect x="54.5" y="254.5" width="7" height="7" />
              <rect x="94.5" y="114.5" width="7" height="7" />
            </g>
          </svg>
        </div>
        <Link className="narrow" href="/app/trade" tabIndex={-1}>Try an order <span aria-hidden="true">→</span></Link>
      </article>
      {/* biome-ignore lint/a11y/noNoninteractiveTabindex: as above */}
      <article className="card" id="agents" tabIndex={0}>
        <h2 className="title">For agents</h2>
        <div className="wide">
          <p className="lead">An agent that trades from one wallet publishes its strategy. With one tool call, Nuluvium routes its orders from fresh addresses instead.</p>
          <p className="push"><Link className="button outline" href="/app/agents">Connect an agent</Link></p>
          {/* Every tile is an order an agent placed; nobody can tell which agent, or why. */}
          <div className="tile-art" aria-hidden="true">
            {TILES.map((tile, index) =>
              tile ? (
                <i key={index} className="m" style={{ backgroundPosition: tile[0], animationDelay: tile[1] }} />
              ) : (
                <i key={index} />
              ),
            )}
          </div>
        </div>
        <Link className="narrow" href="/app/agents" tabIndex={-1}>Connect an agent <span aria-hidden="true">→</span></Link>
      </article>
    </section>
  );
}

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="bleed">
        {/* Footer painting: generated with scripts/generate-images.mjs. */}
        <div className="painting dusk footer-art">
          {/* eslint-disable-next-line @next/next/no-img-element -- decorative painting, sized by CSS */}
          <img className="art" src="/assets/footer.jpg" alt="" />
          <div className="inner top">
            <h2>The privacy layer for<br />onchain stocks</h2>
            <nav aria-label="Footer"><Link href="/for-agents">Agents</Link><Link href="/product">Product</Link><Link href="/why">Why</Link><Link href="/docs">Docs</Link><Link href="/stats">Stats</Link></nav>
          </div>
          <div className="dash"></div>
          <div className="inner bottom">
            <div>
              <span className="wordmark">Nuluvium</span>
              <p className="legal">© 2026 Nuluvium<i>·</i><Link href="/terms">Terms</Link><i>·</i><Link href="/privacy">Privacy</Link><i>·</i><Link href="/app/proof">Known limits</Link><i>·</i>Testnet, test tokens<i>·</i>Not affiliated with Robinhood</p>
            </div>
            <p className="legal"><a href="https://x.com/nuluviumhq" target="_blank" rel="noreferrer">X</a><i>·</i><a href="https://github.com/nuluviumhq/nuluvium" target="_blank" rel="noreferrer">GitHub</a><i>·</i><Link href="/app/proof">Contracts</Link></p>
          </div>
        </div>
      </div>
    </footer>
  );
}


