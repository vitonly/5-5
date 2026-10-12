import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Плавные переходы между страницами (React <ViewTransition>)
    viewTransition: true,
  },
};

export default nextConfig;
