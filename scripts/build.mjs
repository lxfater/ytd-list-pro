import { rm } from "node:fs/promises";
import { build as esbuild } from "esbuild";
import { build as viteBuild } from "vite";

await rm("dist", { force: true, recursive: true });

await viteBuild({ configFile: "vite.config.ts" });

await esbuild({
  entryPoints: ["src/background/index.ts"],
  outfile: "dist/assets/background.js",
  bundle: true,
  format: "esm",
  platform: "browser",
  target: "es2022",
  sourcemap: true,
  logLevel: "info"
});

await esbuild({
  entryPoints: ["src/content/page-reader.ts"],
  outfile: "dist/assets/page-reader.js",
  bundle: true,
  format: "iife",
  platform: "browser",
  target: "es2022",
  sourcemap: true,
  logLevel: "info"
});

await esbuild({
  entryPoints: ["src/content/index.ts"],
  outfile: "dist/assets/content.js",
  bundle: true,
  format: "iife",
  platform: "browser",
  target: "es2022",
  sourcemap: true,
  logLevel: "info"
});
