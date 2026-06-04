import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  serverExternalPackages: ["better-sqlite3", "pdf-parse"],
  turbopack: {
    root: path.join(__dirname),
  },
};

export default nextConfig;
