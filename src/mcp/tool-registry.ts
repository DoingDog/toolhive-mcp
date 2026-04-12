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
        location: { type: "string", description: "City or place name to look up" },
        units: { type: "string", enum: ["metric", "imperial"], default: "metric" }
      },
      required: ["location"],
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
        format: { type: "string", enum: ["markdown", "text", "html"], default: "markdown" }
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
        timezone: { type: "string", description: "IANA timezone, e.g. Asia/Shanghai" }
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
        question: { type: "string", description: "Documentation question" },
        limit: { type: "number", minimum: 1, default: 5 }
      },
      required: ["libraryId", "question"],
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
        maxResults: { type: "number", minimum: 1, default: 5 },
        searchDepth: { type: "string", enum: ["basic", "advanced"], default: "basic" }
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
        urls: {
          type: "array",
          items: { type: "string" },
          description: "URLs to extract"
        }
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
        perPage: { type: "number", minimum: 1, default: 10 },
        page: { type: "number", minimum: 1, default: 1 }
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
        url: { type: "string", description: "URL to extract" }
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
    properties: {
      input: { type: "string", description: "Tool input payload" }
    },
    required: ["input"],
    additionalProperties: false
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
