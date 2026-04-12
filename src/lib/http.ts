import { validationError } from "./errors";
import type { ToolExecutionResult } from "../mcp/result";

export const DEFAULT_CHROME_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

export function assertHttpUrl(value: unknown): URL | ToolExecutionResult {
  if (typeof value !== "string") {
    return validationError("url must be a string");
  }

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return validationError("url must be a valid URL");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return validationError("url must use http or https");
  }

  return url;
}

export function headersToObject(headers: Headers): Record<string, string> {
  const result: Record<string, string> = {};
  headers.forEach((value, key) => {
    result[key] = value;
  });
  return result;
}
