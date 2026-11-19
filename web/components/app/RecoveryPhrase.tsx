"use client";

// "Show recovery phrase" for an email login: reads the phrase back from this device's encrypted store
// (lib/deviceKeys.ts) while the person is unlocked. A warning comes first, the words only on a second
// click, and they are dropped from memory when the dialog closes. Wallet logins have no phrase: their
// keys come from a wallet signature, so the button is not shown for them.

import { useCallback, useState } from "react";
import { loadDeviceSecret } from "@/lib/deviceKeys";
import { usePrivyState } from "@/lib/privyState";
import { Dialog } from "./Dialog";
import { useSession } from "./session";

type View = { mode: "warn" } | { mode: "shown"; words: string } | { mode: "failed"; message: string };

export function RecoveryPhraseButton() {
  const { session } = useSession();
  const { userId } = usePrivyState();
  const [view, setView] = useState<View | null>(null);
  const close = useCallback(() => setView(null), []);

  if (session?.kind !== "email" || !userId) return null;

  const reveal = async () => {
    try {
      const words = await loadDeviceSecret(userId);
      setView(words ? { mode: "shown", words } : { mode: "failed", message: "No recovery phrase is stored in this browser. Log out and log in again with your phrase." });
    } catch {
      setView({ mode: "failed", message: "This browser could not read your stored keys (private mode or storage blocked)." });
    }
  };

  return (
    <>
      <button className="text-link mono" type="button" onClick={() => setView({ mode: "warn" })}>Show recovery phrase</button>
      <Dialog
        open={view !== null}
        onClose={close}
        title={view?.mode === "shown" ? "Your recovery phrase" : "Show your recovery phrase?"}
        lead={
          view?.mode === "shown"
            ? "These 12 words are your Nuluvium keys. Keep them offline; never paste them into a website or chat."
            : "Anyone who sees these 12 words can spend your shielded balance and see your trades. Make sure no one can see your screen."
        }
      >
        {view?.mode === "shown" ? (
          <pre className="code" style={{ marginTop: "1rem", whiteSpace: "pre-wrap" }}><code>{view.words}</code></pre>
        ) : view?.mode === "failed" ? (
          <p className="fine" role="alert">{view.message}</p>
        ) : (
          <div className="modal-options">
            <button type="button" onClick={() => void reveal()}><span>Show the 12 words</span><span className="chip">Reveal</span></button>
          </div>
        )}
      </Dialog>
    </>
  );
}
