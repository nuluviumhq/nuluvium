"use client";

// Orders (ported from prototype/orders.html): every order you routed and how far its pieces got,
// from the encrypted schedule in this browser, plus the pieces that went out (like get_fills).

import Link from "next/link";
import { useState } from "react";
import { formatUsdg } from "@/lib/chain";
import { STATUS_CLASS, STATUS_LABEL, marble, shortTime } from "@/lib/format";
import { isOpen, orderStatus, piecesDone, type Order, type OrderStatus } from "@/lib/orders";
import { TOKENS } from "@/lib/tokens";
import { explorerAddress, explorerTx, shortAddress } from "@/lib/wallet";
import { Holdings } from "./Holdings";
import { useSession } from "./session";

const TILE_KIND: Record<OrderStatus, string> = { scheduled: "mine-sealed", routing: "mine-sealed", done: "mine-filled", cancelled: "closed", failed: "closed" };
const TILE_COUNT = 18;
const FILTERS = [
  { id: "all", label: "All" },
  { id: "open", label: "Open" },
  { id: "done", label: "Done" },
  { id: "cancelled", label: "Cancelled" },
] as const;
type Filter = (typeof FILTERS)[number]["id"];

const matches = (order: Order, filter: Filter) =>
  filter === "all" || (filter === "open" ? isOpen(order) : filter === "cancelled" ? ["cancelled", "failed"].includes(orderStatus(order)) : orderStatus(order) === filter);

export function Orders() {
  const { session, openLogin, toast, orders, cancelOrder } = useSession();
  const [filter, setFilter] = useState<Filter>("all");
  const visible = orders.filter((order) => matches(order, filter));
  const fills = orders.flatMap((order) => order.pieces.filter((piece) => piece.status === "done").map((piece) => ({ order, piece })));

  const cancel = async (order: Order) => {
    const cancelled = await cancelOrder(order.id);
    toast(`Order ${order.id}: ${cancelled} piece${cancelled === 1 ? "" : "s"} cancelled. ${piecesDone(order)} of ${order.pieces.length} had gone out and stay done.`);
  };

  return (
    <>
      <header className="app-title">
        <h1 className="display">Orders</h1>
        <p className="lead">Every order you routed, and how far its pieces got.</p>
      </header>

      <section className="prompt" hidden={Boolean(session)}>
        <div>
          <h2 className="title">Log in to see your orders</h2>
          <p>Only you can see which pieces belong to which order.</p>
        </div>
        <button className="button" type="button" onClick={() => openLogin()}>Log in</button>
      </section>

      <div className="stack" hidden={!session}>
        <section className="stage low" aria-label="Your orders at a glance">
          <p className="stage-label">Your orders · {orders.length} in this browser</p>
          <div className="tiles six" role="img" aria-label="Your orders, newest first">
            {Array.from({ length: Math.max(TILE_COUNT, orders.length) }, (_, index) => {
              const order = orders[index];
              if (!order) return <span key={index} className="tile dim" />;
              const status = orderStatus(order);
              return <span key={index} className={`tile ${TILE_KIND[status]}`} style={marble(index)} title={`${order.id} · ${STATUS_LABEL[status]}`} />;
            })}
          </div>
          <div className="chips">
            <span className="chip-dot mine-sealed">Scheduled or routing</span>
            <span className="chip-dot mine-filled">Done</span>
            <span className="chip-dot closed">Cancelled</span>
          </div>
        </section>

        <section className="box" aria-label="All orders">
          <div className="box-head">
            <h2 className="title">All orders</h2>
            <span className="pick" role="group" aria-label="Filter by status">
              {FILTERS.map((item) => (
                <button key={item.id} type="button" aria-pressed={filter === item.id} onClick={() => setFilter(item.id)}>{item.label}</button>
              ))}
            </span>
          </div>
          <div className="scroll-x">
            <table className="rows wide">
              <thead><tr><th>Order</th><th>Placed</th><th>Token</th><th>Side</th><th>Amount</th><th>Window</th><th>Pieces</th><th>Status</th><th></th></tr></thead>
              <tbody>
                {visible.map((order) => {
                  const status = orderStatus(order);
                  const failed = order.pieces.find((piece) => piece.status === "failed");
                  return (
                    <tr key={order.id}>
                      <td className="hash">{order.id}</td>
                      <td>{shortTime(order.createdAt)}</td>
                      <td className="tok">{order.token}</td>
                      <td className="buy">Buy</td>
                      <td>{formatUsdg(BigInt(order.amount))}</td>
                      <td>{order.window}</td>
                      <td>{piecesDone(order)} / {order.pieces.length}</td>
                      <td><span className={`state ${STATUS_CLASS[status]}`} title={failed?.error}>{STATUS_LABEL[status]}</span></td>
                      <td>{isOpen(order) ? <button className="text-link mono" type="button" onClick={() => void cancel(order)}>Cancel</button> : null}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="empty" hidden={visible.length > 0}>{orders.length === 0 ? "No orders yet." : "No orders with this status."} <Link className="text-link" href="/app/trade">Start a private order</Link></p>
        </section>

        {session ? <Holdings /> : null}

        <section className="box" aria-label="Pieces that went out">
          <div className="box-head"><h2 className="title">Pieces that went out</h2><span className="mono soft">Each from its own fresh address</span></div>
          <div className="scroll-x">
            <table className="rows wide">
              <thead><tr><th>Order</th><th>When</th><th>Spent</th><th>Received</th><th>Fresh address</th><th>Transaction</th></tr></thead>
              <tbody>
                {fills.map(({ order, piece }) => {
                  const token = TOKENS.find((item) => item.symbol === order.token);
                  const received = token && piece.received ? (Number(BigInt(piece.received)) / 10 ** token.decimals).toFixed(4) : "?";
                  return (
                    <tr key={`${order.id}-${piece.number}`}>
                      <td className="hash">{order.id}</td>
                      <td>{piece.sentAt ? shortTime(piece.sentAt) : ""}</td>
                      <td>{formatUsdg(BigInt(piece.amount))}</td>
                      <td>{received} {order.token}</td>
                      <td className="hash">{piece.fresh ? <a className="text-link" href={explorerAddress(piece.fresh)} target="_blank" rel="noreferrer">{shortAddress(piece.fresh)}</a> : ""}</td>
                      <td className="hash">{piece.tx ? <a className="text-link" href={explorerTx(piece.tx)} target="_blank" rel="noreferrer">{shortAddress(piece.tx)}</a> : ""}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="empty" hidden={fills.length > 0}>No pieces have gone out yet.</p>
        </section>
        <p className="fine">Cancelling stops the pieces that have not gone out. Pieces already sent are ordinary public trades and stay done. Orders live in this browser, encrypted with your keys.</p>
      </div>
    </>
  );
}
