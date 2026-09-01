import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Inside Docker Compose this is the backend service name; outside Compose (e.g. `npm run dev`
// on the host) it falls back to localhost.
const apiTarget = process.env.VITE_API_PROXY_TARGET || 'http://localhost:3000';

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
    // Every backend route lives under /api (see backend/src/main.ts) — the SPA's own routes
    // never do, so a single proxy rule here can't collide with client-side routing.
    proxy: {
      '/api': apiTarget,
    },
  },
});
