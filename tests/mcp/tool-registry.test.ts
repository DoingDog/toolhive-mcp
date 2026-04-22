// @ts-expect-error Vitest loads raw markdown via Vite in tests.
import readme from "../../README.md?raw";
// @ts-expect-error Vitest loads raw markdown via Vite in tests.
import readmeZhCn from "../../README.zh-CN.md?raw";
import { describe, expect, it, vi } from "vitest";
import { findEnabledTool, getEnabledTools } from "../../src/mcp/tool-registry";
import { buildAliasMap, buildHandlerMap, buildToolDefinitions } from "../../src/mcp/tool-catalog";
import { getToolDefinitions, type ToolManifestEntry } from "../../src/mcp/tool-manifest";
import type { ToolExecutionResult } from "../../src/mcp/result";
import type { JsonSchema } from "../../src/mcp/schema";
import { validateToolArguments } from "../../src/mcp/validate";
import type { ToolContext } from "../../src/tools/types";

async function stubHandler(_args: unknown, _context: ToolContext): Promise<ToolExecutionResult> {
  return { ok: true, data: { ok: true } };
}

const manifest: ToolManifestEntry[] = [
  {
    name: "weather",
    aliases: ["forecast.current"],
    description: "Get current weather for a location.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string" }
      },
      additionalProperties: false
    },
    category: "native",
    whenToUse: "Use for current weather requests.",
    whenNotToUse: "Do not use for forecasts.",
    outputShape: "Current weather payload.",
    limits: { timeoutMs: 5000, maxBytes: 4096 },
    handler: stubHandler
  },
  {
    name: "tavily_search",
    aliases: ["tavily.search"],
    description: "Search the web with Tavily.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string" }
      },
      required: ["query"],
      additionalProperties: false
    },
    category: "external",
    envRequirement: "TAVILY_API_KEYS",
    whenToUse: "Use for Tavily-backed search.",
    whenNotToUse: "Do not use without Tavily API keys.",
    outputShape: "Tavily search results.",
    limits: { timeoutMs: 10_000 },
    handler: stubHandler
  },
  {
    name: "context7_resolve_library_id",
    aliases: ["context7.resolve-library-id"],
    description: "Resolve a Context7 library identifier.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string" }
      },
      additionalProperties: false
    },
    category: "external",
    envRequirement: "CONTEXT7_API_KEYS",
    whenToUse: "Use for resolving Context7 libraries.",
    whenNotToUse: "Do not use without Context7 API keys.",
    outputShape: "Context7 library identifier.",
    limits: { timeoutMs: 10_000 },
    handler: stubHandler
  }
];

