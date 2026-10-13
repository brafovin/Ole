import { defineConfig } from 'vite';

// Relative base so the production build works from any sub-path (e.g. /bloodmoon/).
export default defineConfig({
  base: './',
  server: { port: 5173, open: false },
  build: { outDir: 'dist', chunkSizeWarningLimit: 2000, target: 'es2020' },
});
