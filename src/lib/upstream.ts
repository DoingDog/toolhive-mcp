import { upstreamError } from "./errors";
import type { ToolFailure } from "../mcp/result";
import { pickRandomKey } from "./keys";

type UpstreamRequest = {
  url: string;
  init?: RequestInit;
};

type UpstreamFetchOptions = {
  keys: string[];
  serviceName: string;
  makeRequest: (key: string) => UpstreamRequest;
  maxRetries?: number;
};

export type UpstreamFetchSuccess = {
  response: Response;
  text: string;
  key: string;
};

const AUTH_TEXT_PATTERN = /(unauthorized|invalid api key|invalid access key|api key[^\n]*invalid|authentication failed)/i;

function isAuthFailure(status: number, text: string): boolean {
  if (status === 401 || status === 403) {
    return true;
  }

  if (status === 400) {
    return AUTH_TEXT_PATTERN.test(text);
  }

  return false;
}

function nextKey(keys: string[], currentKey: string): string | undefined {
  if (keys.length <= 1) {
    return undefined;
  }

  const currentIndex = keys.indexOf(currentKey);
  const startIndex = currentIndex === -1 ? 0 : currentIndex + 1;

  for (let offset = 0; offset < keys.length; offset += 1) {
    const candidate = keys[(startIndex + offset) % keys.length]!;
    if (candidate !== currentKey) {
      return candidate;
    }
  }

  return undefined;
}

export async function fetchWithKeyRetry(options: UpstreamFetchOptions): Promise<UpstreamFetchSuccess | ToolFailure> {
  const { keys, serviceName, makeRequest, maxRetries = 1 } = options;
  let key = pickRandomKey(keys);
  let attempts = 0;

  while (key && attempts <= maxRetries) {
    const request = makeRequest(key);

    try {
      new Request(request.url, request.init);
    } catch (error) {
      return upstreamError(error instanceof Error ? error.message : `${serviceName} request failed`);
    }

    try {
      const response = await fetch(request.url, request.init);
      const text = await response.text();
      const authFailure = isAuthFailure(response.status, text);

      if (response.ok && !authFailure) {
        return { response, text, key };
      }

      if (attempts < maxRetries && authFailure) {
        const rotatedKey = nextKey(keys, key);
        if (rotatedKey) {
          key = rotatedKey;
          attempts += 1;
          continue;
        }
      }

      return upstreamError(`${serviceName} returned ${response.status}: ${text}`, response.status);
    } catch (error) {
      if (attempts < maxRetries) {
        attempts += 1;
        continue;
      }

      return upstreamError(error instanceof Error ? error.message : `${serviceName} request failed`);
    }
  }

  return upstreamError(`${serviceName} request failed`);
}
