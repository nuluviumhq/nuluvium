"use client";

// The login screen (prototype/login.html): a painting on the left, the form on the right. It covers
// the app while nobody is unlocked, so a page under it (a half-filled order) keeps its state and an
// action that asked for login runs right after. "Look around first" hides it until the next login.
// Steps: email + one-time code (Privy, headless) or a wallet (Privy's wallet list), then for an email
// login the recovery phrase is made or restored here (session.tsx does the work).

import { useEffect, useRef, useState } from "react";
import { ArrowIcon } from "@/components/icons";
import type { PrivyState } from "@/lib/privyState";

export type PhraseStep = { mode: "choose" } | { mode: "new"; phrase: string; saved: boolean } | { mode: "restore"; text: string };

interface LoginScreenProps {
  privy: PrivyState;
  phrase: PhraseStep | null;
  setPhrase: (phrase: PhraseStep) => void;
  /** True once the person asked to unlock: the keys are being made. */
  unlocking: boolean;
  busy: boolean;
  step: string | null;
  error: string | null;
  setError: (error: string | null) => void;
  /** Asks session.tsx to unlock as soon as Privy has logged in. */
  onBegin: () => void;
  onNewPhrase: () => void;
  onApplyPhrase: (text: string) => void;
  /** Hides the screen ("Look around first", Escape). */
  onBrowse: () => void;
}

/** Privy's errors in plain words (the raw ones mention codes and endpoints). */
function emailError(error: unknown, stage: "send" | "code"): string {
  const text = error instanceof Error ? error.message : "";
  if (stage === "code") return /attempt|expired/i.test(text) ? "That code has expired. Send a new one." : "That code is not right. Check the email and try again.";
  return /invalid|email/i.test(text) ? "That email address does not look right." : "The code could not be sent. Please try again.";
}

