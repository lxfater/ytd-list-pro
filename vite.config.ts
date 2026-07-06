import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";
import { manifest } from "./src/manifest";

const projectRoot = dirname(fileURLToPath(import.meta.url));

function emitManifest(): Plugin {
  return {
    name: "emit-extension-manifest",
    apply: "build",
    async closeBundle() {
      await mkdir("dist", { recursive: true });
      await writeFile("dist/manifest.json", `${JSON.stringify(manifest, null, 2)}\n`);
    }
  };
}

export default defineConfig({
  plugins: [react(), emitManifest()],
  build: {
    outDir: "dist",
    emptyOutDir: true,
    sourcemap: true,
    rollupOptions: {
      input: {
        popup: resolve(projectRoot, "popup.html")
      },
      output: {
        entryFileNames: "assets/[name].js",
        chunkFileNames: "assets/[name].js",
        assetFileNames: "assets/[name][extname]"
      }
    }
  }
});
