import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import path from 'node:path';

export default defineConfig({
  root: path.resolve(process.cwd(), 'web'),
  plugins: [svelte()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:8090',
      '/dav': 'http://localhost:8090',
    },
  },
  build: {
    outDir: path.resolve(process.cwd(), 'dist'),
    emptyOutDir: true,
  },
});
