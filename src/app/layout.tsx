import type { Metadata } from "next";
// import { IBM_Plex_Sans } from "next/font/google";
import localFont from "next/font/local";
import AppShell from "@/components/layout/AppShell";
import { THEME_BOOT_SCRIPT } from "@/lib/appearance";
import "./globals.css";

// const plexSans = IBM_Plex_Sans({
//   subsets: ["latin"],
//   weight: ["400", "500", "600", "700"],
// });

const plexSans = localFont({
  src: [
    { path: "../../node_modules/@fontsource/ibm-plex-sans/files/ibm-plex-sans-latin-400-normal.woff2", weight: "400", style: "normal" },
    { path: "../../node_modules/@fontsource/ibm-plex-sans/files/ibm-plex-sans-latin-500-normal.woff2", weight: "500", style: "normal" },
    { path: "../../node_modules/@fontsource/ibm-plex-sans/files/ibm-plex-sans-latin-600-normal.woff2", weight: "600", style: "normal" },
    { path: "../../node_modules/@fontsource/ibm-plex-sans/files/ibm-plex-sans-latin-700-normal.woff2", weight: "700", style: "normal" },
  ],
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
