import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts", "src/bin-stdio.ts"],
  format: ["esm"],
  target: "node20",
  platform: "node",
  bundle: true,
  splitting: false,
  sourcemap: true,
  clean: true,
  outDir: "bundle",
  treeshake: true,
  noExternal: [
    "@mobile-e2e-mcp/contracts",
    "@mobile-e2e-mcp/core",
    "@mobile-e2e-mcp/adapter-maestro",
  ],
});
