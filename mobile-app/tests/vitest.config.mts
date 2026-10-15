// This repository already provides Vitest/jsdom in the Desktop workspace.
// No test runtime is included in the mobile build or Android assets.
import { fileURLToPath } from "node:url";
export default {
  root: fileURLToPath(new URL("..", import.meta.url)),
  esbuild: { jsx: "automatic", jsxImportSource: "react" },
  resolve: {
    alias: {
      vitest: fileURLToPath(
        new URL(
          "../../desktop/node_modules/vitest/dist/index.js",
          import.meta.url,
        ),
      ),
    },
  },
  test: {
    environment: "jsdom",
    include: ["tests/remote-wiring.test.tsx", "tests/remote-client.test.ts"],
    pool: "forks",
    poolOptions: { forks: { singleFork: true } },
    testTimeout: 5000,
  },
};
