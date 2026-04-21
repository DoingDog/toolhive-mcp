import type { AppEnv } from "../lib/env";
import { handleContext7QueryDocs, handleContext7Resolve } from "../tools/external/context7";
import { handleExaSearch } from "../tools/external/exa";
import { handleIpLookup } from "../tools/external/iplookup";
import { handlePuremdExtract } from "../tools/external/puremd";
import { handleTavilyCrawl, handleTavilyExtract, handleTavilySearch } from "../tools/external/tavily";
import { handleUnsplashSearch } from "../tools/external/unsplash";
import { handleBase64Decode, handleBase64Encode } from "../tools/devutils/base64";
import { handleHash } from "../tools/devutils/hash";
import { handleCidrCalculate, handleIpValidate } from "../tools/devutils/ip-tools";
import { handleJsonFormat, handleJsonValidate } from "../tools/devutils/json-tools";
import { handleJwtDecode } from "../tools/devutils/jwt";
import { handleRegexTest } from "../tools/devutils/regex";
import { handleCaseConvert, handleSlugify, handleTextStats } from "../tools/devutils/text";
import { handleTimestampConvert } from "../tools/devutils/timestamp";
import { handleUrlParse } from "../tools/devutils/url-parse";
import { handleUuid } from "../tools/devutils/uuid";
import { handleCalc } from "../tools/native/calc";
import { handleWhoami } from "../tools/native/ip";
import { handleTime } from "../tools/native/time";
import { handleWeather } from "../tools/native/weather";
import { handleWebfetch } from "../tools/native/webfetch";
import {
  handlePaperGetDetails,
  handlePaperGetOpenAccess,
  handlePaperGetRelated,
  handlePaperSearch
} from "../tools/paper/search";
import type { ToolHandler as RuntimeToolHandler } from "../tools/types";
import type { ToolDefinition } from "./schema";
import { emptyObjectSchema, type JsonSchema } from "./schema";

export type ToolHandler = RuntimeToolHandler;

type EnvRequirement = NonNullable<ToolDefinition["requiresEnv"]>;

export type ToolManifestEntry = {
  name: string;
  aliases: string[];
  description: string;
  inputSchema: ToolDefinition["inputSchema"];
  category: "native" | "external" | "devutils";
  envRequirement?: EnvRequirement;
  whenToUse: string;
  whenNotToUse: string;
  outputShape: string;
  limits: {
    timeoutMs?: number;
    maxBytes?: number;
  };
  handler: ToolHandler;
};

function toCanonicalToolName(name: string): string {
  return name.replace(/[.-]/g, "_");
}

type NativeManifestConfig = Omit<ToolManifestEntry, "category" | "aliases">;

type ExternalManifestConfig = Omit<ToolManifestEntry, "name" | "category" | "aliases" | "handler"> & {
  legacyName: string;
  handler: (args: unknown, env: AppEnv) => ReturnType<ToolHandler>;
};

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

type PaperManifestConfig = Omit<ToolManifestEntry, "name" | "category" | "aliases"> & {
  legacyName: string;
};

function nativeTool(config: NativeManifestConfig): ToolManifestEntry {
  return {
    ...config,
    category: "native",
    aliases: []
  };
}

function externalTool(config: ExternalManifestConfig): ToolManifestEntry {
  return {
    ...config,
    name: toCanonicalToolName(config.legacyName),
    aliases: [config.legacyName],
    category: "external",
    handler: (args, context) => config.handler(args, context.env)
  };
}

function devutilsTool(name: DevutilsToolName, inputSchema: JsonSchema, handler: ToolHandler): ToolManifestEntry {
  const { required, ...schemaWithoutRequired } = inputSchema;

  return {
    name: `devutils_${name}`,
    aliases: [`devutils.${name}`],
    description: `Run the ${name} developer utility`,
    inputSchema: schemaWithoutRequired,
    category: "devutils",
    whenToUse: `Use when the ${name} developer utility is the requested operation.`,
    whenNotToUse: `Do not use when the request is unrelated to the ${name} developer utility.`,
    outputShape: `${name} utility result.`,
    limits: {},
    handler
  };
}

