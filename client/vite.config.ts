import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import path from 'path'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      // Task 22: 'prompt' (not 'autoUpdate') so PWAUpdatePrompt's needRefresh fires
      // and the user is offered the new bundle. 'autoUpdate' contradicted that
      // component and let old bundles linger after deploys.
      registerType: 'prompt',
      devOptions: { enabled: true },
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'SearchBook',
        short_name: 'SearchBook',
        description: 'Personal CRM for job search networking',
        theme_color: '#0f172a',
        background_color: '#ffffff',
        display: 'standalone',
        start_url: '/',
        icons: [
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        // The SPA navigate-fallback serves the precached index.html for EVERY
        // top-level navigation. That silently broke opening an attachment: a
        // click on a relative `/files/<name>` link is a navigation request, so
        // the SW answered it with the app shell, React Router matched nothing,
        // and `path="*"` redirected to the dashboard — the file never loaded.
        // `<img src="/photos/…">` was unaffected (image requests aren't
        // mode: 'navigate'), which is why photos looked fine.
        // These three prefixes are always real server responses (the Netlify
        // Blobs media proxy / the API), never app routes — so they must reach
        // the network instead of the shell.
        navigateFallbackDenylist: [/^\/api\//, /^\/photos\//, /^\/files\//],
        // Web Push + notificationclick handlers live in public/push-sw.js and are
        // imported into the generated SW. Kept separate so the heavy Workbox caching
        // config below stays untouched (lower risk than switching to injectManifest).
        importScripts: ['/push-sw.js'],
        runtimeCaching: [
          {
            // Task 15: API responses are NEVER cached. A stale cached record fed
            // to auto-save on a flaky connection could overwrite newer server data
            // (the same silent-loss class Phase 1 fought). NetworkOnly removes that
            // vector entirely; the trade-off is no offline read of records, which is
            // acceptable for a single-user CRM that needs write correctness.
            urlPattern: /^\/api\//,
            handler: 'NetworkOnly',
          },
          {
            urlPattern: /^\/photos\//,
            handler: 'CacheFirst',
            options: {
              cacheName: 'photos-cache',
              expiration: {
                maxEntries: 200,
                maxAgeSeconds: 60 * 60 * 24 * 30, // 30 days
              },
            },
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    proxy: {
      '/api': 'http://localhost:3001',
      '/photos': 'http://localhost:3001',
      '/files': 'http://localhost:3001',
    },
  },
})
