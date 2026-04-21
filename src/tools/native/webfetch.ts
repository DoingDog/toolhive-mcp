import htmlToMd from "html-to-md";
import { validationError } from "../../lib/errors";
import { assertHttpUrl, DEFAULT_CHROME_UA, headersToObject } from "../../lib/http";
import { createResponseMetadata } from "../../lib/response-metadata";
import { fetchGuardedText } from "../../lib/upstream";
import type { ToolContext } from "../types";
import type { ToolExecutionResult } from "../../mcp/result";

type WebfetchFormat = "markdown" | "text" | "html";

type WebfetchFallbackReason = "markdown_conversion_failed";

export type RenderedWebfetchBody = {
  body: string;
  requested_format: WebfetchFormat;
  actual_format: "markdown" | "text" | "html";
  extracted: boolean;
  fallback_reason: WebfetchFallbackReason | null;
};

type WebfetchArgs = {
  url?: unknown;
  method?: unknown;
  requestheaders?: unknown;
  body?: unknown;
  format?: unknown;
  return_responseheaders?: unknown;
  max_bytes?: unknown;
};

const WEBFETCH_TIMEOUT_MS = 30_000;

function isHeaderRecord(value: unknown): value is Record<string, string> {
  return !!value
    && typeof value === "object"
    && Object.values(value).every((item) => typeof item === "string");
}

function isWebfetchFormat(value: unknown): value is WebfetchFormat {
  return value === "markdown" || value === "text" || value === "html";
}

function isHtmlResponse(contentType: string | null): boolean {
  const normalizedContentType = contentType?.toLowerCase();
  return normalizedContentType?.includes("text/html") === true
    || normalizedContentType?.includes("application/xhtml+xml") === true;
}

function extractHtmlText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\s*\/p\s*>/gi, "\n\n")
    .replace(/<\s*\/div\s*>/gi, "\n\n")
    .replace(/<\s*\/article\s*>/gi, "\n\n")
    .replace(/<\s*\/section\s*>/gi, "\n\n")
    .replace(/<\s*\/li\s*>/gi, "\n")
    .replace(/<\s*\/h[1-6]\s*>/gi, "\n\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\r/g, "")
    .replace(/[ \t\f\v]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function renderFetchedBody(
  body: string,
  contentType: string | null,
  format?: WebfetchFormat,
  convertMarkdown: (html: string) => string = htmlToMd
): RenderedWebfetchBody {
  const requestedFormat = format ?? "markdown";

  if (!isHtmlResponse(contentType)) {
    return {
      body,
      requested_format: requestedFormat,
      actual_format: requestedFormat === "html" ? "html" : "text",
      extracted: false,
      fallback_reason: null
    };
  }

  if (requestedFormat === "html") {
    return {
      body,
      requested_format: requestedFormat,
      actual_format: "html",
      extracted: false,
      fallback_reason: null
    };
  }

  if (requestedFormat === "text") {
    return {
      body: extractHtmlText(body),
      requested_format: requestedFormat,
      actual_format: "text",
      extracted: true,
      fallback_reason: null
    };
  }

  try {
    return {
      body: convertMarkdown(body),
      requested_format: requestedFormat,
      actual_format: "markdown",
      extracted: true,
      fallback_reason: null
    };
  } catch {
    return {
      body: extractHtmlText(body),
      requested_format: requestedFormat,
      actual_format: "text",
      extracted: false,
      fallback_reason: "markdown_conversion_failed"
    };
  }
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

  const format = webfetchArgs.format;
  if (format !== undefined && !isWebfetchFormat(format)) {
    return validationError("format must be markdown, text, or html");
  }

  if (webfetchArgs.requestheaders !== undefined && !isHeaderRecord(webfetchArgs.requestheaders)) {
    return validationError("requestheaders must be an object of string values");
  }

  if (webfetchArgs.body !== undefined && typeof webfetchArgs.body !== "string") {
    return validationError("body must be a string");
  }

  if (method === "GET" && webfetchArgs.body !== undefined) {
    return validationError("body is only allowed for POST requests");
  }

  if (webfetchArgs.max_bytes !== undefined && (!Number.isInteger(webfetchArgs.max_bytes) || (webfetchArgs.max_bytes as number) < 0)) {
    return validationError("max_bytes must be a non-negative integer");
  }

  let headers: Headers;
  try {
    headers = new Headers(webfetchArgs.requestheaders as HeadersInit | undefined);
    if (!headers.has("user-agent")) {
      headers.set("user-agent", DEFAULT_CHROME_UA);
    }
  } catch (error) {
    return validationError(
      error instanceof Error ? error.message : "requestheaders are invalid"
    );
  }

  const init: RequestInit = { method, headers };
  if (method === "POST" && webfetchArgs.body !== undefined) {
    init.body = webfetchArgs.body;
  }

  const result = await fetchGuardedText(
    { url: url.toString(), init },
    {
      serviceName: "webfetch",
      timeoutMs: WEBFETCH_TIMEOUT_MS,
      ...(webfetchArgs.max_bytes !== undefined ? { maxBytes: webfetchArgs.max_bytes as number } : {})
    }
  );

  if ("error" in result) {
    return result;
  }

  if (!result.response.ok) {
    return {
      ok: false,
      error: {
        type: "upstream_error",
        message: "webfetch request failed",
        details: { status: result.response.status, details: result.text }
      }
    };
  }

  const renderedBody = renderFetchedBody(
    result.text,
    result.response.headers.get("content-type"),
    format
  );

  return {
    ok: true,
    data: {
      status: result.response.status,
      url: result.response.url || url.toString(),
      body: renderedBody.body,
      requested_format: renderedBody.requested_format,
      actual_format: renderedBody.actual_format,
      extracted: renderedBody.extracted,
      fallback_reason: renderedBody.fallback_reason,
      ...createResponseMetadata({
        providerUsed: "webfetch",
        ...(result.contentLength !== undefined ? { contentLength: result.contentLength } : {}),
        truncated: result.truncated,
        cached: false,
        partial: false
      }),
      ...(webfetchArgs.return_responseheaders === true ? { headers: headersToObject(result.response.headers) } : {})
    }
  };
}
