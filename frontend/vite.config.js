import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// En desarrollo, /api se redirige al backend (sin problemas de CORS).
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: { '/api': { target: process.env.VITE_PROXY_TARGET || 'http://localhost:4000', changeOrigin: true } },
  },
  preview: { port: 5173, proxy: { '/api': { target: process.env.VITE_PROXY_TARGET || 'http://localhost:4000', changeOrigin: true } } },
});