function paperTool(config: PaperManifestConfig): ToolManifestEntry {
  return {
    ...config,
    name: toCanonicalToolName(config.legacyName),
    aliases: [config.legacyName],
    category: "external"
  };
}

const nativeToolManifestEntries: ToolManifestEntry[] = [
  nativeTool({
    name: "weather",
    description:
      "Get current weather for a location. Supports city names, airport codes, or coordinates. Prefer a structured location string and avoid ambiguous natural language.",
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Structured location string such as a city, airport code, or coordinates. Avoid ambiguous natural language."
        },
        location: {
          type: "string",
          description: "Alias for query. Structured location string such as a city, airport code, or coordinates."
        },
        format: { type: "string", enum: ["json", "text"], default: "json" },
        lang: { type: "string" },
        units: { type: "string", enum: ["metric", "us", "uk"] }
      },
      additionalProperties: false
    },
    whenToUse: "Use to get current weather for a specific location.",
    whenNotToUse: "Do not use when the user wants forecasts or historical weather.",
    outputShape: "Current weather payload from wttr.in.",
    limits: {},
    handler: handleWeather
  }),
  nativeTool({
    name: "time",
    description: "Get the current time for a timezone",
    inputSchema: {
      type: "object",
      properties: {
        timezone: { type: "string", default: "UTC", description: "IANA timezone, e.g. Asia/Shanghai" }
      },
      additionalProperties: false
    },
    whenToUse: "Use to get the current time in a timezone.",
    whenNotToUse: "Do not use when the user asks for date arithmetic or schedules.",
    outputShape: "Timezone-aware current time string and metadata.",
    limits: {},
    handler: handleTime
  }),
  nativeTool({
    name: "whoami",
    description: "Get the current request identity summary only",
    inputSchema: emptyObjectSchema,
    whenToUse: "Use to inspect caller IP and geolocation summary.",
    whenNotToUse: "Do not use when the user asks for full request headers or debug dumps.",
    outputShape: "Request identity summary.",
    limits: {},
    handler: handleWhoami
  }),
  nativeTool({
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
        format: { type: "string", enum: ["markdown", "text", "html"] },
        max_bytes: { type: "integer", minimum: 0 },
        return_responseheaders: { type: "boolean", default: false }
      },
      required: ["url"],
      additionalProperties: false
    },
    whenToUse: "Use for direct HTTP fetching.",
    whenNotToUse: "Do not use when the request is not about fetching web content.",
    outputShape: "Fetched web content.",
    limits: { timeoutMs: 30000, maxBytes: 1048576 },
    handler: handleWebfetch
  }),
  nativeTool({
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
    },
    whenToUse: "Use to evaluate a single trusted math expression.",
    whenNotToUse: "Do not use for natural language math questions or arbitrary code.",
    outputShape: "Numeric expression result.",
    limits: {},
    handler: handleCalc
  })
];

