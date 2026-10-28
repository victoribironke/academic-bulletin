import { cookies } from "next/headers";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { SiteHeader } from "@/components/layout/site-header";
import { HelpButton } from "@/components/layout/help-button";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { UserProvider } from "@/contexts/user-context";

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
          <main className="flex-1 p-4 md:p-6">
            <div className="mx-auto w-full max-w-7xl">{children}</div>
          </main>
        </SidebarInset>
        <HelpButton />
      </SidebarProvider>
    </UserProvider>
  );
}
