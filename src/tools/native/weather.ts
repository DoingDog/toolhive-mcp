import { upstreamError, validationError } from "../../lib/errors";
import type { ToolContext } from "../types";
import type { ToolExecutionResult } from "../../mcp/result";

type WeatherArgs = {
  query?: unknown;
  location?: unknown;
  format?: unknown;
  lang?: unknown;
  units?: unknown;
};

export async function handleWeather(args: unknown, _context: ToolContext): Promise<ToolExecutionResult> {
  const weatherArgs = (args ?? {}) as WeatherArgs;
  const query = weatherArgs.query ?? weatherArgs.location;

  if (typeof query !== "string" || query.trim() === "") {
    return validationError("query or location must be a non-empty string");
  }

  const format = weatherArgs.format ?? "json";
  if (format !== "json" && format !== "text") {
    return validationError("format must be json or text");
  }

  if (weatherArgs.lang !== undefined && typeof weatherArgs.lang !== "string") {
    return validationError("lang must be a string");
  }

  const normalizedLang = weatherArgs.lang
    ? (() => {
        const normalized = weatherArgs.lang.trim().replaceAll("_", "-").toLowerCase();
        if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(normalized)) {
          return null;
        }

        return normalized;
      })()
    : undefined;

  if (normalizedLang === null) {
    return validationError("lang must be a locale like zh-cn");
  }

  if (weatherArgs.units !== undefined && weatherArgs.units !== "metric" && weatherArgs.units !== "us" && weatherArgs.units !== "uk") {
    return validationError("units must be metric, us, or uk");
  }

  const url = new URL(`https://wttr.in/${encodeURIComponent(query)}`);
  url.searchParams.set("format", format === "json" ? "j1" : "T");
  if (normalizedLang) {
    url.searchParams.set("lang", normalizedLang);
  }
  if (weatherArgs.units === "us") {
    url.searchParams.set("u", "");
  }
  if (weatherArgs.units === "metric") {
    url.searchParams.set("m", "");
  }
  if (weatherArgs.units === "uk") {
    url.searchParams.set("M", "");
  }

  try {
    const response = await fetch(url.toString());
    const body = await response.text();

    if (!response.ok) {
      return upstreamError("weather request failed", response.status, body);
    }

    return {
      ok: true,
      data: format === "json" ? JSON.parse(body) : body
    };
  } catch (error) {
    return upstreamError(error instanceof Error ? error.message : "weather request failed");
  }
}
