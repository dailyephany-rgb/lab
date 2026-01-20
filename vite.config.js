

import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "path";

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      input: {
        // Main
        main: resolve(__dirname, "index.html"),

        // Department pages
        haem: resolve(__dirname, "index_haem.html"),
        biochem: resolve(__dirname, "index_biochem.html"),
        biochem_backup: resolve(__dirname, "index_biochem_backup.html"),
        backroom: resolve(__dirname, "index_backroom.html"),
        coag: resolve(__dirname, "index_coag.html"),
        validator: resolve(__dirname, "index_validator.html"),

        // Owner pages
        owner: resolve(__dirname, "index_owner.html"),
        owner_haem: resolve(__dirname, "index_owner_haem.html"),
        owner_coag: resolve(__dirname, "index_owner_coag.html"),
        owner_urine: resolve(__dirname, "index_owner_urine.html"),

        owner_serology: resolve(__dirname, "owner_serology.html"),
        owner_rapid: resolve(__dirname, "owner_rapid.html"),
        owner_hormones: resolve(__dirname, "owner_hormones.html"),
        owner_biochem: resolve(__dirname, "owner_biochem.html"),
        owner_bloodgroup: resolve(__dirname, "owner_bloodgroup.html"),
      },
    },
  },
});
