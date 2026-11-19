// Ported from prototype/404.html.
import type { Metadata } from "next";
import Link from "next/link";
import { SiteBehaviour } from "@/components/SiteBehaviour";
import { SiteHeader } from "@/components/site";

export const metadata: Metadata = { title: "Page not found" };

export default function NotFound() {
  return (
    <>
      <SiteHeader solid />
      <main>
          <section className="hero-section">
            <div className="painting hero">
              <img className="art" src="/assets/footer.jpg" alt="" />
              <div className="inner">
                <h1 className="display"><span className="line"><span>This page is</span></span><span className="line"><span>unseen</span></span></h1>
                <div className="rule"></div>
                <div className="below">
                  <p className="lead">The page you asked for does not exist, or it has moved.</p>
                  <Link className="button light" href="/">Back to the site</Link>
                </div>
              </div>
            </div>
          </section>
        </main>
      <SiteBehaviour />
    </>
  );
}
