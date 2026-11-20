// Landing page sections between the pinned scene and the closing cards.
// Every fact here comes from the docs (fees, caps, limits) or the chain (LiveFigures); the two
// example orders are labelled "Sample". Update this copy when fees, caps or limits change.
import Link from "next/link";
import { LiveFigures } from "@/components/LiveFigures";
import { MCP_EXAMPLE, MCP_TOOLS } from "@/lib/mcpExample";

const REPO = "https://github.com/nuluviumhq/nuluvium";

/** The sample routed order: 500 USDG in five pieces over a 2 h window (sizes add up to 500.00). */
const SAMPLE_PIECES: Array<[string, string, string]> = [
  ["0x91c2…07ab", "96.40", "14:38"],
  ["0x3e7d…b1f0", "112.15", "15:02"],
  ["0x0a58…9c33", "88.70", "15:29"],
  ["0xd413…5e2c", "104.30", "15:51"],
  ["0x6fb0…a871", "98.45", "16:17"],
];

const QUESTIONS: Array<[string, React.ReactNode]> = [
  [
    "What does it cost?",
    <>Each piece pays the relayer the larger of 0.10 USDG and its gas cost plus 20%, so 0.10 today. The relayer pays the gas; fresh addresses never need ETH.</>,
  ],
  [
    "How much can I deposit?",
    <>Until an independent audit is published: at most 1,000 USDG per deposit and 25,000 USDG across all deposits. The smallest deposit is 1 USDG.</>,
  ],
  [
    "What if my deposit is not approved?",
    <>You can take it back in full to the wallet that made it, at any time. That exit is part of the Privacy Pools contracts, and it is public.</>,
  ],
  [
    "Who can see my trades?",
    <>Anyone can see each piece: it is an ordinary swap. What other readers of the chain cannot see is that the pieces belong together, or to you. Robinhood is not one of those readers we promise privacy from.</>,
  ],
  [
    "Is this real money?",
    <>No. Nuluvium runs on Robinhood Chain testnet with test USDG from the app&#39;s faucet. It is not audited yet.</>,
  ],
  [
    "Where can I use the app?",
    <>The site is readable everywhere. The app is not offered in the United States, the European Union and a few other places; the list is in the <Link href="/docs/faq">docs</Link>.</>,
  ],
];

