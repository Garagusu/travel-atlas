import { AppNav } from "@/components/app-nav";
import { ConfirmProvider } from "@/components/ui/dialog";
import { ToastProvider } from "@/components/ui/toast";
import { requireUser } from "@/lib/auth";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  return (
    <ToastProvider>
      <ConfirmProvider>
        <AppNav userName={user.name} />
        <main className="flex-1 flex flex-col">{children}</main>
      </ConfirmProvider>
    </ToastProvider>
  );
}
