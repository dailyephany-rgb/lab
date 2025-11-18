
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "path";

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, "public/index.html"),
        haem: resolve(__dirname, "public/index_haem.html"),
        biochem: resolve(__dirname, "public/index_biochem.html"),
        biochem_backup: resolve(__dirname, "public/index_biochem_backup.html"),
        backroom: resolve(__dirname, "public/index_backroom.html"),
        coag: resolve(__dirname, "public/index_coag.html"),
        validator: resolve(__dirname, "public/index_validator.html"),
      },
    },
  },
});