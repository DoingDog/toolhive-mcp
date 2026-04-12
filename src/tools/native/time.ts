import { validationError } from "../../lib/errors";
import { formatTime, isValidTimezone } from "../../lib/time";
import type { ToolContext } from "../types";
import type { ToolExecutionResult } from "../../mcp/result";

export async function handleTime(args: unknown, _context: ToolContext): Promise<ToolExecutionResult> {
  const timezone =
    typeof args === "object" && args !== null && "timezone" in args
      ? (args as { timezone?: unknown }).timezone
      : "UTC";

  if (typeof timezone !== "string") {
    return validationError("timezone must be a string");
  }

  if (!isValidTimezone(timezone)) {
    return validationError("timezone must be a valid IANA timezone");
  }

  return {
    ok: true,
    data: formatTime(timezone)
  };
}
