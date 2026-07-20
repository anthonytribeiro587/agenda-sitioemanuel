import { AgendaProvider } from "@/components/AgendaProvider";
import { AppShell } from "@/components/AppShell";
import { SettingsProvider } from "@/components/SettingsProvider";

export default function ProtectedLayout({ children }: { children: React.ReactNode }) {
  return (
    <AgendaProvider>
      <SettingsProvider>
        <AppShell>{children}</AppShell>
      </SettingsProvider>
    </AgendaProvider>
  );
}
