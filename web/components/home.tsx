// Landing page sections between the pinned scene and the footer: one idea per screen, each screen a
// full-width band whose tone alternates (cream paper, white, deep green) so it reads as a new chapter.
// Facts come from the docs (fees, caps, windows, limits) or the chain (LiveFigures); the sample order
// and the tracker labels are labelled as samples. Update this copy when fees, caps or limits change.
// Art (web/public/art): public-domain paintings from Wikimedia Commons (Duerer, Bruegel, Patinir,
// Kalf) and images generated in their style (owl, couriers, instruments; scripts/generate-images.mjs),
// all shown in the brand's green duotone; the colour original appears through a dot mask on hover.
import Link from "next/link";
import { AgentPrompt, Loupe, OrderSelector, PillarCard, ScrollStage } from "@/components/homeInteractive";
import { LiveFigures } from "@/components/LiveFigures";

const REPO = "https://github.com/nuluviumhq/nuluvium";

const PILLARS = [
  { n: "01", title: "Shielded balance", art: "/art/card-shield.webp", text: "Your USDG sits in a Privacy Pools balance. A proof shows the funds are clean, and nothing links what comes next to your wallet." },
  { n: "02", title: "Fresh addresses", art: "/art/card-fresh.webp", text: "Every piece is bought from a new address made from your own keys. The relayer pays the gas, so you never fund them." },
  { n: "03", title: "Split and spread", art: "/art/card-split.webp", text: "One order becomes pieces of random size at random gaps, over the window you pick: 10 minutes to 6 hours." },
  { n: "04", title: "Proof afterwards", art: "/art/card-proof.webp", text: "Every piece is an ordinary public swap anyone can check. What nobody can see is that they belong together." },
];

/**
 * Tracker labels pinned to the hare (sample): where each label sits and the point of the painting
 * it points at, both in % of the frame.
 */
const TRACKERS = [
  { text: "0x4f9a…c21e · labelled “whale”", at: ["4%", "7%"], to: [60, 16] },
  { text: "Bought 8,000 USDG this week", at: ["62%", "28%"], to: [63, 52] },
  { text: "Every Monday at 14:31", at: ["3%", "52%"], to: [32, 48] },
  { text: "3 wallets copy every trade", at: ["52%", "80%"], to: [72, 84] },
] as const;

/** Crowd fragments (crops of the paintings): resting spot around the headline and where they fly in from. */
const FRAGMENTS: Array<{ src: string; x: string; y: string; w: string; dx: string; dy: string; you?: boolean }> = [
  { src: "/art/frag-1.webp", x: "6%", y: "14%", w: "13rem", dx: "-15vw", dy: "-10vh" },
  { src: "/art/frag-3.webp", x: "40%", y: "2%", w: "10rem", dx: "0vw", dy: "-22vh" },
  { src: "/art/frag-2.webp", x: "76%", y: "10%", w: "12rem", dx: "15vw", dy: "-12vh" },
  { src: "/art/frag-4.webp", x: "2%", y: "58%", w: "11rem", dx: "-17vw", dy: "5vh" },
  { src: "/art/frag-6.webp", x: "20%", y: "76%", w: "12rem", dx: "-10vw", dy: "20vh", you: true },
  { src: "/art/frag-8.webp", x: "62%", y: "78%", w: "10rem", dx: "8vw", dy: "20vh" },
  { src: "/art/frag-7.webp", x: "82%", y: "56%", w: "12rem", dx: "18vw", dy: "8vh" },
  { src: "/art/frag-5.webp", x: "88%", y: "32%", w: "8rem", dx: "15vw", dy: "0vh" },
];

const PROOFS: Array<{ title: string; text: string; link: string; href: string; external: boolean }> = [
  { title: "Open source", text: "Contracts, relayer, approved-set provider, SDK, MCP server and this site. Apache-2.0.", link: "Repository", href: REPO, external: true },
  { title: "Review notes", text: "Build and test everything, the static-analysis triage, and which key can do what.", link: "review.md", href: `${REPO}/blob/main/docs/review.md`, external: true },
  { title: "Approved sets", text: "Every set of approved deposits, published and checkable against the roots on chain.", link: "approved-sets", href: "https://github.com/nuluviumhq/approved-sets", external: true },
  { title: "Unchanged Privacy Pools", text: "The pool contracts and circuits are Privacy Pools v1.3.0, kept unchanged.", link: "Security", href: "/docs/security", external: false },
];

