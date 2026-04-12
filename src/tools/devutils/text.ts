import { validationError } from "../../lib/errors";
import type { ToolExecutionResult } from "../../mcp/result";

export async function handleTextStats(args: unknown): Promise<ToolExecutionResult> {
  const text = (args as { text?: unknown } | undefined)?.text;
  if (typeof text !== "string") return validationError("text must be a string");
  const words = text.trim() ? text.trim().split(/\s+/).length : 0;
  return { ok: true, data: { characters: text.length, words, lines: text.split(/\r?\n/).length } };
}

export async function handleSlugify(args: unknown): Promise<ToolExecutionResult> {
  const text = (args as { text?: unknown } | undefined)?.text;
  if (typeof text !== "string") return validationError("text must be a string");
  return { ok: true, data: { slug: text.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") } };
}

export async function handleCaseConvert(args: unknown): Promise<ToolExecutionResult> {
  const text = (args as { text?: unknown } | undefined)?.text;
  if (typeof text !== "string") return validationError("text must be a string");
  const words = text.trim().split(/[^A-Za-z0-9]+/).filter(Boolean);
  return {
    ok: true,
    data: {
      snake_case: words.map((word) => word.toLowerCase()).join("_"),
      kebab_case: words.map((word) => word.toLowerCase()).join("-"),
      camelCase: words.map((word, index) => index === 0 ? word.toLowerCase() : word[0]!.toUpperCase() + word.slice(1).toLowerCase()).join("")
    }
  };
}
