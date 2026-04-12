import { hasKeys, type AppEnv } from "../lib/env";
import type { ToolDefinition } from "./schema";
import { emptyObjectSchema } from "./schema";

const nativeTools: ToolDefinition[] = [
  {
    name: "weather",
    description: "Get current weather for a location",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string" },
        format: { type: "string", enum: ["json", "text"], default: "json" },
        lang: { type: "string" },
        units: { type: "string", enum: ["metric", "us", "uk"] }
      },
      required: ["query"],
      additionalProperties: false
    }
  },
  {
    name: "webfetch",
    description: "Fetch a web page and return extracted content",
    inputSchema: {
      type: "object",
      properties: {
        url: { type: "string", description: "HTTP or HTTPS URL to fetch" },
        method: { type: "string", enum: ["GET", "POST"], default: "GET" },
        requestheaders: {
          type: "object",
          additionalProperties: { type: "string" }
        },
        body: { type: "string" },
        return_responseheaders: { type: "boolean", default: false }
      },
      required: ["url"],
      additionalProperties: false
    }
  },
  {
    name: "calc",
    description: "Evaluate a math expression",
    inputSchema: {
      type: "object",
      properties: {
        expression: { type: "string", description: "Expression to evaluate" }
      },
      required: ["expression"],
      additionalProperties: false
    }
  },
  {
    name: "time",
    description: "Get the current time for a timezone",
    inputSchema: {
      type: "object",
      properties: {
        timezone: { type: "string", description: "IANA timezone, e.g. Asia/Shanghai", default: "UTC" }
      },
      additionalProperties: false
    }
  },
  {
    name: "ip",
    description: "Get IP and geolocation information",
    inputSchema: emptyObjectSchema
  }
];

const externalTools: ToolDefinition[] = [
  {
    name: "context7.resolve-library-id",
    description: "Resolve a Context7 library identifier from a package or library name",
    requiresEnv: "CONTEXT7_API_KEYS",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Package or library name to resolve" }
      },
      required: ["query"],
      additionalProperties: false
    }
  },
  {
    name: "context7.query-docs",
    description: "Query Context7 documentation for a resolved library",
    requiresEnv: "CONTEXT7_API_KEYS",
    inputSchema: {
      type: "object",
      properties: {
        libraryId: { type: "string", description: "Resolved Context7 library id" },
        query: { type: "string" }
      },
      required: ["libraryId", "query"],
      additionalProperties: false
    }
  },
  {
    name: "tavily.search",
    description: "Search the web with Tavily",
    requiresEnv: "TAVILY_API_KEYS",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search query" },
        search_depth: { type: "string", enum: ["basic", "advanced", "fast", "ultra-fast"] },
        topic: { type: "string", enum: ["general", "news", "finance"] },
        max_results: { type: "integer", minimum: 0, maximum: 20 },
        include_answer: {},
        include_raw_content: {},
        include_domains: { type: "array", items: { type: "string" } },
        exclude_domains: { type: "array", items: { type: "string" } }
      },
      required: ["query"],
      additionalProperties: false
    }
  },
  {
    name: "tavily.extract",
    description: "Extract content from web pages with Tavily",
    requiresEnv: "TAVILY_API_KEYS",
    inputSchema: {
      type: "object",
      properties: {
        urls: {},
        query: { type: "string" },
        extract_depth: { type: "string", enum: ["basic", "advanced"] },
        format: { type: "string", enum: ["markdown", "text"] },
        include_images: { type: "boolean" },
        include_favicon: { type: "boolean" }
      },
      required: ["urls"],
      additionalProperties: false
    }
  },
  {
    name: "unsplash.search_photos",
    description: "Search Unsplash photos",
    requiresEnv: "UNSPLASH_ACCESS_KEYS",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Photo search query" },
        page: { type: "integer", minimum: 1 },
        per_page: { type: "integer", minimum: 1, maximum: 30 },
        orientation: { type: "string", enum: ["landscape", "portrait", "squarish"] },
        color: { type: "string" },
        order_by: { type: "string" }
      },
      required: ["query"],
      additionalProperties: false
    }
  },
  {
    name: "puremd.extract",
    description: "Extract clean markdown from a URL",
    requiresEnv: "PUREMD_API_KEYS",
    inputSchema: {
      type: "object",
      properties: {
        url: { type: "string", description: "URL to extract" },
        format: { type: "string", enum: ["markdown", "text"] },
        requestheaders: {
          type: "object",
          additionalProperties: { type: "string" }
        },
        prompt: { type: "string" },
        schema: { type: "string" }
      },
      required: ["url"],
      additionalProperties: false
    }
  }
];

const devutilsToolNames = [
  "base64_encode",
  "base64_decode",
  "hash",
  "uuid",
  "jwt_decode",
  "json_format",
  "json_validate",
  "regex_test",
  "url_parse",
  "timestamp_convert",
  "ip_validate",
  "cidr_calculate",
  "text_stats",
  "slugify",
  "case_convert"
] as const;

const devutilsTools: ToolDefinition[] = devutilsToolNames.map((name) => ({
  name: `devutils.${name}`,
  description: `Run the ${name} developer utility`,
  inputSchema: {
    type: "object",
    properties: {},
    additionalProperties: true
  }
}));

export function getEnabledTools(env: AppEnv): ToolDefinition[] {
  return [
    ...nativeTools,
    ...devutilsTools,
    ...externalTools.filter((tool) => tool.requiresEnv && hasKeys(env, tool.requiresEnv))
  ];
}

export function findEnabledTool(name: string, env: AppEnv): ToolDefinition | undefined {
  return getEnabledTools(env).find((tool) => tool.name === name);
}
