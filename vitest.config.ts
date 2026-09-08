import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const root = fileURLToPath(new URL(".", import.meta.url));
export default defineConfig({
  resolve: {
    alias: {
      "@anything-to-api/schema": `${root}packages/schema/src/index.ts`,
      "@anything-to-api/runtime": `${root}packages/runtime/src/index.ts`,
      "@anything-to-api/browser-adapter": `${root}packages/browser-adapter/src/index.ts`,
      "@anything-to-api/discovery": `${root}packages/discovery/src/index.ts`,
      "@anything-to-api/exporters": `${root}packages/exporters/src/index.ts`,
      "@anything-to-api/auth-adapters": `${root}packages/auth-adapters/src/index.ts`,
      "@anything-to-api/repair": `${root}packages/repair/src/index.ts`,
    },
  },
});
