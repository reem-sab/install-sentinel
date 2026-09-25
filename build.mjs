// Bundles the action and the CLI into dist/ so the action runs without node_modules.
// GitHub runs JavaScript actions straight from the repository, so dist/ is committed.
import { build } from "esbuild";

const shared = {
  bundle: true,
  platform: "node",
  target: "node24",
  format: "esm",
  // Some CommonJS dependencies call require(); this gives them one inside an ES module bundle.
  banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" },
  logLevel: "info",
};

await build({ ...shared, entryPoints: ["src/main.ts"], outfile: "dist/index.js" });
await build({
  ...shared,
  entryPoints: ["src/cli.ts"],
  outfile: "dist/cli.js",
  banner: { js: "#!/usr/bin/env node\n" + shared.banner.js },
});
