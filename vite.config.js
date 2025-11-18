

import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "path";

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, "index.html"),                    // Mango UI
        haem: resolve(__dirname, "index_haem.html"),               // Haematology
        biochem: resolve(__dirname, "index_biochem.html"),         // Biochemistry
        biochem_backup: resolve(__dirname, "index_biochem_backup.html"), // Biochemistry (backup)
        backroom: resolve(__dirname, "index_backroom.html"),       // Backroom
        coag: resolve(__dirname, "index_coag.html"),               // Coagulation
        validator: resolve(__dirname, "index_validator.html"),     // Validator
       
      },
    },
  },
});