import { afterEach, describe, expect, it, vi } from "vitest";
import { handleJsonRpc } from "../../src/mcp/router";
import { handleContext7QueryDocs, handleContext7Resolve } from "../../src/tools/external/context7";
import {
  handleDomainCheckDomain,
  handleDomainExploreName,
  handleDomainListCategories,
  handleDomainSearchDomains
} from "../../src/tools/external/domain";
import { handleIpLookup } from "../../src/tools/external/iplookup";
import {
  handleNewsGetNews,
  handleNewsGetNewsDetail,
  handleNewsGetRegions,
  handleNewsGetTopics
} from "../../src/tools/external/news";
import { handlePuremdExtract } from "../../src/tools/external/puremd";
import {
  handleTavilyCrawl,
  handleTavilyExtract,
  handleTavilyResearch,
  handleTavilySearch
} from "../../src/tools/external/tavily";
import { handleUnsplashSearch } from "../../src/tools/external/unsplash";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("IP lookup tool", () => {
  it("returns curated fields and raw data on success", async () => {
    const fetchMock = vi.fn(async () =>
      Response.json({
        status: "success",
        query: "1.1.1.1",
        country: "Australia",
        countryCode: "AU",
        region: "QLD",
        regionName: "Queensland",
        city: "South Brisbane",
        timezone: "Australia/Brisbane",
        lat: -27.4748,
        lon: 153.017,
        zip: "4101",
        isp: "APNIC and Cloudflare DNS Resolver project",
        org: "Cloudflare",
        as: "AS13335 Cloudflare, Inc.",
        asname: "CLOUDFLARENET",
        mobile: false,
        proxy: false,
        hosting: true
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await handleIpLookup({ query: "1.1.1.1" });

    expect(result).toEqual({
      ok: true,
      data: {
        query: "1.1.1.1",
        ip: "1.1.1.1",
        country: "Australia",
        country_code: "AU",
        region: "Queensland",
        region_code: "QLD",
        city: "South Brisbane",
        timezone: "Australia/Brisbane",
        lat: -27.4748,
        lon: 153.017,
        zip: "4101",
        isp: "APNIC and Cloudflare DNS Resolver project",
        org: "Cloudflare",
        as: "AS13335 Cloudflare, Inc.",
        asname: "CLOUDFLARENET",
        mobile: false,
        proxy: false,
        hosting: true,
        raw: {
          status: "success",
          query: "1.1.1.1",
          country: "Australia",
          countryCode: "AU",
          region: "QLD",
          regionName: "Queensland",
          city: "South Brisbane",
          timezone: "Australia/Brisbane",
          lat: -27.4748,
          lon: 153.017,
          zip: "4101",
          isp: "APNIC and Cloudflare DNS Resolver project",
          org: "Cloudflare",
          as: "AS13335 Cloudflare, Inc.",
          asname: "CLOUDFLARENET",
          mobile: false,
          proxy: false,
          hosting: true
        }
      }
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "http://ip-api.com/json/1.1.1.1?fields=55312383"
    );
  });

  it("returns validation_error when upstream reports a failed lookup", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          status: "fail",
          message: "invalid query",
          query: "bad ip"
        })
      )
    );

    const result = await handleIpLookup({ query: "bad ip" });

    expect(result).toEqual({
      ok: false,
      error: expect.objectContaining({
        type: "validation_error",
        message: "IP lookup failed: invalid query",
        details: {
          upstream: {
            status: "fail",
            message: "invalid query",
            query: "bad ip"
          }
        }
      })
    });
  });

  it("returns upstream_error with rate limit details on 429", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response("too many requests", {
          status: 429,
          headers: {
            "X-Rl": "0",
            "X-Ttl": "56"
          }
        })
      )
    );

    const result = await handleIpLookup({ query: "1.1.1.1" });

    expect(result).toEqual({
      ok: false,
      error: expect.objectContaining({
        type: "upstream_error",
        message: "IP-API rate limit exceeded (X-Rl=0, X-Ttl=56): too many requests",
        details: {
          status: 429,
          details: {
            rateLimitRemaining: "0",
            rateLimitResetSeconds: "56"
          }
        }
      })
    });
  });
});

