import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { readFileSync } from "node:fs";

export default defineConfig({
  plugins: [react(), {
    name: "distribution-notices",
    generateBundle() {
      for (const fileName of ["LICENSE", "THIRD_PARTY_NOTICES.md"]) {
        this.emitFile({ type: "asset", fileName,
          source: readFileSync(new URL(fileName, import.meta.url), "utf8") });
      }
    },
  }],
});