const paperToolManifestEntries: ToolManifestEntry[] = [
  paperTool({
    legacyName: "paper-search",
    description: "Search scholarly papers across Crossref and OpenAlex",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", minLength: 1, description: "Search query for papers" }
      },
      required: ["query"],
      additionalProperties: false
    },
    whenToUse: "Use to search scholarly papers and return merged results from the available providers.",
    whenNotToUse: "Do not use for full-text retrieval or provider-specific filters that this tool does not expose.",
    outputShape: "Object with query, providers, partial, and merged paper results.",
    limits: {},
    handler: handlePaperSearch
  }),
  paperTool({
    legacyName: "paper-get-details",
    description: "Get paper details by DOI or arXiv identifier",
    inputSchema: {
      type: "object",
      properties: {
        doi: { type: "string", minLength: 1, description: "DOI used for paper lookup" },
        arxiv_id: { type: "string", minLength: 1, description: "arXiv id used for paper lookup" }
      },
      additionalProperties: false
    },
    whenToUse: "Use to access the registered paper details surface by DOI or arXiv id.",
    whenNotToUse: "Do not use to resolve generic provider-specific paper ids.",
    outputShape: "Paper details response keyed by DOI or arXiv identifier.",
    limits: {},
    handler: handlePaperGetDetails
  }),
  paperTool({
    legacyName: "paper-get-related",
    description: "Get papers related to an OpenAlex work id or DOI",
    inputSchema: {
      type: "object",
      properties: {
        paper_id: { type: "string", minLength: 1, description: "OpenAlex work id, work URL, or DOI" },
        doi: { type: "string", minLength: 1, description: "DOI used to resolve the OpenAlex work before fetching related papers" }
      },
      additionalProperties: false
    },
    whenToUse: "Use to fetch OpenAlex related-paper results for a DOI or OpenAlex work identifier.",
    whenNotToUse: "Do not use with arXiv ids or other provider-specific identifiers that OpenAlex cannot resolve.",
    outputShape: "Object with resolved paper_id, providers, partial, and related paper results.",
    limits: {},
    handler: handlePaperGetRelated
  }),
  paperTool({
    legacyName: "paper-get-open-access",
    description: "Get open access availability and links for a paper DOI",
    inputSchema: {
      type: "object",
      properties: {
        doi: { type: "string", minLength: 1, description: "DOI to resolve open access data for" }
      },
      required: ["doi"],
      additionalProperties: false
    },
    envRequirement: "PAPER_SEARCH_MCP_UNPAYWALL_EMAILS",
    whenToUse: "Use to look up Unpaywall open-access status and download links for a DOI.",
    whenNotToUse: "Do not use without a DOI or when broader paper metadata is needed.",
    outputShape: "Object with doi, provider, open_access, and download_links.",
    limits: {},
    handler: handlePaperGetOpenAccess
  })
];

