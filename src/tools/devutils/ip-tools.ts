import { validationError } from "../../lib/errors";
import type { ToolExecutionResult } from "../../mcp/result";

export async function handleIpValidate(args: unknown): Promise<ToolExecutionResult> {
  const ip = (args as { ip?: unknown } | undefined)?.ip;
  if (typeof ip !== "string") return validationError("ip must be a string");
  const match = ip.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!match) return { ok: true, data: { valid: false, version: null } };
  const parts = match.slice(1).map(Number);
  const valid = parts.every((part) => part >= 0 && part <= 255);
  return {
    ok: true,
    data: {
      valid,
      version: valid ? "IPv4" : null,
      is_private: valid && (
        parts[0] === 10
        || (parts[0] === 172 && parts[1]! >= 16 && parts[1]! <= 31)
        || (parts[0] === 192 && parts[1] === 168)
      )
    }
  };
}

export async function handleCidrCalculate(args: unknown): Promise<ToolExecutionResult> {
  const cidr = (args as { cidr?: unknown } | undefined)?.cidr;
  if (typeof cidr !== "string") return validationError("cidr must be a string");
  const [ip, prefixText] = cidr.split("/");
  const prefix = Number(prefixText);
  if (!ip || !Number.isInteger(prefix) || prefix < 0 || prefix > 32) {
    return validationError("Invalid IPv4 CIDR");
  }
  return { ok: true, data: { cidr, prefix_length: prefix } };
}
