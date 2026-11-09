import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { federation } from '@module-federation/vite';

// Change this when you copy the template: every module needs its own dev port.
const DEV_PORT = 9010;

const { name } = JSON.parse(readFileSync(new URL('./module.json', import.meta.url), 'utf8')) as { name: string };

// `pnpm dev:standalone` (mode "standalone") serves only src/standalone without Module Federation.
export default defineConfig(({ mode }) => ({
  // Relative base: the same build works wherever remoteEntry.js is served from
  // (e.g. /ui/modules/<name>/), because assets resolve relative to it.
  base: './',
  plugins: [
    react(),
    tailwindcss(),
    ...(mode === 'standalone'
      ? []
      : [
          federation({
            name,
            filename: 'remoteEntry.js',
            // Without this the dev server crashes in @module-federation/dts-plugin.
            dts: false,
            exposes: { './module': './src/module.tsx' },
            // Must match the shell: only these three are shared; the shell's copies are the ones used.
            shared: {
              react: { singleton: true, requiredVersion: '^19' },
              'react-dom': { singleton: true, requiredVersion: '^19' },
              'react-router': { singleton: true, requiredVersion: '^7' },
            },
          }),
        ]),
  ],
  server: { port: DEV_PORT, cors: true, origin: `http://localhost:${DEV_PORT}` },
  preview: { port: DEV_PORT, cors: true },
  build: {
    target: 'esnext',
    // There is no index.html entry (standalone.html is dev only), so name the module as the entry.
    rollupOptions: { input: { module: 'src/module.tsx' } },
  },
}));
