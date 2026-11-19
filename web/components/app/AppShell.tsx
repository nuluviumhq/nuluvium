"use client";

// App shell (ported from prototype/shell.js): sidebar, phone top bar and tab bar around the page.
// DOM: .mobile-bar, .app > (aside.sidebar, main.app-main > page), .tab-bar. The testnet note lives in
// the sidebar (and the phone account menu), so page content starts at the top.

import Link from "next/link";
import { usePathname } from "next/navigation";
import { explorerAddress } from "@/lib/wallet";
import { RecoveryPhraseButton } from "./RecoveryPhrase";
import { useSession } from "./session";

const PAGES = [
  { id: "overview", href: "/app", label: "Overview" },
  { id: "trade", href: "/app/trade", label: "Trade" },
  { id: "orders", href: "/app/orders", label: "Orders" },
  { id: "agents", href: "/app/agents", label: "Agents" },
  { id: "proof", href: "/app/proof", label: "Proof" },
  { id: "account", href: "/app/account", label: "Account" },
] as const;
// Phones: five tabs fit; Account is reached from the account menu instead.
const TABS = PAGES.filter((page) => page.id !== "account");

/** The full login-wallet address, with Copy and a link to the explorer (sidebar and phone menu). */
function FullAddress() {
  const { session, toast } = useSession();
  if (!session) return null;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(session.address);
      toast("Address copied.");
    } catch {
      toast("Could not copy. Select the address and copy it by hand.");
    }
  };
  return (
    <>
      <span className="addr addr-full">{session.address}</span>
      <span className="addr-actions">
        <button className="text-link mono" type="button" onClick={() => void copy()}>Copy</button>
        <a className="text-link mono" href={explorerAddress(session.address)} target="_blank" rel="noreferrer">Explorer</a>
      </span>
    </>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const current = PAGES.find((page) => page.href === pathname) ?? PAGES[0];
  const { session, openLogin, logout } = useSession();

  return (
    <>
      <div className="mobile-bar">
        <Link className="wordmark" href="/">Nuluvium</Link>
        {session ? (
          // Phones: the address opens a small menu, so Log out is not one stray tap away.
          <details className="account-menu">
            <summary className="mono">{session.wallet}</summary>
            <div className="menu-panel">
              <span className="mono soft">{session.kind === "email" ? "Email login · unlocked" : "Wallet · unlocked"}</span>
              <FullAddress />
              <span className="mono soft">Testnet · test tokens only</span>
              <Link className="text-link mono" href="/app/account" onClick={(event) => event.currentTarget.closest("details")?.removeAttribute("open")}>Account · backup</Link>
              <RecoveryPhraseButton />
              <button className="text-link mono" type="button" onClick={logout}>Log out</button>
            </div>
          </details>
        ) : (
          <button className="button" type="button" onClick={() => openLogin()}>Log in</button>
        )}
      </div>
      <div className="app">
        <aside className="sidebar">
          <Link className="wordmark" href="/">Nuluvium</Link>
          <nav aria-label="App">
            {PAGES.map((page, index) => (
              <Link key={page.id} href={page.href} aria-current={page.id === current.id ? "page" : undefined}>
                <span className="n">0{index + 1}</span>
                <span className="t">{page.label}</span>
              </Link>
            ))}
          </nav>
          <div className="foot account">
            <span className="sample network">Testnet · test tokens</span>
            {session ? (
              <>
                <span className="mono soft">{session.kind === "email" ? "Email login · unlocked" : "Wallet · unlocked"}</span>
                <FullAddress />
                <RecoveryPhraseButton />
                <button className="text-link mono" type="button" onClick={logout}>Log out</button>
              </>
            ) : (
              <>
                <span className="mono soft">Not logged in</span>
                <button className="button" type="button" onClick={() => openLogin()}>Log in</button>
              </>
            )}
          </div>
        </aside>
        <main className="app-main" data-page={current.id}>
          {children}
        </main>
      </div>
      <nav className="tab-bar" aria-label="App">
        {TABS.map((page) => (
          <Link key={page.id} href={page.href} aria-current={page.id === current.id ? "page" : undefined}>
            {page.label}
          </Link>
        ))}
      </nav>
    </>
  );
}
