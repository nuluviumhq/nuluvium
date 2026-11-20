// Ported from prototype/index.html.
import type { Metadata } from "next";
import { LandingScene, StatementWords } from "@/components/LandingScene";
import { SiteBehaviour } from "@/components/SiteBehaviour";
import { SiteHeader, Banner, SiteFooter } from "@/components/site";
import { HomeSections } from "@/components/home";
import { INTRO_SCRIPT, IntroCurtain } from "@/components/IntroCurtain";

export const metadata: Metadata = {
  title: { absolute: "Nuluvium | The privacy layer for onchain stocks" },
  description: "Nuluvium is the privacy layer for onchain stocks on Robinhood Chain. Trades by you or your agents don't trace back to you.",
};

// The statement lights up word by word as the scene scrolls (LandingScene).
const STATEMENT = [
  "Every trade on Robinhood Chain is public once it lands. Wallet, size and timing, tied to everything that wallet has ever done.",
  "For an agent, that history is its strategy, published one trade at a time for anyone to follow, copy or trade against. Onchain stocks had no way to trade without leaving that trail."
];

export default function Page() {
  return (
    <>
      {/* Runs before first paint: decides whether the opening sequence plays (IntroCurtain). */}
      {/* biome-ignore lint/security/noDangerouslySetInnerHtml: a fixed string from IntroCurtain, no user input */}
      <script dangerouslySetInnerHTML={{ __html: INTRO_SCRIPT }} />
      <IntroCurtain />
      <Banner />
      <SiteHeader />
      <main>
          <section className="hero-section">
              {/* Hero painting: generated with scripts/generate-images.mjs (gpt-image-2), no text in the image. */}
              <div className="painting hero">
                {/* Silent looping video (Grok, from the hero painting; plays forward then backward so the loop has no seam).
                     The poster is its first frame, shown until the video can play. */}
                {/* biome-ignore lint/a11y/noAriaHiddenOnFocusable: decorative muted loop without controls; it never takes focus */}
                <video className="art" id="hero-video" autoPlay muted loop playsInline preload="auto" poster="/assets/hero-poster.jpg" aria-hidden="true">
                  <source src="/assets/hero.mp4" type="video/mp4" />
                </video>
                <div className="inner">
                <h1 className="display">
                  <span className="line"><span>The privacy layer for</span></span>
                  <span className="line"><span>onchain stocks</span></span>
                </h1>
                <div className="rule"></div>
                <div className="below">
                  <p className="lead">Your trades don&#39;t trace back to you. Nuluvium routes orders for your agents, and for you, through fresh addresses funded from a shielded balance.</p>
                  <a className="button light" href="#product">How it works</a>
                </div>
                </div>
              </div>
          </section>

          <div className="wrap">
            <section className="markets" aria-label="Markets at launch">
              <p className="mono">Markets at launch</p>
              <p className="name">NVDA</p>
              <p className="name">TSLA</p>
              <p className="name">SPY</p>
            </section>
          </div>

          {/* One pinned scene, driven by scroll (scene.js). Order of events, as on the reference:
               the statement lights up word by word, the panel rises on the right, the panel travels
               left over the statement, then the steps open one at a time. */}
          <section className="scene" id="product" data-step="intro">
            <div className="pin">
              <div className="frame">
                <div className="statement" id="statement">
                  <StatementWords paragraphs={STATEMENT} />
                </div>

                <div className="panel" aria-hidden="true">
                  <div className="halo"></div>
                  <svg aria-hidden="true" className="lines build" viewBox="0 0 928 800" preserveAspectRatio="xMidYMid slice">
                    <path d="M464 0V800" />
                    <path d="M464 400L40 -24M464 400L888 -24M464 400L40 824M464 400L888 824" />
                    <path className="fine" d="M70 250Q464 470 858 250M70 550Q464 330 858 550" />
                    <path d="M350 262H578M350 262V322M578 262V322M600 290V546M578 290H608M578 546H608" />
                  </svg>
                  <svg aria-hidden="true" className="lines ring" viewBox="0 0 928 800" preserveAspectRatio="xMidYMid slice">
                    <circle cx="464" cy="400" r="300" />
                    <path d="M464 0V800M0 400H928M464 400L64 170M464 400L864 170M464 400L64 630M464 400L864 630" />
                  </svg>
                  <svg aria-hidden="true" className="lines hex" viewBox="0 0 928 800" preserveAspectRatio="xMidYMid slice">
                    <path d="M464 190L646 295V505L464 610L282 505V295Z" />
                    <path d="M464 130L698 265V535L464 670L230 535V265Z" />
                    <path d="M464 190V610M282 295L646 505M646 295L282 505" />
                  </svg>
                  <span className="measure w">Shielded</span>
                  <span className="measure h">Unlinked</span>

                  <div className="pebbles">
                    <div><img src="/assets/stone.jpg" alt="" /></div>
                    <div><img src="/assets/stone.jpg" alt="" /></div>
                    <div><img src="/assets/stone.jpg" alt="" /></div>
                    <div><img src="/assets/stone.jpg" alt="" /></div>
                    <div className="mine"><img src="/assets/stone.jpg" alt="" /></div>
                    <div><img src="/assets/stone.jpg" alt="" /></div>
                    <div><img src="/assets/stone.jpg" alt="" /></div>
                    <div><img src="/assets/stone.jpg" alt="" /></div>
                    <div><img src="/assets/stone.jpg" alt="" /></div>
                    <div><img src="/assets/stone.jpg" alt="" /></div>
                    <div><img src="/assets/stone.jpg" alt="" /></div>
                    <div><img src="/assets/stone.jpg" alt="" /></div>
                  </div>

                  <div className="stone">
                    <img src="/assets/stone.jpg" alt="" />
                    <i className="node a"></i><i className="node b"></i><i className="node c"></i>
                  </div>

                  <div className="tag t1">
                    <div className="head"><span>Shielded balance</span><span className="chip">5,000</span></div>
                    <div className="foot"><span>Not linked to your wallet</span></div>
                  </div>
                  <div className="tag t2">
                    <div className="head"><span>Fresh address A</span><span className="chip">P-01</span></div>
                    <div className="foot"><span>Buys 11.37 NVDA at 14:58</span></div>
                  </div>
                  <div className="tag t3">
                    <div className="head"><span>Fresh address B</span><span className="chip">P-02</span></div>
                    <div className="foot"><span>Buys 11.37 NVDA at 16:23</span></div>
                  </div>

                  <article className="record">
                    <div className="cap">
                      <span className="seal"><i>N</i></span>
                      <p>Routing record</p>
                      <span className="thumb"><img src="/assets/stone.jpg" alt="" /></span>
                    </div>
                    <p className="bar">Not linked to you</p>
                    <div className="cells">
                      <div className="cell"><div>Your wallet<span>R-01</span></div></div>
                      <div className="cell"><div>Agent key<span>R-02</span></div></div>
                      <div className="cell"><div>Total size<span>R-03</span></div></div>
                      <div className="cell"><div>Time window<span>R-04</span></div></div>
                      <div className="cell"><div>Shielded balance<span>R-05</span></div></div>
                      <div className="cell"><div>Clean-funds proof<span>R-06</span></div></div>
                    </div>
                    <p className="bar">Public on chain*</p>
                    <div className="cells three">
                      <div className="cell"><div>Piece 1, address A<span>01</span></div></div>
                      <div className="cell"><div>Piece 2, address B<span>02</span></div></div>
                      <div className="cell"><div>Piece 3, address C<span>03</span></div></div>
                    </div>
                    <p className="note">*Each piece is an ordinary swap on a public pool that anyone can check. Nothing links the pieces to each other or to you.</p>
                    <p className="sign">Nuluvium</p>
                  </article>
                </div>

                <div className="right">
                  <p className="intro">That is what Nuluvium is for.</p>
                  <div className="steps">
                    <article className="step active">
                      <button type="button" data-go="0"><span className="n">01</span><span className="t">Shield</span></button>
                      <div className="body"><div><p>Move USDG into your shielded balance. A proof shows the funds are clean, and nothing links what happens next to your wallet.</p></div></div>
                    </article>
                    <article className="step">
                      <button type="button" data-go="1"><span className="n">02</span><span className="t">Split</span></button>
                      <div className="body"><div><p>You or your agent set the size and a time window. The order is cut into pieces, and each piece gets its own fresh address.</p></div></div>
                    </article>
                    <article className="step">
                      <button type="button" data-go="2"><span className="n">03</span><span className="t">Route</span></button>
                      <div className="body"><div><p>Each piece swaps on the public pools at random gaps across the window. Nobody is matched with anybody; every piece is an ordinary trade.</p></div></div>
                    </article>
                    <article className="step">
                      <button type="button" data-go="3"><span className="n">04</span><span className="t">Prove</span></button>
                      <div className="body"><div><p>Every piece is public and checkable. What nobody can see is that the pieces belong together, or to you.</p></div></div>
                    </article>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <HomeSections />
        </main>
      <SiteFooter />
      <SiteBehaviour />
      <LandingScene />
    </>
  );
}
