import { defineConfig } from 'vitest/config';
export default defineConfig({
  server: {
    port: 5173,
    proxy: {
      '/socket.io': { target: 'http://127.0.0.1:3001', ws: true },
      '/api': 'http://127.0.0.1:3001',
    },
  },
  build: {
    outDir: 'dist/client',
    chunkSizeWarningLimit: 1600,
    rollupOptions: { output: { manualChunks: { phaser: ['phaser'] } } },
  },
  test: { include: ['tests/**/*.test.ts'], testTimeout: 15000 },
});
