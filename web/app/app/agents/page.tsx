import type { Metadata } from "next";
import { Agents } from "@/components/app/Agents";

export const metadata: Metadata = { title: "Agents", description: "Let an AI agent trade without leaving a trail back to its strategy." };

export default function Page() {
  return <Agents />;
}
