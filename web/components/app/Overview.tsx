"use client";

// Overview (ported from prototype/app.html): your shielded balance and the orders it is routing.
// Balance and orders are real (testnet); the market-hours clock is still a sample.

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { formatUsdg, parseUsdg, readWalletFunds, unitsToInput, type ShieldedNote } from "@/lib/chain";
import { requestTestFunds } from "@/lib/faucet";
import { ragequitDeposit } from "@/lib/exits";
import { STATUS_CLASS, STATUS_LABEL, marble } from "@/lib/format";
import { isOpen, orderStatus, piecesDone } from "@/lib/orders";
import { shortAddress, type WalletStep } from "@/lib/wallet";
import { Dialog } from "./Dialog";
import { MarketHours } from "./MarketHours";
import { RecoveryPhraseButton } from "./RecoveryPhrase";
import { DEPOSIT_CAP, friendlyError, useSession } from "./session";
import { REASON_COPY } from "@/lib/reasons";

const TILE_COUNT = 45;
const APPROVAL_LABEL = { approved: "Approved", waiting: "Checking, about a minute", rejected: "Not approved" } as const;
const APPROVAL_CLASS = { approved: "done", waiting: "scheduled", rejected: "expired" } as const;
/** Quick-fill buttons: share of the wallet's tUSDG, in percent. */
const QUICK_FILL: Array<[string, bigint]> = [["25%", 25n], ["50%", 50n], ["Max", 100n]];
const minBig = (a: bigint, b: bigint) => (a < b ? a : b);
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

  // Balance card figures: total, and how much of it can be spent now.
  const ready = balance.value?.approved;
  const checking = notes.filter((note) => note.approval === "waiting").reduce((sum, note) => sum + note.value, 0n);
  const doneCount = Object.values(steps).filter(Boolean).length;

  const pieceTiles = (
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
  );

  const marketHours = <MarketHours />;

  return (
    <>
      <header className="app-title">
        <h1 className="display">Overview</h1>
      </header>

      {/* Logged out: a prompt, not a blank page. */}
      {!loggedIn ? (
        <>
          <section className="prompt">
            <div>
              <h2 className="title">Log in to see your balance and orders</h2>
              <p>Then four short steps: free test funds, a deposit, a minute for the clean-funds check, and your first private order. About three minutes.</p>
            </div>
            <button className="button" type="button" onClick={() => openLogin()}>Log in</button>
          </section>
          {marketHours}
        </>
      ) : (
        <div className="desk">
          {/* Left: what you read. */}
          <div className="desk-main">
            <dl className="stat-row">
              <div><dt>Orders routing</dt><dd>{balance.state === "ready" ? open.length : <span className="skeleton">…</span>}</dd></div>
              <div><dt>Pieces sent</dt><dd>{balance.state === "ready" ? sent : <span className="skeleton">…</span>}</dd></div>
              <div><dt>Ready to spend</dt><dd>{ready === undefined ? <span className="skeleton">…</span> : formatUsdg(ready)}</dd></div>
            </dl>

            <section className="app-card" aria-label="Orders routing now">
              <div className="card-head"><h2 className="title">Orders routing now</h2><Link className="mono soft text-link" href="/app/orders">All orders</Link></div>
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

            {/* One tile per piece of your orders. */}
            <section className="app-card" aria-label="Your pieces">
              <div className="card-head"><h2 className="title">Your pieces</h2><span className="mono soft">{sent} sent · {waiting} waiting</span></div>
              {sent + waiting === 0 ? (
                // Empty: one line, not a grid of empty squares.
                <p className="empty">No pieces yet. Each order goes out in pieces, one tile each. <Link className="text-link" href="/app/trade">Start a private order</Link></p>
              ) : (
                <div className="stage">
                  {pieceTiles}
                  <div className="chips">
                    <span className="chip-dot mine-filled">Went out</span>
                    <span className="chip-dot mine-sealed">Waiting in the window</span>
                    <span className="chip-dot">Room for the next ones</span>
                  </div>
                </div>
              )}
            </section>

            <section className="app-card" aria-label="Deposits">
              <div className="card-head"><h2 className="title">Deposits</h2><span className="mono soft">Public</span></div>
              <div className="scroll-x">
                <table className="rows narrow">
                  <thead><tr><th>Deposit</th><th>Balance</th><th>Status</th><th></th></tr></thead>
                  <tbody>
                    {notes.map((note) => {
                      const ownWallet = session && note.depositor.toLowerCase() === session.address.toLowerCase();
                      const busy = busyDeposits.has(note.depositIndex.toString());
                      return (
                        <tr key={note.depositIndex.toString()}>
                          <td className="hash">#{note.depositIndex.toString()}</td>
                          <td>{formatUsdg(note.value)}</td>
                          <td>
                            <span className={`state ${APPROVAL_CLASS[note.approval]}`}>{APPROVAL_LABEL[note.approval]}</span>
                            {/* Refused: say why and what to do (codes from the clean-funds check, lib/reasons.ts). */}
                            {note.approval === "rejected" ? (
                              <p className="fine">{note.reason ? REASON_COPY[note.reason].explain : "The clean-funds check did not approve it. It can only be taken back."}</p>
                            ) : null}
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
              <p className="empty" hidden={notes.length > 0 || balance.state !== "ready"}>No deposits yet. Use the Deposit form to move tUSDG into your shielded balance.</p>
              <p className="fine">A deposit is public; what you do with it next is not linked to it. Take back returns what is left of a deposit to the wallet that made it, approved or not.</p>
            </section>

            {marketHours}
          </div>

          {/* Right: what you act on. On phones this comes first. */}
          <aside className="desk-rail" aria-label="Your balance">
            <section className="app-card balance-card" aria-label="Shielded balance">
              <p className="label">Shielded balance · only you see this</p>
              <p className="big" aria-live="polite">
                {balance.state === "ready" && balance.value ? (
                  <>{formatUsdg(balance.value.total)}<small>tUSDG</small></>
                ) : balance.state === "failed" ? (
                  balanceText
                ) : (
                  <span className="skeleton">…</span>
                )}
              </p>
              <p className="sub">
                {ready === undefined ? <span className="skeleton">…</span> : formatUsdg(ready)} ready{checking > 0n ? ` · ${formatUsdg(checking)} being checked` : ""}
                <br />Linked to your wallet: 0. Trades go out from fresh addresses.
              </p>
              <Link className="button full" href="/app/trade">New private order</Link>
            </section>

            <section className="app-card" aria-label="Deposit">
              <div className="card-head">
                <h2 className="title">Deposit</h2>
                <button className="text-link mono" type="button" disabled={Boolean(working)} onClick={getTestFunds}>Get test funds</button>
              </div>
              <form className="form-rows flush" onSubmit={onDeposit}>
                <label>
                  <span className="name"><span className="n">01</span>Amount</span>
                  <span className="value">
                    <input name="deposit" type="text" inputMode="decimal" value={amountText} onChange={(event) => setAmountText(event.target.value)} aria-label="Amount to deposit" />
                    <small>tUSDG</small>
                  </span>
                </label>
                <div>
                  <span className="name"><span className="n"></span>Fill</span>
                  <span className="pick" role="group" aria-label="Fill the deposit amount">
                    {QUICK_FILL.map(([label, share]) => (
                      <button
                        key={label}
                        type="button"
                        disabled={!funds || funds.usdg === 0n}
                        onClick={() => funds && setAmountText(unitsToInput(minBig((funds.usdg * share) / 100n, DEPOSIT_CAP)))}
                      >
                        {label}
                      </button>
                    ))}
                  </span>
                </div>
                <div>
                  <span className="name"><span className="n">02</span>In your wallet</span>
                  <span className="value">{funds ? `${formatUsdg(funds.usdg)}` : <span className="skeleton">…</span>} <small>tUSDG</small></span>
                </div>
                <button className="button full" type="submit" disabled={Boolean(working)}>{working ? "Working…" : "Deposit"}</button>
              </form>
              {working ? <p className="reason" aria-live="polite">{working}</p> : null}
              {funds && funds.eth === 0n ? (
                <p className="fine">Your wallet needs a little testnet ETH for gas. Get test funds sends some with the test USDG, once a day.</p>
              ) : null}
              <p className="fine">Up to 1,000 tUSDG per deposit until the audit. A deposit can be spent once the clean-funds check approves it, usually within a minute.</p>
              {/* Email logins only (renders nothing otherwise); phones hide the sidebar that also has it. */}
              <RecoveryPhraseButton />
            </section>

            {showOnboard ? (
              <section className="app-card onboard-card" aria-label="Getting started">
                <div className="card-head">
                  <h2 className="title">Getting started</h2>
                  <span className="mono soft">{doneCount} of 4 · <button className="text-link mono soft" type="button" onClick={hideOnboard}>Hide</button></span>
                </div>
                <ol className="check-list">
                  <li className={stepClass("funds")}>
                    <span className="tick" aria-hidden="true"></span>
                    <div>
                      <strong>Get test funds</strong>
                      {current === "funds" ? (
                        <>
                          <p>100 test USDG and a little test ETH for gas, free, once a day. Nothing to sign.</p>
                          <button className="button" type="button" disabled={Boolean(working)} onClick={getTestFunds}>Get test funds</button>
                        </>
                      ) : null}
                    </div>
                  </li>
                  <li className={stepClass("deposit")}>
                    <span className="tick" aria-hidden="true"></span>
                    <div>
                      <strong>Deposit</strong>
                      {current === "deposit" ? (
                        <>
                          <p>Move tUSDG into your shielded balance. Your wallet asks twice the first time: allow, then deposit.</p>
                          <button className="button" type="button" disabled={Boolean(working) || !amount} onClick={onDeposit}>Deposit {amountText} tUSDG</button>
                        </>
                      ) : null}
                    </div>
                  </li>
                  <li className={stepClass("approved")}>
                    <span className="tick" aria-hidden="true"></span>
                    <div>
                      <strong>Clean-funds check</strong>
                      {current === "approved" ? (
                        <>
                          <p>Each deposit is checked before it can be spent, usually within a minute. This page updates by itself.</p>
                          {awaitingApproval ? <span className="state scheduled">Checking…</span> : null}
                        </>
                      ) : null}
                    </div>
                  </li>
                  <li className={stepClass("order")}>
                    <span className="tick" aria-hidden="true"></span>
                    <div>
                      <strong>First private order</strong>
                      {current === "order" ? (
                        <>
                          <p>Buy a stock token in pieces, each from its own fresh address.</p>
                          <Link className="button" href="/app/trade">Route an order</Link>
                        </>
                      ) : null}
                    </div>
                  </li>
                </ol>
              </section>
            ) : null}
          </aside>
        </div>
      )}

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
