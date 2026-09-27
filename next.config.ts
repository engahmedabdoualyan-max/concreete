import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
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