const AGENT_EXAMPLES = [
  "Buy 500 USDG of NVDA in five pieces over the next two hours.",
  "How much do I have ready to trade privately?",
  "Shield 200 USDG from my wallet.",
  "Stop the NVDA order; keep what already went out.",
  "Show me the pieces that went out today.",
];

export function HomeSections() {
  return (
    <div className="home-more">
      {/* 1. The problem: Duerer's hare, every hair visible, tracker labels pinned to it. */}
      <section className="screen tone-paper" data-reveal>
        <div className="wrap problem">
          <div className="screen-copy">
            <p className="mono">The problem</p>
            <h2 className="statement-title">Every hair<br />is visible.</h2>
            <p className="screen-lead">Every trade on Robinhood Chain is public and tied to the wallet that made it. Copiers repeat it. Trackers alert on it. Anyone can read an agent&#39;s rules from it.</p>
            <Link className="text-link mono-link" href="/why">Why it matters →</Link>
          </div>
          <Loupe base="/art/hare-duo.webp" color="/art/hare.webp" alt="Albrecht Duerer's Young Hare, every hair painted one by one" caption="Albrecht Dürer, Young Hare, 1502 · labels are a sample · move over it">
            <svg className="tracker-lines" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
              {TRACKERS.map((tracker, index) => (
                <line key={tracker.text} className={`t-${index}`} x1={Number.parseFloat(tracker.at[0]) + 2} y1={Number.parseFloat(tracker.at[1]) + 3} x2={tracker.to[0]} y2={tracker.to[1]} pathLength={1} style={{ ["--i" as string]: index }} />
              ))}
            </svg>
            {TRACKERS.map((tracker, index) => (
              <span key={tracker.text} className={`tracker-dot t-${index}`} style={{ left: `${tracker.to[0]}%`, top: `${tracker.to[1]}%`, ["--i" as string]: index }} aria-hidden="true" />
            ))}
            <ul className="trackers" aria-label="What a tracker sees (sample)">
              {TRACKERS.map((tracker, index) => (
                <li key={tracker.text} className={`t-${index}`} style={{ left: tracker.at[0], top: tracker.at[1], ["--i" as string]: index }}>{tracker.text}</li>
              ))}
            </ul>
          </Loupe>
        </div>
      </section>

      {/* 2. The product moment: the same order, two ways (plays itself once). */}
      <section className="screen tone-white" data-reveal>
        <div className="wrap">
          <div className="screen-head">
            <p className="mono">One order, two ways</p>
            <h2 className="statement-title">Pick how your order lands.</h2>
          </div>
          <OrderSelector />
        </div>
      </section>

      {/* 3. The four parts, as cards that dissolve into their text. */}
      <section className="screen tone-paper" data-reveal>
        <div className="wrap">
          <div className="screen-head">
            <p className="mono">How it works</p>
            <h2 className="statement-title">Four parts. One promise.</h2>
            <p className="screen-lead">Your trades don&#39;t trace back to you. Hover a card, or tap it, to read the part.</p>
          </div>
          <div className="pillars">
            {PILLARS.map((pillar) => (
              <PillarCard key={pillar.n} {...pillar} href="/product" />
            ))}
          </div>
        </div>
      </section>

      {/* 4. The crowd: fragments gather around the headline; "you" gets lost among them. */}
      <ScrollStage className="crowd-scene tone-green">
        <div className="crowd-pin">
          <div className="fragments">
            {FRAGMENTS.map((fragment) => (
              <span
                key={fragment.src}
                className={`fragment${fragment.you ? " you" : ""}`}
                style={{ ["--x" as string]: fragment.x, ["--y" as string]: fragment.y, ["--w" as string]: fragment.w, ["--dx" as string]: fragment.dx, ["--dy" as string]: fragment.dy }}
              >
                <img src={fragment.src} alt="" loading="lazy" />
                {fragment.you ? <span className="you-tag">You</span> : null}
              </span>
            ))}
          </div>
          <div className="crowd-copy">
            <p className="mono">Live on testnet</p>
            <h2 className="statement-title light">You hide<br />in the crowd.</h2>
            <LiveFigures />
          </div>
        </div>
      </ScrollStage>

      {/* 5. Agents: a clockwork owl that works on its own. */}
      <section className="screen tone-paper" data-reveal>
        <div className="wrap agents">
          <figure className="dots-reveal paper">
            <img src="/art/owl-duo.webp" alt="A brass clockwork owl with its chest open, showing the gears" loading="lazy" />
            <img className="color" src="/art/owl.webp" alt="" loading="lazy" />
            <figcaption>A clockwork owl, after Dürer · made for Nuluvium</figcaption>
          </figure>
          <div className="screen-copy">
            <p className="mono">For agents</p>
            <h2 className="statement-title">Your agent&#39;s strategy, kept to itself.</h2>
            <p className="screen-lead">One MCP server on the agent&#39;s own machine, listed on the official MCP Registry as com.nuluvium/mcp. It holds its own keys; Nuluvium never sees them.</p>
            <AgentPrompt command="npx -y @nuluvium/mcp" examples={AGENT_EXAMPLES} />
            <Link className="text-link mono-link" href="/for-agents">Set up an agent →</Link>
          </div>
        </div>
      </section>

      {/* 6. Plainly: what is private and from whom, over Patinir's crossing. */}
      <section className="screen plainly" data-reveal>
        <figure className="plainly-art">
          <img src="/art/charon-duo.webp" alt="Patinir's landscape: a small boat crossing a wide river between two shores" loading="lazy" />
          <figcaption>Joachim Patinir, Landscape with Charon Crossing the Styx, c. 1520–1524</figcaption>
        </figure>
        <div className="wrap plainly-inner">
          <h2 className="statement-title light">Plainly.</h2>
          <div className="plainly-cards">
            <article style={{ ["--i" as string]: 0 }}><span className="mono">Private</span><p>From other readers of the chain. Your pieces don&#39;t add up to you.</p></article>
            <article style={{ ["--i" as string]: 1 }}><span className="mono">Not private</span><p>From Robinhood. And each piece is still a public swap.</p></article>
            <article style={{ ["--i" as string]: 2 }}><span className="mono">Testnet</span><p>Not audited yet. Deposits capped at 1,000 USDG each, 25,000 in total.</p></article>
          </div>
          <Link className="text-link mono-link light" href="/docs/security">Read the security notes →</Link>
        </div>
      </section>

      {/* 7. Check our work: Kalf's still life, everything laid out to inspect. */}
      <section className="screen tone-white" data-reveal>
        <div className="wrap">
          <div className="screen-head">
            <p className="mono">Check our work</p>
            <h2 className="statement-title">Don&#39;t take our word for it.</h2>
          </div>
          <div className="proof-grid">
            <figure className="dots-reveal dark">
              <img src="/art/kalf-duo.webp" alt="Kalf's still life: glasses, a porcelain bowl, fruit and a peeled lemon on a draped table" loading="lazy" />
              <img className="color" src="/art/kalf.webp" alt="" loading="lazy" />
              <figcaption>Willem Kalf, Still Life, c. 1660</figcaption>
            </figure>
            <div className="proof-cards">
              {PROOFS.map((proof) => {
                const body = (
                  <>
                    <span className="proof-title">{proof.title}</span>
                    <span className="proof-text">{proof.text}</span>
                    <span className="proof-link">{proof.link}<span className="arrow" aria-hidden="true">→</span></span>
                  </>
                );
                return proof.external ? (
                  <a key={proof.title} className="proof-card" href={proof.href}>{body}</a>
                ) : (
                  <Link key={proof.title} className="proof-card" href={proof.href}>{body}</Link>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      {/* 8. Start, then a frieze of couriers leading into the footer. */}
      <section className="screen tone-paper last" data-reveal>
        <div className="wrap">
          <div className="start-panel">
            <p className="mono">Start on testnet</p>
            <h2 className="statement-title light">Your first private order<br />takes a few minutes.</h2>
            <ol className="start-line">
              <li><span className="n">01</span>Get free test funds</li>
              <li><span className="n">02</span>Shield test USDG</li>
              <li><span className="n">03</span>Clean-funds check, a minute or two</li>
              <li><span className="n">04</span>Route your first order</li>
            </ol>
            <div className="start-actions">
              <Link className="button light" href="/app">Go to app</Link>
              <Link className="text-link mono-link light" href="/docs/faq">Questions first? Read the FAQ →</Link>
            </div>
          </div>
        </div>
        <figure className="frieze" aria-hidden="true">
          <img src="/art/frieze.webp" alt="" loading="lazy" />
        </figure>
      </section>
    </div>
  );
}
