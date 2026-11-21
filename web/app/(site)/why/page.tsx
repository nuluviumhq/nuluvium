// Ported from prototype/why.html. Hero and statement: the "Network" layout (components/layouts.tsx).
import type { Metadata } from "next";
import Link from "next/link";
import { SiteBehaviour } from "@/components/SiteBehaviour";
import { SiteHeader, ClosingCards, SiteFooter } from "@/components/site";
import { ArrowIcon } from "@/components/icons";
import { GiantHero } from "@/components/layouts";

export const metadata: Metadata = {
  title: "Why",
  description: "What a public wallet history gives away, who reads it, and what changes when trades are routed through Nuluvium.",
};

export default function Page() {
  return (
    <>
      <SiteHeader current="why" />
      <main>
          <div className="wrap">
            <GiantHero
              kicker="Why"
              lines={["A public wallet", "tells everyone", "your plan."]}
              lead="Every trade on Robinhood Chain is public once it lands, and tied to the wallet that made it. Here is what that history gives away, who reads it, and what changes when your trades are routed."
              action={<a className="button outline down" href="#shows">What it shows <ArrowIcon /></a>}
            />
          </div>

          <section className="steps-scene" id="shows" data-scroll-steps data-active="0">
            <div className="pin">
              <div className="wrap">
                <div className="stage views" aria-hidden="true">
                  <div className="view">
                    <p className="stage-label">A public wallet · readable by anyone</p>
                    <div className="sheet"><div className="form-rows">
                      <div className="lit"><span className="name"><span className="n">01</span>Wallet</span><span className="value">0x4f9a…c21e</span></div>
                      <div><span className="name"><span className="n">02</span>Total bought this week</span><span className="value">8,000 <small>USDG</small></span></div>
                      <div><span className="name"><span className="n">03</span>Pattern</span><span className="value">Mondays, 14:31</span></div>
                    </div></div>
                    <div className="chips"><span className="chip-dot mine-filled">Every past trade of this wallet is one click away</span></div>
                  </div>
                  <div className="view">
                    <p className="stage-label">A public wallet · readable by anyone</p>
                    <div className="sheet"><div className="form-rows">
                      <div><span className="name"><span className="n">01</span>Wallet</span><span className="value">0x4f9a…c21e</span></div>
                      <div className="lit"><span className="name"><span className="n">02</span>Total bought this week</span><span className="value">8,000 <small>USDG</small></span></div>
                      <div><span className="name"><span className="n">03</span>Pattern</span><span className="value">Mondays, 14:31</span></div>
                    </div></div>
                    <div className="chips"><span className="chip-dot mine-filled">Add up its trades and the size is plain</span></div>
                  </div>
                  <div className="view">
                    <p className="stage-label">A public wallet · readable by anyone</p>
                    <div className="sheet"><div className="form-rows">
                      <div><span className="name"><span className="n">01</span>Wallet</span><span className="value">0x4f9a…c21e</span></div>
                      <div><span className="name"><span className="n">02</span>Total bought this week</span><span className="value">8,000 <small>USDG</small></span></div>
                      <div className="lit"><span className="name"><span className="n">03</span>Pattern</span><span className="value">Mondays, 14:31</span></div>
                    </div></div>
                    <div className="chips"><span className="chip-dot mine-filled">Same time, same size, every week</span></div>
                  </div>
                </div>
                <div className="step-list">
                  <p className="intro-line">What a public wallet shows:</p>
                  <article className="step active">
                    <button type="button"><span className="n">01</span><span className="t">Who</span></button>
                    <div className="body"><div><p>Which wallet traded, and with it everything that wallet has done before.</p></div></div>
                  </article>
                  <article className="step">
                    <button type="button"><span className="n">02</span><span className="t">How much</span></button>
                    <div className="body"><div><p>Each trade shows its size; together they show the whole position.</p></div></div>
                  </article>
                  <article className="step">
                    <button type="button"><span className="n">03</span><span className="t">The pattern</span></button>
                    <div className="body"><div><p>When it trades and how often. A pattern in time is easy to spot and easy to anticipate.</p></div></div>
                  </article>
                </div>
              </div>
            </div>
          </section>

          <section className="steps-scene" data-scroll-steps data-active="0">
            <div className="pin">
              <div className="wrap">
                <div className="stage views" aria-hidden="true">
                  <div className="view">
                    <p className="stage-label">One wallet · and the wallets that follow it</p>
                    <div className="tiles "><span className="tile"></span><span className="tile"></span><span className="tile"></span><span className="tile"></span><span className="tile"></span><span className="tile"></span><span className="tile"></span><span className="tile"></span><span className="tile"></span><span className="tile"></span><span className="tile"></span><span className="tile"></span><span className="tile"></span><span className="tile mine-filled" style={{ backgroundPosition: "45% 63%" }}></span><span className="tile"></span><span className="tile"></span><span className="tile"></span><span className="tile"></span><span className="tile"></span><span className="tile"></span><span className="tile"></span><span className="tile"></span><span className="tile mine-filled" style={{ backgroundPosition: "54% 60%" }}></span><span className="tile mine-filled" style={{ backgroundPosition: "55% 53%" }}></span><span className="tile mine-filled" style={{ backgroundPosition: "56% 46%" }}></span><span className="tile"></span><span className="tile"></span><span className="tile"></span><span className="tile"></span><span className="tile"></span><span className="tile"></span><span className="tile mine-filled" style={{ backgroundPosition: "63% 57%" }}></span><span className="tile"></span><span className="tile"></span><span className="tile"></span><span className="tile"></span><span className="tile"></span><span className="tile"></span><span className="tile"></span><span className="tile"></span><span className="tile"></span><span className="tile"></span><span className="tile"></span><span className="tile"></span><span className="tile"></span></div>
                    <div className="chips"><span className="chip-dot mine-filled">The same trade, repeated</span></div>
                  </div>
                  <div className="view">
                    <p className="stage-label">A labelled wallet · an alert on every move</p>
                    <div className="tiles "><span className="tile"></span><span className="tile"></span><span className="tile"></span><span className="tile"></span><span className="tile mine-filled" style={{ backgroundPosition: "36% 36%" }}></span><span className="tile"></span><span className="tile"></span><span className="tile"></span><span className="tile"></span><span className="tile"></span><span className="tile"></span><span className="tile"></span><span className="tile"></span><span className="tile mine-filled" style={{ backgroundPosition: "45% 63%" }}></span><span className="tile"></span><span className="tile"></span><span className="tile"></span><span className="tile"></span><span className="tile"></span><span className="tile"></span><span className="tile"></span><span className="tile"></span><span className="tile mine-filled" style={{ backgroundPosition: "54% 60%" }}></span><span className="tile"></span><span className="tile"></span><span className="tile"></span><span className="tile"></span><span className="tile"></span><span className="tile"></span><span className="tile"></span><span className="tile"></span><span className="tile mine-filled" style={{ backgroundPosition: "63% 57%" }}></span><span className="tile"></span><span className="tile"></span><span className="tile"></span><span className="tile"></span><span className="tile"></span><span className="tile"></span><span className="tile"></span><span className="tile"></span><span className="tile mine-filled" style={{ backgroundPosition: "36% 54%" }}></span><span className="tile"></span><span className="tile"></span><span className="tile"></span><span className="tile"></span></div>
                    <div className="chips"><span className="chip-dot mine-filled">Tracked the moment it trades</span></div>
                  </div>
                  <div className="view">
                    <p className="stage-label">An agent&#39;s trades · read as a rulebook</p>
                    <div className="tiles "><span className="tile"></span><span className="tile"></span><span className="tile mine-filled" style={{ backgroundPosition: "34% 50%" }}></span><span className="tile"></span><span className="tile"></span><span className="tile"></span><span className="tile mine-filled" style={{ backgroundPosition: "38% 52%" }}></span><span className="tile"></span><span className="tile"></span><span className="tile"></span><span className="tile"></span><span className="tile mine-filled" style={{ backgroundPosition: "43% 47%" }}></span><span className="tile"></span><span className="tile"></span><span className="tile"></span><span className="tile mine-filled" style={{ backgroundPosition: "47% 49%" }}></span><span className="tile"></span><span className="tile"></span><span className="tile"></span><span className="tile"></span><span className="tile mine-filled" style={{ backgroundPosition: "52% 44%" }}></span><span className="tile"></span><span className="tile"></span><span className="tile"></span><span className="tile mine-filled" style={{ backgroundPosition: "56% 46%" }}></span><span className="tile"></span><span className="tile"></span><span className="tile"></span><span className="tile"></span><span className="tile mine-filled" style={{ backgroundPosition: "61% 41%" }}></span><span className="tile"></span><span className="tile"></span><span className="tile"></span><span className="tile mine-filled" style={{ backgroundPosition: "65% 43%" }}></span><span className="tile"></span><span className="tile"></span><span className="tile"></span><span className="tile"></span><span className="tile mine-filled" style={{ backgroundPosition: "34% 38%" }}></span><span className="tile"></span><span className="tile"></span><span className="tile"></span><span className="tile mine-filled" style={{ backgroundPosition: "38% 40%" }}></span><span className="tile"></span><span className="tile"></span></div>
                    <div className="chips"><span className="chip-dot mine-filled">A few public trades show the rule</span></div>
                  </div>
                </div>
                <div className="step-list">
                  <p className="intro-line">Who reads it:</p>
                  <article className="step active">
                    <button type="button"><span className="n">01</span><span className="t">Copiers</span></button>
                    <div className="body"><div><p>They follow a wallet and repeat its trades. Whatever edge the wallet had is shared with everyone who watches.</p></div></div>
                  </article>
                  <article className="step">
                    <button type="button"><span className="n">02</span><span className="t">Trackers</span></button>
                    <div className="body"><div><p>Dashboards label wallets and send alerts the moment a known one trades, so others can act on it.</p></div></div>
                  </article>
                  <article className="step">
                    <button type="button"><span className="n">03</span><span className="t">Anyone studying your agent</span></button>
                    <div className="body"><div><p>An agent trades by rules. Each public trade from its wallet gives away a little more of them.</p></div></div>
                  </article>
                </div>
              </div>
            </div>
          </section>

          <div className="wrap">
            <section className="center-statement">
              <p className="mono">With Nuluvium</p>
              <h2>The trades still happen in public. They just stop adding up to you.</h2>
            </section>

            <section className="split sealed-compare">
              <div className="stage" aria-hidden="true">
                <p className="stage-label">The same trades · routed</p>
                <span className="app-stone"><img src="/assets/stone.jpg" alt="" /></span>
                <div className="chips"><span className="chip-dot mine-sealed">Wallet: not linked</span><span className="chip-dot mine-sealed">Size: split</span><span className="chip-dot mine-sealed">Pattern: spread</span></div>
              </div>
              <div className="ledger">
                <p className="ledger-intro">What changes, and what does not.</p>
                <div className="form-rows">
                  <div><span className="name"><span className="n">01</span>Who</span><span className="claim-state yes">Not linked to you</span></div>
                  <div><span className="name"><span className="n">02</span>How much</span><span className="claim-state yes">Split across addresses</span></div>
                  <div><span className="name"><span className="n">03</span>The pattern</span><span className="claim-state yes">Spread over a window</span></div>
                  <div><span className="name"><span className="n">04</span>Each piece</span><span className="claim-state ">Still public on chain</span></div>
                </div>
                <Link className="button full" href="/app/trade">Try an order</Link>
              </div>
            </section>

            <section className="box measured">
              <div className="box-head"><h2 className="title">What we checked</h2><span className="mono soft">14 to 15 Nov 2026</span></div>
              <dl className="limits three">
                <div><dt>Pending orders are already hidden</dt><dd>Robinhood Chain sends transactions straight to one sequencer, with no public mempool. What leaks is the history afterwards.</dd></div>
                <div><dt>The median trade is about $160</dt><dd>From 15,816 recent stock token trades. This is not about price impact.</dd></div>
                <div><dt>So it is about being followed</dt><dd>The people who care are agents and wallets that others watch. Privacy here is from other readers of the chain, not from Robinhood.</dd></div>
              </dl>
            </section>
          </div>

          <div className="wrap">
            <ClosingCards />
          </div>
        </main>
      <SiteFooter />
      <SiteBehaviour />
    </>
  );
}