describe("tool manifest task 1 infrastructure", () => {
  it("exposes only manifest-derived canonical names in tools/list", () => {
    const names = getEnabledTools({ TAVILY_API_KEYS: "tvly-a", CONTEXT7_API_KEYS: "ctx-a" }).map((tool) => tool.name);

    expect(names).toContain("weather");
    expect(names).toContain("tavily_search");
    expect(names).toContain("context7_resolve_library_id");
    expect(names).not.toContain("tavily.search");
    expect(names).not.toContain("context7.resolve-library-id");
    expect(names.every((name) => !name.includes("-"))).toBe(true);
  });

  it("projects manifest entries into tool definitions", () => {
    expect(buildToolDefinitions(manifest)).toEqual([
      {
        name: "weather",
        description: "Get current weather for a location.",
        inputSchema: {
          type: "object",
          properties: {
            query: { type: "string" }
          },
          additionalProperties: false
        },
        requiresEnv: undefined
      },
      {
        name: "tavily_search",
        description: "Search the web with Tavily.",
        inputSchema: {
          type: "object",
          properties: {
            query: { type: "string" }
          },
          required: ["query"],
          additionalProperties: false
        },
        requiresEnv: "TAVILY_API_KEYS"
      },
      {
        name: "context7_resolve_library_id",
        description: "Resolve a Context7 library identifier.",
        inputSchema: {
          type: "object",
          properties: {
            query: { type: "string" }
          },
          additionalProperties: false
        },
        requiresEnv: "CONTEXT7_API_KEYS"
      }
    ]);
  });

  it("builds alias and handler maps from manifest entries", async () => {
    const aliasMap = buildAliasMap(manifest);
    const handlerMap = buildHandlerMap(manifest);
    const handler = handlerMap.get("tavily_search");

    expect(aliasMap.get("forecast.current")).toBe("weather");
    expect(aliasMap.get("tavily.search")).toBe("tavily_search");
    expect(handler).toBeTypeOf("function");

    await expect(
      handler?.({}, { env: {}, request: new Request("https://example.com/mcp", { method: "POST" }) })
    ).resolves.toEqual({ ok: true, data: { ok: true } });
  });

  it("keeps existing registry alias resolution independent from manifest projections", () => {
    expect(findEnabledTool("tavily.search", { TAVILY_API_KEYS: "tvly" })?.name).toBe("tavily_search");
    expect(findEnabledTool("context7.resolve-library-id", { CONTEXT7_API_KEYS: "ctx" })?.name).toBe(
      "context7_resolve_library_id"
    );
    expect(findEnabledTool("context7_resolve_library_id", { CONTEXT7_API_KEYS: "ctx" })?.name).toBe(
      "context7_resolve_library_id"
    );
    expect(findEnabledTool("weather", {})?.name).toBe("weather");
  });

  it("does not call projected handlers while resolving registry aliases", () => {
    const aliasMap = buildAliasMap(manifest);
    const handlerMap = buildHandlerMap([
      {
        ...manifest[1]!,
        handler: vi.fn(stubHandler)
      }
    ]);

    expect(aliasMap.get("tavily.search")).toBe("tavily_search");
    expect(handlerMap.get("tavily_search")).toBeDefined();
    expect(handlerMap.get("tavily_search")).not.toHaveBeenCalled();
  });

  it("enables paper tools with canonical underscore names while gating only open access by env", () => {
    const namesWithoutUnpaywall = getEnabledTools({}).map((tool) => tool.name);
    const namesWithUnpaywall = getEnabledTools({ PAPER_SEARCH_MCP_UNPAYWALL_EMAILS: "a@example.com" }).map((tool) => tool.name);

    expect(namesWithoutUnpaywall).toContain("paper_search");
    expect(namesWithoutUnpaywall).toContain("paper_get_details");
    expect(namesWithoutUnpaywall).toContain("paper_get_related");
    expect(namesWithoutUnpaywall).not.toContain("paper_get_open_access");
    expect(namesWithUnpaywall).toContain("paper_get_open_access");
    expect(namesWithUnpaywall).not.toContain("paper-search");
    expect(namesWithUnpaywall.every((name) => !name.includes("-"))).toBe(true);
  });

  it("resolves legacy paper aliases without exposing them in tools/list", () => {
    const names = getEnabledTools({ PAPER_SEARCH_MCP_UNPAYWALL_EMAILS: "a@example.com" }).map((tool) => tool.name);

    expect(names).not.toContain("paper-search");
    expect(findEnabledTool("paper-search", {})?.name).toBe("paper_search");
    expect(findEnabledTool("paper-get-details", {})?.name).toBe("paper_get_details");
    expect(findEnabledTool("paper-get-related", {})?.name).toBe("paper_get_related");
    expect(findEnabledTool("paper-get-open-access", {})?.name).toBeUndefined();
    expect(findEnabledTool("paper-get-open-access", { PAPER_SEARCH_MCP_UNPAYWALL_EMAILS: "a@example.com" })?.name).toBe("paper_get_open_access");
  });

  it("keeps paper manifest copy aligned with current behavior", () => {
    const paperEntries = getEnabledTools({ PAPER_SEARCH_MCP_UNPAYWALL_EMAILS: "a@example.com" }).filter((tool) =>
      ["paper_search", "paper_get_related", "paper_get_open_access"].includes(tool.name)
    );

    expect(paperEntries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "paper_search",
          description: "Search scholarly papers across Crossref and OpenAlex"
        }),
        expect.objectContaining({
          name: "paper_get_related",
          description: "Get papers related to an OpenAlex work id or DOI"
        }),
        expect.objectContaining({
          name: "paper_get_open_access",
          description: "Get open access availability and links for a paper DOI"
        })
      ])
    );
  });

  it("documents paper_search in the README tool surface", () => {
    expect(readme).toContain("paper_search");
  });

  it("documents weather in the README tool surface", () => {
    expect(readme).toContain("weather");
  });

  it("keeps iplookup enabled without provider env", () => {
    const names = getEnabledTools({}).map((tool) => tool.name);

    expect(names).toContain("iplookup");
  });

  it("does not document deprecated dotted Tavily names in the README", () => {
    expect(readme).not.toContain("tavily.search");
  });

  it("keeps generated README tool snippets aligned with canonical paper tool names", () => {
    expect(readme).toContain("paper_search");
    expect(readme).toContain("paper_get_details");
    expect(readme).toContain("paper_get_related");
    expect(readmeZhCn).toContain("paper_search");
    expect(readmeZhCn).toContain("paper_get_details");
    expect(readmeZhCn).toContain("paper_get_related");
    expect(readme).not.toContain("paper-search");
    expect(readmeZhCn).not.toContain("paper-search");
  });

  it("keeps generated README auth and product documentation copy present", () => {
    expect(readme).toContain("[中文](./README.zh-CN.md)");
    expect(readmeZhCn).toContain("[English](./README.md)");

    for (const content of [readme, readmeZhCn]) {
      expect(content).toContain("Claude");
      expect(content).toContain("Cursor");
      expect(content).toContain("Cline");
      expect(content).toContain("Cherry Studio");
      expect(content).toContain("Codex");
      expect(content).toContain("https://mcp.awsl.app/mcp?key=elysia");
      expect(content).toContain("https://github.com/DoingDog/toolhive-mcp");
      expect(content).toContain("Bearer");
      expect(content).toContain("x-api-key / API key");
      expect(content).toContain("query `key`");
      expect(content).not.toContain("OAuth");
    }
  });

  it("does not expose any news tools from getEnabledTools", () => {
    const names = getEnabledTools({}).map((tool) => tool.name);

    expect(names).not.toContain("news_get_news");
    expect(names).not.toContain("news_get_news_detail");
    expect(names).not.toContain("news_get_topics");
    expect(names).not.toContain("news_get_regions");
  });

  it("documents news tools as intentionally disabled in this release", () => {
    expect(readme).toContain("News tools are intentionally disabled in this release.");
    expect(readme).not.toContain("External tools: `iplookup`, `exa_search`, `tavily_search`, `tavily_extract`, `tavily_crawl`, `news_get_news`, `news_get_news_detail`, `news_get_topics`, `news_get_regions`, `context7_resolve_library_id`, `context7_query_docs`, `puremd_extract`, `unsplash_search_photos`");
  });

  it("validates anyOf properties used by manifest schemas", () => {
    const schema: JsonSchema = {
      type: "object",
      properties: {
        urls: {
          anyOf: [
            { type: "string" },
            { type: "array", items: { type: "string" } }
          ]
        }
      },
      required: ["urls"],
      additionalProperties: false
    };

    expect(validateToolArguments(schema, { urls: "https://example.com" })).toBeUndefined();
    expect(validateToolArguments(schema, { urls: ["https://example.com"] })).toBeUndefined();
    expect(validateToolArguments(schema, { urls: 123 })).toBe("Invalid params");
    expect(validateToolArguments(schema, { urls: ["https://example.com", 123] })).toBe("Invalid params");
  });

  it("keeps paper manifest schemas as plain top-level objects without anyOf", () => {
    const tools = getToolDefinitions({ PAPER_SEARCH_MCP_UNPAYWALL_EMAILS: "a@example.com" });
    const detailsSchema = tools.find((tool) => tool.name === "paper_get_details")?.inputSchema as JsonSchema;
    const relatedSchema = tools.find((tool) => tool.name === "paper_get_related")?.inputSchema as JsonSchema;

    expect(detailsSchema).toMatchObject({
      type: "object",
      properties: {
        doi: { type: "string", minLength: 1 },
        arxiv_id: { type: "string", minLength: 1 }
      },
      additionalProperties: false
    });
    expect(detailsSchema).not.toHaveProperty("anyOf");

    expect(relatedSchema).toMatchObject({
      type: "object",
      properties: {
        paper_id: { type: "string", minLength: 1 },
        doi: { type: "string", minLength: 1 }
      },
      additionalProperties: false
    });
    expect(relatedSchema).not.toHaveProperty("anyOf");
  });
});
