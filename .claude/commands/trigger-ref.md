# Trigger.dev quick reference

**SDK version: v4.8.8** (`@trigger.dev/sdk` + `@trigger.dev/build`). Researched 2026-11-20 from trigger.dev/docs and the changelog.
Always import from `"@trigger.dev/sdk"`. Never `"@trigger.dev/sdk/v3"`, and never `client.defineJob` (that's v2).

## Basic task
```ts
import { task } from "@trigger.dev/sdk";

export const helloWorld = task({
  id: "hello-world",                 // unique, used to trigger it
  maxDuration: 300,                  // seconds
  run: async (payload: { name: string }, { ctx }) => {
    return { message: `Hello ${payload.name}` }; // must be JSON-serialisable
  },
});
```

## Scheduled task (cron)
```ts
import { schedules } from "@trigger.dev/sdk";

export const dailyCleanup = schedules.task({
  id: "daily-cleanup",
  // String cron = UTC. Object form adds a timezone. No seconds field.
  cron: { pattern: "0 3 * * *", timezone: "America/New_York" },
  run: async (payload) => {
    // payload.timestamp, payload.lastTimestamp, payload.timezone, payload.scheduleId
  },
});
```
Declarative schedules sync on `dev`/`deploy`. In dev they only fire while `npx trigger.dev@latest dev` is running.

## Schema task (validated payload)
```ts
import { schemaTask } from "@trigger.dev/sdk";
import { z } from "zod";

export const createUser = schemaTask({
  id: "create-user",
  schema: z.object({ name: z.string(), age: z.number() }),
  run: async (payload) => { /* payload is typed + validated */ },
});
```
A bad payload fails with `TaskPayloadParsedError` (not retried). `tasks.trigger<typeof createUser>()` skips client-side validation.

## Triggering
```ts
// From a backend (needs TRIGGER_SECRET_KEY). Type-only import, so task code isn't bundled:
import { tasks } from "@trigger.dev/sdk";
import type { helloWorld } from "./trigger/hello";
const handle = await tasks.trigger<typeof helloWorld>("hello-world", { name: "Ann" });

// From inside another task:
await helloWorld.trigger({ name: "Ann" });                 // fire and forget
const result = await helloWorld.triggerAndWait({ name: "Ann" });
if (result.ok) console.log(result.output);                // or result.unwrap()
await helloWorld.batchTriggerAndWait([{ payload: { name: "A" } }, { payload: { name: "B" } }]);
```
REST (e.g. from Deno or Supabase when the SDK breaks):
```
POST https://api.trigger.dev/api/v1/tasks/<task-id>/trigger
Authorization: Bearer <TRIGGER_SECRET_KEY>
{ "payload": {...}, "options": { "idempotencyKey": "...", "concurrencyKey": "...", "ttl": "10m", "tags": ["..."] } }
→ { "id": "run_..." }
```
Never run `triggerAndWait` inside `Promise.all`. Use `batchTriggerAndWait`.

## Idempotency keys
```ts
import { idempotencyKeys } from "@trigger.dev/sdk";

const key = await idempotencyKeys.create(`order-${orderId}`, { scope: "global" });
await processOrder.trigger({ orderId }, { idempotencyKey: key, idempotencyKeyTTL: "1d" });
```
- **Scope:** `"run"` (the default in a task), `"attempt"` or `"global"`. Outside a task, every scope behaves as global.
- **When a key is used up:** a successful run keeps it; a failed run clears it.
- **Default TTL** is 30 days.
- **Limit:** a key only stops duplicate runs. It doesn't make the code inside `run()` idempotent.

## Waits
```ts
import { wait } from "@trigger.dev/sdk";
await wait.for({ seconds: 30 });            // or minutes, hours, days...
await wait.until({ date: new Date("2026-12-01T09:00:00Z") });
```
Waits over ~5s aren't billed as compute.

## Retries
```ts
import { task, retry, AbortTaskRunError } from "@trigger.dev/sdk";

export const t = task({
  id: "t",
  retry: { maxAttempts: 3, factor: 2, minTimeoutInMs: 1000, maxTimeoutInMs: 10000 }, // maxAttempts includes the 1st try
  run: async () => {
    const res = await retry.fetch("https://api.example.com", {
      retry: { byStatus: { "500-599": { strategy: "backoff", maxAttempts: 3 } } },
    });
    if (res.status === 400) throw new AbortTaskRunError("Bad input, don't retry");
  },
  onFailure: async ({ payload, error }) => { /* runs once, after the last retry fails */ },
});
```

## Checker + processor pattern
A cheap scheduled "checker" finds work, then fans out one "processor" run per item. Idempotency keys stop the same item from being processed twice.
```ts
import { schedules, task, idempotencyKeys } from "@trigger.dev/sdk";

export const processItem = task({
  id: "process-item",
  concurrency: { total: 5 },                 // don't hammer the API
  run: async (payload: { itemId: string }) => { /* do the real work */ },
});

export const checkForItems = schedules.task({
  id: "check-for-items",
  cron: "*/15 * * * *",
  run: async () => {
    const items = await findNewItems();      // cheap query
    if (items.length === 0) return { found: 0 };
    await processItem.batchTrigger(
      await Promise.all(items.map(async (i) => ({
        payload: { itemId: i.id },
        options: { idempotencyKey: await idempotencyKeys.create(`item-${i.id}`, { scope: "global" }) },
      })))
    );
    return { found: items.length };
  },
});
```

## Concurrency per key (e.g. one run at a time per user)
```ts
export const perUser = task({ id: "per-user", concurrency: { perKey: 1, total: 50 }, run: async () => {} });
await perUser.trigger(data, { concurrencyKey: data.userId });
```

## Bundling extra files (e.g. a markdown folder)
```ts
// trigger.config.ts
import { additionalFiles } from "@trigger.dev/build/extensions/core";
build: { extensions: [additionalFiles({ files: ["./context/**"] })] },
legacyDevProcessCwdBehaviour: false,
// at runtime:
path.join(process.cwd(), "context", "faqs.md")
```