const externalToolManifestEntries: ToolManifestEntry[] = [
  externalTool({
    legacyName: "iplookup",
    description: "Look up IP or hostname geolocation and network details",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "IP address or hostname to look up" }
      },
      required: ["query"],
      additionalProperties: false
    },
    whenToUse: "Use when the user wants IP or hostname geolocation and network info.",
    whenNotToUse: "Do not use for WHOIS, ASN deep dives, or reverse DNS beyond the provider response.",
    outputShape: "IP lookup details and raw upstream payload.",
    limits: {},
    handler: handleIpLookup
  }),
  externalTool({
    legacyName: "exa.search",
    description: "Search the web with Exa curated synchronous search",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string" },
        limit: { type: "integer", minimum: 1 },
        search_type: { type: "string" },
        category: { type: "string" },
        include_domains: { type: "array", items: { type: "string" } },
        exclude_domains: { type: "array", items: { type: "string" } },
        start_published_date: { type: "string" },
        end_published_date: { type: "string" },
        start_crawl_date: { type: "string" },
        end_crawl_date: { type: "string" },
        include_text: { type: "boolean" },
        text_max_characters: { type: "integer", minimum: 1 },
        include_highlights: { type: "boolean" },
        highlights_max_characters: { type: "integer", minimum: 1 },
        include_summary: { type: "boolean" },
        summary_query: { type: "string" },
        livecrawl: { type: "string" },
        moderation: {},
        user_location: { type: "object" }
      },
      required: ["query"],
      additionalProperties: false
    },
    envRequirement: "EXA_API_KEYS",
    whenToUse: "Use for web search via Exa's API.",
    whenNotToUse: "Do not use for browsing authenticated or private resources.",
    outputShape: "Exa search results with mapped fields and raw response.",
    limits: {},
    handler: handleExaSearch
  }),
  externalTool({
    legacyName: "tavily.search",
    description: "Search the web with Tavily",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string" },
        search_depth: { type: "string", enum: ["basic", "advanced"] },
        topic: { type: "string", enum: ["general", "news"] },
        max_results: { type: "integer", minimum: 0 },
        include_answer: {},
        include_raw_content: {},
        include_domains: { type: "array", items: { type: "string" } },
        exclude_domains: { type: "array", items: { type: "string" } }
      },
      required: ["query"],
      additionalProperties: false
    },
    envRequirement: "TAVILY_API_KEYS",
    whenToUse: "Use for Tavily search API requests.",
    whenNotToUse: "Do not use for authenticated websites or arbitrary crawling without need.",
    outputShape: "Tavily search response.",
    limits: {},
    handler: handleTavilySearch
  }),
  externalTool({
    legacyName: "tavily.extract",
    description: "Extract content from web pages with Tavily",
    inputSchema: {
      type: "object",
      properties: {
        urls: {
          anyOf: [
            { type: "string" },
            { type: "array", items: { type: "string" } }
          ]
        },
        query: { type: "string" },
        extract_depth: { type: "string", enum: ["basic", "advanced"] },
        format: { type: "string", enum: ["markdown", "text"] },
        include_images: { type: "boolean" },
        include_favicon: { type: "boolean" }
      },
      required: ["urls"],
      additionalProperties: false
    },
    envRequirement: "TAVILY_API_KEYS",
    whenToUse: "Use for Tavily extraction API requests.",
    whenNotToUse: "Do not use for authenticated pages or sites blocked to the API.",
    outputShape: "Tavily extract response.",
    limits: {},
    handler: handleTavilyExtract
  }),
  externalTool({
    legacyName: "tavily.crawl",
    description: "Crawl web pages with Tavily",
    inputSchema: {
      type: "object",
      properties: {
        url: { type: "string" },
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
    },
    envRequirement: "TAVILY_API_KEYS",
    whenToUse: "Use for Tavily crawl API requests.",
    whenNotToUse: "Do not use for websites requiring a browser or login.",
    outputShape: "Tavily crawl response.",
    limits: {},
    handler: handleTavilyCrawl
  }),
  externalTool({
    legacyName: "context7.resolve-library-id",
    description: "Resolve a Context7 library identifier from a package or library name",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string" },
        libraryName: { type: "string" },
        library_name: { type: "string" }
      },
      additionalProperties: false
    },
    envRequirement: "CONTEXT7_API_KEYS",
    whenToUse: "Use to resolve a Context7 library id.",
    whenNotToUse: "Do not use for general web search.",
    outputShape: "Context7 resolve result content.",
    limits: {},
    handler: handleContext7Resolve
  }),
  externalTool({
    legacyName: "context7.query-docs",
    description: "Query Context7 documentation for a resolved library",
    inputSchema: {
      type: "object",
      properties: {
        libraryId: { type: "string" },
        query: { type: "string" }
      },
      required: ["libraryId", "query"],
      additionalProperties: false
    },
    envRequirement: "CONTEXT7_API_KEYS",
    whenToUse: "Use to query Context7 docs for a specific library id.",
    whenNotToUse: "Do not use without a resolved library id.",
    outputShape: "Context7 query-docs result content.",
    limits: {},
    handler: handleContext7QueryDocs
  }),
  externalTool({
    legacyName: "puremd.extract",
    description: "Extract clean markdown from a URL",
    inputSchema: {
      type: "object",
      properties: {
        url: { type: "string" },
        format: { type: "string", enum: ["markdown", "text"] },
        prompt: { type: "string" },
        schema: { type: "string" },
        requestheaders: {
          type: "object",
          additionalProperties: { type: "string" }
        }
      },
      required: ["url"],
      additionalProperties: false
    },
    envRequirement: "PUREMD_API_KEYS",
    whenToUse: "Use for Pure.md extraction.",
    whenNotToUse: "Do not use for authenticated or private websites.",
    outputShape: "Extracted content from Pure.md.",
    limits: {},
    handler: handlePuremdExtract
  }),
  externalTool({
    legacyName: "unsplash.search_photos",
    description: "Search Unsplash photos",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string" },
        page: { type: "integer", minimum: 1 },
        per_page: { type: "integer", minimum: 1, maximum: 30 },
        orientation: { type: "string", enum: ["landscape", "portrait", "squarish"] },
        color: { type: "string" },
        order_by: { type: "string" }
      },
      required: ["query"],
      additionalProperties: false
    },
    envRequirement: "UNSPLASH_ACCESS_KEYS",
    whenToUse: "Use to search Unsplash photos.",
    whenNotToUse: "Do not use for authenticated or private image sources.",
    outputShape: "Compact Unsplash photo results.",
    limits: {},
    handler: handleUnsplashSearch
  })
];

