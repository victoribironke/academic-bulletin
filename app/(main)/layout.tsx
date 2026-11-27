import { cookies } from "next/headers";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { SiteHeader } from "@/components/layout/site-header";
import { CountdownBar } from "@/components/calendar/countdown";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { UserProvider } from "@/contexts/user-context";
import { OfflineBanner } from "@/components/shared/offline-banner";

export default async function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Remember whether the sidebar was collapsed between visits.
  const cookieStore = await cookies();
  const defaultOpen = cookieStore.get("sidebar_state")?.value !== "false";

  return (
    <UserProvider>
      <SidebarProvider defaultOpen={defaultOpen}>
        <AppSidebar />
        <SidebarInset>
          <SiteHeader />
          {/* C3: everyone's own deadline, on every page. */}
          <CountdownBar />
          <main className="flex-1 p-4 md:p-6">
            <div className="mx-auto w-full max-w-7xl">
              {/* U2: work is never lost when the connection drops. */}
              <OfflineBanner />
              {children}
            </div>
          </main>
        </SidebarInset>
      </SidebarProvider>
    </UserProvider>
  );
}
