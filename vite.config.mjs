import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { federation } from '@module-federation/vite';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  plugins: [
    react(),
    federation({
      name: 'lamassu_shell',
      remotes: {},
      dts: false,
      shared: {
        react: { singleton: true, requiredVersion: '^19' },
        'react-dom': { singleton: true, requiredVersion: '^19' },
        'react-router': { singleton: true, requiredVersion: '^7' },
      },
    }),
  ],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  server: { port: 9002 },
  preview: { port: 9002 },
  build: { outDir: 'out' },
});
