import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { Suspense } from "react";
import "../globals.css";
import Sidebar from "@/components/Sidebar";
import TopBar from "@/components/TopBar";
import ThemeProvider from "@/components/ThemeProvider";
import { SidebarProvider } from "@/context/SidebarContext";
import { ConfirmProvider } from "@/components/ConfirmProvider";
import AuthHeartbeat from "@/components/AuthHeartbeat";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  weight: ["300", "400", "600", "700"],
});

export const metadata: Metadata = {
  title: "SmartVault",
  description: "Intelligent File & Document Management System",
};

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ThemeProvider>
      <ConfirmProvider>
        <SidebarProvider>
          <div
            className={`${inter.variable} font-sans antialiased bg-[var(--bg-app)] text-[var(--text-primary)] text-[17px] leading-[1.44] tracking-[-0.01em] selection:bg-[var(--accent)] selection:text-white flex h-dvh min-h-0 overflow-hidden`}
          >
            {/* Sidebar */}
            <Suspense fallback={<div className="hidden md:block w-64 bg-[var(--bg-surface)] border-r border-[var(--border-subtle)]" />}>
              <Sidebar />
            </Suspense>

            {/* Main content */}
            <div className="flex-1 flex flex-col min-w-0 md:pl-64">
              <Suspense fallback={<div className="h-[52px] w-full bg-[var(--bg-surface)] border-b border-[var(--border-subtle)]" />}>
                <TopBar />
              </Suspense>
              <AuthHeartbeat />
              <main className="flex-1 overflow-y-auto mt-[52px] relative min-w-0">
                {children}
              </main>
            </div>
          </div>
        </SidebarProvider>
      </ConfirmProvider>
    </ThemeProvider>
  );
}
