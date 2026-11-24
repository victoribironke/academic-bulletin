import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";
import { isTestSite } from "@/lib/environment";
import { PretendClock } from "@/components/layout/pretend-clock";

const geistSans = Geist({
  subsets: ["latin"],
  variable: "--font-geist-sans",
});

const geistMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-geist-mono",
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
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable}`}>
      <body className="font-sans antialiased">
        {isTestSite() && (
          <div
            role="note"
            className="sticky top-0 z-[100] bg-amber-400 px-4 py-1 text-center text-sm font-semibold text-amber-950"
          >
            <span className="inline-flex flex-wrap items-center justify-center gap-x-3">
              <span>TEST SITE: nothing here is real, and emails go only to the DAP test inbox.</span>
              <PretendClock />
            </span>
          </div>
        )}
        {children}
        <Toaster richColors position="top-right" />
      </body>
    </html>
  );
}
