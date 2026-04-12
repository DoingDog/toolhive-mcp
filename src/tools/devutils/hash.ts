import { validationError } from "../../lib/errors";
import type { ToolExecutionResult } from "../../mcp/result";

export async function handleHash(args: unknown): Promise<ToolExecutionResult> {
  const input = args as { text?: unknown; algorithm?: unknown } | undefined;
  if (!input || typeof input.text !== "string") return validationError("text must be a string");
  const rawAlgorithm = input.algorithm === undefined ? "SHA-256" : String(input.algorithm).toUpperCase();
  const algorithm = rawAlgorithm.startsWith("SHA-") ? rawAlgorithm : rawAlgorithm.replace(/^SHA/, "SHA-");
  if (!["SHA-1", "SHA-256", "SHA-384", "SHA-512"].includes(algorithm)) {
    return validationError("algorithm must be SHA-1, SHA-256, SHA-384, or SHA-512");
  }
  const digest = await crypto.subtle.digest(algorithm, new TextEncoder().encode(input.text));
  return {
    ok: true,
    data: {
      algorithm,
      hex: [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("")
    }
  };
}
