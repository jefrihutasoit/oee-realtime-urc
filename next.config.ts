import { networkInterfaces } from "node:os";
import type { NextConfig } from "next";

/**
 * Hosts allowed to load `next dev` resources (scripts, HMR) besides localhost: this machine's own
 * IPv4 addresses, plus ALLOWED_DEV_ORIGINS (comma-separated, e.g. the public IP or domain).
 */
const DEV_ORIGINS = [
  ...Object.values(networkInterfaces())
    .flat()
    .flatMap((n) => (n && n.family === "IPv4" && !n.internal ? [n.address] : [])),
  ...(process.env.ALLOWED_DEV_ORIGINS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
];

/**
 * Backend (be-realtime-urc) as seen from this Next server. The browser never calls it directly:
 * /api, /uploads and /socket.io are proxied here, so the app works from any host or IP on a single port.
 */
const BACKEND_URL = (process.env.BACKEND_URL ?? "http://localhost:4000").replace(/\/$/, "");

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  allowedDevOrigins: DEV_ORIGINS,
  // Socket.IO requests "/socket.io/?EIO=…"; the default trailing-slash redirect would break it.
  skipTrailingSlashRedirect: true,
  async redirects() {
    return [{ source: "/", destination: "/dashboard/machine", permanent: false }];
  },
  async rewrites() {
    return [
      { source: "/api/:path*", destination: `${BACKEND_URL}/api/:path*` },
      { source: "/uploads/:path*", destination: `${BACKEND_URL}/uploads/:path*` },
      { source: "/socket.io/", destination: `${BACKEND_URL}/socket.io/` },
    ];
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
