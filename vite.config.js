import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'masked-icon.svg'],
      manifest: {
        name: 'Wspólny Dom',
        short_name: 'Wspólny Dom',
        description: 'Zarządzanie obowiązkami',
        theme_color: '#2563eb',
        background_color: '#f9fafb',
        display: 'standalone',
        icons: [
          {
            src: 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/e6/Home_Icon.svg/192px-Home_Icon.svg.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/e6/Home_Icon.svg/512px-Home_Icon.svg.png',
            sizes: '512x512',
            type: 'image/png'
          }
        ]
      }
    })
  ],
})
