import { defineConfig, minimal2023Preset } from '@vite-pwa/assets-generator/config'

export default defineConfig({
  preset: {
    ...minimal2023Preset,
    transparent: { ...minimal2023Preset.transparent, favicons: [] },
    apple: { ...minimal2023Preset.apple, padding: 0 }
  },
  images: ['public/icon.svg']
})