export const toolManifestEntries: ToolManifestEntry[] = [
  ...nativeToolManifestEntries,
  ...paperToolManifestEntries,
  ...externalToolManifestEntries,
  devutilsTool("base64_encode", {
    type: "object",
    properties: { text: { type: "string" } },
    required: ["text"],
    additionalProperties: false
  }, handleBase64Encode),
  devutilsTool("base64_decode", {
    type: "object",
    properties: { text: { type: "string" } },
    required: ["text"],
    additionalProperties: false
  }, handleBase64Decode),
  devutilsTool("hash", {
    type: "object",
    properties: {
      text: { type: "string" },
      algorithm: { type: "string", enum: ["SHA-1", "SHA-256", "SHA-384", "SHA-512"] }
    },
    required: ["text"],
    additionalProperties: false
  }, handleHash),
  devutilsTool("uuid", emptyObjectSchema, handleUuid),
  devutilsTool("jwt_decode", {
    type: "object",
    properties: { token: { type: "string" } },
    required: ["token"],
    additionalProperties: false
  }, handleJwtDecode),
  devutilsTool("json_format", {
    type: "object",
    properties: {
      text: { type: "string" },
      minify: { type: "boolean" }
    },
    required: ["text"],
    additionalProperties: false
  }, handleJsonFormat),
  devutilsTool("json_validate", {
    type: "object",
    properties: { text: { type: "string" } },
    required: ["text"],
    additionalProperties: false
  }, handleJsonValidate),
  devutilsTool("regex_test", {
    type: "object",
    properties: {
      pattern: { type: "string" },
      text: { type: "string" },
      flags: { type: "string" }
    },
    required: ["pattern", "text"],
    additionalProperties: false
  }, handleRegexTest),
  devutilsTool("url_parse", {
    type: "object",
    properties: { url: { type: "string" } },
    required: ["url"],
    additionalProperties: false
  }, handleUrlParse),
  devutilsTool("timestamp_convert", {
    type: "object",
    properties: { value: {} },
    additionalProperties: false
  }, handleTimestampConvert),
  devutilsTool("ip_validate", {
    type: "object",
    properties: { ip: { type: "string" } },
    required: ["ip"],
    additionalProperties: false
  }, handleIpValidate),
  devutilsTool("cidr_calculate", {
    type: "object",
    properties: { cidr: { type: "string" } },
    required: ["cidr"],
    additionalProperties: false
  }, handleCidrCalculate),
  devutilsTool("text_stats", {
    type: "object",
    properties: { text: { type: "string" } },
    required: ["text"],
    additionalProperties: false
  }, handleTextStats),
  devutilsTool("slugify", {
    type: "object",
    properties: { text: { type: "string" } },
    required: ["text"],
    additionalProperties: false
  }, handleSlugify),
  devutilsTool("case_convert", {
    type: "object",
    properties: { text: { type: "string" } },
    required: ["text"],
    additionalProperties: false
  }, handleCaseConvert)
];

export function getToolHandler(name: string): ToolHandler | undefined {
  return toolManifestEntries.find((entry) => entry.name === name || entry.aliases.includes(name))?.handler;
}

export function getManifestEnabledEntries(env: AppEnv): ToolManifestEntry[] {
  return toolManifestEntries.filter((entry) => {
    if (!entry.envRequirement) {
      return true;
    }

    const value = env[entry.envRequirement];
    return typeof value === "string" && value.trim().length > 0;
  });
}

export function getToolDefinitions(env: AppEnv): ToolDefinition[] {
  return getManifestEnabledEntries(env).map((entry) => ({
    name: entry.name,
    description: entry.description,
    inputSchema: entry.inputSchema,
    ...(entry.envRequirement ? { requiresEnv: entry.envRequirement } : {})
  }));
}
