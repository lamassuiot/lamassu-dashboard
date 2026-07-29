
import type {NextConfig} from 'next';

const nextConfig: NextConfig = {
  /* config options here */
  output: 'export', // Add this line to enable static HTML export
  turbopack: {
    resolveAlias: {
      child_process: {
        browser: './src/lib/packet-analyzer/node-module-shim.ts',
      },
      crypto: {
        browser: './src/lib/packet-analyzer/node-module-shim.ts',
      },
      fs: {
        browser: './src/lib/packet-analyzer/node-module-shim.ts',
      },
      path: {
        browser: './src/lib/packet-analyzer/node-module-shim.ts',
      },
    },
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
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
  webpack: (config, {isServer}) => {
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        child_process: false,
        crypto: false,
        fs: false,
        path: false,
      };
    }

    return config;
  },
};

export default nextConfig;
