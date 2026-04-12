import type { JsonRpcRequest } from "./jsonrpc";
import { jsonRpcError, jsonRpcResult } from "./jsonrpc";
import { initializeResult } from "./protocol";
import { internalError, validationError } from "../lib/errors";
import { toToolResult } from "./result";
import { findEnabledTool, getEnabledTools } from "./tool-registry";
import { validateToolArguments } from "./validate";
import { handleContext7QueryDocs, handleContext7Resolve } from "../tools/external/context7";
import {
  handleDomainCheckDomain,
  handleDomainExploreName,
  handleDomainListCategories,
  handleDomainSearchDomains
} from "../tools/external/domain";
import {
  handleNewsGetNews,
  handleNewsGetNewsDetail,
  handleNewsGetRegions,
  handleNewsGetTopics
} from "../tools/external/news";
import { handlePuremdExtract } from "../tools/external/puremd";
import {
  handleTavilyCrawl,
  handleTavilyExtract,
  handleTavilyResearch,
  handleTavilySearch
} from "../tools/external/tavily";
import { handleUnsplashSearch } from "../tools/external/unsplash";
import { handleBase64Decode, handleBase64Encode } from "../tools/devutils/base64";
import { handleHash } from "../tools/devutils/hash";
import { handleUuid } from "../tools/devutils/uuid";
import { handleJwtDecode } from "../tools/devutils/jwt";
import { handleJsonFormat, handleJsonValidate } from "../tools/devutils/json-tools";
import { handleRegexTest } from "../tools/devutils/regex";
import { handleUrlParse } from "../tools/devutils/url-parse";
import { handleTimestampConvert } from "../tools/devutils/timestamp";
import { handleCidrCalculate, handleIpValidate } from "../tools/devutils/ip-tools";
import { handleCaseConvert, handleSlugify, handleTextStats } from "../tools/devutils/text";
import { handleCalc } from "../tools/native/calc";
import { handleIp } from "../tools/native/ip";
import { handleTime } from "../tools/native/time";
import { handleWeather } from "../tools/native/weather";
import { handleWebfetch } from "../tools/native/webfetch";
import type { ToolContext } from "../tools/types";

export type Env = Record<string, string | undefined>;

export async function handleJsonRpc(
  request: JsonRpcRequest,
  env: Env,
  originalRequest: Request
): Promise<Response> {
  switch (request.method) {
    case "initialize":
      return jsonRpcResult(request.id ?? null, initializeResult());
    case "tools/list":
      return jsonRpcResult(request.id ?? null, {
        tools: getEnabledTools(env, { disabledTools: getDisabledTools(originalRequest) })
      });
    case "tools/call": {
      const params = request.params;
      if (!params || typeof params !== "object") {
        return jsonRpcError(request.id ?? null, -32602, "Invalid params");
      }

      const name = "name" in params ? (params as { name?: unknown }).name : undefined;
      if (typeof name !== "string") {
        return jsonRpcError(request.id ?? null, -32602, "Invalid params");
      }

      const tool = findEnabledTool(name, env);
      if (!tool) {
        return jsonRpcError(request.id ?? null, -32602, `Unknown tool: ${name}`);
      }

      const args = "arguments" in params ? (params as { arguments?: unknown }).arguments ?? {} : {};
      const validationErrorMessage = validateToolArguments(tool.inputSchema, args);
      if (validationErrorMessage) {
        return jsonRpcError(request.id ?? null, -32602, validationErrorMessage);
      }

      const result = await dispatchTool(name, args, { env, request: originalRequest });
      return jsonRpcResult(request.id ?? null, toToolResult(result));
    }
    default:
      return jsonRpcError(request.id ?? null, -32601, `Method not found: ${request.method}`);
  }
}

function getDisabledTools(request: Request): string[] {
  return new URL(request.url).searchParams
    .get("disable")
    ?.split(",")
    .map((value) => value.trim())
    .filter(Boolean) ?? [];
}

async function dispatchTool(name: string, args: unknown, context: ToolContext) {
  switch (name) {
    case "weather":
      return handleWeather(args, context);
    case "webfetch":
      return handleWebfetch(args, context);
    case "calc":
      return handleCalc(args, context);
    case "time":
      return handleTime(args, context);
    case "ip":
      return handleIp(args, context);
    case "tavily.search":
      return handleTavilySearch(args, context.env);
    case "tavily.extract":
      return handleTavilyExtract(args, context.env);
    case "tavily.crawl":
      return handleTavilyCrawl(args, context.env);
    case "tavily.research":
      return handleTavilyResearch(args, context.env);
    case "context7.resolve-library-id":
      return handleContext7Resolve(args, context.env);
    case "context7.query-docs":
      return handleContext7QueryDocs(args, context.env);
    case "unsplash.search_photos":
      return handleUnsplashSearch(args, context.env);
    case "puremd.extract":
      return handlePuremdExtract(args, context.env);
    case "news.get_news":
      return handleNewsGetNews(args, context.env);
    case "news.get_news_detail":
      return handleNewsGetNewsDetail(args, context.env);
    case "news.get_topics":
      return handleNewsGetTopics(args, context.env);
    case "news.get_regions":
      return handleNewsGetRegions(args, context.env);
    case "domain.check_domain":
      return handleDomainCheckDomain(args, context.env);
    case "domain.explore_name":
      return handleDomainExploreName(args, context.env);
    case "domain.search_domains":
      return handleDomainSearchDomains(args, context.env);
    case "domain.list_categories":
      return handleDomainListCategories(args, context.env);
    case "devutils.base64_encode":
      return handleBase64Encode(args);
    case "devutils.base64_decode":
      return handleBase64Decode(args);
    case "devutils.hash":
      return handleHash(args);
    case "devutils.uuid":
      return handleUuid();
    case "devutils.jwt_decode":
      return handleJwtDecode(args);
    case "devutils.json_format":
      return handleJsonFormat(args);
    case "devutils.json_validate":
      return handleJsonValidate(args);
    case "devutils.regex_test":
      return handleRegexTest(args);
    case "devutils.url_parse":
      return handleUrlParse(args);
    case "devutils.timestamp_convert":
      return handleTimestampConvert(args);
    case "devutils.ip_validate":
      return handleIpValidate(args);
    case "devutils.cidr_calculate":
      return handleCidrCalculate(args);
    case "devutils.text_stats":
      return handleTextStats(args);
    case "devutils.slugify":
      return handleSlugify(args);
    case "devutils.case_convert":
      return handleCaseConvert(args);
    default:
      return name.includes(".")
        ? internalError(`Tool handler not implemented: ${name}`)
        : validationError(`Unknown native tool: ${name}`);
  }
}
