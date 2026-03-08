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
      <div className="flex min-h-screen">
        {/* Sidebar */}
        <Sidebar />

        {/* Main content area */}
        <div className="flex-1 pl-64">
          {/* Header */}
          <Header />

          {/* Page content */}
          <main className="p-6">{children}</main>
        </div>
      </div>
    </UserProvider>
  );
}
