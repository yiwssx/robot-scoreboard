import { defineConfig } from "vite";
import preact from "@preact/preset-vite";
import { resolve } from "node:path";

export default defineConfig({
  plugins: [preact({ devToolsEnabled: false, prefreshEnabled: false })],
  build: {
    outDir: resolve(__dirname, "../public/app"),
    emptyOutDir: true,
    sourcemap: false,
    target: "es2020",
    rollupOptions: {
      input: {
        control: resolve(__dirname, "src/apps/control/main.tsx"),
        team: resolve(__dirname, "src/apps/team/main.tsx"),
        teams: resolve(__dirname, "src/apps/teams/main.tsx"),
        status: resolve(__dirname, "src/apps/status/main.tsx"),
        "overlay-main": resolve(__dirname, "src/apps/overlay/main.tsx"),
      },
      output: {
        entryFileNames: "[name].js",
        chunkFileNames: "chunks/[name]-[hash].js",
        assetFileNames: "assets/[name]-[hash][extname]",
      },
    },
  },
});
