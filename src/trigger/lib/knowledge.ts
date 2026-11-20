// ============================================================================
// Knowledge base: reads every markdown file in /context into one block of text.
// This is ALL Emma is allowed to know about the clinic. To change what she
// knows, edit the files in /context (no code changes needed).
// ============================================================================
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

// /context is bundled with the task (see trigger.config.ts → additionalFiles),
// so it sits next to the code both on your computer and in the cloud.
const CONTEXT_DIR = path.join(process.cwd(), "context");

let cached: string | null = null;

export async function loadKnowledge(): Promise<string> {
  if (cached) return cached;
  const files = (await readdir(CONTEXT_DIR)).filter((f) => f.endsWith(".md")).sort();
  if (files.length === 0) throw new Error(`No .md files found in ${CONTEXT_DIR}`);

  const parts = await Promise.all(
    files.map(async (f) => `<file name="${f}">\n${(await readFile(path.join(CONTEXT_DIR, f), "utf8")).trim()}\n</file>`),
  );
  cached = parts.join("\n\n");
  return cached;
}