export function LoginScreen(props: LoginScreenProps) {
  const { privy, phrase, setPhrase, unlocking, busy, step, error, setError, onBegin, onNewPhrase, onApplyPhrase, onBrowse } = props;
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [stage, setStage] = useState<"email" | "code">("email");
  const [sending, setSending] = useState(false);
  const [slow, setSlow] = useState(false);
  const art = useRef<HTMLElement | null>(null);
  const form = useRef<HTMLDivElement | null>(null);

  // A new step: focus its first field or button (keyboard and screen readers land on it).
  const view = phrase?.mode ?? (privy.authenticated ? "unlock" : stage);
  // biome-ignore lint/correctness/useExhaustiveDependencies: runs when the step changes
  useEffect(() => {
    const first = form.current?.querySelector<HTMLElement>("input, textarea, button:not([disabled])");
    first?.focus({ preventScroll: true });
  }, [view]);

  // Unlocking for a while: say it is still working, so it does not look stuck.
  const waiting = privy.authenticated && unlocking && !phrase;
  useEffect(() => {
    setSlow(false);
    if (!waiting) return;
    const timer = window.setTimeout(() => setSlow(true), 12_000);
    return () => window.clearTimeout(timer);
  }, [waiting]);

  // The page under the screen does not scroll while it is shown; Escape looks around instead.
  useEffect(() => {
    const root = document.documentElement;
    const previous = root.style.overflow;
    root.style.overflow = "hidden";
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && onBrowse();
    document.addEventListener("keydown", onKey);
    return () => {
      root.style.overflow = previous;
      document.removeEventListener("keydown", onKey);
    };
  }, [onBrowse]);

  // The lens: the painting's colour shows through a circle that follows a fine pointer.
  const onPointerMove = (event: React.PointerEvent<HTMLElement>) => {
    if (event.pointerType !== "mouse" || !art.current) return;
    const box = art.current.getBoundingClientRect();
    art.current.style.setProperty("--lx", `${event.clientX - box.left}px`);
    art.current.style.setProperty("--ly", `${event.clientY - box.top}px`);
    art.current.classList.add("looking");
  };

  const sendCode = async (event?: React.FormEvent) => {
    event?.preventDefault();
    if (!email.trim() || sending) return;
    setError(null);
    setSending(true);
    try {
      await privy.sendEmailCode(email.trim());
      setCode("");
      setStage("code");
    } catch (failure) {
      setError(emailError(failure, "send"));
    } finally {
      setSending(false);
    }
  };

  const checkCode = async (event?: React.FormEvent) => {
    event?.preventDefault();
    if (code.trim().length < 6 || sending) return;
    setError(null);
    setSending(true);
    onBegin();
    try {
      await privy.loginWithEmailCode(code.trim());
    } catch (failure) {
      setError(emailError(failure, "code"));
    } finally {
      setSending(false);
    }
  };

  const loginWithWallet = () => {
    setError(null);
    onBegin();
    privy.loginWithWallet();
  };

  return (
    <div className="login-screen" role="dialog" aria-modal="true" aria-labelledby="login-title">
      <div className="login-split">
        <aside className="login-art" aria-hidden="true" ref={art} onPointerMove={onPointerMove} onPointerLeave={() => art.current?.classList.remove("looking")}>
          <img className="base" src="/art/login-masked-square-duo.webp" alt="" />
          <img className="lens" src="/art/login-masked-square.webp" alt="" />
          <span className="wordmark">Nuluvium</span>
          <div className="login-caption">
            <p className="title">Your order leaves in pieces, carried by addresses nobody can tie back to you.</p>
            <ul className="mono">
              <li><span>01</span>Keys are made in this browser</li>
              <li><span>02</span>Privy never sees them</li>
              <li><span>03</span>Testnet · test tokens only</li>
            </ul>
          </div>
        </aside>

        <div className="login-panel">
          <div className="login-top">
            <a className="text-link mono back" href="/"><ArrowIcon direction="left" />Back to site</a>
            <span className="sample network">Testnet</span>
          </div>

          <div className="login-form" ref={form}>
            {phrase?.mode === "choose" ? (
              <section className="login-step" key="choose">
                <h1 className="display" id="login-title">Your keys</h1>
                <p className="lead">Your Nuluvium keys are made on this device and protected by a recovery phrase only you keep. Privy never sees it.</p>
                <div className="modal-options">
                  <button type="button" disabled={busy} onClick={onNewPhrase}><span>First time: make new keys</span><span className="chip">01</span></button>
                  <button type="button" disabled={busy} onClick={() => { setError(null); setPhrase({ mode: "restore", text: "" }); }}><span>I have a recovery phrase</span><span className="chip">02</span></button>
                </div>
              </section>
            ) : phrase?.mode === "new" ? (
              <section className="login-step" key="new">
                <h1 className="display" id="login-title">Write these down</h1>
                <p className="lead">12 words. You need them on another device or after clearing this browser. Without them your balance cannot be recovered, by us or anyone.</p>
                <pre className="code"><code>{phrase.phrase}</code></pre>
                <label className="fine login-check">
                  <input type="checkbox" checked={phrase.saved} onChange={(event) => setPhrase({ ...phrase, saved: event.target.checked })} />
                  I wrote the 12 words down and keep them somewhere safe.
                </label>
                <button className="button" type="button" disabled={busy || !phrase.saved} onClick={() => onApplyPhrase(phrase.phrase)}>{busy ? "Saving…" : "Continue to the app"}</button>
              </section>
            ) : phrase?.mode === "restore" ? (
              <section className="login-step" key="restore">
                <h1 className="display" id="login-title">Enter your phrase</h1>
                <p className="lead">The 12 words from your first login, in order, separated by spaces.</p>
                <textarea
                  className="code login-phrase"
                  value={phrase.text}
                  onChange={(event) => setPhrase({ mode: "restore", text: event.target.value })}
                  aria-label="Recovery phrase"
                  autoComplete="off"
                  spellCheck={false}
                />
                <button className="button" type="button" disabled={busy || !phrase.text.trim()} onClick={() => onApplyPhrase(phrase.text)}>{busy ? "Checking…" : "Restore my keys"}</button>
                <p className="fine login-row"><button className="text-link" type="button" disabled={busy} onClick={() => { setError(null); setPhrase({ mode: "choose" }); }}>Back</button></p>
              </section>
            ) : privy.authenticated ? (
              <section className="login-step" key="unlock">
                {error === "Connect your wallet to unlock." ? (
                  <>
                    <h1 className="display" id="login-title">Connect your wallet</h1>
                    <p className="lead">You logged in with a wallet. Connect it again to make your Nuluvium keys on this device.</p>
                    <button className="button" type="button" onClick={() => privy.connectWallet()}>Connect your wallet</button>
                  </>
                ) : unlocking ? (
                  <>
                    <h1 className="display" id="login-title">Unlocking</h1>
                    <p className="lead" aria-live="polite">{step ?? "Getting your wallet ready…"}</p>
                    {error ? null : <span className="login-progress" aria-hidden="true" />}
                    {slow && !error ? <p className="fine">Still working. The first login can take a little longer while Privy sets up your wallet. If it does not finish, allow nuluvium.com in your ad blocker or Brave Shields, then reload.</p> : null}
                    {error ? <button className="button" type="button" disabled={busy} onClick={onBegin}>Try again</button> : null}
                  </>
                ) : (
                  <>
                    <h1 className="display" id="login-title">Welcome back</h1>
                    <p className="lead">You are logged in. Unlock to make your Nuluvium keys on this device again.</p>
                    <button className="button" type="button" onClick={onBegin}>Unlock</button>
                  </>
                )}
                <p className="fine login-row"><button className="text-link" type="button" onClick={() => { setStage("email"); setError(null); void privy.logout(); }}>Use another account</button></p>
              </section>
            ) : stage === "code" ? (
              <form className="login-step" key="code" onSubmit={checkCode}>
                <h1 className="display" id="login-title">Check your email</h1>
                <p className="lead">We sent a 6-digit code to <b>{email.trim()}</b>.</p>
                <div className="field">
                  <label className="mono" htmlFor="login-code">Code</label>
                  <div className="control">
                    <input id="login-code" className="code-input" inputMode="numeric" autoComplete="one-time-code" maxLength={6} placeholder="000000" value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))} />
                  </div>
                </div>
                <button className="button" type="submit" disabled={sending || code.length < 6}>{sending ? "Checking…" : "Log in"}</button>
                <p className="fine login-row">
                  <button className="text-link" type="button" onClick={() => { setStage("email"); setError(null); }}>Use another email</button>
                  <button className="text-link" type="button" disabled={sending} onClick={() => void sendCode()}>Send a new code</button>
                </p>
              </form>
            ) : (
              <form className="login-step" key="email" onSubmit={sendCode}>
                <h1 className="display" id="login-title">Log in</h1>
                <p className="lead">With your email or a wallet. Your Nuluvium keys are made here, on this device.</p>
                <div className="field">
                  <label className="mono" htmlFor="login-email">Email</label>
                  <div className="control">
                    <input id="login-email" type="email" placeholder="you@example.com" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} />
                  </div>
                </div>
                <button className="button" type="submit" disabled={sending || !privy.ready || !email.trim()}>{sending ? "Sending the code…" : "Continue with email"}</button>
                <p className="login-or mono soft"><span>or</span></p>
                <button className="button outline" type="button" disabled={!privy.ready} onClick={loginWithWallet}>Connect a wallet</button>
              </form>
            )}
            {error && error !== "Connect your wallet to unlock." ? <p className="fine login-error" role="alert">{error}</p> : null}
          </div>

          <div className="login-foot">
            <button className="text-link look" type="button" onClick={onBrowse}>Look around first<ArrowIcon /></button>
            <p className="fine">Login by Privy: it knows your email and login wallet, never your Nuluvium keys or fresh addresses. Stock tokens are not available to US persons.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
