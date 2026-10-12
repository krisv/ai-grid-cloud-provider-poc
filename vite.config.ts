import { defineConfig } from 'vitest/config';
import { fileURLToPath, URL } from 'node:url';
export default defineConfig({
  resolve: { alias: { '~': fileURLToPath(new URL('./src', import.meta.url)) } },
  server: { proxy: { '/api': { target: process.env.MAAS_API_TARGET ?? `http://${process.env.MAAS_API_HOST ?? '127.0.0.1'}:${process.env.MAAS_API_PORT ?? '8080'}`, changeOrigin: true } } },
  test: { exclude: ['backend/**', 'node_modules/**', 'dist/**'], environment: 'jsdom', setupFiles: ['./src/test-setup.ts'], css: false },
});
