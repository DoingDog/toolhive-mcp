import { upstreamError, validationError } from "../../lib/errors";
import type { ToolContext } from "../types";
import type { ToolExecutionResult } from "../../mcp/result";

type WeatherArgs = {
  query?: unknown;
  format?: unknown;
  lang?: unknown;
  units?: unknown;
};

export async function handleWeather(args: unknown, _context: ToolContext): Promise<ToolExecutionResult> {
  const weatherArgs = (args ?? {}) as WeatherArgs;

  if (typeof weatherArgs.query !== "string" || weatherArgs.query.trim() === "") {
    return validationError("query must be a non-empty string");
  }

  const format = weatherArgs.format ?? "json";
  if (format !== "json" && format !== "text") {
    return validationError("format must be json or text");
  }

  if (weatherArgs.lang !== undefined && typeof weatherArgs.lang !== "string") {
    return validationError("lang must be a string");
  }

  if (weatherArgs.units !== undefined && weatherArgs.units !== "metric" && weatherArgs.units !== "us" && weatherArgs.units !== "uk") {
    return validationError("units must be metric, us, or uk");
  }

  const url = new URL(`https://wttr.in/${encodeURIComponent(weatherArgs.query)}`);
  url.searchParams.set("format", format === "json" ? "j1" : "T");
  if (weatherArgs.lang) {
    url.searchParams.set("lang", weatherArgs.lang);
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
