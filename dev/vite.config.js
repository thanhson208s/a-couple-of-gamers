import { defineConfig } from 'vite'

export default defineConfig({
  server: {
    proxy: {
      '/v1': 'http://localhost:3000',
    },
  },
})
