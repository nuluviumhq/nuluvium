"use client";

// Trade (ported from prototype/trade.html): the private order ticket, now routing real pieces on
// testnet. Each piece is a private withdrawal to its own fresh address plus a buy, relayed in one
// transaction. Pieces go out from this browser while the tab is open.

import Link from "next/link";
import { useEffect, useState } from "react";
import { formatUsdg, parseUsdg, readPieceFee, readRecentPieces, unitsToInput, type PublicPiece } from "@/lib/chain";
import { STATUS_CLASS, STATUS_LABEL, marble } from "@/lib/format";
import { isOpen, orderStatus, piecesDone } from "@/lib/orders";
import { TOKENS, expectedOut } from "@/lib/tokens";
import { explorerTx, shortAddress } from "@/lib/wallet";
import { MIN_PIECE, START_DELAY_SECONDS, friendlyError, useSession } from "./session";

const WINDOWS = [
  { label: "10 min", seconds: 600 },
  { label: "30 min", seconds: 1800 },
  { label: "2 h", seconds: 7200 },
  { label: "6 h", seconds: 21600 },
];

/** Quick-fill buttons: share of the largest deposit one order can pay from, in percent. */
const QUICK_FILL: Array<[string, bigint]> = [["25%", 25n], ["50%", 50n], ["Max", 100n]];

const formatTokens = (units: bigint, decimals: number) => (Number(units) / 10 ** decimals).toFixed(4);

