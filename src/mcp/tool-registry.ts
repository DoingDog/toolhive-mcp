import { hasKeys, type AppEnv } from "../lib/env";
import type { ToolDefinition } from "./schema";
import { emptyObjectSchema, type JsonSchema } from "./schema";

const nativeTools: ToolDefinition[] = [
  {
    name: "weather",
    description:
      "Get current weather for a location. Supports city names, airport codes, or coordinates. Prefer a structured location string and avoid ambiguous natural language.",
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description:
            "Structured location string such as a city, airport code, or coordinates. Avoid ambiguous natural language."
        },
        location: {
          type: "string",
          description:
            "Alias for query. Structured location string such as a city, airport code, or coordinates."
        },
        format: { type: "string", enum: ["json", "text"], default: "json" },
        lang: { type: "string" },
        units: { type: "string", enum: ["metric", "us", "uk"] }
      },
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
    description:
      "Evaluate a single math expression string, such as 2*(3+4). Pass an expression, not a natural language question.",
    inputSchema: {
      type: "object",
      properties: {
        expression: {
          type: "string",
          description: "Single math expression string to evaluate, such as 2*(3+4). Not a natural language question."
        },
        expr: {
          type: "string",
          description: "Alias for expression. Single math expression string to evaluate, such as 2*(3+4)."
        },
        input: {
          type: "string",
          description: "Alias for expression. Single math expression string to evaluate, such as 2*(3+4)."
        }
      },
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
    name: "whoami",
    description: "Get the current request identity summary only",
    inputSchema: emptyObjectSchema
  },
  {
    name: "iplookup",
    description: "Look up IP or hostname geolocation and network details",
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "IP address or hostname to look up"
        }
      },
      required: ["query"],
      additionalProperties: false
    }
  }
];

type ExternalToolConfig = Omit<ToolDefinition, "name"> & {
  legacyName: string;
};

function toCanonicalToolName(name: string): string {
  return name.replace(/\./g, "_");
}

const externalToolConfigs: ExternalToolConfig[] = [
  {
    legacyName: "context7.resolve-library-id",
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
    legacyName: "context7.query-docs",
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
    legacyName: "tavily.search",
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
    legacyName: "tavily.extract",
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
    legacyName: "tavily.crawl",
    description: "Crawl web pages with Tavily",
    requiresEnv: "TAVILY_API_KEYS",
    inputSchema: {
      type: "object",
      properties: {
        url: { type: "string", description: "Root URL to crawl" },
        instructions: { type: "string" },
        max_depth: { type: "integer", minimum: 1 },
        max_breadth: { type: "integer", minimum: 1 },
        limit: { type: "integer", minimum: 1 },
        select_paths: { type: "array", items: { type: "string" } },
        select_domains: { type: "array", items: { type: "string" } },
        exclude_paths: { type: "array", items: { type: "string" } },
        exclude_domains: { type: "array", items: { type: "string" } },
        allow_external: { type: "boolean" },
        include_images: { type: "boolean" },
        extract_depth: { type: "string", enum: ["basic", "advanced"] },
        format: { type: "string", enum: ["markdown", "text"] },
        include_favicon: { type: "boolean" }
      },
      required: ["url"],
      additionalProperties: false
    }
  },
  {
    legacyName: "unsplash.search_photos",
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
    legacyName: "puremd.extract",
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
  },
  {
    legacyName: "news.get_news",
    description: "Get recent news items from newsmcp",
    inputSchema: {
      type: "object",
      properties: {
        topics: { type: "string" },
        geo: { type: "string" },
        hours: { type: "integer", minimum: 1 },
        page: { type: "integer", minimum: 1 },
        per_page: { type: "integer", minimum: 1 },
        order_by: { type: "string" }
      },
      additionalProperties: false
    }
  },
  {
    legacyName: "news.get_news_detail",
    description: "Get a news item detail by event id",
    inputSchema: {
      type: "object",
      properties: {
        event_id: { type: "string" }
      },
      required: ["event_id"],
      additionalProperties: false
    }
  },
  {
    legacyName: "news.get_topics",
    description: "Get available news topics from newsmcp",
    inputSchema: emptyObjectSchema
  },
  {
    legacyName: "news.get_regions",
    description: "Get available news regions from newsmcp",
    inputSchema: emptyObjectSchema
  },
  // All domain tools are intentionally kept out of the current release
  // because the upstream endpoint set is currently unstable / unavailable.
  // The handler code remains in src/tools/external/domain.ts for future re-enable.
];

const externalTools: ToolDefinition[] = externalToolConfigs.map((tool) => ({
  ...tool,
  name: toCanonicalToolName(tool.legacyName)
}));

