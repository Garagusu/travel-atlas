import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Relative base + hash routing: the built site works from any GitHub Pages path
// (https://<user>.github.io/ or https://<user>.github.io/<repo>/) without configuration.
export default defineConfig({
  base: "./",
  resolve: { alias: { "@": new URL("./src", import.meta.url).pathname } },
  plugins: [react(), tailwindcss()],
  build: { outDir: "dist", chunkSizeWarningLimit: 2500 },
});
