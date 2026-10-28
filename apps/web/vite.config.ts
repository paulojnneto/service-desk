import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 3000,
    // Fails loudly instead of quietly moving to another port.
    strictPort: true,
    // The browser talks to a single origin; /api goes to the agent API.
    proxy: { "/api": "http://localhost:3001" },
  },
});
