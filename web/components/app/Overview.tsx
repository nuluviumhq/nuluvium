"use client";

// Overview (ported from prototype/app.html): your shielded balance and the orders it is routing.
// Balance and orders are real (testnet); the market-hours clock is still a sample.

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { formatUsdg, parseUsdg, readWalletFunds, type ShieldedNote } from "@/lib/chain";
import { requestTestFunds } from "@/lib/faucet";
import { ragequitDeposit } from "@/lib/exits";
import { STATUS_CLASS, STATUS_LABEL, marble } from "@/lib/format";
import { isOpen, orderStatus, piecesDone } from "@/lib/orders";
import { shortAddress, type WalletStep } from "@/lib/wallet";
import { Dialog } from "./Dialog";
import { RecoveryPhraseButton } from "./RecoveryPhrase";
import { DEPOSIT_CAP, friendlyError, useSession } from "./session";

const TILE_COUNT = 45;
const APPROVAL_LABEL = { approved: "Approved", waiting: "Checking, about a minute", rejected: "Not approved" } as const;
const APPROVAL_CLASS = { approved: "done", waiting: "scheduled", rejected: "expired" } as const;
// Getting started can be hidden by hand (for people whose orders live in another browser).
const ONBOARD_HIDDEN_KEY = "nuluvium.onboard.hidden";

