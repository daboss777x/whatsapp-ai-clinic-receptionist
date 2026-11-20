// ============================================================================
// Nightly cleanup: deletes chat messages older than 3 days, for privacy.
// Runs every day at 3:00 AM New York time.
// ============================================================================
import { logger, schedules } from "@trigger.dev/sdk";
import { deleteOldMessages } from "./lib/memory.js";

export const cleanupOldMessages = schedules.task({
  id: "cleanup-old-messages",
  cron: { pattern: "0 3 * * *", timezone: "America/New_York" },
  run: async () => {
    const deleted = await deleteOldMessages();
    logger.log(`Deleted ${deleted} old messages`);
    return { deleted };
  },
});
