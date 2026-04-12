import type { AppEnv } from "../../lib/env";
import { configError, upstreamError, validationError } from "../../lib/errors";
import { assertHttpUrl } from "../../lib/http";
import { parseKeyList } from "../../lib/keys";
import { fetchWithKeyRetry } from "../../lib/upstream";
import type { ToolExecutionResult } from "../../mcp/result";

function headerRecord(value: unknown): Record<string, string> | undefined {
  if (value === undefined) return undefined;
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const entries = Object.entries(value);
  if (!entries.every(([, item]) => typeof item === "string")) return undefined;
  return Object.fromEntries(entries) as Record<string, string>;
}

export async function handlePuremdExtract(args: unknown, env: AppEnv): Promise<ToolExecutionResult> {
  if (!args || typeof args !== "object" || typeof (args as { url?: unknown }).url !== "string") {
    return validationError("url must be a string");
  }

  const keys = parseKeyList(env.PUREMD_API_KEYS);
  if (keys.length === 0) {
    return configError("PUREMD_API_KEYS is not configured");
  }

  const input = args as {
    url: string;
    format?: unknown;
    requestheaders?: unknown;
    prompt?: unknown;
    schema?: unknown;
  };

  const target = assertHttpUrl(input.url);
  if (!(target instanceof URL)) {
    return target;
  }

  const forwardedHeaders = headerRecord(input.requestheaders);
  if (input.requestheaders !== undefined && !forwardedHeaders) {
    return validationError("requestheaders must be an object of string values");
  }

  const pureUrl = `https://pure.md/${target.href.replace(/^https?:\/\//, "")}`;
  const hasStructuredExtraction = typeof input.prompt === "string" || typeof input.schema === "string";
  const result = await fetchWithKeyRetry({
    keys,
    serviceName: "Pure.md",
    makeRequest: (key) => {
      const headers: Record<string, string> = {
        authorization: `Bearer ${key}`,
        "x-api-key": key,
        accept: "text/markdown,text/plain,application/json",
        ...(forwardedHeaders ?? {})
      };

      const requestInit: RequestInit = {
        method: hasStructuredExtraction ? "POST" : "GET",
        headers
      };

      if (hasStructuredExtraction) {
        requestInit.headers = {
          ...headers,
          "content-type": "application/json"
        };
        requestInit.body = JSON.stringify({
          prompt: input.prompt,
          schema: input.schema,
          format: input.format ?? "markdown"
        });
      }

      return { url: pureUrl, init: requestInit };
    }
  });

  if ("error" in result) {
    return result;
  }

  const content = result.text;

  return {
    ok: true,
    data: {
      url: target.toString(),
      content,
      format: input.format ?? "markdown"
    }
  };
}
