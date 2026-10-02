import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Local / LAN hosts for Next dev. Prefer localhost for public clones.
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  output: "export",
  devIndicators: false,
};

export default nextConfig;
