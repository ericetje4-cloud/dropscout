import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import pkg from './package.json' with { type: 'json' };

// Base path : pour GitHub Pages (servi sous /<repo>/), définir
// VITE_BASE_PATH=/nom-du-repo. Vide par défaut (déploiement racine).
const base = process.env.VITE_BASE_PATH ?? '/';
// Garantit un slash final pour préfixer les chemins du manifest.
const baseDir = base.endsWith('/') ? base : `${base}/`;

// https://vite.dev/config/
export default defineConfig({
  base,

  // Injecte la version (de package.json) comme constante globale côté client.
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },

  // Autorise l'accès depuis un tunnel (cloudflared, ngrok...) pour tester la
  // PWA sur mobile en HTTPS. true = accepte tous les hôtes (dev/preview only).
  preview: { allowedHosts: true },
  server: { allowedHosts: true },
  resolve: {
    // Alias '@' -> '/src' pour les imports type '@/lib/...'.
    alias: { '@': '/src' },
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'icons/*.png'],
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
      },
      manifest: {
        name: 'DropScout',
        short_name: 'DropScout',
        description: 'Veille produits gagnants & gestion dropshipping.',
        theme_color: '#0ea5e9',
        background_color: '#0f172a',
        display: 'standalone',
        orientation: 'portrait',
        start_url: baseDir,
        scope: baseDir,
        lang: 'fr',
        categories: ['business', 'shopping'],
        icons: [
          {
            src: `${baseDir}icons/icon-192.png`,
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: `${baseDir}icons/icon-512.png`,
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: `${baseDir}icons/icon-maskable-512.png`,
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      devOptions: { enabled: true, type: 'module' },
    }),
  ],
  build: {
    target: 'es2022',
    rolldownOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('react') || id.includes('scheduler'))
              return 'react-vendor';
          }
        },
      },
    },
    chunkSizeWarningLimit: 700,
  },
});
