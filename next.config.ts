import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // A free Render instance has 512 MB, and building this app needs ~1 GB, so the
  // API service cannot compile on that host. STANDALONE=1 emits the small
  // self-contained server bundle instead; the deploy host only unpacks and runs
  // it. Every other build (local, CI, Vercel) is left exactly as it was.
  output: process.env.STANDALONE === "1" ? "standalone" : undefined,
  // Memory-lean build. The free Render tier gives the service 512 MB, and the
  // default build peaks near 1 GB (turbopack compile + page collection in
  // parallel), which the container kills mid-build. These switches only change
  // how the build spends memory, never the output. `npm run typecheck` and
  // `npm run lint` still run in CI, so nothing is checked less often.
  experimental: {
    cpus: 1,
    memoryBasedWorkersCount: true,
    parallelServerCompiles: false,
    parallelServerBuildTraces: false,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(self), microphone=(self), geolocation=(self)" },
          { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
        ],
      },
    ];
  },
};

export default nextConfig;
