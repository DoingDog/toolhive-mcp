import { validationError } from "../../lib/errors";
import type { ToolExecutionResult } from "../../mcp/result";

export async function handleTimestampConvert(args: unknown): Promise<ToolExecutionResult> {
  const input = args as { value?: unknown } | undefined;
  if (!input || (typeof input.value !== "string" && typeof input.value !== "number")) {
    return validationError("value must be a string or number");
  }
  const isUnixSeconds = typeof input.value === "number" || (/^\d+$/.test(input.value));
  const date = isUnixSeconds ? new Date(Number(input.value) * 1000) : new Date(input.value);
  if (!Number.isFinite(date.getTime())) return validationError("Invalid date or timestamp");
  return { ok: true, data: { iso: date.toISOString(), unix: Math.floor(date.getTime() / 1000) } };
}
