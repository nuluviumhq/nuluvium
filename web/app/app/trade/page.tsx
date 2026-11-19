import type { Metadata } from "next";
import { Trade } from "@/components/app/Trade";

export const metadata: Metadata = { title: "Trade", description: "Route an order through fresh addresses." };

export default function Page() {
  return <Trade />;
}
