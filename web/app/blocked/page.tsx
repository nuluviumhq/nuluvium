// Shown (with HTTP 451) by custom-worker.ts when the app is opened from a country where Nuluvium
// is not offered. Same look as the 404 page.
import type { Metadata } from "next";
import Link from "next/link";
import { SiteBehaviour } from "@/components/SiteBehaviour";
import { SiteHeader } from "@/components/site";

export const metadata: Metadata = { title: "Not available in your country" };

export default function Blocked() {
  return (
    <>
      <SiteHeader solid />
      <main>
        <section className="hero-section">
          <div className="painting hero">
            {/* eslint-disable-next-line @next/next/no-img-element -- decorative painting, sized by CSS */}
            <img className="art" src="/assets/footer.jpg" alt="" />
            <div className="inner">
              <h1 className="display"><span className="line"><span>Not available</span></span><span className="line"><span>where you are</span></span></h1>
              <div className="rule"></div>
              <div className="below">
                <p className="lead">Stock tokens are not offered to US persons or in restricted countries, and Nuluvium is not open in the European Union yet. You can still read the site.</p>
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
