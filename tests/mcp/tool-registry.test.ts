import { describe, expect, it } from "vitest";
import { handleJsonRpc } from "../../src/mcp/router";
import { findEnabledTool, getEnabledTools } from "../../src/mcp/tool-registry";
import { parseKeyList, pickRandomKey } from "../../src/lib/keys";

const originalRequest = new Request("https://example.com/mcp", { method: "POST" });

describe("tool registry", () => {
  it('parseKeyList(" a, b ,, c ") returns trimmed non-empty keys', () => {
    expect(parseKeyList(" a, b ,, c ")).toEqual(["a", "b", "c"]);
  });

  it('pickRandomKey(["only"]) returns the single key', () => {
    expect(pickRandomKey(["only"])).toBe("only");
  });

  it("includes native, devutils, and news tools by default while hiding all domain tools", () => {
    const names = getEnabledTools({}).map((tool) => tool.name);

    expect(names).toContain("weather");
    expect(names).toContain("webfetch");
    expect(names).toContain("whoami");
    expect(names).toContain("iplookup");
    expect(names).not.toContain("ip");
    expect(names).toContain("devutils_base64_encode");
    expect(names).toContain("news_get_news");
    expect(names).toContain("news_get_news_detail");
    expect(names).toContain("news_get_topics");
    expect(names).toContain("news_get_regions");
    expect(names).not.toContain("domain_check_domain");
    expect(names).not.toContain("domain_explore_name");
    expect(names).not.toContain("domain_search_domains");
    expect(names).not.toContain("domain.list_categories");
    expect(names.some((name) => name.includes("."))).toBe(false);
  });

  it("keeps native and devutils schemas aligned with the handlers", () => {
    const tools = getEnabledTools({});
    const weather = tools.find((tool) => tool.name === "weather");
    const webfetch = tools.find((tool) => tool.name === "webfetch");
    const time = tools.find((tool) => tool.name === "time");
    const calc = tools.find((tool) => tool.name === "calc");
    const base64Encode = tools.find((tool) => tool.name === "devutils_base64_encode");
    const hash = tools.find((tool) => tool.name === "devutils_hash");
    const uuid = tools.find((tool) => tool.name === "devutils_uuid");
    const regex = tools.find((tool) => tool.name === "devutils_regex_test");
    const timestamp = tools.find((tool) => tool.name === "devutils_timestamp_convert");

    expect(weather?.description).toContain("city");
    expect(weather?.description).toContain("airport code");
    expect(weather?.description).toContain("coordinates");
    expect(weather?.description).toContain("structured location string");
    expect(weather?.description).toContain("ambiguous natural language");
    expect(weather?.inputSchema.properties).toMatchObject({
      query: { type: "string" },
      location: { type: "string" },
      format: { enum: ["json", "text"], default: "json" },
      lang: { type: "string" },
      units: { enum: ["metric", "us", "uk"] }
    });
    expect(weather?.inputSchema.properties?.query).toMatchObject({
      description: expect.stringContaining("city")
    });
    expect(weather?.inputSchema.required).toBeUndefined();

    expect(webfetch?.inputSchema.properties).toMatchObject({
      method: { enum: ["GET", "POST"], default: "GET" },
      return_responseheaders: { type: "boolean", default: false }
    });
    expect(webfetch?.inputSchema.properties?.requestheaders).toMatchObject({
      type: "object",
      additionalProperties: { type: "string" }
    });

    expect(time?.inputSchema.properties).toMatchObject({
      timezone: { default: "UTC" }
    });

    expect(calc?.description).toContain("single math expression string");
    expect(calc?.description).toContain("2*(3+4)");
    expect(calc?.description).toContain("not a natural language question");
    expect(calc?.inputSchema.properties).toMatchObject({
      expression: { type: "string" },
      expr: { type: "string" },
      input: { type: "string" }
    });
    expect(calc?.inputSchema.properties?.expression).toMatchObject({
      description: expect.stringMatching(/single math expression string/i)
    });
    expect(calc?.inputSchema.required).toBeUndefined();

    expect(base64Encode?.inputSchema).toEqual({
      type: "object",
      properties: {
        text: { type: "string", description: "Text to encode as base64" }
      },
      additionalProperties: false
    });

    expect(hash?.inputSchema).toEqual({
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
    });

    expect(uuid?.inputSchema).toEqual({
      type: "object",
      properties: {},
      additionalProperties: false
    });

    expect(regex?.inputSchema).toEqual({
      type: "object",
      properties: {
        pattern: { type: "string", description: "Regular expression pattern" },
        text: { type: "string", description: "Text to test against the pattern" },
        flags: { type: "string", description: "Optional RegExp flags" }
      },
      additionalProperties: false
    });

    expect(timestamp?.inputSchema).toEqual({
      type: "object",
      properties: {
        value: {
          description: "Date string or Unix timestamp in seconds"
        }
      },
      additionalProperties: false
    });
  });

  it("hides key-gated tools when env keys are absent", () => {
    const names = getEnabledTools({}).map((tool) => tool.name);

    expect(names).not.toContain("tavily_search");
    expect(names).not.toContain("context7_query-docs");
  });

  it("includes external tools when matching env keys are present with canonical names", () => {
    const tools = getEnabledTools({
      TAVILY_API_KEYS: "t1,t2",
      CONTEXT7_API_KEYS: "c1,c2",
      UNSPLASH_ACCESS_KEYS: "u1",
      PUREMD_API_KEYS: "p1"
    });
    const names = tools.map((tool) => tool.name);
    const context7Resolve = tools.find((tool) => tool.name === "context7_resolve-library-id");
    const context7Query = tools.find((tool) => tool.name === "context7_query-docs");
    const tavilySearch = tools.find((tool) => tool.name === "tavily_search");
    const tavilyExtract = tools.find((tool) => tool.name === "tavily_extract");
    const tavilyCrawl = tools.find((tool) => tool.name === "tavily_crawl");
    const unsplash = tools.find((tool) => tool.name === "unsplash_search_photos");
    const puremd = tools.find((tool) => tool.name === "puremd_extract");
    const newsGetNews = tools.find((tool) => tool.name === "news_get_news");
    const newsGetNewsDetail = tools.find((tool) => tool.name === "news_get_news_detail");
    const newsGetTopics = tools.find((tool) => tool.name === "news_get_topics");
    const newsGetRegions = tools.find((tool) => tool.name === "news_get_regions");

    expect(names).toContain("tavily_search");
    expect(names).toContain("tavily_extract");
    expect(names).toContain("tavily_crawl");
    expect(names).not.toContain("tavily_research");
    expect(names).toContain("context7_resolve-library-id");
    expect(names).toContain("context7_query-docs");
    expect(names).toContain("unsplash_search_photos");
    expect(names).toContain("puremd_extract");
    expect(names).toContain("news_get_news");
    expect(names).toContain("news_get_news_detail");
    expect(names).toContain("news_get_topics");
    expect(names).toContain("news_get_regions");

    expect(context7Resolve?.inputSchema.properties).toMatchObject({
      query: { type: "string" }
    });
    expect(context7Resolve?.inputSchema.required).toEqual(["query"]);
    expect(context7Query?.inputSchema.required).toEqual(["libraryId", "query"]);

    expect(tavilySearch?.inputSchema.properties).toHaveProperty("search_depth");
    expect(tavilySearch?.inputSchema.properties).toHaveProperty("include_domains");
    expect(tavilyExtract?.inputSchema.properties).toHaveProperty("extract_depth");
    expect(tavilyExtract?.inputSchema.properties).toHaveProperty("include_favicon");
    expect(tavilyCrawl?.inputSchema.properties).toHaveProperty("url");
    expect(tavilyCrawl?.inputSchema.properties).toHaveProperty("exclude_domains");

    expect(unsplash?.inputSchema.properties).toHaveProperty("per_page");
    expect(unsplash?.inputSchema.properties).toHaveProperty("order_by");

    expect(puremd?.inputSchema.properties).toHaveProperty("requestheaders");
    expect(puremd?.inputSchema.properties).toHaveProperty("schema");

    expect(newsGetNews?.inputSchema.properties).toHaveProperty("topics");
    expect(newsGetNews?.inputSchema.properties).toHaveProperty("order_by");
    expect(newsGetNewsDetail?.inputSchema.required).toEqual(["event_id"]);
    expect(newsGetTopics?.inputSchema.properties).toEqual({});
    expect(newsGetRegions?.inputSchema.properties).toEqual({});
  });

  it("resolves legacy dotted tool names to canonical names", () => {
    const canonical = findEnabledTool("tavily_search", { TAVILY_API_KEYS: "t1" });
    const legacy = findEnabledTool("tavily.search", { TAVILY_API_KEYS: "t1" });

    expect(canonical?.name).toBe("tavily_search");
    expect(legacy?.name).toBe("tavily_search");
  });

  it("filters enabled tools by legacy exact name and namespace prefix", () => {
    const names = getEnabledTools(
      { TAVILY_API_KEYS: "t1" },
      {
        disabledTools: ["tavily.search", "calc"]
      }
    ).map((tool) => tool.name);

    expect(names).not.toContain("calc");
    expect(names).not.toContain("tavily_search");
    expect(names).toContain("tavily_extract");
    expect(names).toContain("weather");
  });

  it("filters enabled tools by legacy namespace prefix", () => {
    const names = getEnabledTools(
      { TAVILY_API_KEYS: "t1" },
      {
        disabledTools: ["tavily.*", "calc"]
      }
    ).map((tool) => tool.name);

    expect(names).not.toContain("calc");
    expect(names).not.toContain("tavily_search");
    expect(names).not.toContain("tavily_extract");
    expect(names).not.toContain("tavily_crawl");
    expect(names).toContain("weather");
  });

  it("routes tools/list with env-gated tools and no domain tools using canonical names", async () => {
    const request = { jsonrpc: "2.0" as const, id: 1, method: "tools/list" };

    const withoutEnv = await handleJsonRpc(request, {}, originalRequest);
    const withoutEnvBody = (await withoutEnv.json()) as { result: { tools: { name: string }[] } };
    const withoutEnvNames = withoutEnvBody.result.tools.map((tool) => tool.name);

    const withEnv = await handleJsonRpc(request, { TAVILY_API_KEYS: "tvly-a" }, originalRequest);
    const withEnvBody = (await withEnv.json()) as { result: { tools: { name: string }[] } };
    const withEnvNames = withEnvBody.result.tools.map((tool) => tool.name);

    expect(withoutEnvNames).not.toContain("tavily_search");
    expect(withoutEnvNames).not.toContain("tavily_crawl");
    expect(withoutEnvNames).not.toContain("tavily_research");
    expect(withoutEnvNames).toContain("news_get_news");
    expect(withoutEnvNames).toContain("news_get_news_detail");
    expect(withoutEnvNames).toContain("news_get_topics");
    expect(withoutEnvNames).toContain("news_get_regions");
    expect(withoutEnvNames).not.toContain("domain_check_domain");
    expect(withoutEnvNames).not.toContain("domain_explore_name");
    expect(withoutEnvNames).not.toContain("domain_search_domains");
    expect(withoutEnvNames).not.toContain("domain_list_categories");
    expect(withEnvNames).toContain("tavily_search");
    expect(withEnvNames).toContain("tavily_crawl");
    expect(withEnvNames).not.toContain("tavily_research");
    expect(withEnvNames).toContain("news_get_news");
    expect(withEnvNames).toContain("news_get_news_detail");
    expect(withEnvNames).toContain("news_get_topics");
    expect(withEnvNames).toContain("news_get_regions");
    expect(withEnvNames).not.toContain("domain_check_domain");
  });

  it("does not expose any domain tools even when external env keys are configured", () => {
    const names = getEnabledTools({
      TAVILY_API_KEYS: "t1",
      CONTEXT7_API_KEYS: "c1",
      UNSPLASH_ACCESS_KEYS: "u1",
      PUREMD_API_KEYS: "p1"
    }).map((tool) => tool.name);

    expect(names).not.toContain("domain_check_domain");
    expect(names).not.toContain("domain_explore_name");
    expect(names).not.toContain("domain_search_domains");
    expect(names).not.toContain("domain_list_categories");
  });
});
