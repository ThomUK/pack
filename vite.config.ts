import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { VitePWA } from 'vite-plugin-pwa'
import { fileURLToPath, URL } from 'node:url'

// GitHub Pages serves the app at https://<owner>.github.io/pack/
const base = process.env.VITE_BASE ?? '/pack/'
const buildId = (process.env.GITHUB_SHA ?? 'dev').slice(0, 7)
const buildTime = new Date().toISOString()

export default defineConfig({
  base,
  define: {
    __BUILD_ID__: JSON.stringify(buildId),
    __BUILD_TIME__: JSON.stringify(buildTime),
  },
  plugins: [
    vue(),
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      manifest: {
        name: 'Pack — family travel',
        short_name: 'Pack',
        description: 'Family travel planning and packing',
        start_url: base,
        scope: base,
        display: 'standalone',
        background_color: '#f6f5f2',
        theme_color: '#2f5d50',
        icons: [
          { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
        ],
        share_target: {
          action: `${base}share-target`,
          method: 'POST',
          enctype: 'multipart/form-data',
          params: {
            title: 'title',
            text: 'text',
            url: 'url',
            files: [{ name: 'files', accept: ['image/*', 'application/pdf', 'text/plain'] }],
          },
        },
      } as any,
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
      },
      devOptions: { enabled: false },
    }),
  ],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
} as any)
