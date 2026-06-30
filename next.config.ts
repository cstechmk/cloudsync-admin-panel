import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
  serverExternalPackages: ['firebase-admin', 'winston', 'winston-daily-rotate-file'],
  allowedDevOrigins: ['192.168.0.159', 'upright-squeamish-denial.ngrok-free.dev'],
};

export default nextConfig;
