import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      // 'prompt' — a new build waits until the person accepts the refresh
      // (see components/UpdatePrompt) rather than swapping under their feet.
      registerType: 'prompt',
      injectRegister: null,
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Heartfulness Sittings',
        short_name: 'HF Sittings',
        description: 'Book and manage individual meditation sittings.',
        theme_color: '#45598f',
        background_color: '#f7f8fc',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        navigateFallbackDenylist: [/^\/auth/],
        // The push + notification-click handlers (public/push-sw.js) are
        // folded into the generated worker. It is a plain script rather
        // than part of the app so the generated-worker strategy — which
        // is what keeps the "a new version is ready" prompt simple — can
        // stay as it is. Not precached: it is already part of the worker.
        importScripts: ['push-sw.js'],
        globIgnores: ['**/push-sw.js'],
      },
    }),
  ],
})
