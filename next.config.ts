import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Lets a second browser profile on 127.0.0.1 act as another player in dev.
  allowedDevOrigins: ["127.0.0.1"],
};

export default nextConfig;
