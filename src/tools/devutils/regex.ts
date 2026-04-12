import { validationError } from "../../lib/errors";
import type { ToolExecutionResult } from "../../mcp/result";

export async function handleRegexTest(args: unknown): Promise<ToolExecutionResult> {
  const input = args as { pattern?: unknown; text?: unknown; flags?: unknown } | undefined;
  if (!input || typeof input.pattern !== "string" || typeof input.text !== "string") {
    return validationError("pattern and text must be strings");
  }
  try {
    const regex = new RegExp(input.pattern, typeof input.flags === "string" ? input.flags : "g");
    return {
      ok: true,
      data: {
        matches: [...input.text.matchAll(regex)].map((match) => ({ match: match[0], index: match.index }))
      }
    };
  } catch (error) {
    return validationError(error instanceof Error ? error.message : String(error));
  }
}
