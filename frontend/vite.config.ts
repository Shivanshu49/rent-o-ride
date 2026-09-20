import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // The web app never talks to the database and never holds a service-role
    // key; everything goes through the API over HTTP. Proxying in dev keeps
    // the browser on one origin so cookies and CORS behave like production.
    proxy: {
      '/api': {
        target: process.env['VITE_API_PROXY'] ?? 'http://localhost:3000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
});