type DevutilsToolName =
  | "base64_encode"
  | "base64_decode"
  | "hash"
  | "uuid"
  | "jwt_decode"
  | "json_format"
  | "json_validate"
  | "regex_test"
  | "url_parse"
  | "timestamp_convert"
  | "ip_validate"
  | "cidr_calculate"
  | "text_stats"
  | "slugify"
  | "case_convert";

const devutilsToolSchemas: Record<DevutilsToolName, JsonSchema> = {
  base64_encode: {
    type: "object",
    properties: {
      text: { type: "string", description: "Text to encode as base64" }
    },
    additionalProperties: false
  },
  base64_decode: {
    type: "object",
    properties: {
      text: { type: "string", description: "Base64 text to decode" }
    },
    additionalProperties: false
  },
  hash: {
    type: "object",
    properties: {
      text: { type: "string", description: "Text to hash" },
      algorithm: {
        type: "string",
        enum: ["SHA-1", "SHA-256", "SHA-384", "SHA-512"],
        description: "Hash algorithm to use"
      }
    },
    additionalProperties: false
  },
  uuid: emptyObjectSchema,
  jwt_decode: {
    type: "object",
    properties: {
      token: { type: "string", description: "JWT string to decode" }
    },
    additionalProperties: false
  },
  json_format: {
    type: "object",
    properties: {
      text: { type: "string", description: "JSON text to pretty-print or minify" },
      minify: { type: "boolean", description: "Whether to return minified JSON" }
    },
    additionalProperties: false
  },
  json_validate: {
    type: "object",
    properties: {
      text: { type: "string", description: "JSON text to validate" }
    },
    additionalProperties: false
  },
  regex_test: {
    type: "object",
    properties: {
      pattern: { type: "string", description: "Regular expression pattern" },
      text: { type: "string", description: "Text to test against the pattern" },
      flags: { type: "string", description: "Optional RegExp flags" }
    },
    additionalProperties: false
  },
  url_parse: {
    type: "object",
    properties: {
      url: { type: "string", description: "URL to parse" }
    },
    additionalProperties: false
  },
  timestamp_convert: {
    type: "object",
    properties: {
      value: {
        description: "Date string or Unix timestamp in seconds"
      }
    },
    additionalProperties: false
  },
  ip_validate: {
    type: "object",
    properties: {
      ip: { type: "string", description: "IPv4 address to validate" }
    },
    additionalProperties: false
  },
  cidr_calculate: {
    type: "object",
    properties: {
      cidr: { type: "string", description: "IPv4 CIDR notation, such as 192.168.0.0/24" }
    },
    additionalProperties: false
  },
  text_stats: {
    type: "object",
    properties: {
      text: { type: "string", description: "Text to analyze" }
    },
    additionalProperties: false
  },
  slugify: {
    type: "object",
    properties: {
      text: { type: "string", description: "Text to convert into a slug" }
    },
    additionalProperties: false
  },
  case_convert: {
    type: "object",
    properties: {
      text: { type: "string", description: "Text to convert between common case formats" }
    },
    additionalProperties: false
  }
};

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
  name: `devutils_${name}`,
  description: `Run the ${name} developer utility`,
  inputSchema: devutilsToolSchemas[name as DevutilsToolName]
}));

type GetEnabledToolsOptions = {
  disabledTools?: string[];
};

const toolAliasMap = new Map<string, string>([
  ...externalToolConfigs.map((tool) => [tool.legacyName, toCanonicalToolName(tool.legacyName)] as const),
  ...devutilsToolNames.map((name) => [`devutils.${name}`, `devutils_${name}`] as const)
]);

export function canonicalizeToolName(name: string): string {
  return toolAliasMap.get(name) ?? name;
}

export function getEnabledTools(env: AppEnv, options: GetEnabledToolsOptions = {}): ToolDefinition[] {
  const tools = [
    ...nativeTools,
    ...devutilsTools,
    ...externalTools.filter((tool) => !tool.requiresEnv || hasKeys(env, tool.requiresEnv))
  ];

  if (!options.disabledTools?.length) {
    return tools;
  }

  return tools.filter((tool) => !matchesDisabledTool(tool.name, options.disabledTools!));
}

export function findEnabledTool(name: string, env: AppEnv): ToolDefinition | undefined {
  const canonicalName = canonicalizeToolName(name);
  return getEnabledTools(env).find((tool) => tool.name === canonicalName);
}

function matchesDisabledTool(name: string, disabledTools: string[]): boolean {
  return disabledTools.some((disabledTool) => {
    const canonicalDisabled = canonicalizeToolName(disabledTool);
    if (disabledTool.endsWith(".*")) {
      const legacyPrefix = disabledTool.slice(0, -2);
      return name.startsWith(`${legacyPrefix}_`) || name.startsWith(`${canonicalizeToolName(legacyPrefix)}_`);
    }
    return name === canonicalDisabled;
  });
}
