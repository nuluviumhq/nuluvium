"use client";

// Holdings: what each of your fresh addresses holds now, rebuilt from the chain with your keys, and
// the two ways out: sell the stock tokens for tUSDG (gasless, through the relayer), or export the
// address's key into a wallet of your own.

import { useCallback, useEffect, useState } from "react";
import { formatUsdg, quoteOut, readPieceFee } from "@/lib/chain";
import { freshPrivateKey, readHoldings, sellHolding, type Holding } from "@/lib/exits";
import { TOKENS, type TradableToken } from "@/lib/tokens";
import { explorerAddress, shortAddress } from "@/lib/wallet";
import { Dialog } from "./Dialog";
import { friendlyError, useSession } from "./session";

const tokenAmount = (token: TradableToken, units: bigint) => (Number(units) / 10 ** token.decimals).toFixed(4);

type Pending =
  | { kind: "sell"; holding: Holding; token: TradableToken; fee: bigint | null; value: bigint | null | "failed" } | { kind: "key"; holding: Holding; key: `0x${string}` | null };

export function Holdings() {
  const { session, toast, orders } = useSession();
  const [state, setState] = useState<{ holdings: Holding[]; empty: number } | "reading" | "failed">("reading");
  const [pending, setPending] = useState<Pending | null>(null);
  const [working, setWorking] = useState<string | null>(null);
  const close = useCallback(() => setPending(null), []);

  const refresh = useCallback(() => {
    if (!session) return;
    readHoldings(session.keys).then(setState, () => setState("failed"));
  }, [session]);
  // Read again when a piece lands (the done count changes).
  const done = orders.reduce((sum, order) => sum + order.pieces.filter((piece) => piece.status === "done").length, 0);
  // biome-ignore lint/correctness/useExhaustiveDependencies: `done` is the trigger, not an input
  useEffect(refresh, [refresh, done]);

  const askSell = (holding: Holding, token: TradableToken) => {
    setPending({ kind: "sell", holding, token, fee: null, value: null });
    const update = (change: { fee?: bigint; value?: bigint | "failed" }) =>
      setPending((current) => (current?.kind === "sell" && current.holding === holding ? { ...current, ...change } : current));
    readPieceFee().then((fee) => update({ fee }), () => {});
    quoteOut("sell", token.address, holding.tokens[token.symbol] ?? 0n).then(
      (value) => update({ value }),
      () => update({ value: "failed" }),
    );
  };

  const sell = async (holding: Holding, token: TradableToken) => {
    if (!session) return;
    setPending(null);
    setWorking(holding.address);
    toast("Selling… the relayer sends it, no wallet prompt.");
    try {
      const { tx } = await sellHolding(session.keys, holding, token);
      toast(`Sold. The tUSDG is on ${shortAddress(holding.address)}.`, tx);
      refresh();
    } catch (error) {
      toast(friendlyError(error));
    } finally {
      setWorking(null);
    }
  };

  const showKey = async (holding: Holding) => {
    if (!session || pending?.kind !== "key") return;
    const key = await freshPrivateKey(session.keys, holding);
    setPending({ kind: "key", holding, key });
  };

  const copyKey = async (key: string) => {
    try {
      await navigator.clipboard.writeText(key);
      toast("Key copied. Paste it into your wallet's import screen, then clear your clipboard.");
    } catch {
      toast("Could not copy. Select the key and copy it by hand.");
    }
  };

  const rows = state === "reading" || state === "failed" ? [] : state.holdings;

  return (
    <section className="box" aria-label="Holdings">
      <div className="box-head">
        <h2 className="title">Holdings</h2>
        <span className="mono soft">{state === "reading" ? "Reading the chain…" : state === "failed" ? "Could not read" : `${rows.length} fresh address${rows.length === 1 ? "" : "es"} holding something`}</span>
      </div>
      <div className="scroll-x">
        <table className="rows wide">
          <thead><tr><th>Fresh address</th><th>Holds</th><th>tUSDG</th><th></th><th></th></tr></thead>
          <tbody>
            {rows.map((holding) => {
              const held = TOKENS.filter((token) => (holding.tokens[token.symbol] ?? 0n) > 0n);
              return (
                <tr key={holding.address}>
                  <td className="hash"><a className="text-link" href={explorerAddress(holding.address)} target="_blank" rel="noreferrer">{shortAddress(holding.address)}</a></td>
                  <td>{held.length ? held.map((token) => `${tokenAmount(token, holding.tokens[token.symbol]!)} ${token.symbol}`).join(", ") : "None"}</td>
                  <td>{formatUsdg(holding.usdg)}</td>
                  <td>
                    {held.map((token) => (
                      <button key={token.symbol} className="text-link mono" type="button" disabled={Boolean(working)} onClick={() => askSell(holding, token)}>
                        {working === holding.address ? "Selling…" : `Sell ${token.symbol}`}
                      </button>
                    ))}
                  </td>
                  <td><button className="text-link mono" type="button" onClick={() => setPending({ kind: "key", holding, key: null })}>Export key</button></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="empty" hidden={state === "reading" || rows.length > 0}>
        {state === "failed" ? "Could not read your fresh addresses. Try again in a moment." : "None of your fresh addresses holds anything yet."}
      </p>
      <p className="fine">
        Found from your keys and the chain, so it includes pieces sent from other browsers. Selling happens on the same fresh address: the relayer pays the gas and takes its fee from the tUSDG, so nothing links back to you. To move tokens or tUSDG elsewhere, export that address&#39;s key into a wallet; sending it gas from your own wallet links the two on chain.
      </p>

      <Dialog
        open={pending?.kind === "sell"}
        onClose={close}
        title={pending?.kind === "sell" ? `Sell ${pending.token.symbol} on this address?` : ""}
        lead={
          pending?.kind === "sell"
            ? `${tokenAmount(pending.token, pending.holding.tokens[pending.token.symbol] ?? 0n)} ${pending.token.symbol} on ${shortAddress(pending.holding.address)} ${pending.value === null ? ": reading the price…" : pending.value === "failed" ? ": no price quote right now." : ` for about ${formatUsdg(pending.value)} tUSDG at the current quote.`}`
            : ""
        }
      >
        {pending?.kind === "sell" ? (
          <>
            <ul className="fine">
              <li>Relayer fee: {pending.fee === null ? "reading…" : `${formatUsdg(pending.fee)} tUSDG`}, taken from what the sale brings. No gas from you and no wallet prompt.</li>
              <li>The tUSDG stays on this fresh address. At most 1% below a fresh quote taken when you sell, or the sale does not happen.</li>
              <li>Like the buy, the sale is public but not linked to you or your other addresses.</li>
            </ul>
            <div className="modal-options">
              <button type="button" onClick={() => void sell(pending.holding, pending.token)}><span>Sell all {pending.token.symbol}</span><span className="chip">Gasless</span></button>
            </div>
          </>
        ) : null}
      </Dialog>

      <Dialog
        open={pending?.kind === "key"}
        onClose={close}
        title="Export this address's key?"
        lead={pending?.kind === "key" ? `The private key of ${shortAddress(pending.holding.address)}, to import it into a wallet such as Rabby or MetaMask.` : ""}
      >
        {pending?.kind === "key" ? (
          <>
            <ul className="fine">
              <li>Anyone with this key controls everything on this address. Never share it or paste it into a website.</li>
              <li>It unlocks only this one address, not your deposits or your other fresh addresses.</li>
              <li>Gas for it from your own wallet links the two on chain. On testnet, use the faucet instead.</li>
            </ul>
            {pending.key ? (
              <>
                <pre className="code" style={{ marginTop: "1rem" }}><code style={{ overflowWrap: "anywhere", whiteSpace: "pre-wrap" }}>{pending.key}</code></pre>
                <div className="modal-options">
                  <button type="button" onClick={() => pending.key && void copyKey(pending.key)}><span>Copy the key</span><span className="chip">Copy</span></button>
                </div>
              </>
            ) : (
              <div className="modal-options">
                <button type="button" onClick={() => void showKey(pending.holding)}><span>Show the key</span><span className="chip">Reveal</span></button>
              </div>
            )}
          </>
        ) : null}
      </Dialog>
    </section>
  );
}
