import type { Metadata } from "next";
import { IBM_Plex_Sans } from "next/font/google";
import AppShell from "@/components/layout/AppShell";
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
    <html lang="en">
      <body className={`${plexSans.className} bg-[#F3F6FA] text-slate-800 antialiased`}>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
