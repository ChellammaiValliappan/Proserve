import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Local development: `npm run dev:api` serves the API on :8888, Vite proxies /api to it.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: { "/api": { target: "http://localhost:8888", headers: { "x-forwarded-host": "localhost:5173" } } },
  },
  build: {
    outDir: "dist",
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks: { react: ["react", "react-dom", "react-router-dom"] },
      },
    },
  },
});
