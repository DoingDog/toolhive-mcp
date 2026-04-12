import { hasKeys, type AppEnv } from "../lib/env";
import type { ToolDefinition } from "./schema";
import { emptyObjectSchema } from "./schema";

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
    name: "tavily.crawl",
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
    name: "tavily.research",
    description: "Perform deep research with Tavily",
    requiresEnv: "TAVILY_API_KEYS",
    inputSchema: {
      type: "object",
      properties: {
        input: { type: "string", description: "Research task description" },
        model: { type: "string" },
        stream: { type: "boolean" },
        output_schema: {},
        citation_format: { type: "string" }
      },
      required: ["input"],
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
  },
  {
    name: "news.get_news",
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
    name: "news.get_news_detail",
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
    name: "news.get_topics",
    description: "Get available news topics from newsmcp",
    inputSchema: emptyObjectSchema
  },
  {
    name: "news.get_regions",
    description: "Get available news regions from newsmcp",
    inputSchema: emptyObjectSchema
  },
  {
    name: "domain.check_domain",
    description: "Check a domain name and return availability details",
    inputSchema: {
      type: "object",
      properties: {
        domain: { type: "string" },
        context: { type: "string" },
        max_price: { type: "number" }
      },
      required: ["domain"],
      additionalProperties: false
    }
  },
  {
    name: "domain.explore_name",
    description: "Explore domain options for a name",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string" },
        context: { type: "string" },
        max_price: { type: "number" }
      },
      required: ["name"],
      additionalProperties: false
    }
  },
  {
    name: "domain.search_domains",
    description: "Search domains by category and price",
    inputSchema: {
      type: "object",
      properties: {
        category: { type: "string" },
        max_price: { type: "number" }
      },
      additionalProperties: false
    }
  },
  // domain.list_categories is intentionally kept out of the current release
  // because the upstream endpoint is currently returning 503. The handler code
  // remains in src/tools/external/domain.ts for future re-enable.
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

type GetEnabledToolsOptions = {
  disabledTools?: string[];
};

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
  return getEnabledTools(env).find((tool) => tool.name === name);
}

function matchesDisabledTool(name: string, disabledTools: string[]): boolean {
  return disabledTools.some((disabledTool) =>
    disabledTool.endsWith(".*")
      ? name.startsWith(`${disabledTool.slice(0, -2)}.`)
      : name === disabledTool
  );
}
