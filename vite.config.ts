import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

// When running locally (`npm run dev` / `npm run preview`) all external API
// calls are routed through these proxies, so browser CORS rules never apply.
const proxy = {
  '/proxy/simbrief': {
    target: 'https://www.simbrief.com',
    changeOrigin: true,
    rewrite: (p: string) => p.replace(/^\/proxy\/simbrief/, ''),
  },
  '/proxy/awc': {
    target: 'https://aviationweather.gov',
    changeOrigin: true,
    rewrite: (p: string) => p.replace(/^\/proxy\/awc/, ''),
  },
  '/proxy/vatsim': {
    target: 'https://metar.vatsim.net',
    changeOrigin: true,
    rewrite: (p: string) => p.replace(/^\/proxy\/vatsim/, ''),
  },
};

export default defineConfig({
  // BASE_PATH is set by the GitHub Pages workflow (e.g. "/msfs-buddy/").
  base: process.env.BASE_PATH ?? '/',
  plugins: [react()],
  build: {
    rollupOptions: {
      // Two sites from one build: the SimBrief EFB (/) and SimPlanner (/simplanner/).
      input: {
        main: fileURLToPath(new URL('./index.html', import.meta.url)),
        simplanner: fileURLToPath(new URL('./simplanner/index.html', import.meta.url)),
      },
    },
  },
  server: { proxy, host: true },
  preview: { proxy, host: true },
});
