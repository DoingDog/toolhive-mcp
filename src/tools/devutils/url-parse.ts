import { validationError } from "../../lib/errors";
import type { ToolExecutionResult } from "../../mcp/result";

export async function handleUrlParse(args: unknown): Promise<ToolExecutionResult> {
  const raw = (args as { url?: unknown } | undefined)?.url;
  if (typeof raw !== "string") return validationError("url must be a string");
  try {
    const url = new URL(raw);
    return {
      ok: true,
      data: {
        protocol: url.protocol,
        username: url.username,
        password: url.password,
        hostname: url.hostname,
        port: url.port,
        pathname: url.pathname,
        search: url.search,
        searchParams: Object.fromEntries(url.searchParams),
        hash: url.hash
      }
    };
  } catch (error) {
    return validationError(error instanceof Error ? error.message : String(error));
  }
}
