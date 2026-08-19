// https://nuxt.com/docs/api/configuration/nuxt-config
import { fileURLToPath } from 'node:url'
import tailwindcss from '@tailwindcss/vite'

export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },
  modules: ['@nuxt/eslint'],
  css: ['~/assets/css/main.css'],
  vite: {
    plugins: [tailwindcss()],
  },
  alias: {
    '~shared': fileURLToPath(new URL('../shared', import.meta.url)),
  },
  runtimeConfig: {
    supabaseUrl: '',
    supabasePublishableKey: '',
    mcpUrl: '',
    deepseekApiKey: '',
    public: {
      supabaseUrl: '',
      supabasePublishableKey: '',
      dbMode: 'supabase',
      yandexMapsKey: '',
    },
  },
})
