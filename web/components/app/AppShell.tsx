"use client";

// App shell (ported from prototype/shell.js): sidebar, phone top bar and tab bar around the page.
// DOM: .mobile-bar, .app > (aside.sidebar, main.app-main > page), .tab-bar. The testnet note lives in
// the sidebar (and the phone account menu), so page content starts at the top.

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronIcon, LogoutIcon } from "@/components/icons";
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

/** The login, short: address and login type, opening the Account page (copy, explorer, recovery phrase live there). */
function AccountChip({ onOpen }: { onOpen?: (event: React.MouseEvent<HTMLAnchorElement>) => void }) {
  const { session } = useSession();
  if (!session) return null;
  return (
    <Link className="account-chip" href="/app/account" onClick={onOpen}>
      <span className="account-dot" aria-hidden="true" />
      <span className="account-text">
        <span className="addr">{session.wallet}</span>
        <span className="mono soft">{session.kind === "email" ? "Email login" : "Wallet"}</span>
      </span>
      <ChevronIcon />
    </Link>
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
              <AccountChip onOpen={(event) => event.currentTarget.closest("details")?.removeAttribute("open")} />
              <span className="mono soft">Testnet · test tokens only</span>
              <button className="logout" type="button" onClick={logout}><LogoutIcon />Log out</button>
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
              <div className="account-row">
                <AccountChip />
                <button className="logout icon-only" type="button" onClick={logout} aria-label="Log out" title="Log out"><LogoutIcon /></button>
              </div>
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
