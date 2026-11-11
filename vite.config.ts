import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  // Development: the API runs on :3000 (see api/README.md); in production nginx serves /api.
  server: {
    proxy: { "/api": process.env.VITE_API_PROXY ?? "http://localhost:3000" },
  },
  plugins: [react(), tailwindcss()],
});