export function HomeSections() {
  return (
    <div className="wrap home-more">
      {/* 1. The problem */}
      <section className="home-block" data-reveal>
        <div className="kicker-row">
          <p className="mono">The problem</p>
          <p>Every trade on Robinhood Chain is public, and tied to the wallet that made it.</p>
        </div>
        <div className="split">
          <div className="stage" aria-hidden="true">
            <p className="stage-label">A public wallet · sample</p>
            <div className="sheet">
              <div className="form-rows">
                <div><span className="name"><span className="n">01</span>Wallet</span><span className="value">0x4f9a…c21e</span></div>
                <div className="lit"><span className="name"><span className="n">02</span>Bought this week</span><span className="value">8,000 <small>USDG</small></span></div>
                <div><span className="name"><span className="n">03</span>Pattern</span><span className="value">Mondays, 14:31</span></div>
              </div>
            </div>
            <div className="chips"><span className="chip-dot mine-filled">One click shows its whole history</span></div>
          </div>
          <div className="ledger">
            <p className="ledger-intro">Who reads it.</p>
            <div className="form-rows">
              <div><span className="name"><span className="n">01</span>Copiers</span><span className="value">Repeat its trades</span></div>
              <div><span className="name"><span className="n">02</span>Trackers</span><span className="value">Alert on every move</span></div>
              <div><span className="name"><span className="n">03</span>Anyone studying an agent</span><span className="value">Learn its rules</span></div>
            </div>
            <Link className="button outline full" href="/why">Why it matters</Link>
          </div>
        </div>
      </section>

      {/* 2. The same order, before and after */}
      <section className="home-block" data-reveal>
        <div className="kicker-row">
          <p className="mono">One order, two ways</p>
          <p>A buy of 500 USDG of NVDA, as it lands from one wallet and as Nuluvium sends it.</p>
        </div>
        <div className="pair">
          <div className="box">
            <div className="box-head"><h2 className="title">From one wallet</h2><span className="mono soft">Sample</span></div>
            <div className="scroll-x">
              <table className="rows narrow">
                <thead><tr><th>Address</th><th>USDG</th><th>Time</th></tr></thead>
                <tbody><tr><td className="hash">0x4f9a…c21e (yours)</td><td>500.00</td><td>14:31</td></tr></tbody>
              </table>
            </div>
            <p className="box-note">One swap. Who bought, how much and when, all in one line, next to everything this wallet did before.</p>
          </div>
          <div className="box">
            <div className="box-head"><h2 className="title">Through Nuluvium</h2><span className="mono soft">Sample · 2 h window</span></div>
            <div className="scroll-x">
              <table className="rows narrow">
                <thead><tr><th>Fresh address</th><th>USDG</th><th>Time</th></tr></thead>
                <tbody>
                  {SAMPLE_PIECES.map(([address, amount, time]) => (
                    <tr key={address}><td className="hash">{address}</td><td>{amount}</td><td>{time}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="box-note">Five ordinary swaps from five fresh addresses, at random gaps. Nothing links them to each other or to your wallet. Relayer fee: 0.50 USDG.</p>
          </div>
        </div>
      </section>

      {/* 3. Live figures */}
      <section className="home-block" data-reveal>
        <div className="kicker-row">
          <p className="mono">Live on testnet</p>
          <p>Read from the chain every ten minutes. Totals only, no addresses.</p>
        </div>
        <LiveFigures />
      </section>

      {/* 4. Agents */}
      <section className="home-block" data-reveal>
        <div className="kicker-row">
          <p className="mono">For agents</p>
          <p>Listed on the official MCP Registry as com.nuluvium/mcp. One block of configuration, six tools.</p>
        </div>
        <div className="pair">
          <div className="box">
            <div className="box-head"><h2 className="title">Add the server</h2><span className="mono soft">.mcp.json</span></div>
            <pre className="code tinted"><code>{MCP_EXAMPLE}</code></pre>
            <div className="chips"><span className="chip-dot mine-filled">Claude</span><span className="chip-dot mine-filled">Codex</span><span className="chip-dot mine-filled">Cursor</span><span className="chip-dot">Any MCP client</span></div>
          </div>
          <div className="box">
            <div className="box-head"><h2 className="title">Tools</h2><span className="mono soft">Run on the agent&#39;s machine</span></div>
            <div className="scroll-x">
              <table className="rows narrow">
                <thead><tr><th>Tool</th><th>What it does</th></tr></thead>
                <tbody>
                  {MCP_TOOLS.map(([tool, what]) => (
                    <tr key={tool}><td className="hash">{tool}</td><td>{what}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Link className="button outline" href="/for-agents">Connect an agent</Link>
          </div>
        </div>
      </section>

      {/* 5. What is private, and from whom */}
      <section className="home-block" data-reveal>
        <div className="kicker-row">
          <p className="mono">Plainly</p>
          <p>What stays private, from whom, and what does not.</p>
        </div>
        <div className="pair">
          <div className="box">
            <div className="box-head"><h2 className="title">Privacy</h2><span className="mono soft">By design</span></div>
            <div className="form-rows flush">
              <div><span className="name"><span className="n">01</span>Your trades, from other readers of the chain</span><span className="claim-state yes">Not linked to you</span></div>
              <div><span className="name"><span className="n">02</span>Your trades, from Robinhood</span><span className="claim-state">Not promised</span></div>
              <div><span className="name"><span className="n">03</span>What the relayer sees</span><span className="claim-state yes">One piece, no logs</span></div>
              <div><span className="name"><span className="n">04</span>Your notes and fresh keys</span><span className="claim-state yes">Only on your device</span></div>
              <div><span className="name"><span className="n">05</span>Each piece</span><span className="claim-state">Public on chain</span></div>
              <div><span className="name"><span className="n">06</span>Your deposit</span><span className="claim-state">Public on chain</span></div>
            </div>
          </div>
          <div className="box">
            <div className="box-head"><h2 className="title">Limits</h2><span className="mono soft">Read before you deposit</span></div>
            <dl className="limits one">
              <div><dt>Testnet only</dt><dd>Test USDG and test stock tokens on Robinhood Chain testnet. No real money moves.</dd></div>
              <div><dt>Not audited yet</dt><dd>Until an independent audit is published, deposits are capped at 1,000 USDG each and 25,000 USDG in total.</dd></div>
              <div><dt>A small crowd is weak privacy</dt><dd>With few deposits, timing and amounts can still point a piece to its deposit. It gets stronger with every user.</dd></div>
            </dl>
          </div>
        </div>
      </section>

      {/* 6. Check our work */}
      <section className="home-block" data-reveal>
        <div className="kicker-row">
          <p className="mono">Check our work</p>
          <p>Everything behind the claims above is open, so you don&#39;t have to take our word for it.</p>
        </div>
        <section className="box measured">
          <dl className="limits">
            <div><dt>Open source</dt><dd>Contracts, relayer, approved-set provider, SDK, MCP server and this site, under Apache-2.0. <a className="text-link" href={REPO}>Repository</a></dd></div>
            <div><dt>Review notes</dt><dd>How to build and test everything, the static-analysis triage, and which key can do what. <a className="text-link" href={`${REPO}/blob/main/docs/review.md`}>review.md</a></dd></div>
            <div><dt>Approved sets</dt><dd>Every set of approved deposits is published and checkable against the roots posted on chain. <a className="text-link" href="https://github.com/nuluviumhq/approved-sets">approved-sets</a></dd></div>
            <div><dt>Unchanged Privacy Pools</dt><dd>The pool contracts and circuits are Privacy Pools v1.3.0, kept unchanged; our logic lives in our own contracts. <Link className="text-link" href="/docs/security">Security</Link></dd></div>
          </dl>
        </section>
      </section>

      {/* 7. Questions, and how to start */}
      <section className="home-block" data-reveal>
        <div className="kicker-row">
          <p className="mono">Questions</p>
          <p>The ones people ask first. The rest are in the docs.</p>
        </div>
        <div className="pair">
          <div className="box">
            <div className="box-head"><h2 className="title">Before you start</h2><Link className="mono soft" href="/docs/faq">All questions →</Link></div>
            <div className="faq">
              {QUESTIONS.map(([question, answer]) => (
                <details key={question}>
                  <summary>{question}</summary>
                  <p>{answer}</p>
                </details>
              ))}
            </div>
          </div>
          <div className="box">
            <div className="box-head"><h2 className="title">Start on testnet</h2><span className="mono soft">Free test funds</span></div>
            <div className="form-rows flush">
              <div><span className="name"><span className="n">01</span>Get test funds</span><span className="value">In the app</span></div>
              <div><span className="name"><span className="n">02</span>Shield test USDG</span><span className="value">One deposit</span></div>
              <div><span className="name"><span className="n">03</span>Clean-funds check</span><span className="value">A minute or two</span></div>
              <div><span className="name"><span className="n">04</span>Route your first order</span><span className="value">Pieces go out</span></div>
            </div>
            <Link className="button full" href="/app">Go to app</Link>
          </div>
        </div>
      </section>
    </div>
  );
}
