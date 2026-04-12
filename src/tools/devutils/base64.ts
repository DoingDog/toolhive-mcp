import { validationError } from "../../lib/errors";
import type { ToolExecutionResult } from "../../mcp/result";

function requireText(args: unknown): string | undefined {
  return args && typeof args === "object" && typeof (args as { text?: unknown }).text === "string"
    ? (args as { text: string }).text
    : undefined;
}

export async function handleBase64Encode(args: unknown): Promise<ToolExecutionResult> {
  const text = requireText(args);
  if (text === undefined) return validationError("text must be a string");
  return { ok: true, data: { result: btoa(unescape(encodeURIComponent(text))) } };
}

export async function handleBase64Decode(args: unknown): Promise<ToolExecutionResult> {
  const text = requireText(args);
  if (text === undefined) return validationError("text must be a string");
  try {
    return { ok: true, data: { result: decodeURIComponent(escape(atob(text))) } };
  } catch {
    return validationError("Invalid base64 text");
  }
}
