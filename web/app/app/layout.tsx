import { AppShell } from "@/components/app/AppShell";
import { PrivyAuth } from "@/components/app/PrivyAuth";
import { SessionProvider } from "@/components/app/session";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <PrivyAuth>
      <SessionProvider>
        <AppShell>{children}</AppShell>
      </SessionProvider>
    </PrivyAuth>
  );
}
