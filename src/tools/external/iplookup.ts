import { createResponseMetadata } from "../../lib/response-metadata";
import { upstreamError, validationError } from "../../lib/errors";
import type { ToolExecutionResult } from "../../mcp/result";

type IpApiSuccessResponse = {
  status: "success";
  query?: unknown;
  country?: unknown;
  countryCode?: unknown;
  region?: unknown;
  regionName?: unknown;
  city?: unknown;
  timezone?: unknown;
  lat?: unknown;
  lon?: unknown;
  zip?: unknown;
  isp?: unknown;
  org?: unknown;
  as?: unknown;
  asname?: unknown;
  mobile?: unknown;
  proxy?: unknown;
  hosting?: unknown;
};

type IpApiFailureResponse = {
  status: "fail";
  message?: unknown;
  [key: string]: unknown;
};

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim() !== "";
}

function readText(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

export async function handleIpLookup(args: unknown): Promise<ToolExecutionResult> {
  const query = (args as { query?: unknown } | undefined)?.query;
  if (!isNonEmptyString(query)) {
    return validationError("query must be a non-empty string");
  }

  let response: Response;
  try {
    response = await fetch(
      `http://ip-api.com/json/${encodeURIComponent(query)}?fields=55312383`
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return upstreamError(`IP-API request failed: ${message}`);
  }

  if (response.status === 429) {
    const rateLimitRemaining = response.headers.get("X-Rl") ?? undefined;
    const rateLimitResetSeconds = response.headers.get("X-Ttl") ?? undefined;
    const body = await response.text();
    const suffix = body ? `: ${body}` : "";
    return upstreamError(
      `IP-API rate limit exceeded (X-Rl=${rateLimitRemaining ?? "unknown"}, X-Ttl=${rateLimitResetSeconds ?? "unknown"})${suffix}`,
      429,
      { rateLimitRemaining, rateLimitResetSeconds }
    );
  }

  if (!response.ok) {
    return upstreamError(
      `IP-API returned ${response.status}: ${await response.text()}`,
      response.status
    );
  }

  let data: IpApiSuccessResponse | IpApiFailureResponse;
  try {
    data = await response.json() as IpApiSuccessResponse | IpApiFailureResponse;
  } catch {
    return upstreamError("IP-API returned invalid JSON");
  }

  if (data.status === "fail") {
    const upstreamMessage = readText(data.message);
    return validationError(
      upstreamMessage ? `IP lookup failed: ${upstreamMessage}` : "IP lookup failed",
      { upstream: data }
    );
  }

  return {
    ok: true,
    data: {
      query,
      ip: readText(data.query),
      country: readText(data.country),
      country_code: readText(data.countryCode),
      region: readText(data.regionName),
      region_code: readText(data.region),
      city: readText(data.city),
      timezone: readText(data.timezone),
      lat: data.lat,
      lon: data.lon,
      zip: readText(data.zip),
      isp: readText(data.isp),
      org: readText(data.org),
      as: readText(data.as),
      asname: readText(data.asname),
      mobile: data.mobile,
      proxy: data.proxy,
      hosting: data.hosting,
      ...createResponseMetadata({
        providerUsed: "ip-api",
        cached: false,
        partial: false
      })
    }
  };
}
