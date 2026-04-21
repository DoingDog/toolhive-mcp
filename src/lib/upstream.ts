import { upstreamError } from "./errors";
import type { ToolFailure } from "../mcp/result";
import { pickRandomKey } from "./keys";

type UpstreamRequest = {
  url: string;
  init?: RequestInit;
};

type GuardedFetchOptions = {
  serviceName: string;
  timeoutMs?: number;
  maxBytes?: number;
};

type UpstreamFetchOptions = GuardedFetchOptions & {
  keys: string[];
  makeRequest: (key: string) => UpstreamRequest;
  maxRetries?: number;
};

export type GuardedFetchSuccess = {
  response: Response;
  text: string;
  contentLength?: number;
  truncated: boolean;
};

export type UpstreamFetchSuccess = GuardedFetchSuccess & {
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

function truncateBytes(bytes: Uint8Array, contentLength: number | undefined, maxBytes?: number): {
  text: string;
  contentLength?: number;
  truncated: boolean;
} {
  if (maxBytes === undefined || maxBytes < 0 || (contentLength !== undefined && contentLength <= maxBytes)) {
    return {
      text: new TextDecoder().decode(bytes),
      ...(contentLength !== undefined ? { contentLength } : {}),
      truncated: false
    };
  }

  const decoder = new TextDecoder("utf-8", { fatal: true });
  let end = Math.min(maxBytes, bytes.length);

  while (end > 0) {
    try {
      return {
        text: decoder.decode(bytes.subarray(0, end)),
        ...(contentLength !== undefined ? { contentLength } : {}),
        truncated: true
      };
    } catch {
      end -= 1;
    }
  }

  return {
    text: "",
    ...(contentLength !== undefined ? { contentLength } : {}),
    truncated: true
  };
}

function truncateText(text: string, maxBytes?: number): { text: string; contentLength?: number; truncated: boolean } {
  const encoded = new TextEncoder().encode(text);
  return truncateBytes(encoded, encoded.length, maxBytes);
}

function getContentLength(response: Response): number | undefined {
  const contentLength = response.headers.get("content-length");
  if (contentLength === null) {
    return undefined;
  }

  const parsed = Number.parseInt(contentLength, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}

async function readResponseText(response: Response, maxBytes?: number): Promise<{ text: string; contentLength?: number; truncated: boolean }> {
  if (maxBytes === undefined || maxBytes < 0 || response.body === null) {
    return truncateText(await response.text(), maxBytes);
  }

  const contentLength = getContentLength(response);
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let bufferedBytes = 0;
  let consumedBytes = 0;
  let truncated = false;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      const chunk = value ?? new Uint8Array();
      consumedBytes += chunk.byteLength;

      if (bufferedBytes + chunk.byteLength <= maxBytes) {
        chunks.push(chunk);
        bufferedBytes += chunk.byteLength;

        if (contentLength !== undefined && contentLength > maxBytes && bufferedBytes >= maxBytes) {
          truncated = true;
          await reader.cancel();
          break;
        }

        continue;
      }

      const remaining = Math.max(0, maxBytes - bufferedBytes);
      if (remaining > 0) {
        chunks.push(chunk.subarray(0, remaining));
        bufferedBytes += remaining;
      }
      truncated = true;
      await reader.cancel();
      break;
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(bufferedBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return truncated
    ? truncateBytes(bytes, contentLength, maxBytes)
    : {
      text: new TextDecoder().decode(bytes),
      contentLength: contentLength ?? consumedBytes,
      truncated: false
    };
}

function mergeAbortSignals(signals: AbortSignal[]): AbortSignal {
  if (signals.length === 1) {
    return signals[0]!;
  }

  if (typeof AbortSignal.any === "function") {
    return AbortSignal.any(signals);
  }

  const controller = new AbortController();
  const abort = (signal: AbortSignal) => {
    controller.abort(signal.reason);
    for (const currentSignal of signals) {
      currentSignal.removeEventListener("abort", onAbort);
    }
  };
  const onAbort = (event: Event) => {
    abort(event.target as AbortSignal);
  };

  for (const signal of signals) {
    if (signal.aborted) {
      abort(signal);
      break;
    }

    signal.addEventListener("abort", onAbort, { once: true });
  }

  return controller.signal;
}

export async function fetchGuardedText(
  request: UpstreamRequest,
  options: GuardedFetchOptions
): Promise<GuardedFetchSuccess | ToolFailure> {
  try {
    new Request(request.url, request.init);
  } catch (error) {
    return upstreamError(error instanceof Error ? error.message : `${options.serviceName} request failed`);
  }

  const timeoutMs = options.timeoutMs;
  const controller = timeoutMs !== undefined ? new AbortController() : undefined;
  const timeoutId = timeoutMs !== undefined
    ? setTimeout(() => controller?.abort(new Error(`${options.serviceName} request timed out after ${timeoutMs}ms`)), timeoutMs)
    : undefined;

  const signal = controller
    ? mergeAbortSignals(request.init?.signal ? [request.init.signal, controller.signal] : [controller.signal])
    : request.init?.signal;
  const init: RequestInit = signal
    ? { ...(request.init ?? {}), signal }
    : (request.init ?? {});

  try {
    const response = await fetch(request.url, init);
    const body = await readResponseText(response, options.maxBytes);

    return {
      response,
      text: body.text,
      ...(body.contentLength !== undefined ? { contentLength: body.contentLength } : {}),
      truncated: body.truncated
    };
  } catch (error) {
    if (error instanceof Error) {
      return upstreamError(error.message);
    }

    return upstreamError(`${options.serviceName} request failed`);
  } finally {
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId);
    }
  }
}

export async function fetchWithKeyRetry(options: UpstreamFetchOptions): Promise<UpstreamFetchSuccess | ToolFailure> {
  const { keys, serviceName, makeRequest, maxRetries = 1, timeoutMs, maxBytes } = options;
  let key = pickRandomKey(keys);
  let attempts = 0;

  while (key && attempts <= maxRetries) {
    const request = makeRequest(key);
    const guardedResult = await fetchGuardedText(request, {
      serviceName,
      ...(timeoutMs !== undefined ? { timeoutMs } : {}),
      ...(maxBytes !== undefined ? { maxBytes } : {})
    });

    if ("error" in guardedResult) {
      if (attempts < maxRetries) {
        attempts += 1;
        continue;
      }

      return guardedResult;
    }

    const authFailure = isAuthFailure(guardedResult.response.status, guardedResult.text);

    if (guardedResult.response.ok && !authFailure) {
      return { ...guardedResult, key };
    }

    if (attempts < maxRetries && authFailure) {
      const rotatedKey = nextKey(keys, key);
      if (rotatedKey) {
        key = rotatedKey;
        attempts += 1;
        continue;
      }
    }

    return upstreamError(
      `${serviceName} returned ${guardedResult.response.status}: ${guardedResult.text}`,
      guardedResult.response.status
    );
  }

  return upstreamError(`${serviceName} request failed`);
}
