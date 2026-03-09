import { Sidebar } from "@/components/layout/sidebar";
import { Header } from "@/components/layout/header";
import { UserProvider } from "@/contexts/user-context";

export default function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <UserProvider>
      <div className="flex h-screen overflow-hidden">
        {/* Sidebar */}
        <Sidebar />

        {/* Main content area */}
        <div className="flex flex-1 flex-col pl-64 h-screen overflow-hidden">
          {/* Header */}
          <Header />

          {/* Page content - this is the only scrollable area */}
          <main className="flex-1 overflow-y-auto p-6">{children}</main>
        </div>
      </div>
    </UserProvider>
  );
}
