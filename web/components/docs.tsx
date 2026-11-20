// Docs: .doc pages (as on Terms and Privacy) with the list of subpages beside them.
// Content comes from the testnet build (docs/testnet.md, docs/mcp.md); keep facts in step with it.

import Link from "next/link";
import { SiteBehaviour } from "@/components/SiteBehaviour";
import { ArrowIcon } from "@/components/icons";
import { SiteHeader } from "@/components/site";

export const DOC_PAGES = [
  { slug: "", title: "Overview" },
  { slug: "getting-started", title: "Getting started" },
  { slug: "orders", title: "Placing an order" },
  { slug: "how-it-works", title: "How it works" },
  { slug: "agents", title: "Agents (MCP)" },
  { slug: "fees-and-limits", title: "Fees and limits" },
  { slug: "contracts", title: "Contracts" },
  { slug: "security", title: "Security and risks" },
  { slug: "faq", title: "Questions" },
] as const;

export type DocSlug = (typeof DOC_PAGES)[number]["slug"];

const href = (slug: string) => (slug ? `/docs/${slug}` : "/docs");
const number = (index: number) => String(index + 1).padStart(2, "0");

/** One docs page: header, subpage list, the page's sections, and links to the pages before and after. */
export function DocsPage({ slug, lead, children }: { slug: DocSlug; lead: string; children: React.ReactNode }) {
  const index = DOC_PAGES.findIndex((page) => page.slug === slug);
  const page = DOC_PAGES[index]!;
  const previous = DOC_PAGES[index - 1];
  const next = DOC_PAGES[index + 1];
  return (
    <>
      <SiteHeader solid current="docs" />
      <div className="wrap docs">
        <aside className="docs-nav">
          <p className="mono">Docs · testnet</p>
          <nav aria-label="Docs">
            {DOC_PAGES.map((item, itemIndex) => (
              <Link key={item.slug} href={href(item.slug)} aria-current={item.slug === slug ? "page" : undefined}>
                <span className="n">{number(itemIndex)}</span>
                <span className="t">{item.title}</span>
              </Link>
            ))}
          </nav>
        </aside>
        <main className="doc">
          <p className="mono">Docs · {number(index)}</p>
          <h1 className="display">{page.title}</h1>
          <p className="lead">{lead}</p>
          <p className="notice">Nuluvium runs on Robinhood Chain testnet with test tokens. Nothing here is investment advice.</p>
          {children}
          <p className="doc-links">
            {previous ? <Link className="text-link" href={href(previous.slug)}><ArrowIcon direction="left" />{previous.title}</Link> : <Link className="text-link" href="/">Back to the site</Link>}
            {next ? <Link className="text-link next" href={href(next.slug)}>{next.title}<ArrowIcon /></Link> : null}
          </p>
        </main>
      </div>
      <SiteBehaviour />
    </>
  );
}

/** A numbered section, as on the legal pages. */
export function DocSection({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2><span className="n">{number(n - 1)}</span>{title}</h2>
      {children}
    </section>
  );
}
