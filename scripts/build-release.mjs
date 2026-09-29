/**
 * Builds a single ESM `bedrock-registry-client.js` for GitHub Release drop-in packs.
 * Does not embed Omniac `mcbe-ipc` — authors place that file beside this one as `./mcbe-ipc.js`.
 */
import * as esbuild from "esbuild";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const pkgRoot = path.join(root, "..");
const outfile = path.join(pkgRoot, "dist", "release", "bedrock-registry-client.js");

await esbuild.build({
  absWorkingDir: pkgRoot,
  entryPoints: [path.join(pkgRoot, "src", "bedrock.ts")],
  outfile,
  bundle: true,
  format: "esm",
  platform: "neutral",
  target: "es2022",
  logLevel: "info",
  banner: {
    js: [
      "/**",
      " * @mcbe-registry/client — schema 5 Release build.",
      " * Place Omniac mcbe-ipc next to this file as ./mcbe-ipc.js (see README).",
      " * Do not treat this file as a substitute for installing mcbe-ipc yourself.",
      " */",
    ].join("\n"),
  },
  external: ["@minecraft/server"],
  plugins: [
    {
      name: "mcbe-ipc-relative",
      setup(build) {
        build.onResolve({ filter: /^mcbe-ipc$/ }, () => ({
          path: "./mcbe-ipc.js",
          external: true,
        }));
      },
    },
  ],
});

process.stdout.write(`wrote ${outfile}\n`);
