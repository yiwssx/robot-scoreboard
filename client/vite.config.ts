import { defineConfig } from "vite";
import preact from "@preact/preset-vite";
import { resolve } from "node:path";

export default defineConfig({
  plugins: [preact({ devToolsEnabled: false, prefreshEnabled: false })],
  publicDir: resolve(__dirname, "static"),
  build: {
    outDir: resolve(__dirname, "../dist/client"),
    emptyOutDir: true,
    sourcemap: false,
    target: "es2020",
    rollupOptions: {
      input: {
        control: resolve(__dirname, "src/apps/control/main.tsx"),
        scoring: resolve(__dirname, "src/apps/scoring/main.tsx"),
        "team-setup": resolve(__dirname, "src/apps/team-setup/main.tsx"),
        status: resolve(__dirname, "src/apps/status/main.tsx"),
        "overlay-main": resolve(__dirname, "src/apps/overlay/main.tsx"),
      },
      output: {
        entryFileNames: "app/[name].js",
        chunkFileNames: "app/chunks/[name]-[hash].js",
        assetFileNames: "app/assets/[name]-[hash][extname]",
      },
    },
  },
});
