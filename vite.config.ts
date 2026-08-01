import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Relative base so the built folder works from any subpath:
// a static host, a Docker image, or a Home Assistant ingress panel.
export default defineConfig({
  base: './',
  plugins: [react()],
  server: { host: true },
})
