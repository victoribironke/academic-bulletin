import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { UserProvider } from "@/contexts/user-context";
import { Sidebar } from "@/components/layout/sidebar";
import { Header } from "@/components/layout/header";
import { Toaster } from "@/components/ui/sonner";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Academic Bulletin Review System",
  description:
    "Manage the academic bulletin review process at Babcock University",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${inter.variable} font-sans antialiased`}>
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
          <Toaster richColors position="top-right" />
        </UserProvider>
      </body>
    </html>
  );
}
