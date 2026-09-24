
import type {NextConfig} from 'next';

const nextConfig: NextConfig = {
  /* config options here */
  output: 'export', // Add this line to enable static HTML export
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  // This is needed to allow the Next.js dev server to accept requests from the Firebase Studio preview environment.
  allowedDevOrigins: ["*.cluster-c3a7z3wnwzapkx3rfr5kz62dac.cloudworkstations.dev"],
  experimental: {
  },
  images: {
    // When using `output: 'export'`, the default `next/image` loader is not supported.
    // However, remotePatterns for external image providers like placehold.co will still work,
    // but images won't be optimized by Next.js at runtime.
    // If you switch to local images, you might need to configure a custom loader or pre-optimize them.
    unoptimized: true, // Disable image optimization for static export
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'placehold.co',
        port: '',
        pathname: '/**',
      },
    ],
  },
};

export default nextConfig;
