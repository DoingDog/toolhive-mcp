import { validationError } from "../../lib/errors";
import type { ToolExecutionResult } from "../../mcp/result";

function decodePart(part: string): unknown {
  const padded = part.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(part.length / 4) * 4, "=");
  return JSON.parse(atob(padded));
}

export async function handleJwtDecode(args: unknown): Promise<ToolExecutionResult> {
  const token = (args as { token?: unknown } | undefined)?.token;
  if (typeof token !== "string") return validationError("token must be a string");
  const parts = token.split(".");
  if (parts.length < 2) return validationError("JWT must contain at least header and payload");
  try {
    return {
      ok: true,
      data: {
        header: decodePart(parts[0]!),
        payload: decodePart(parts[1]!),
        signature_present: parts.length === 3
      }
    };
  } catch {
    return validationError("Invalid JWT encoding");
  }
}
