// A tiny test task. It proves Trigger.dev is connected. Safe to delete later.
import { logger, task } from "@trigger.dev/sdk";

export const helloWorld = task({
  id: "hello-world",
  maxDuration: 60,
  run: async (payload: { name?: string }) => {
    logger.log("Hello task ran", { payload });
    return { message: `Hello ${payload.name ?? "world"} from Sunrise Clinic 👋` };
  },
});
