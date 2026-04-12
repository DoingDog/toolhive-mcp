import { validationError } from "../../lib/errors";
import type { ToolExecutionResult } from "../../mcp/result";

export async function handleJsonValidate(args: unknown): Promise<ToolExecutionResult> {
  const text = (args as { text?: unknown } | undefined)?.text;
  if (typeof text !== "string") return validationError("text must be a string");
  try {
    return { ok: true, data: { valid: true, value: JSON.parse(text) as unknown } };
  } catch (error) {
    return validationError(error instanceof Error ? error.message : String(error));
  }
}

export async function handleJsonFormat(args: unknown): Promise<ToolExecutionResult> {
  const input = args as { text?: unknown; minify?: unknown } | undefined;
  if (!input || typeof input.text !== "string") return validationError("text must be a string");
  try {
    const value = JSON.parse(input.text) as unknown;
    return { ok: true, data: { result: input.minify === true ? JSON.stringify(value) : JSON.stringify(value, null, 2) } };
  } catch (error) {
    return validationError(error instanceof Error ? error.message : String(error));
  }
}
