import { AgendaProvider } from "@/components/AgendaProvider";
import { AppShell } from "@/components/AppShell";

export default function ProtectedLayout({ children }: { children: React.ReactNode }) {
  return (
    <AgendaProvider>
      <AppShell>{children}</AppShell>
    </AgendaProvider>
  );
}
