"use client";

// App shell (ported from prototype/shell.js): sidebar, phone top bar and tab bar around the page.
// Same DOM as the prototype: .mobile-bar, .app > (aside.sidebar, main.app-main > .app-top + page), .tab-bar

import Link from "next/link";
import { usePathname } from "next/navigation";
import { formatUsdg } from "@/lib/chain";
import { RecoveryPhraseButton } from "./RecoveryPhrase";
import { useSession } from "./session";

const PAGES = [
  { id: "overview", href: "/app", label: "Overview" },
  { id: "trade", href: "/app/trade", label: "Trade" },
  { id: "orders", href: "/app/orders", label: "Orders" },
  { id: "agents", href: "/app/agents", label: "Agents" },
  { id: "proof", href: "/app/proof", label: "Proof" },
] as const;

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const current = PAGES.find((page) => page.href === pathname) ?? PAGES[0];
  const { session, openLogin, logout, balance } = useSession();
  // Top bar: the balance you can spend now, on every page (was a sample market clock).
  const ready = balance.value?.approved;
  const topLine = !session ? "" : ready === undefined ? "Shielded balance · reading…" : `Shielded balance · ${formatUsdg(ready)} tUSDG ready`;

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
            {session ? (
              <>
                <span className="mono soft">{session.kind === "email" ? "Email login · unlocked" : "Wallet · unlocked"}</span>
                <span className="addr">{session.wallet}</span>
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
          <div className="app-top">
            <span className="mono soft">{topLine}</span>
            <span className="sample">Testnet · test tokens only</span>
          </div>
          {children}
        </main>
      </div>
      <nav className="tab-bar" aria-label="App">
        {PAGES.map((page) => (
          <Link key={page.id} href={page.href} aria-current={page.id === current.id ? "page" : undefined}>
            {page.label}
          </Link>
        ))}
      </nav>
    </>
  );
}
