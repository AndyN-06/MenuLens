import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [
    react(),
    {
      // Disable all socket/request timeouts on the Vite dev server so that
      // long OCR + LLM operations (can exceed 5 min on CPU) don't get killed
      // while the socket is idle waiting for the backend to respond.
      name: 'no-timeout',
      configureServer(server) {
        server.httpServer?.setTimeout(0)          // socket inactivity timeout
        if (server.httpServer) {
          server.httpServer.requestTimeout = 0    // Node 18+ request timeout (default 300s)
          server.httpServer.headersTimeout = 0    // headers must arrive before this
        }
      },
    },
  ],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
        proxyTimeout: 0,   // 0 = disabled; http-proxy calls socket.setTimeout(0)
        timeout: 0,
      },
    },
  },
})
