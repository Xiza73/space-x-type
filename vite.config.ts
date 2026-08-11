import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Tauri inyecta TAURI_DEV_HOST cuando se desarrolla contra un dispositivo real.
const host = process.env.TAURI_DEV_HOST

// https://v2.tauri.app/start/frontend/vite/
export default defineConfig({
  plugins: [react()],

  // Tauri necesita el output de Vite intacto para reportar sus propios errores.
  clearScreen: false,

  server: {
    // Puerto fijo: tauri.conf.json apunta acá y no puede adivinar uno nuevo.
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host ? { protocol: 'ws', host, port: 1421 } : undefined,
    // src-tauri lo vigila cargo; que lo mire Vite también solo cuesta CPU.
    watch: { ignored: ['**/src-tauri/**'] },
  },
})
