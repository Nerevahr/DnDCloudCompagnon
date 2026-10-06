// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },
  modules: ['@nuxt/ui'],
  css: ['~/assets/css/main.css'],
  runtimeConfig: {
    public: {
      // Surchargeable via NUXT_PUBLIC_API_BASE (ex: URL CloudFront / API Gateway en production)
      apiBase: 'http://localhost:4000'
    }
  }
})
