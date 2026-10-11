import type { Metadata } from "next";
import { IBM_Plex_Sans } from "next/font/google";
import AppShell from "@/components/layout/AppShell";
import { THEME_BOOT_SCRIPT } from "@/lib/appearance";
import "./globals.css";

const plexSans = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "OEE Monitoring | URC",
  description: "Realtime OEE monitoring for PT. URC Indonesia",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // data-theme / data-accent are set before paint by the script below, so React must not complain.
    <html lang="en" data-theme="light" data-accent="blue" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
      </head>
      <body className={`${plexSans.className} bg-(--app-bg) text-slate-800 antialiased`}>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
