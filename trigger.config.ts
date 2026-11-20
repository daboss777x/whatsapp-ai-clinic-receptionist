import { defineConfig } from "@trigger.dev/sdk";
import { additionalFiles } from "@trigger.dev/build/extensions/core";

export default defineConfig({
  project: "proj_YOUR_PROJECT_REF",
  runtime: "node-24",
  logLevel: "log",
  // The max compute seconds a task is allowed to run (each task can set its own, lower limit).
  maxDuration: 3600,
  retries: {
    enabledInDev: true,
    default: {
      maxAttempts: 3,
      minTimeoutInMs: 1000,
      maxTimeoutInMs: 10000,
      factor: 2,
      randomize: true,
    },
  },
  dirs: ["./src/trigger"],
  // Makes process.cwd() the project folder in dev too, so "context/..." paths work everywhere.
  legacyDevProcessCwdBehaviour: false,
  build: {
    // Ship the /context markdown files (Emma's knowledge) along with the code.
    extensions: [additionalFiles({ files: ["./context/**"] })],
  },
});
