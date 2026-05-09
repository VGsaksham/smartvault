import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { Suspense } from "react";
import "./globals.css";
import Sidebar from "@/components/Sidebar";
import TopBar from "@/components/TopBar";
import ThemeProvider from "@/components/ThemeProvider";
import { SidebarProvider } from "@/context/SidebarContext";
import { ConfirmProvider } from "@/components/ConfirmProvider";
import AuthHeartbeat from "@/components/AuthHeartbeat";

// Inter is the closest open-source equivalent to SF Pro
const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  weight: ["300", "400", "600", "700"],
});

export const metadata: Metadata = {
  title: "SmartVault",
  description: "Intelligent File & Document Management System",
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="theme-color" content="#f5f5f7" media="(prefers-color-scheme: light)" />
        <meta name="theme-color" content="#0f0f10" media="(prefers-color-scheme: dark)" />
      </head>
      <body
        className={`${inter.variable} font-sans antialiased bg-[var(--bg-app)] text-[var(--text-primary)] text-[17px] leading-[1.44] tracking-[-0.01em] selection:bg-[var(--accent)] selection:text-white`}
      >
        <ThemeProvider>
          <ConfirmProvider>
            <SidebarProvider>
            <div className="flex h-dvh min-h-0 overflow-hidden">
              {/* Sidebar — fixed on desktop, overlay on mobile */}
              <Suspense fallback={<div className="hidden md:block w-64 bg-[var(--bg-surface)] border-r border-[var(--border-subtle)]" />}>
                <Sidebar />
              </Suspense>

              {/* Main content area — full width on mobile, offset on desktop */}
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
      </body>
    </html>
  );
}
