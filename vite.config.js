
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "path";

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, "index.html"),       // 🧾 Mango UI
        haem: resolve(__dirname, "index_haem.html"),  // 🩸 Haematology UI
      },
    },
  },
});