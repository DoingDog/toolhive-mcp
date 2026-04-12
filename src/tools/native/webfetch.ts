import { upstreamError, validationError } from "../../lib/errors";
import { assertHttpUrl, DEFAULT_CHROME_UA, headersToObject } from "../../lib/http";
import type { ToolContext } from "../types";
import type { ToolExecutionResult } from "../../mcp/result";

type WebfetchArgs = {
  url?: unknown;
  method?: unknown;
  requestheaders?: unknown;
  body?: unknown;
  return_responseheaders?: unknown;
};

function isHeaderRecord(value: unknown): value is Record<string, string> {
  return !!value &&
    typeof value === "object" &&
    Object.values(value).every((item) => typeof item === "string");
}

export async function handleWebfetch(args: unknown, _context: ToolContext): Promise<ToolExecutionResult> {
  const webfetchArgs = (args ?? {}) as WebfetchArgs;
  const url = assertHttpUrl(webfetchArgs.url);
  if (!(url instanceof URL)) {
    return url;
  }

  const method = webfetchArgs.method ?? "GET";
  if (method !== "GET" && method !== "POST") {
    return validationError("method must be GET or POST");
  }

  if (webfetchArgs.requestheaders !== undefined && !isHeaderRecord(webfetchArgs.requestheaders)) {
    return validationError("requestheaders must be an object of string values");
  }

  if (webfetchArgs.body !== undefined && typeof webfetchArgs.body !== "string") {
    return validationError("body must be a string");
  }

  const headers = new Headers(webfetchArgs.requestheaders as HeadersInit | undefined);
  if (!headers.has("user-agent")) {
    headers.set("user-agent", DEFAULT_CHROME_UA);
  }

  const init: RequestInit = { method, headers };
  if (method === "POST" && webfetchArgs.body !== undefined) {
    init.body = webfetchArgs.body;
  }

  const response = await fetch(url.toString(), init);
  const body = await response.text();

  if (!response.ok) {
    return upstreamError("webfetch request failed", response.status, body);
  }

  return {
    ok: true,
    data: {
      status: response.status,
      url: url.toString(),
      body,
      ...(webfetchArgs.return_responseheaders === true ? { headers: headersToObject(response.headers) } : {})
    }
  };
}
