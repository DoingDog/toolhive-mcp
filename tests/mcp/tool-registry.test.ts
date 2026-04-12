import { describe, expect, it } from "vitest";
import { handleJsonRpc } from "../../src/mcp/router";
import { getEnabledTools } from "../../src/mcp/tool-registry";
import { parseKeyList, pickRandomKey } from "../../src/lib/keys";

const originalRequest = new Request("https://example.com/mcp", { method: "POST" });

describe("tool registry", () => {
  it('parseKeyList(" a, b ,, c ") returns trimmed non-empty keys', () => {
    expect(parseKeyList(" a, b ,, c ")).toEqual(["a", "b", "c"]);
  });

  it('pickRandomKey(["only"]) returns the single key', () => {
    expect(pickRandomKey(["only"])).toBe("only");
  });

  it("includes native, devutils, news, and domain tools by default", () => {
    const names = getEnabledTools({}).map((tool) => tool.name);

    expect(names).toContain("weather");
    expect(names).toContain("webfetch");
    expect(names).toContain("devutils.base64_encode");
    expect(names).toContain("news.get_news");
    expect(names).toContain("news.get_news_detail");
    expect(names).toContain("news.get_topics");
    expect(names).toContain("news.get_regions");
    expect(names).toContain("domain.check_domain");
    expect(names).toContain("domain.explore_name");
    expect(names).toContain("domain.search_domains");
    expect(names).not.toContain("domain.list_categories");
  });

  it("keeps native tool schemas aligned with the plan", () => {
    const tools = getEnabledTools({});
    const weather = tools.find((tool) => tool.name === "weather");
    const webfetch = tools.find((tool) => tool.name === "webfetch");
    const time = tools.find((tool) => tool.name === "time");
    const calc = tools.find((tool) => tool.name === "calc");
    const devutils = tools.find((tool) => tool.name === "devutils.base64_encode");

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

    expect(devutils?.inputSchema).toEqual({
      type: "object",
      properties: {},
      additionalProperties: true
    });
  });

  it("hides key-gated tools when env keys are absent", () => {
    const names = getEnabledTools({}).map((tool) => tool.name);

    expect(names).not.toContain("tavily.search");
    expect(names).not.toContain("context7.query-docs");
  });

  it("includes external tools when matching env keys are present", () => {
    const tools = getEnabledTools({
      TAVILY_API_KEYS: "t1,t2",
      CONTEXT7_API_KEYS: "c1,c2",
      UNSPLASH_ACCESS_KEYS: "u1",
      PUREMD_API_KEYS: "p1"
    });
    const names = tools.map((tool) => tool.name);
    const context7Resolve = tools.find((tool) => tool.name === "context7.resolve-library-id");
    const context7Query = tools.find((tool) => tool.name === "context7.query-docs");
    const tavilySearch = tools.find((tool) => tool.name === "tavily.search");
    const tavilyExtract = tools.find((tool) => tool.name === "tavily.extract");
    const tavilyCrawl = tools.find((tool) => tool.name === "tavily.crawl");
    const tavilyResearch = tools.find((tool) => tool.name === "tavily.research");
    const unsplash = tools.find((tool) => tool.name === "unsplash.search_photos");
    const puremd = tools.find((tool) => tool.name === "puremd.extract");
    const newsGetNews = tools.find((tool) => tool.name === "news.get_news");
    const newsGetNewsDetail = tools.find((tool) => tool.name === "news.get_news_detail");
    const newsGetTopics = tools.find((tool) => tool.name === "news.get_topics");
    const newsGetRegions = tools.find((tool) => tool.name === "news.get_regions");

    expect(names).toContain("tavily.search");
    expect(names).toContain("tavily.extract");
    expect(names).toContain("tavily.crawl");
    expect(names).toContain("tavily.research");
    expect(names).toContain("context7.resolve-library-id");
    expect(names).toContain("unsplash.search_photos");
    expect(names).toContain("puremd.extract");
    expect(names).toContain("news.get_news");
    expect(names).toContain("news.get_news_detail");
    expect(names).toContain("news.get_topics");
    expect(names).toContain("news.get_regions");

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
    expect(tavilyResearch?.inputSchema.properties).toHaveProperty("input");
    expect(tavilyResearch?.inputSchema.properties).toHaveProperty("output_schema");

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

  it("filters enabled tools by exact name and namespace prefix", () => {
    const names = getEnabledTools(
      { TAVILY_API_KEYS: "t1" },
      {
        disabledTools: ["tavily.*", "calc"]
      }
    ).map((tool) => tool.name);

    expect(names).not.toContain("calc");
    expect(names).not.toContain("tavily.search");
    expect(names).not.toContain("tavily.extract");
    expect(names).not.toContain("tavily.crawl");
    expect(names).not.toContain("tavily.research");
    expect(names).toContain("weather");
  });

  it("routes tools/list with env-gated tools and default domain tools", async () => {
    const request = { jsonrpc: "2.0" as const, id: 1, method: "tools/list" };

    const withoutEnv = await handleJsonRpc(request, {}, originalRequest);
    const withoutEnvBody = (await withoutEnv.json()) as { result: { tools: { name: string }[] } };
    const withoutEnvNames = withoutEnvBody.result.tools.map((tool) => tool.name);

    const withEnv = await handleJsonRpc(request, { TAVILY_API_KEYS: "tvly-a" }, originalRequest);
    const withEnvBody = (await withEnv.json()) as { result: { tools: { name: string }[] } };
    const withEnvNames = withEnvBody.result.tools.map((tool) => tool.name);

    expect(withoutEnvNames).not.toContain("tavily.search");
    expect(withoutEnvNames).not.toContain("tavily.crawl");
    expect(withoutEnvNames).not.toContain("tavily.research");
    expect(withoutEnvNames).toContain("news.get_news");
    expect(withoutEnvNames).toContain("news.get_news_detail");
    expect(withoutEnvNames).toContain("news.get_topics");
    expect(withoutEnvNames).toContain("news.get_regions");
    expect(withoutEnvNames).toContain("domain.check_domain");
    expect(withoutEnvNames).toContain("domain.explore_name");
    expect(withoutEnvNames).toContain("domain.search_domains");
    expect(withoutEnvNames).not.toContain("domain.list_categories");
    expect(withEnvNames).toContain("tavily.search");
    expect(withEnvNames).toContain("tavily.crawl");
    expect(withEnvNames).toContain("tavily.research");
    expect(withEnvNames).toContain("news.get_news");
    expect(withEnvNames).toContain("news.get_news_detail");
    expect(withEnvNames).toContain("news.get_topics");
    expect(withEnvNames).toContain("news.get_regions");
    expect(withEnvNames).toContain("domain.check_domain");
  });

  it("exposes only currently enabled domain tools", () => {
    const names = getEnabledTools({
      TAVILY_API_KEYS: "t1",
      CONTEXT7_API_KEYS: "c1",
      UNSPLASH_ACCESS_KEYS: "u1",
      PUREMD_API_KEYS: "p1"
    }).map((tool) => tool.name);

    expect(names).toContain("domain.check_domain");
    expect(names).toContain("domain.explore_name");
    expect(names).toContain("domain.search_domains");
    expect(names).not.toContain("domain.list_categories");
  });
});
