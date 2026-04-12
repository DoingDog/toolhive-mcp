import type { AppEnv } from "../../lib/env";
import { upstreamError, validationError } from "../../lib/errors";
import type { ToolExecutionResult } from "../../mcp/result";

const DEFAULT_DOMAIN_API_BASE_URL = "https://agentdomainservice.com";

function getDomainApiBaseUrl(env: AppEnv): string {
  return (env.DOMAIN_API_BASE_URL ?? DEFAULT_DOMAIN_API_BASE_URL).replace(/\/+$/, "");
}

function getString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function getOptionalQuery(args: Record<string, unknown>, key: "context" | "category" | "max_price"): string | undefined {
  const value = args[key];
  if (typeof value === "string") {
    return value;
  }

  if (typeof value === "number") {
    return String(value);
  }

  return undefined;
}

async function getDomain(pathname: string, query: Record<string, string | undefined>, env: AppEnv = {}): Promise<ToolExecutionResult> {
  const url = new URL(`${getDomainApiBaseUrl(env)}${pathname}`);

  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) {
      url.searchParams.set(key, value);
    }
  }

  const response = await fetch(url.toString());
  if (!response.ok) {
    return upstreamError(`Domain API returned ${response.status}: ${await response.text()}`, response.status);
  }

  try {
    return {
      ok: true,
      data: await response.json()
    };
  } catch {
    return upstreamError("Domain API returned invalid JSON");
  }
}

export async function handleDomainCheckDomain(args: unknown, env: AppEnv = {}): Promise<ToolExecutionResult> {
  const input = args && typeof args === "object" ? args as Record<string, unknown> : {};
  const domain = getString(input.domain)?.trim();
  if (!domain) {
    return validationError("domain must be a non-empty string");
  }

  return getDomain(`/api/v1/lookup/${encodeURIComponent(domain)}`, {
    context: getOptionalQuery(input, "context"),
    max_price: getOptionalQuery(input, "max_price")
  }, env);
}

export async function handleDomainExploreName(args: unknown, env: AppEnv = {}): Promise<ToolExecutionResult> {
  const input = args && typeof args === "object" ? args as Record<string, unknown> : {};
  const name = getString(input.name)?.trim();
  if (!name) {
    return validationError("name must be a non-empty string");
  }

  return getDomain(`/api/v1/explore/${encodeURIComponent(name)}`, {
    context: getOptionalQuery(input, "context"),
    max_price: getOptionalQuery(input, "max_price")
  }, env);
}

export async function handleDomainSearchDomains(args: unknown, env: AppEnv = {}): Promise<ToolExecutionResult> {
  const input = args && typeof args === "object" ? args as Record<string, unknown> : {};

  return getDomain("/api/v1/domains/search", {
    category: getOptionalQuery(input, "category"),
    max_price: getOptionalQuery(input, "max_price")
  }, env);
}

export async function handleDomainListCategories(_args: unknown, env: AppEnv = {}): Promise<ToolExecutionResult> {
  return getDomain("/api/v1/domains/categories", {}, env);
}
