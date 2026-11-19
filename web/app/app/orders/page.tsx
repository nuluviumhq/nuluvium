import type { Metadata } from "next";
import { Orders } from "@/components/app/Orders";

export const metadata: Metadata = { title: "Orders", description: "Every order you routed, and how far its pieces got." };

export default function Page() {
  return <Orders />;
}