export function Trade() {
  const { session, requireLogin, toast, orders, balance, placeOrder } = useSession();
  const loggedIn = Boolean(session);
  const [symbol, setSymbol] = useState(TOKENS[0]!.symbol);
  const [amountText, setAmountText] = useState("10");
  const [pieces, setPieces] = useState(3);
  const [windowLabel, setWindowLabel] = useState(WINDOWS[0]!.label);
  const [orderState, setOrderState] = useState("Not routed yet");
  const [sending, setSending] = useState(false);
  const [feePerPiece, setFeePerPiece] = useState<bigint | null>(null);
  const [recent, setRecent] = useState<PublicPiece[] | null>(null);

  useEffect(() => {
    readPieceFee().then(setFeePerPiece, () => setFeePerPiece(null));
    readRecentPieces().then(setRecent, () => setRecent([]));
  }, []);

  const token = TOKENS.find((item) => item.symbol === symbol) ?? TOKENS[0]!;
  const amount = parseUsdg(amountText) ?? 0n;
  const fees = feePerPiece === null ? null : feePerPiece * BigInt(pieces);
  const receive = fees !== null && amount > fees ? expectedOut(token, amount - fees) : 0n;
  const mine = orders.slice(0, 5);
  const approved = balance.value?.approved;
  const waitingDeposit = balance.value?.notes.some((note) => note.approval === "waiting") ?? false;
  // One order is paid from one approved deposit that no open order uses (as placeOrder picks it):
  // the largest such deposit is the most one order can spend.
  const busy = new Set(orders.filter(isOpen).map((order) => order.depositIndex));
  const maxSpend = balance.value
    ? balance.value.notes
        .filter((note) => note.approval === "approved" && !busy.has(note.depositIndex.toString()))
        .reduce((largest, note) => (note.value > largest ? note.value : largest), 0n)
    : undefined;
  const minAmount = MIN_PIECE * BigInt(pieces);
  // Why the order cannot go out yet, shown under the button (null: it can).
  const blocker =
    !loggedIn || maxSpend === undefined || amount <= 0n
      ? null
      : amount < minAmount
        ? "small"
        : amount <= maxSpend
          ? null
          : waitingDeposit && (approved ?? 0n) < amount
            ? "waiting"
            : "short";
  const chosenWindow = WINDOWS.find((item) => item.label === windowLabel)!;
  const gapSeconds = Math.min(30, Math.floor(chosenWindow.seconds / Math.max(1, pieces - 1)));

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (amount <= 0n) return toast("Enter an amount above zero.");
    if (blocker) return;
    // Logged out: the login modal opens first, then the order is placed.
    requireLogin(async () => {
      setSending(true);
      try {
        const chosen = WINDOWS.find((item) => item.label === windowLabel)!;
        const order = await placeOrder({ token: symbol, amount, pieces, windowSeconds: chosen.seconds, windowLabel });
        setOrderState(`Order ${order.id} · scheduled`);
        toast(`Order ${order.id} scheduled in ${pieces} pieces over ${windowLabel}. Keep this tab open: the pieces go out from your browser.`);
      } catch (error) {
        toast(friendlyError(error));
      } finally {
        setSending(false);
      }
    });
  };

  return (
    <>
      <header className="app-title">
        <h1 className="display">Trade</h1>
        <p className="lead">Each piece buys from its own fresh address, so the order does not trace back to you.</p>
      </header>

      <div className="desk">
        <div className="desk-main">
          <section className="app-card" aria-label="Preview">
            <div className="card-head"><h2 className="title">Preview</h2><span className="mono soft">{orderState}</span></div>
            <div className="stage">
              <div className="tiles three" role="img" aria-label="Pieces of this order">
                {Array.from({ length: 9 }, (_, index) =>
                  index < pieces ? <span key={index} className="tile mine-filled" style={marble(index)} /> : <span key={index} className="tile" />,
                )}
              </div>
              <div className="chips">
                <span className="chip-dot mine-sealed">Wallet: not linked</span>
                <span className="chip-dot mine-filled">{pieces} fresh addresses</span>
                <span className="chip-dot mine-filled">Window: {windowLabel}</span>
              </div>
            </div>
            {/* What will happen, from the same rules the planner uses (sizes and times are random). */}
            <dl className="plan-list">
              <div><dt>Pieces</dt><dd>{pieces}, about {amount > 0n ? formatUsdg(amount / BigInt(pieces)) : "…"} tUSDG each; sizes vary, none under {formatUsdg(MIN_PIECE)}</dd></div>
              <div><dt>Timing</dt><dd>First about {START_DELAY_SECONDS} s after you route, then random times over {windowLabel}, at least {gapSeconds} s apart</dd></div>
              <div><dt>Each piece</dt><dd>Swaps from its own fresh address; the relayer sends it and pays the gas</dd></div>
              <div><dt>Keep open</dt><dd>This tab, until the last piece goes out</dd></div>
            </dl>
          </section>
          <section className="box" aria-label="Your orders">
            <div className="box-head"><h2 className="title">Your orders</h2><Link className="mono soft text-link" href="/app/orders">{loggedIn ? "All orders" : ""}</Link></div>
            <div className="scroll-x">
              <table className="rows">
                <thead><tr><th>Token</th><th>Side</th><th>Amount</th><th>Pieces</th><th>Status</th></tr></thead>
                <tbody>
                  {mine.map((order) => {
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
            <p className="empty" hidden={loggedIn && mine.length > 0}>{loggedIn ? "No orders yet. Your first one appears here once you route it." : "Log in to see your orders here."}</p>
          </section>

          <section className="box" aria-label="Recent pieces">
            <div className="box-head"><h2 className="title">Recent pieces</h2><span className="mono soft">Public, unlinked</span></div>
            <div className="scroll-x">
              <table className="rows">
                <thead><tr><th>Token</th><th>Size</th><th>Price</th><th>From</th></tr></thead>
                <tbody>
                  {(recent ?? []).map((piece) => {
                    const known = TOKENS.find((item) => item.address.toLowerCase() === piece.token.toLowerCase());
                    const decimals = known?.decimals ?? 18;
                    const spent = piece.usdgIn - piece.fee;
                    const price = piece.tokenOut > 0n ? (Number(spent) / 1e6) / (Number(piece.tokenOut) / 10 ** decimals) : 0;
                    return (
                      <tr key={piece.tx}>
                        <td className="tok">{known?.symbol ?? "?"}</td>
                        <td>{formatUsdg(piece.usdgIn)}</td>
                        <td>{price.toFixed(2)}</td>
                        <td className="hash"><a className="text-link" href={explorerTx(piece.tx)} target="_blank" rel="noreferrer">{shortAddress(piece.owner)}</a></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {recent === null ? <p className="empty"><span className="skeleton">…</span></p> : null}
            <p className="empty" hidden={recent === null || recent.length > 0}>No pieces from anyone in the last blocks. Pieces appear here, public and unlinked, as they go out.</p>
          </section>
        </div>

        {/* The order ticket: the rail on desktop, first on phones. */}
        <aside className="desk-rail">
            <form className="app-card ledger" aria-label="Order ticket" onSubmit={submit}>
              <div className="card-head"><h2 className="title">Your order</h2><span className="mono soft">{!loggedIn ? "Log in to see your balance" : maxSpend === undefined ? <span className="skeleton">…</span> : maxSpend === approved ? `${formatUsdg(maxSpend)} tUSDG ready` : `${formatUsdg(maxSpend)} max per order`}</span></div>
              <div className="form-rows">
                <div>
                  <span className="name"><span className="n">01</span>Side</span>
                  <span className="pick" role="group" aria-label="Side">
                    <button type="button" aria-pressed="true">Buy</button>
                    <button type="button" aria-pressed="false" disabled title="Selling from the app comes later">Sell · soon</button>
                  </span>
                </div>
                <label>
                  <span className="name"><span className="n">02</span>Stock token</span>
                  <select name="token" value={symbol} onChange={(event) => setSymbol(event.target.value)}>
                    {TOKENS.map((item) => <option key={item.symbol} value={item.symbol}>{item.symbol}</option>)}
                  </select>
                </label>
                <label>
                  <span className="name"><span className="n">03</span>Amount</span>
                  <span className="value">
                    <input name="amount" type="text" inputMode="decimal" value={amountText} onChange={(event) => setAmountText(event.target.value)} />
                    <small>tUSDG</small>
                  </span>
                </label>
            {loggedIn ? (
              <div>
                <span className="name"><span className="n"></span>Fill</span>
                <span className="pick" role="group" aria-label="Fill the amount">
                  {QUICK_FILL.map(([label, share]) => (
                    <button key={label} type="button" disabled={!maxSpend} onClick={() => maxSpend && setAmountText(unitsToInput((maxSpend * share) / 100n))}>
                      {label}
                    </button>
                  ))}
                </span>
              </div>
            ) : null}
                <label>
                  <span className="name"><span className="n">04</span>Split into</span>
                  <select name="pieces" value={pieces} onChange={(event) => setPieces(Number(event.target.value))}>
                    <option value="3">3 pieces</option>
                    <option value="5">5 pieces</option>
                    <option value="8">8 pieces</option>
                  </select>
                </label>
                <label>
                  <span className="name"><span className="n">05</span>Time window</span>
                  <select name="window" value={windowLabel} onChange={(event) => setWindowLabel(event.target.value)}>
                    {WINDOWS.map((item) => <option key={item.label} value={item.label}>{item.label}</option>)}
                  </select>
                </label>
                <div>
                  <span className="name"><span className="n">06</span>You receive, about</span>
                  <span className="value">{formatTokens(receive, token.decimals)} <small>{token.symbol}</small></span>
                </div>
                <div>
                  <span className="name"><span className="n">07</span>Relayer fee, {pieces} pieces</span>
                  <span className="value">{fees === null ? <span className="skeleton">…</span> : formatUsdg(fees)} <small>tUSDG</small></span>
                </div>
              </div>
              <button className="button full" type="submit" disabled={sending || Boolean(blocker)}>{sending ? "Planning…" : loggedIn ? "Route order" : "Log in to route"}</button>
              {blocker === "waiting" ? (
                <p className="reason" aria-live="polite">Your deposit is waiting for the clean-funds check, usually under a minute. The button unlocks by itself.</p>
              ) : blocker === "short" ? (
                <p className="reason" aria-live="polite">
              One order pays from one deposit, and your largest free one holds {formatUsdg(maxSpend ?? 0n)} tUSDG. Lower the amount (Max fills it) or <Link className="text-link" href="/app">deposit more on Overview</Link>.
            </p>
          ) : blocker === "small" ? (
            <p className="reason" aria-live="polite">Each piece is at least {formatUsdg(MIN_PIECE)} tUSDG: {pieces} pieces need {formatUsdg(minAmount)} or more. Raise the amount or pick fewer pieces.</p>
              ) : null}
              <p className="fine">Paid from your shielded balance. Each piece swaps from its own fresh address; keep this tab open until the last piece. Testnet: MSTK is a mock stock at a fixed price of 180 tUSDG.</p>
            </form>
        </aside>
      </div>
    </>
  );
}
