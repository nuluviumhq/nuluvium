"use client";

// "Start here": the step-by-step guide at the top of Overview (prototype/walkthrough.html). The steps
// come from the chain and this browser (Overview.tsx), so it moves on by itself. Each step has one
// action and "Show me", which scrolls to the real control and lights it up for a moment. When the last
// step is done it says so, then fades and folds its height to zero, so no empty space is left.

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

export type GuideStep = "funds" | "deposit" | "approved" | "order";
const ORDER: GuideStep[] = ["funds", "deposit", "approved", "order"];
const NAMES: Record<GuideStep, string> = { funds: "Test funds", deposit: "Deposit", approved: "Clean-funds check", order: "First private order" };
/** Ids of the real controls "Show me" points at (set in Overview.tsx). */
const TARGETS: Record<GuideStep, string> = { funds: "guide-target-funds", deposit: "guide-target-deposit", approved: "guide-target-deposits", order: "guide-target-order" };

interface OnboardGuideProps {
  /** The step to do now; null once all four are done. */
  current: GuideStep | null;
  working: boolean;
  depositLabel: string;
  canDeposit: boolean;
  /** Deposit number being checked, when one is waiting for the clean-funds check. */
  checking: string | null;
  onGetFunds: () => void;
  onDeposit: (event: React.MouseEvent) => void;
  onHide: () => void;
  /** Called once the guide has folded away after the last step. */
  onFinished: () => void;
}

/** Scrolls to a control and lights it up for a moment (the rest of the page dims). */
function showMe(id: string) {
  const target = document.getElementById(id);
  if (!target) return;
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  target.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "center" });
  target.classList.add("spotlit");
  window.setTimeout(() => target.classList.remove("spotlit"), 2400);
}

export function OnboardGuide({ current, working, depositLabel, canDeposit, checking, onGetFunds, onDeposit, onHide, onFinished }: OnboardGuideProps) {
  const root = useRef<HTMLElement | null>(null);
  const [leaving, setLeaving] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const at = current === null ? ORDER.length : ORDER.indexOf(current);

  // While the check runs, count the seconds so the wait reads as progress.
  useEffect(() => {
    setSeconds(0);
    if (current !== "approved") return;
    const timer = window.setInterval(() => setSeconds((value) => value + 1), 1000);
    return () => window.clearInterval(timer);
  }, [current]);

  // All done: show the done line, then fade, fold to zero height (from the measured height), finish.
  useEffect(() => {
    if (current !== null) return;
    const fold = window.setTimeout(() => {
      if (root.current) root.current.style.maxHeight = `${root.current.scrollHeight}px`;
      void root.current?.offsetHeight;
      setLeaving(true);
    }, 2500);
    const finish = window.setTimeout(onFinished, 3400);
    return () => {
      window.clearTimeout(fold);
      window.clearTimeout(finish);
    };
  }, [current, onFinished]);

  return (
    <section ref={root} className={leaving ? "app-card guide leaving" : "app-card guide"} aria-label="Start here">
      <div className="guide-head">
        <p className="mono">Start here · {at} of 4 done · about three minutes</p>
        <button className="text-link mono soft" type="button" onClick={onHide}>Hide guide</button>
      </div>

      <ol className="guide-steps">
        {ORDER.map((step, index) => (
          <li key={step} className={index < at ? "done" : index === at ? "current" : undefined} aria-current={index === at ? "step" : undefined}>
            <span className="dot"><i>{index + 1}</i></span>
            <span className="name">{NAMES[step]}</span>
          </li>
        ))}
      </ol>

      {current === "funds" ? (
        <div className="guide-body" key="funds">
          <div>
            <h2 className="title">Get free test funds</h2>
            <p>100 test USDG and a little test ETH for gas, once a day. Nothing to sign.</p>
          </div>
          <div className="guide-actions">
            <button className="button" type="button" disabled={working} onClick={onGetFunds}>Get test funds</button>
            <button className="text-link mono" type="button" onClick={() => showMe(TARGETS.funds)}>Show me</button>
          </div>
        </div>
      ) : current === "deposit" ? (
        <div className="guide-body" key="deposit">
          <div>
            <h2 className="title">Deposit into your shielded balance</h2>
            <p>Your wallet asks twice the first time: allow, then deposit. The deposit itself is public; what it pays for later is not linked to it.</p>
          </div>
          <div className="guide-actions">
            <button className="button" type="button" disabled={working || !canDeposit} onClick={onDeposit}>Deposit {depositLabel} tUSDG</button>
            <button className="text-link mono" type="button" onClick={() => showMe(TARGETS.deposit)}>Show me</button>
          </div>
        </div>
      ) : current === "approved" ? (
        <div className="guide-body" key="approved">
          <div>
            <h2 className="title">Wait for the clean-funds check</h2>
            <p>Every deposit is checked before it can be spent, usually within a minute. Nothing to do; this page updates by itself.</p>
          </div>
          <div className="guide-actions">
            <span className="guide-wait mono" role="status">
              <span className="pulse" aria-hidden="true" />
              {checking ? `Checking deposit #${checking}` : "Checking"} · {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, "0")}
            </span>
            <button className="text-link mono" type="button" onClick={() => showMe(TARGETS.approved)}>Show me</button>
          </div>
        </div>
      ) : current === "order" ? (
        <div className="guide-body" key="order">
          <div>
            <h2 className="title">Route your first private order</h2>
            <p>Buy a stock token in pieces, each from its own fresh address. Try 10 tUSDG of MSTK in 3 pieces over 5 minutes.</p>
          </div>
          <div className="guide-actions">
            <Link className="button" href="/app/trade">Start a private order</Link>
            <button className="text-link mono" type="button" onClick={() => showMe(TARGETS.order)}>Show me</button>
          </div>
        </div>
      ) : (
        <div className="guide-body done" key="done" role="status">
          <div>
            <h2 className="title">You&#39;re set up</h2>
            <p>Your first order is routing. Its pieces appear under Your pieces as they go out.</p>
          </div>
        </div>
      )}
    </section>
  );
}
