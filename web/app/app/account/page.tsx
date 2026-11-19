import type { Metadata } from "next";
import { Account } from "@/components/app/Account";

export const metadata: Metadata = { title: "Account", description: "Your login, a backup of your orders, and what this browser keeps." };

export default function Page() {
  return <Account />;
}
