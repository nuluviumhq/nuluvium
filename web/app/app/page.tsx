import type { Metadata } from "next";
import { Overview } from "@/components/app/Overview";

export const metadata: Metadata = { title: "Overview", description: "Your shielded balance and the orders it is routing." };

export default function Page() {
  return <Overview />;
}
