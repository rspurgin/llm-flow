import { build } from "esbuild";
import { mkdirSync } from "fs";

mkdirSync("bundle", { recursive: true });

const shared = {
  bundle: true,
  platform: "node",
  target: "node18",
  format: "cjs",
  minify: false,
  external: [],
};

await build({
  ...shared,
  entryPoints: ["src/server.ts"],
  outfile: "bundle/server.cjs",
});

await build({
  ...shared,
  entryPoints: ["src/cli.ts"],
  outfile: "bundle/cli.cjs",
});

console.log("Bundled -> bundle/server.cjs and bundle/cli.cjs");