export function Overview() {
  const { session, openLogin, orders, balance, refreshBalance, deposit, toast } = useSession();
  const loggedIn = Boolean(session);
  const pieces = orders.flatMap((order) => order.pieces);
  const sent = pieces.filter((piece) => piece.status === "done").length;
  const waiting = pieces.filter((piece) => piece.status === "scheduled" || piece.status === "sending").length;
  const open = orders.filter(isOpen);

  const balanceText =
    balance.state === "ready" && balance.value
      ? `${formatUsdg(balance.value.total)} tUSDG`
      : balance.state === "failed"
        ? "Could not read"
        : "Reading…";

  // Deposit form: the wallet's tUSDG and ETH, the amount, and what is happening now.
  const [funds, setFunds] = useState<{ usdg: bigint; eth: bigint } | null>(null);
  const [amountText, setAmountText] = useState("25");
  const [working, setWorking] = useState<string | null>(null);
  const readFunds = useCallback(() => {
    if (session) readWalletFunds(session.address).then(setFunds, () => setFunds(null));
  }, [session]);
  useEffect(readFunds, [readFunds]);

  // Runs one wallet action; `working` is the line that says what is happening now.
  const run = async (label: string, action: () => Promise<string>, done: (tx: string) => string) => {
    setWorking(label);
    try {
      const tx = await action();
      toast(done(tx), tx);
      readFunds();
      refreshBalance();
      // The RPC's log index can trail the receipt by a few seconds: read once more a little later.
      window.setTimeout(refreshBalance, 6_000);
    } catch (error) {
      toast(friendlyError(error));
    } finally {
      setWorking(null);
    }
  };

  // Take back (ragequit): the deposit row being confirmed, and the deposits an open order is paying from.
  const [takeBack, setTakeBack] = useState<ShieldedNote | null>(null);
  const closeTakeBack = useCallback(() => setTakeBack(null), []);
  const busyDeposits = new Set(open.map((order) => order.depositIndex));
  const confirmTakeBack = (note: ShieldedNote) => {
    if (!session) return;
    setTakeBack(null);
    void run(
      "Taking the deposit back… the proof takes a few seconds, then confirm in your wallet.",
      async () => (await ragequitDeposit(session.address, session.keys, note.depositIndex)).tx,
      () => `${formatUsdg(note.value)} tUSDG are back in your wallet.`,
    );
  };

  const amount = parseUsdg(amountText);
  const onDeposit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!amount) return toast("Enter an amount above zero.");
    if (amount > DEPOSIT_CAP) return toast("Deposits are capped at 1,000 tUSDG until the audit.");
    if (funds && amount > funds.usdg) return toast("Your wallet holds less tUSDG than that. Use Get test funds first.");
    // The wallet asks up to twice: allow tUSDG (first deposit only), then the deposit itself.
    let approvedFirst = false;
    const onStep = (step: WalletStep) => {
      if (step === "approve") approvedFirst = true;
      setWorking(
        step === "approve"
          ? "Step 1 of 2: allow Nuluvium to use your tUSDG. Confirm in your wallet."
          : step === "send"
            ? `${approvedFirst ? "Step 2 of 2: " : ""}confirm the deposit in your wallet.`
            : "Sent. Waiting for the network to confirm, a few seconds…",
      );
    };
    void run("Preparing the deposit…", () => deposit(amount, onStep), () => "Deposited. The clean-funds check approves it, usually within a minute.");
  };

  const getTestFunds = () => {
    if (!session) return;
    let gotEth = false;
    void run(
      "Sending test funds to your wallet… nothing to sign.",
      async () => {
        const drip = await requestTestFunds(session.address);
        gotEth = drip.eth !== "0";
        return drip.usdgTx;
      },
      () => `${gotEth ? "100 test USDG and a little test ETH for gas are" : "100 test USDG are"} in your wallet.`,
    );
  };

  // Getting started: derived from the chain and this browser, so it ticks itself off.
  const notes = balance.value?.notes ?? [];
  const approvedTotal = balance.value?.approved ?? 0n;
  const awaitingApproval = notes.some((note) => note.approval === "waiting");
  const steps = {
    funds: notes.length > 0 || Boolean(funds && funds.usdg > 0n && funds.eth > 0n),
    deposit: notes.length > 0,
    approved: approvedTotal > 0n,
    order: orders.length > 0,
  };
  const current = !steps.funds ? "funds" : !steps.deposit ? "deposit" : !steps.approved ? "approved" : !steps.order ? "order" : null;
  const [onboardHidden, setOnboardHidden] = useState(false);
  useEffect(() => {
    try { setOnboardHidden(window.localStorage.getItem(ONBOARD_HIDDEN_KEY) === "1"); } catch { /* storage blocked: keep showing */ }
  }, []);
  const hideOnboard = () => {
    setOnboardHidden(true);
    try { window.localStorage.setItem(ONBOARD_HIDDEN_KEY, "1"); } catch { /* storage blocked: hidden for this visit */ }
  };
  const showOnboard = loggedIn && !onboardHidden && current !== null && balance.state === "ready" && funds !== null;
  const stepClass = (id: keyof typeof steps) => (steps[id] ? "done" : current === id ? "current" : undefined);

  return (
    <>
      <header className="app-title">
        <h1 className="display">Overview</h1>
        <p className="lead">Your shielded balance and the orders it is routing.</p>
      </header>

      {/* Logged out: a prompt, not a blank page. */}
      <section className="prompt" hidden={loggedIn}>
        <div>
          <h2 className="title">Log in to see your balance and orders</h2>
          <p>Then four short steps: free test funds, a deposit, a minute for the clean-funds check, and your first private order. About three minutes.</p>
        </div>
        <button className="button" type="button" onClick={() => openLogin()}>Log in</button>
      </section>

      {showOnboard ? (
        <section className="box onboard" aria-label="Getting started">
          <div className="box-head">
            <h2 className="title">Getting started</h2>
            <button className="text-link mono soft" type="button" onClick={hideOnboard}>Hide</button>
          </div>
          <ol>
            <li className={stepClass("funds")}>
              <div className="step-head"><span className="n">01</span><h3>Get test funds</h3></div>
              <p>100 test USDG and a little test ETH for gas, free, once a day. Nothing to sign.</p>
              {steps.funds ? <span className="state done">Done</span> : current === "funds" ? (
                <button className="button" type="button" disabled={Boolean(working)} onClick={getTestFunds}>Get test funds</button>
              ) : null}
            </li>
            <li className={stepClass("deposit")}>
              <div className="step-head"><span className="n">02</span><h3>Deposit</h3></div>
              <p>Move tUSDG into your shielded balance. Your wallet asks twice the first time: allow, then deposit.</p>
              {steps.deposit ? <span className="state done">Done</span> : current === "deposit" ? (
                <button className="button" type="button" disabled={Boolean(working) || !amount} onClick={onDeposit}>Deposit {amountText} tUSDG</button>
              ) : null}
            </li>
            <li className={stepClass("approved")}>
              <div className="step-head"><span className="n">03</span><h3>Clean-funds check</h3></div>
              <p>Each deposit is checked before it can be spent, usually within a minute. This page updates by itself.</p>
              {steps.approved ? <span className="state done">Approved</span> : awaitingApproval ? (
                <span className="state scheduled">Checking…</span>
              ) : null}
            </li>
            <li className={stepClass("order")}>
              <div className="step-head"><span className="n">04</span><h3>First private order</h3></div>
              <p>Buy a stock token in pieces, each from its own fresh address.</p>
              {steps.order ? <span className="state done">Done</span> : current === "order" ? (
                <Link className="button" href="/app/trade">Route an order</Link>
              ) : null}
            </li>
          </ol>
          {working && current !== "order" ? <p className="reason" aria-live="polite">{working}</p> : null}
        </section>
      ) : null}

      <div className="overview" hidden={!loggedIn}>
        {/* One tile per piece of your orders. */}
        <section className="stage" aria-label="Your pieces">
          <p className="stage-label">{sent} pieces sent · {waiting} waiting</p>
          <div className="tiles" role="img" aria-label="Pieces of your orders">
            {Array.from({ length: TILE_COUNT }, (_, index) =>
              index < sent ? (
                <span key={index} className="tile mine-filled" style={marble(index)} />
              ) : index < sent + waiting ? (
                <span key={index} className="tile mine-sealed" style={marble(index)} />
              ) : (
                <span key={index} className="tile" />
              ),
            )}
          </div>
          <div className="chips">
            <span className="chip-dot mine-filled">Went out</span>
            <span className="chip-dot mine-sealed">Waiting in the window</span>
            <span className="chip-dot">Room for the next ones</span>
          </div>
        </section>

        <section className="ledger" aria-label="Your figures">
          <p className="ledger-intro">Your account, as only you can see it.</p>
          <dl>
            <div><dt><span className="n">01</span>Shielded balance</dt><dd aria-live="polite">{balanceText}</dd></div>
            <div><dt><span className="n">02</span>Orders routing</dt><dd>{open.length}</dd></div>
            <div><dt><span className="n">03</span>Pieces sent</dt><dd>{sent}</dd></div>
            <div><dt><span className="n">04</span>Linked to your wallet</dt><dd>0</dd></div>
          </dl>
          <Link className="button full" href="/app/trade">New private order</Link>
        </section>
      </div>

      <div className="pair" hidden={!loggedIn}>
        <section className="box" aria-label="Shielded balance">
          <div className="box-head"><h2 className="title">Shielded balance</h2><span className="mono soft">Testnet</span></div>
          <form className="form-rows flush" onSubmit={onDeposit}>
            <label>
              <span className="name"><span className="n">01</span>Deposit</span>
              <span className="value">
                <input name="deposit" type="text" inputMode="decimal" value={amountText} onChange={(event) => setAmountText(event.target.value)} aria-label="Amount to deposit" />
                <small>tUSDG</small>
              </span>
            </label>
            <div>
              <span className="name"><span className="n">02</span>In your wallet</span>
              <span className="value">
                {funds ? `${formatUsdg(funds.usdg)}` : "…"} <small>tUSDG</small>
              </span>
            </div>
            <div>
              <span className="name"><span className="n">03</span>Test funds</span>
              <button className="text-link mono" type="button" disabled={Boolean(working)} onClick={getTestFunds}>
                Get test funds
              </button>
            </div>
            <button className="button full" type="submit" disabled={Boolean(working)}>{working ? "Working…" : "Deposit"}</button>
          </form>
          {working ? <p className="reason" aria-live="polite">{working}</p> : null}
          {funds && funds.eth === 0n ? (
            <p className="fine">Your wallet needs a little testnet ETH for gas. Get test funds sends some with the test USDG, once a day.</p>
          ) : null}
          <div className="scroll-x">
            <table className="rows narrow">
              <thead><tr><th>Deposit</th><th>Balance</th><th>Status</th><th></th></tr></thead>
              <tbody>
                {(balance.value?.notes ?? []).map((note) => {
                  const ownWallet = session && note.depositor.toLowerCase() === session.address.toLowerCase();
                  const busy = busyDeposits.has(note.depositIndex.toString());
                  return (
                    <tr key={note.depositIndex.toString()}>
                      <td className="hash">#{note.depositIndex.toString()}</td>
                      <td>{formatUsdg(note.value)}</td>
                      <td>
                        <span className={`state ${APPROVAL_CLASS[note.approval]}`} title={note.reason}>{APPROVAL_LABEL[note.approval]}</span>
                      </td>
                      <td>
                        {!ownWallet ? (
                          <span className="mono soft" title={`Only ${shortAddress(note.depositor)}, the wallet that made it, can take it back.`}>Other wallet</span>
                        ) : busy ? (
                          <span className="mono soft" title="An open order is paying from this deposit. Cancel it first.">In use</span>
                        ) : (
                          <button className="text-link mono" type="button" disabled={Boolean(working)} onClick={() => setTakeBack(note)}>Take back</button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="fine">A deposit is public; what you do with it next is not linked to it. Up to 1,000 tUSDG per deposit until the audit. A deposit can be spent once the clean-funds check approves it, usually within a minute. Take back returns what is left of a deposit to the wallet that made it, approved or not.</p>
          {/* Email logins only (renders nothing otherwise); the sidebar has it too, but phones hide the sidebar. */}
          <RecoveryPhraseButton />
        </section>

        <section className="box" aria-label="Orders routing now">
          <div className="box-head"><h2 className="title">Orders routing now</h2><Link className="mono soft text-link" href="/app/orders">All orders</Link></div>
          <div className="scroll-x">
            <table className="rows">
              <thead><tr><th>Token</th><th>Side</th><th>Amount</th><th>Pieces</th><th>Status</th></tr></thead>
              <tbody>
                {open.map((order) => {
                  const status = orderStatus(order);
                  return (
                    <tr key={order.id}>
                      <td className="tok">{order.token}</td>
                      <td className="buy">Buy</td>
                      <td>{formatUsdg(BigInt(order.amount))}</td>
                      <td>{piecesDone(order)} / {order.pieces.length}</td>
                      <td><span className={`state ${STATUS_CLASS[status]}`}>{STATUS_LABEL[status]}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="empty" hidden={open.length > 0}>Nothing routing. <Link className="text-link" href="/app/trade">Start a private order</Link></p>
        </section>
      </div>

      <section className="clock" aria-label="Market hours">
        <div className="clock-head">
          <h2 className="title">Market hours</h2>
          <p><span className="state done">US market open</span><span className="mono soft">Closes in 3 h 12 min · sample</span></p>
        </div>
        <div className="day" role="img" aria-label="The US market is open from 14:30 to 21:00 UTC. It is 17:48 UTC now.">
          <span className="session" style={{ left: "60.42%", width: "27.08%" }}></span>
          <span className="now" style={{ left: "74.17%" }}><i>17:48</i></span>
        </div>
        <div className="hours mono soft"><span>00</span><span>06</span><span>12</span><span>18</span><span>24 UTC</span></div>
        <p className="fine">Pools trade around the clock, but their prices drift from the real stock while the market is closed.</p>
      </section>

      <Dialog
        open={Boolean(takeBack)}
        onClose={closeTakeBack}
        title="Take this deposit back?"
        lead={takeBack && session ? `${formatUsdg(takeBack.value)} tUSDG from deposit #${takeBack.depositIndex.toString()} go back to ${shortAddress(session.address)}, the wallet that made it.` : ""}
      >
        <ul className="fine">
          <li>This is public: anyone can see your wallet got this deposit back.</li>
          <li>It also shows how much of the deposit was already spent, which can help someone guess which pieces came from it.</li>
          <li>Your wallet sends the transaction and pays a little testnet ETH for gas.</li>
        </ul>
        <div className="modal-options">
          <button type="button" onClick={() => takeBack && confirmTakeBack(takeBack)}><span>Take back {takeBack ? formatUsdg(takeBack.value) : ""} tUSDG</span><span className="chip">Ragequit</span></button>
        </div>
      </Dialog>
    </>
  );
}
