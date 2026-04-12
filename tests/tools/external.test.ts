import { afterEach, describe, expect, it, vi } from "vitest";
import { handleContext7QueryDocs, handleContext7Resolve } from "../../src/tools/external/context7";
import { handlePuremdExtract } from "../../src/tools/external/puremd";
import { handleTavilyExtract, handleTavilySearch } from "../../src/tools/external/tavily";
import { handleUnsplashSearch } from "../../src/tools/external/unsplash";

afterEach(() => {
  vi.restoreAllMocks();
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
  it("posts MCP tool call requests to Context7", async () => {
    const fetchMock = vi.fn(async () => Response.json({ jsonrpc: "2.0", id: 1, result: { content: [] } }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await handleContext7Resolve(
      { query: "react" },
      { CONTEXT7_API_KEYS: "ctx-test" }
    );

    expect(result.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://mcp.context7.com/mcp",
      expect.objectContaining({ method: "POST" })
    );
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
});
