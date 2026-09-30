import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Relative base so the built folder works from any subpath:
// a static host, a Docker image, or a Home Assistant ingress panel.
export default defineConfig({
  base: "./",
  plugins: [react()],
  // A fixed port, failing loudly when taken: with host: true, Vite's free-port probe misses a
  // server bound only to ::1 and lands on a port where localhost reaches the other project.
  server: { host: true, port: 5273, strictPort: true },
});
