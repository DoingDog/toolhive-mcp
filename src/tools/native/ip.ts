import type { ToolContext } from "../types";
import type { ToolExecutionResult } from "../../mcp/result";

export async function handleIp(_args: unknown, context: ToolContext): Promise<ToolExecutionResult> {
  const headers = context.request.headers;

  return {
    ok: true,
    data: {
      ip: headers.get("cf-connecting-ip") ?? headers.get("x-forwarded-for") ?? null,
      method: context.request.method,
      url: context.request.url,
      headers: {
        "cf-connecting-ip": headers.get("cf-connecting-ip"),
        "x-forwarded-for": headers.get("x-forwarded-for"),
        "x-real-ip": headers.get("x-real-ip"),
        "user-agent": headers.get("user-agent")
      },
      cf: (context.request as Request & { cf?: unknown }).cf ?? null
    }
  };
}
