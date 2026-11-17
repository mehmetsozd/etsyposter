import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep the dev badge off the sidebar's bottom-left "Ayarlar" link.
  devIndicators: { position: "bottom-right" },
};

export default nextConfig;
