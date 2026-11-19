"use client";

// Account: who is logged in, a backup of the order schedule (the only thing that lives in this
// browser alone), and a way to remove everything Nuluvium keeps in this browser.

import { useCallback, useRef, useState } from "react";
import { clearThisBrowser } from "@/lib/localData";
import { makeBackup, restoreBackup } from "@/lib/orders";
import { explorerAddress } from "@/lib/wallet";
import { Dialog } from "./Dialog";
import { RecoveryPhraseButton } from "./RecoveryPhrase";
import { useSession } from "./session";

export function Account() {
  const { session, openLogin, logout, toast, orders, withOrdersPaused } = useSession();
  const [working, setWorking] = useState<string | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const closeClear = useCallback(() => setConfirmClear(false), []);
  const fileInput = useRef<HTMLInputElement | null>(null);
  const openOrders = orders.filter((order) => order.pieces.some((piece) => piece.status === "scheduled" || piece.status === "sending")).length;

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast("Address copied.");
    } catch {
      toast("Could not copy. Select the address and copy it by hand.");
    }
  };

  const download = async () => {
    if (!session) return;
    setWorking("Preparing the backup…");
    try {
      const { json, count } = await makeBackup(session.address, session.keys);
      const url = URL.createObjectURL(new Blob([json], { type: "application/json" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = `nuluvium-orders-${new Date().toISOString().slice(0, 10)}.json`;
      link.click();
      URL.revokeObjectURL(url);
      toast(`Backup saved with ${count} ${count === 1 ? "order" : "orders"}. Only your keys can open it.`);
    } catch {
      toast("The backup could not be made in this browser.");
    } finally {
      setWorking(null);
    }
  };

  const restore = async (file: File) => {
    if (!session) return;
    setWorking("Restoring…");
    try {
      const text = await file.text();
      const { added, total } = await withOrdersPaused(() => restoreBackup(session.address, session.keys, text));
      toast(added === 0 ? `Nothing new: all ${total} orders in the backup are already here.` : `Restored ${added} ${added === 1 ? "order" : "orders"}. Scheduled pieces resume while this tab is open.`);
    } catch (error) {
      toast(error instanceof Error ? error.message : "The backup could not be restored.");
    } finally {
      setWorking(null);
      if (fileInput.current) fileInput.current.value = "";
    }
  };

  const clear = async () => {
    setConfirmClear(false);
    setWorking("Clearing this browser…");
    try {
      await withOrdersPaused(clearThisBrowser);
      logout();
      toast("This browser no longer holds any Nuluvium data. Your balance stays on chain.");
    } finally {
      setWorking(null);
    }
  };

  return (
    <>
      <header className="app-title">
        <h1 className="display">Account</h1>
        <p className="lead">Your login, a backup of your orders, and what this browser keeps.</p>
      </header>

      {!session ? (
        <section className="prompt">
          <div>
            <h2 className="title">Log in to see your account</h2>
            <p>Your login wallet, a backup of your orders, and a way to clear this browser.</p>
          </div>
          <button className="button" type="button" onClick={() => openLogin()}>Log in</button>
        </section>
      ) : (
        <div className="desk rail-last">
          <div className="desk-main">
            <section className="app-card" aria-label="Login">
              <div className="card-head"><h2 className="title">Login</h2><span className="mono soft">Unlocked</span></div>
              <div className="form-rows flush">
                <div>
                  <span className="name"><span className="n">01</span>Login with</span>
                  <span className="claim-state">{session.kind === "email" ? "Email (recovery phrase keys)" : "Wallet (keys from a signature)"}</span>
                </div>
                <div className="stack-row">
                  <span className="name"><span className="n">02</span>Login wallet</span>
                  <span className="addr-full">{session.address}</span>
                </div>
              </div>
              <div className="addr-actions">
                <button className="text-link mono" type="button" onClick={() => void copy(session.address)}>Copy address</button>
                <a className="text-link mono" href={explorerAddress(session.address)} target="_blank" rel="noreferrer">Explorer</a>
                <RecoveryPhraseButton />
              </div>
              <p className="fine">
                {session.kind === "email"
                  ? "Your Nuluvium keys come from a 12-word recovery phrase made in this browser. Another device needs the phrase."
                  : "Your Nuluvium keys come from a signature of this wallet: log in with the same wallet on any device and they are the same."}{" "}
                Your trades are made from fresh addresses, never from this wallet.
              </p>
            </section>

            <section className="app-card" aria-label="Backup">
              <div className="card-head"><h2 className="title">Backup your orders</h2><span className="mono soft">{orders.length} in this browser</span></div>
              <p className="card-text">
                Your order schedule and history live only in this browser. If its data is cleared, open orders stop and the list is gone (pieces already sent stay on chain). A backup is the same encrypted record as a file: it holds no address, and only your keys can open it.
              </p>
              <div className="button-row">
                <button className="button" type="button" disabled={Boolean(working)} onClick={() => void download()}>Download backup</button>
                <button className="button outline" type="button" disabled={Boolean(working)} onClick={() => fileInput.current?.click()}>Restore from file</button>
                <input
                  ref={fileInput}
                  type="file"
                  accept="application/json,.json"
                  hidden
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) void restore(file);
                  }}
                />
              </div>
              {working ? <p className="reason" aria-live="polite">{working}</p> : null}
              <p className="fine">Restore adds orders this browser does not have yet and keeps the ones it has.</p>
            </section>

            <section className="app-card" aria-label="Clear this browser">
              <div className="card-head"><h2 className="title">Clear this browser</h2><span className="mono soft">Shared or public computer</span></div>
              <p className="card-text">Removes every Nuluvium record from this browser, then logs you out. Your balance and holdings stay on chain; log in again to see them.</p>
              <div className="button-row">
                <button className="button outline" type="button" disabled={Boolean(working)} onClick={() => setConfirmClear(true)}>Clear this browser</button>
              </div>
            </section>
          </div>

          <aside className="desk-rail" aria-label="Where your data lives">
            <section className="app-card">
              <div className="card-head"><h2 className="title">Where your data lives</h2></div>
              <dl className="where-list">
                <div><dt>On chain, public</dt><dd>Deposits and the pieces that went out. Pieces are not linked to you.</dd></div>
                <div><dt>On chain, found with your keys</dt><dd>Your shielded balance and what each fresh address holds. Any device can find them again.</dd></div>
                <div><dt>Only in this browser</dt><dd>Your order schedule and history, encrypted with your keys.{session.kind === "email" ? " Also your recovery phrase, encrypted." : ""}</dd></div>
                <div><dt>On our servers</dt><dd>Nothing about you. The relayer keeps no logs. Privy, the login provider, knows your login email or wallet.</dd></div>
              </dl>
            </section>
          </aside>
        </div>
      )}

      <Dialog
        open={confirmClear}
        onClose={closeClear}
        title="Clear this browser?"
        lead="Every Nuluvium record in this browser is removed, for every account that used it, and you are logged out."
      >
        <ul className="fine">
          <li>{orders.length} {orders.length === 1 ? "order" : "orders"} and their history are removed from this browser{openOrders > 0 ? `; ${openOrders} open ${openOrders === 1 ? "order stops" : "orders stop"} sending pieces` : ""}. Download a backup first if you want to keep them.</li>
          {session?.kind === "email" ? <li>Your recovery phrase is removed from this browser. Without the 12 words written down, your balance cannot be opened again, by us or anyone.</li> : <li>Your keys come back when you log in with the same wallet.</li>}
          <li>Your balance and holdings stay on chain.</li>
        </ul>
        <div className="modal-options">
          <button type="button" onClick={() => void clear()}><span>Clear and log out</span><span className="chip">Clear</span></button>
        </div>
      </Dialog>
    </>
  );
}
