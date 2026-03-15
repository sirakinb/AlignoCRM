import { defineConfig } from "@trigger.dev/sdk";

export default defineConfig({
  project: "proj_dzedfvhqizlrhrgnznlx",
  dirs: ["./src/trigger"],
  runtime: "node",
  logLevel: "info",
  maxDuration: 3600,
  retries: {
    enabledInDev: false,
    default: {
      maxAttempts: 3,
      minTimeoutInMs: 1000,
      maxTimeoutInMs: 10_000,
      factor: 2,
      randomize: true,
    },
  },
  build: {
    autoDetectExternal: true,
    keepNames: true,
  },
});
