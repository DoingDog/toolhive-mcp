import type { ToolContext } from "../types";
import type { ToolExecutionResult } from "../../mcp/result";

type RequestCfLocation = {
  country?: string;
  countryCode?: string;
  region?: string;
  city?: string;
  timezone?: string;
};

function getWhoamiIp(headers: Headers): { ip: string | null; source: string | null } {
  const cfConnectingIp = headers.get("cf-connecting-ip");
  if (cfConnectingIp) {
    return { ip: cfConnectingIp, source: "cf-connecting-ip" };
  }

  const forwardedFor = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  if (forwardedFor) {
    return { ip: forwardedFor, source: "x-forwarded-for" };
  }

  const realIp = headers.get("x-real-ip");
  if (realIp) {
    return { ip: realIp, source: "x-real-ip" };
  }

  return { ip: null, source: null };
}

export async function handleWhoami(_args: unknown, context: ToolContext): Promise<ToolExecutionResult> {
  const headers = context.request.headers;
  const cf = (context.request as Request & { cf?: RequestCfLocation }).cf;
  const { ip, source } = getWhoamiIp(headers);

  return {
    ok: true,
    data: {
      ip,
      country: cf?.country ?? null,
      country_code: cf?.countryCode ?? cf?.country ?? null,
      region: cf?.region ?? null,
      city: cf?.city ?? null,
      timezone: cf?.timezone ?? null,
      source,
      user_agent: headers.get("user-agent")
    }
  };
}
