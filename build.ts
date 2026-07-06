import { build } from "esbuild";
import pkg from "./package.json";

await build({
  entryPoints: ["src/index.ts"],
  bundle: true,
  format: "esm",
  outfile: "dist/index.js",
  packages: "external",
  platform: "node",
});

await build({
  entryPoints: ["src/cli.ts"],
  bundle: true,
  format: "esm",
  outfile: "dist/cli.js",
  packages: "external",
  platform: "node",
  define: {
    PACKAGE_VERSION: JSON.stringify(pkg.version),
  },
});
