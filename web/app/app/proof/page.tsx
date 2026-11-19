import type { Metadata } from "next";
import { Proof } from "@/components/app/Proof";

export const metadata: Metadata = { title: "Proof", description: "What you can check yourself, and what you cannot yet." };

export default function Page() {
  return <Proof />;
}
