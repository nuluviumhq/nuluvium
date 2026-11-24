import type { Metadata } from "next";
import Link from "next/link";
import { DocSection, DocsPage } from "@/components/docs";
import { CompareCard, Footnote } from "@/components/layouts";

export const metadata: Metadata = {
  title: "How it works · Docs",
  description: "The shielded pool, the approved set, zero-knowledge proofs, the relayer and the Router, step by step.",
};

export default function Page() {
  return (
    <DocsPage slug="how-it-works" lead="Four steps: shield, screen, prove, route. What happens on chain, and what stays with you.">
      <DocSection n={1} title="Shield">
        <p>Your deposit goes into the shielded pool, a fork of Privacy Pools v1.3.0 whose contracts and circuits are deployed unchanged. The pool records a commitment, a hash that hides who can spend it. The secret behind it, your note, stays on your device and can always be rebuilt from the chain with your keys.</p>
      </DocSection>
      <DocSection n={2} title="Screen">
        <p>The approved-set provider checks every deposit: the OFAC sanctions list, the stock token issuer&#39;s blocklist, Nuluvium&#39;s own denylist, and the deposit caps. It also checks where the wallet&#39;s USDG came from, one step back: if at least 10% of the deposit was sent by an address on one of those lists, the deposit is not approved. Smaller amounts from such an address do not count, so nobody can get your deposit refused by sending you a little. Funds that passed through another wallet first are not traced.</p>
        <p>It publishes the list of approved deposits under its content hash and in a public archive, and posts the list&#39;s root on chain. If a check cannot run, the deposit is not approved.</p>
        <p>Every refusal carries a reason code, for example <code>OVER_DEPOSIT_CAP</code>, <code>DENYLISTED</code> or <code>SOURCE_SANCTIONED</code>. The app shows it on the deposit in plain words with what to do next, and <Link className="text-link" href="/stats">Stats</Link> counts refusals by code.</p>
      </DocSection>
      <DocSection n={3} title="Prove">
        <p>For every piece, your browser makes a zero-knowledge proof: that you own an approved deposit with enough left, without saying which one. What is left becomes a new note that only you can spend. Proofs take a few seconds in the browser.</p>
      </DocSection>
      <DocSection n={4} title="Route">
        <p>A relayer sends the proof to the Nuluvium Router in one transaction. The pool releases the piece&#39;s USDG, the Router swaps it on a public Uniswap v3 pool, and the stock tokens go straight to the fresh address. The order is signed by the fresh address, so the relayer cannot change it. The relayer pays the gas and takes its fee in USDG; the Router also takes a 0.1% protocol fee from the piece, half for that relayer and half for the treasury Safe.</p>
        <p>The app picks the relayer from the relayer registry, where each relayer has bonded NLV (tNLV, a test token, on testnet), and tries another if one does not answer. Pieces of one order go through different relayers at random, so no relayer is sure to see them all. You never hold or pay NLV; the bond is the relayer&#39;s.</p>
      </DocSection>
      <DocSection n={5} title="What the chain shows, and what stays with you">
        <CompareCard sides={[
          { numeral: "I", title: "On the chain", text: "What any reader of the chain sees.", rows: [
            ["Your wallet", "One deposit into the pool"],
            ["The pieces", "Swaps from many fresh addresses, all sent by Nuluvium's relayers (shared by everyone), at different times and sizes"],
            ["Not shown", "Which deposit paid for which swap, or that the swaps belong to one order"],
          ] },
          { numeral: "II", title: "On your device", text: "What never leaves your device.", rows: [
            ["Keys and notes", "Made and kept in your browser"],
            ["Fresh addresses", "Made from your keys"],
            ["Order schedule", "In your browser, encrypted with your keys"],
          ] },
        ]} />
        <Footnote>To find your notes, the app reads every pool event and picks out yours in the browser, so the services it calls do not learn which deposits are yours. The relayer sees one piece at a time, with no link to the others; its logs are off.</Footnote>
      </DocSection>
    </DocsPage>
  );
}
