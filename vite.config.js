

import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "path";

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, "index.html"),
        haem: resolve(__dirname, "index_haem.html"),
        biochem: resolve(__dirname, "index_biochem.html"),
        biochem_backup: resolve(__dirname, "index_biochem_backup.html"),
        backroom: resolve(__dirname, "index_backroom.html"),
        coag: resolve(__dirname, "index_coag.html"),
        validator: resolve(__dirname, "index_validator.html"),
      },
    },
  },
});