describe("Tavily HTTP API tools", () => {
  it("posts search requests to Tavily HTTP API", async () => {
    const fetchMock = vi.fn(async () => Response.json({ query: "mcp", results: [] }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await handleTavilySearch(
      { query: "mcp", max_results: 3 },
      { TAVILY_API_KEYS: "tvly-test" }
    );

    expect(result.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.tavily.com/search",
      expect.objectContaining({ method: "POST" })
    );
  });

  it("retries Tavily after a network error and succeeds on the second attempt", async () => {
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(new Error("socket hang up"))
      .mockResolvedValueOnce(Response.json({ query: "mcp", results: [] }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await handleTavilySearch(
      { query: "mcp", max_results: 3 },
      { TAVILY_API_KEYS: "tvly-test" }
    );

    expect(result).toEqual({ ok: true, data: { query: "mcp", results: [] } });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("uses a random Tavily key for the first request when multiple keys are configured", async () => {
    const fetchMock = vi.fn(async () => Response.json({ query: "mcp", results: [] }));
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(Math, "random").mockReturnValue(0.75);

    const result = await handleTavilySearch(
      { query: "mcp", max_results: 3 },
      { TAVILY_API_KEYS: "tvly-first,tvly-second" }
    );

    expect(result).toEqual({ ok: true, data: { query: "mcp", results: [] } });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.tavily.com/search",
      expect.objectContaining({
        headers: expect.objectContaining({ authorization: "Bearer tvly-second" })
      })
    );
  });

  it("rotates Tavily keys after an unauthorized response and succeeds on retry", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response("unauthorized", { status: 401 }))
      .mockResolvedValueOnce(Response.json({ query: "mcp", results: [] }));
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(Math, "random").mockReturnValue(0);

    const result = await handleTavilySearch(
      { query: "mcp", max_results: 3 },
      { TAVILY_API_KEYS: "tvly-first,tvly-second" }
    );

    expect(result).toEqual({ ok: true, data: { query: "mcp", results: [] } });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "https://api.tavily.com/search",
      expect.objectContaining({
        headers: expect.objectContaining({ authorization: "Bearer tvly-first" })
      })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "https://api.tavily.com/search",
      expect.objectContaining({
        headers: expect.objectContaining({ authorization: "Bearer tvly-second" })
      })
    );
  });

  it("does not retry Tavily auth failures when only one key is configured", async () => {
    const fetchMock = vi.fn(async () => new Response("unauthorized", { status: 401 }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await handleTavilySearch(
      { query: "mcp", max_results: 3 },
      { TAVILY_API_KEYS: "tvly-only" }
    );

    expect(result).toEqual({
      ok: false,
      error: expect.objectContaining({
        type: "upstream_error",
        message: "Tavily API returned 401: unauthorized"
      })
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does not retry Tavily auth failures when duplicate keys resolve to the same key", async () => {
    const fetchMock = vi.fn(async () => new Response("unauthorized", { status: 401 }));
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(Math, "random").mockReturnValue(0);

    const result = await handleTavilySearch(
      { query: "mcp", max_results: 3 },
      { TAVILY_API_KEYS: "tvly-same,tvly-same" }
    );

    expect(result).toEqual({
      ok: false,
      error: expect.objectContaining({
        type: "upstream_error",
        message: "Tavily API returned 401: unauthorized"
      })
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does not retry Tavily on a 400 response", async () => {
    const fetchMock = vi.fn(async () => new Response("bad request", { status: 400 }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await handleTavilySearch(
      { query: "mcp", max_results: 3 },
      { TAVILY_API_KEYS: "tvly-test" }
    );

    expect(result).toEqual({
      ok: false,
      error: expect.objectContaining({
        type: "upstream_error",
        message: "Tavily API returned 400: bad request"
      })
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does not retry Tavily when a 500 response body looks like an auth error", async () => {
    const fetchMock = vi.fn(async () => new Response("invalid api key", { status: 500 }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await handleTavilySearch(
      { query: "mcp", max_results: 3 },
      { TAVILY_API_KEYS: "tvly-first,tvly-second" }
    );

    expect(result).toEqual({
      ok: false,
      error: expect.objectContaining({
        type: "upstream_error",
        message: "Tavily API returned 500: invalid api key"
      })
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("returns upstream_error when Tavily returns invalid JSON", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("not-json", { status: 200 })));

    const result = await handleTavilySearch(
      { query: "mcp", max_results: 3 },
      { TAVILY_API_KEYS: "tvly-test" }
    );

    expect(result).toEqual({
      ok: false,
      error: expect.objectContaining({
        type: "upstream_error",
        message: "Tavily API returned invalid JSON"
      })
    });
  });

  it("posts extract requests to Tavily HTTP API", async () => {
    const fetchMock = vi.fn(async () => Response.json({ results: [], failed_results: [] }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await handleTavilyExtract(
      { urls: "https://example.com" },
      { TAVILY_API_KEYS: "tvly-test" }
    );

    expect(result.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.tavily.com/extract",
      expect.objectContaining({ method: "POST" })
    );
  });

  it("posts crawl requests to Tavily HTTP API", async () => {
    const fetchMock = vi.fn(async () => Response.json({ base_url: "https://example.com", results: [] }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await handleTavilyCrawl(
      { url: "https://example.com", max_depth: 2 },
      { TAVILY_API_KEYS: "tvly-test" }
    );

    expect(result.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.tavily.com/crawl",
      expect.objectContaining({ method: "POST" })
    );
  });

  it("posts research requests to Tavily HTTP API", async () => {
    const fetchMock = vi.fn(async () => Response.json({ answer: "done" }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await handleTavilyResearch(
      { input: "Summarize MCP tool ecosystem", model: "mini" },
      { TAVILY_API_KEYS: "tvly-test" }
    );

    expect(result.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.tavily.com/research",
      expect.objectContaining({ method: "POST" })
    );
  });

  it("returns validation_error when Tavily crawl url is missing", async () => {
    const result = await handleTavilyCrawl({}, { TAVILY_API_KEYS: "tvly-test" });

    expect(result).toEqual({
      ok: false,
      error: expect.objectContaining({
        type: "validation_error",
        message: "url must be a string"
      })
    });
  });

  it("returns validation_error when Tavily research input is missing", async () => {
    const result = await handleTavilyResearch({}, { TAVILY_API_KEYS: "tvly-test" });

    expect(result).toEqual({
      ok: false,
      error: expect.objectContaining({
        type: "validation_error",
        message: "input must be a string"
      })
    });
  });

  it("routes canonical Tavily names through JSON-RPC", async () => {
    const fetchMock = vi.fn(async () => Response.json({ query: "mcp", results: [] }));
    vi.stubGlobal("fetch", fetchMock);

    const response = await handleJsonRpc(
      {
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: {
          name: "tavily_search",
          arguments: {
            query: "mcp",
            max_results: 3
          }
        }
      },
      { TAVILY_API_KEYS: "tvly-test" },
      new Request("https://example.com/mcp", { method: "POST" })
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.tavily.com/search",
      expect.objectContaining({ method: "POST" })
    );
    expect(body).toMatchObject({
      result: {
        content: [
          {
            type: "text",
            text: expect.stringContaining("results")
          }
        ]
      }
    });
  });

  it("keeps legacy dotted Tavily names working through JSON-RPC", async () => {
    const fetchMock = vi.fn(async () => Response.json({ query: "mcp", results: [] }));
    vi.stubGlobal("fetch", fetchMock);

    const response = await handleJsonRpc(
      {
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: {
          name: "tavily.search",
          arguments: {
            query: "mcp",
            max_results: 3
          }
        }
      },
      { TAVILY_API_KEYS: "tvly-test" },
      new Request("https://example.com/mcp", { method: "POST" })
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.tavily.com/search",
      expect.objectContaining({ method: "POST" })
    );
    expect(body).toMatchObject({
      result: {
        content: [
          {
            type: "text",
            text: expect.stringContaining("results")
          }
        ]
      }
    });
  });
});

describe("Domain tools", () => {
  it("calls the lookup endpoint and forwards optional query params", async () => {
    const fetchMock = vi.fn(async () => Response.json({ available: true }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await handleDomainCheckDomain({
      domain: "example.com",
      context: "brand",
      max_price: 15
    });

    expect(result).toEqual({ ok: true, data: { available: true } });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://agentdomainservice.com/api/v1/lookup/example.com?context=brand&max_price=15"
    );
  });

  it("calls the explore endpoint", async () => {
    const fetchMock = vi.fn(async () => Response.json({ suggestions: [] }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await handleDomainExploreName({ name: "acme" });

    expect(result).toEqual({ ok: true, data: { suggestions: [] } });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://agentdomainservice.com/api/v1/explore/acme"
    );
  });

  it("calls the search endpoint and forwards query params", async () => {
    const fetchMock = vi.fn(async () => Response.json({ domains: [] }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await handleDomainSearchDomains({ category: "ai-agents", max_price: 15 });

    expect(result).toEqual({ ok: true, data: { domains: [] } });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://agentdomainservice.com/api/v1/domains/search?category=ai-agents&max_price=15"
    );
  });

  it("calls the categories endpoint", async () => {
    const fetchMock = vi.fn(async () => Response.json({ categories: ["ai-agents"] }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await handleDomainListCategories({});

    expect(result).toEqual({ ok: true, data: { categories: ["ai-agents"] } });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://agentdomainservice.com/api/v1/domains/categories"
    );
  });

  it("returns validation_error when domain is missing", async () => {
    const result = await handleDomainCheckDomain({});

    expect(result).toEqual({
      ok: false,
      error: expect.objectContaining({
        type: "validation_error",
        message: "domain must be a non-empty string"
      })
    });
  });

  it("returns validation_error when name is missing", async () => {
    const result = await handleDomainExploreName({});

    expect(result).toEqual({
      ok: false,
      error: expect.objectContaining({
        type: "validation_error",
        message: "name must be a non-empty string"
      })
    });
  });

  it("uses DOMAIN_API_BASE_URL override", async () => {
    const fetchMock = vi.fn(async () => Response.json({ available: true }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await handleDomainCheckDomain(
      { domain: "example.com" },
      { DOMAIN_API_BASE_URL: "https://mirror.example/root/" }
    );

    expect(result).toEqual({ ok: true, data: { available: true } });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://mirror.example/root/api/v1/lookup/example.com"
    );
  });
});

describe("News tools", () => {
  it("gets news from the default newsmcp endpoint and forwards query params", async () => {
    const fetchMock = vi.fn(async () => Response.json({ events: [] }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await handleNewsGetNews({
      topics: "ai",
      geo: "us",
      hours: 24,
      page: 2,
      per_page: 10,
      order_by: "time"
    });

    expect(result).toEqual({ ok: true, data: { events: [] } });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://newsmcp.io/v1/news/?topics=ai&geo=us&hours=24&page=2&per_page=10&order_by=time",
    );
  });

  it("uses NEWS_API_BASE_URL override for the news list endpoint", async () => {
    const fetchMock = vi.fn(async () => Response.json({ events: [] }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await handleNewsGetNews(
      { topics: "ai" },
      { NEWS_API_BASE_URL: "https://mirror.example/api" }
    );

    expect(result).toEqual({ ok: true, data: { events: [] } });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://mirror.example/api/news/?topics=ai",
    );
  });

  it("gets news detail by event_id", async () => {
    const fetchMock = vi.fn(async () => Response.json({ event_id: "evt_123" }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await handleNewsGetNewsDetail({ event_id: "evt_123" });

    expect(result).toEqual({ ok: true, data: { event_id: "evt_123" } });
    expect(fetchMock).toHaveBeenCalledWith("https://newsmcp.io/v1/news/evt_123/");
  });

  it("gets available news topics", async () => {
    const fetchMock = vi.fn(async () => Response.json({ topics: ["ai"] }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await handleNewsGetTopics({});

    expect(result).toEqual({ ok: true, data: { topics: ["ai"] } });
    expect(fetchMock).toHaveBeenCalledWith("https://newsmcp.io/v1/news/topics/");
  });

  it("gets available news regions", async () => {
    const fetchMock = vi.fn(async () => Response.json({ regions: ["us"] }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await handleNewsGetRegions({});

    expect(result).toEqual({ ok: true, data: { regions: ["us"] } });
    expect(fetchMock).toHaveBeenCalledWith("https://newsmcp.io/v1/news/regions/");
  });

  it("returns validation_error when event_id is missing", async () => {
    const result = await handleNewsGetNewsDetail({});

    expect(result).toEqual({
      ok: false,
      error: expect.objectContaining({
        type: "validation_error",
        message: "event_id must be a non-empty string"
      })
    });
  });

  it("returns upstream_error when News API returns invalid JSON", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("not-json", { status: 200 })));

    const result = await handleNewsGetTopics({});

    expect(result).toEqual({
      ok: false,
      error: expect.objectContaining({
        type: "upstream_error",
        message: "News API returned invalid JSON"
      })
    });
  });
});

describe("Unsplash tool", () => {
  it("maps Unsplash response to compact photo fields", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          results: [
            {
              id: "1",
              width: 10,
              height: 20,
              description: "d",
              alt_description: "a",
              color: "#fff",
              user: { name: "Author", links: { html: "https://u" } },
              urls: { small: "s", regular: "r", full: "f" },
              links: { html: "https://p" }
            }
          ]
        })
      )
    );

    const result = await handleUnsplashSearch(
      { query: "cat" },
      { UNSPLASH_ACCESS_KEYS: "un-test" }
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect((result.data as any).results[0]).toEqual(
        expect.objectContaining({
          id: "1",
          width: 10,
          height: 20,
          description: "d",
          alt_description: "a",
          author_name: "Author",
          author_profile: "https://u",
          image_small: "s",
          image_regular: "r",
          image_full: "f",
          html_url: "https://p",
          color: "#fff"
        })
      );
    }
  });

  it("retries Unsplash after an unauthorized response and rotates to the next key", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response("invalid api key", { status: 403 }))
      .mockResolvedValueOnce(
        Response.json({
          results: [
            {
              id: "1",
              width: 10,
              height: 20,
              description: "d",
              alt_description: "a",
              color: "#fff",
              user: { name: "Author", links: { html: "https://u" } },
              urls: { small: "s", regular: "r", full: "f" },
              links: { html: "https://p" }
            }
          ]
        })
      );
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(Math, "random").mockReturnValue(0);

    const result = await handleUnsplashSearch(
      { query: "cat" },
      { UNSPLASH_ACCESS_KEYS: "un-first,un-second" }
    );

    expect(result.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining("https://api.unsplash.com/search/photos"),
      expect.objectContaining({
        headers: expect.objectContaining({ authorization: "Client-ID un-first" })
      })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining("https://api.unsplash.com/search/photos"),
      expect.objectContaining({
        headers: expect.objectContaining({ authorization: "Client-ID un-second" })
      })
    );
  });

  it("returns upstream_error when Unsplash returns an unexpected response shape", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ error: "temporary" })));

    const result = await handleUnsplashSearch(
      { query: "cat" },
      { UNSPLASH_ACCESS_KEYS: "un-test" }
    );

    expect(result).toEqual({
      ok: false,
      error: expect.objectContaining({
        type: "upstream_error",
        message: "Unsplash API returned unexpected response shape"
      })
    });
  });
});

describe("Context7 tool", () => {
  it("unwraps the upstream JSON-RPC result payload", async () => {
    const fetchMock = vi.fn(async () => Response.json({ jsonrpc: "2.0", id: 1, result: { content: [{ type: "text", text: "ok" }] } }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await handleContext7Resolve(
      { query: "react" },
      { CONTEXT7_API_KEYS: "ctx-test" }
    );

    expect(result).toEqual({
      ok: true,
      data: { content: [{ type: "text", text: "ok" }] }
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://mcp.context7.com/mcp",
      expect.objectContaining({ method: "POST" })
    );
  });

  it("maps resolve query to Context7 libraryName", async () => {
    const fetchMock = vi.fn(async () => Response.json({ jsonrpc: "2.0", id: 1, result: { content: [] } }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await handleContext7Resolve(
      { query: "react" },
      { CONTEXT7_API_KEYS: "ctx-test" }
    );

    expect(result.ok).toBe(true);
    const calls = fetchMock.mock.calls as unknown as [string, RequestInit][];
    const [, init] = calls[0]!;
    const body = JSON.parse(String(init.body));
    expect(body.params.arguments).toEqual({ query: "react", libraryName: "react" });
  });

  it("returns upstream_error when Context7 responds with a JSON-RPC error body", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          jsonrpc: "2.0",
          id: 1,
          error: { code: -32603, message: "upstream failed" }
        })
      )
    );

    const result = await handleContext7Resolve(
      { query: "react" },
      { CONTEXT7_API_KEYS: "ctx-test" }
    );

    expect(result).toEqual({
      ok: false,
      error: expect.objectContaining({
        type: "upstream_error",
        message: expect.stringContaining("Context7")
      })
    });
    if (!result.ok) {
      expect(result.error.message).toContain("upstream failed");
    }
  });

  it("validates query-docs arguments", async () => {
    const fetchMock = vi.fn(async () => Response.json({ jsonrpc: "2.0", id: 1, result: { content: [] } }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await handleContext7QueryDocs(
      { libraryId: "lib", query: "hooks" },
      { CONTEXT7_API_KEYS: "ctx-test" }
    );

    expect(result.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://mcp.context7.com/mcp",
      expect.objectContaining({ method: "POST" })
    );
  });
});

describe("Pure.md tool", () => {
  it("extracts content from a URL via pure.md", async () => {
    const fetchMock = vi.fn(async () => new Response("# hello", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await handlePuremdExtract(
      { url: "https://example.com/page", format: "markdown" },
      { PUREMD_API_KEYS: "pm-test" }
    );

    expect(result.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://pure.md/example.com/page",
      expect.objectContaining({ headers: expect.any(Object) })
    );
  });

  it("uses POST when prompt or schema is provided and forwards requestheaders", async () => {
    const fetchMock = vi.fn(async () => new Response("{\"ok\":true}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await handlePuremdExtract(
      {
        url: "https://example.com/page",
        format: "markdown",
        requestheaders: { "x-test": "1" },
        prompt: "extract main content",
        schema: "{\"type\":\"object\"}"
      },
      { PUREMD_API_KEYS: "pm-test" }
    );

    expect(result.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://pure.md/example.com/page",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          authorization: "Bearer pm-test",
          "x-api-key": "pm-test",
          "x-test": "1"
        })
      })
    );
  });

  it("does not retry Pure.md when local request header construction fails", async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      new Request(input, init);
      return new Response("# hello", { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await handlePuremdExtract(
      {
        url: "https://example.com/page",
        requestheaders: { "bad header": "1" }
      },
      { PUREMD_API_KEYS: "pm-test,pm-second" }
    );

    expect(result.ok).toBe(false);
    expect(fetchMock.mock.calls.length).toBeLessThanOrEqual(1);
  });
});
