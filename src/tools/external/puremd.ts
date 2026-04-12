import type { AppEnv } from "../../lib/env";
import { configError, upstreamError, validationError } from "../../lib/errors";
import { assertHttpUrl } from "../../lib/http";
import { parseKeyList, pickRandomKey } from "../../lib/keys";
import type { ToolExecutionResult } from "../../mcp/result";

export async function handlePuremdExtract(args: unknown, env: AppEnv): Promise<ToolExecutionResult> {
  if (!args || typeof args !== "object" || typeof (args as { url?: unknown }).url !== "string") {
    return validationError("url must be a string");
  }

  const key = pickRandomKey(parseKeyList(env.PUREMD_API_KEYS));
  if (!key) {
    return configError("PUREMD_API_KEYS is not configured");
  }

  const target = assertHttpUrl((args as { url: string }).url);
  if (!(target instanceof URL)) {
    return target;
  }

  const pureUrl = `https://pure.md/${target.href.replace(/^https?:\/\//, "")}`;

  let response: Response;
  try {
    response = await fetch(pureUrl, {
      headers: {
        authorization: `Bearer ${key}`,
        "x-api-key": key,
        accept: "text/markdown,text/plain,application/json"
      }
    });
  } catch (error) {
    return upstreamError(error instanceof Error ? error.message : "Pure.md request failed");
  }

  const content = await response.text();
  if (!response.ok) {
    return upstreamError(`Pure.md returned ${response.status}: ${content}`, response.status);
  }

  return {
    ok: true,
    data: {
      url: target.toString(),
      content,
      format: (args as { format?: unknown }).format ?? "markdown"
    }
  };
}
