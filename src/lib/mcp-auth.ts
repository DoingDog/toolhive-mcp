const VALID_KEY = /^[A-Za-z0-9_-]+$/;

export function isProtectedMcpMethod(method: string): boolean {
  return method === "tools/list" || method === "tools/call";
}

export function isAuthorizedMcpRequest(request: Request, env: Record<string, string | undefined>): boolean {
  const configuredKeys = getConfiguredKeys(env.MCP_AUTH_KEYS);
  if (configuredKeys === null) {
    return true;
  }

  const providedKey = getRequestKey(request);
  return providedKey !== null && configuredKeys.has(providedKey);
}

function getConfiguredKeys(rawKeys: string | undefined): Set<string> | null {
  if (rawKeys === undefined || rawKeys.trim() === "") {
    return null;
  }

  return new Set(
    rawKeys
      .split(",")
      .map((key) => key.trim())
      .filter((key) => VALID_KEY.test(key))
  );
}

function getRequestKey(request: Request): string | null {
  const authorization = request.headers.get("authorization");
  if (authorization) {
    const match = /^Bearer\s+(.+)$/.exec(authorization);
    if (match) {
      const bearerKey = match[1]?.trim();
      if (bearerKey && VALID_KEY.test(bearerKey)) {
        return bearerKey;
      }
    }
  }

  const apiKey = request.headers.get("x-api-key")?.trim();
  if (apiKey && VALID_KEY.test(apiKey)) {
    return apiKey;
  }

  const queryKey = new URL(request.url).searchParams.get("key")?.trim();
  if (queryKey && VALID_KEY.test(queryKey)) {
    return queryKey;
  }

  return null;
}
