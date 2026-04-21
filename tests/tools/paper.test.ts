import { afterEach, describe, expect, it, vi } from "vitest";
import { getToolHandler } from "../../src/mcp/tool-manifest";
import { classifyRelatedPaperId } from "../../src/tools/paper/search";
import { normalizeArxivEntry } from "../../src/tools/paper/providers/arxiv";
import { normalizeCrossrefWork } from "../../src/tools/paper/providers/crossref";
import { normalizeOpenAlexWork } from "../../src/tools/paper/providers/openalex";
import { normalizeEuropePmcResult } from "../../src/tools/paper/providers/pubmed";
import { lookupUnpaywallByDoi } from "../../src/tools/paper/providers/unpaywall";
import { mergePaperResults } from "../../src/tools/paper/normalize";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("arXiv paper provider", () => {
  it("normalizes arxiv id, title, abstract, and provider into the shared paper shape", () => {
    expect(
      normalizeArxivEntry({
        id: "http://arxiv.org/abs/2401.12345v1",
        title: " Paper ",
        summary: "Abstract"
      })
    ).toEqual({
      title: "Paper",
      authors: [],
      abstract: "Abstract",
      year: 2024,
      venue: null,
      doi: null,
      arxiv_id: "2401.12345",
      paper_id: "2401.12345",
      source_links: ["https://arxiv.org/abs/2401.12345"],
      download_links: ["https://arxiv.org/pdf/2401.12345.pdf"],
      open_access: true,
      citation_count: null,
      reference_count: null,
      provider: "arxiv"
    });
  });

  it("normalizes arXiv authors instead of returning an empty list", () => {
    expect(
      normalizeArxivEntry({
        id: "http://arxiv.org/abs/1706.03762v7",
        title: "Attention Is All You Need",
        summary: "Transformer abstract",
        authors: [
          "Ashish Vaswani",
          "Noam Shazeer",
          "Niki Parmar"
        ]
      })
    ).toMatchObject({
      arxiv_id: "1706.03762",
      title: "Attention Is All You Need",
      authors: ["Ashish Vaswani", "Noam Shazeer", "Niki Parmar"],
      provider: "arxiv"
    });
  });
});

describe("Europe PMC paper provider", () => {
  it("normalizes doi, year, and provider into the shared paper shape", () => {
    expect(
      normalizeEuropePmcResult({
        id: "123",
        doi: "10.1000/test",
        title: "Paper",
        pubYear: "2024"
      })
    ).toEqual({
      title: "Paper",
      authors: [],
      abstract: null,
      year: 2024,
      venue: null,
      doi: "10.1000/test",
      arxiv_id: null,
      paper_id: "10.1000/test",
      source_links: ["https://doi.org/10.1000/test"],
      download_links: [],
      open_access: null,
      citation_count: null,
      reference_count: null,
      provider: "pubmed"
    });
  });
});

describe("Crossref paper provider", () => {
  it("normalizes the shared paper shape and falls back across date fields", () => {
    expect(
      normalizeCrossrefWork({
        DOI: "10.1000/test",
        title: ["Paper"],
        issued: { "date-parts": [[2024]] }
      })
    ).toEqual({
      title: "Paper",
      authors: [],
      abstract: null,
      year: 2024,
      venue: null,
      doi: "10.1000/test",
      arxiv_id: null,
      paper_id: "10.1000/test",
      source_links: ["https://doi.org/10.1000/test"],
      download_links: [],
      open_access: null,
      citation_count: null,
      reference_count: null,
      provider: "crossref"
    });
  });

  it("normalizes Crossref authors, venue, and counts into the shared paper shape", () => {
    expect(
      normalizeCrossrefWork({
        DOI: "10.1109/CVPR.2016.90",
        title: ["Deep Residual Learning for Image Recognition"],
        author: [
          { given: "Kaiming", family: "He" },
          { given: "Xiangyu", family: "Zhang" },
          { given: "Shaoqing", family: "Ren" },
          { given: "Jian", family: "Sun" }
        ],
        event: { name: "CVPR 2016" },
        "container-title": ["Proceedings of the IEEE Conference on Computer Vision and Pattern Recognition"],
        issued: { "date-parts": [[2016]] },
        "is-referenced-by-count": 250000,
        "reference-count": 41
      })
    ).toEqual({
      title: "Deep Residual Learning for Image Recognition",
      authors: ["Kaiming He", "Xiangyu Zhang", "Shaoqing Ren", "Jian Sun"],
      abstract: null,
      year: 2016,
      venue: "CVPR 2016",
      doi: "10.1109/CVPR.2016.90",
      arxiv_id: null,
      paper_id: "10.1109/CVPR.2016.90",
      source_links: ["https://doi.org/10.1109/CVPR.2016.90"],
      download_links: [],
      open_access: null,
      citation_count: 250000,
      reference_count: 41,
      provider: "crossref"
    });
  });
});

describe("OpenAlex paper provider", () => {
  it("normalizes the shared paper shape", () => {
    expect(
      normalizeOpenAlexWork({
        id: "W1234567890",
        doi: "https://doi.org/10.1000/test",
        title: "Paper",
        publication_year: 2024
      })
    ).toEqual({
      title: "Paper",
      authors: [],
      abstract: null,
      year: 2024,
      venue: null,
      doi: "10.1000/test",
      arxiv_id: null,
      paper_id: "https://openalex.org/W1234567890",
      source_links: ["https://doi.org/10.1000/test"],
      download_links: [],
      open_access: null,
      citation_count: null,
      reference_count: null,
      provider: "openalex"
    });
  });

  it("normalizes OpenAlex authorships, venue, abstract, and counts", () => {
    expect(
      normalizeOpenAlexWork({
        id: "https://openalex.org/W2046618432",
        doi: "https://doi.org/10.1038/nature14539",
        title: "Deep learning",
        publication_year: 2015,
        authorships: [
          { author: { display_name: "Yann LeCun" } },
          { author: { display_name: "Yoshua Bengio" } },
          { author: { display_name: "Geoffrey Hinton" } }
        ],
        primary_location: {
          source: { display_name: "Nature" }
        },
        abstract_inverted_index: {
          Deep: [0],
          learning: [1],
          transforms: [2],
          "AI.": [3]
        },
        cited_by_count: 123456,
        referenced_works_count: 321
      })
    ).toMatchObject({
      title: "Deep learning",
      authors: ["Yann LeCun", "Yoshua Bengio", "Geoffrey Hinton"],
      abstract: "Deep learning transforms AI.",
      year: 2015,
      venue: "Nature",
      doi: "10.1038/nature14539",
      paper_id: "https://openalex.org/W2046618432",
      citation_count: 123456,
      reference_count: 321,
      provider: "openalex"
    });
  });
});

describe("paper related id classification", () => {
  it("classifies DOI, OpenAlex bare ids, and OpenAlex URLs explicitly", () => {
    expect(classifyRelatedPaperId("10.3390/make6040126")).toEqual({
      kind: "doi",
      value: "10.3390/make6040126"
    });

    expect(classifyRelatedPaperId("W4404263292")).toEqual({
      kind: "openalex_id",
      value: "W4404263292"
    });

    expect(classifyRelatedPaperId("https://openalex.org/W4404263292")).toEqual({
      kind: "openalex_url",
      value: "https://openalex.org/W4404263292",
      workId: "W4404263292"
    });
  });
});

describe("paper tool surface", () => {
  it("registers canonical paper handlers in the manifest and resolves legacy aliases", async () => {
    const handler = getToolHandler("paper_search");
    const legacyHandler = getToolHandler("paper-search");
    const fetchMock = vi.fn(async (input: string | URL) => {
      const url = String(input);

      if (url === "https://api.crossref.org/works?query=mcp&rows=10") {
        return Response.json({
          message: {
            items: [
              {
                DOI: "10.1000/test",
                title: ["Minimal Paper"],
                issued: { "date-parts": [[2024]] }
              }
            ]
          }
        });
      }

      if (url === "https://api.openalex.org/works?search=mcp&per-page=10") {
        return Response.json({
          results: [
            {
              id: "https://openalex.org/W1234567890",
              doi: "https://doi.org/10.1000/test",
              title: "Minimal Paper Title",
              publication_year: 2024
            }
          ]
        });
      }

      throw new Error(`unexpected url ${url}`);
    });

    vi.stubGlobal("fetch", fetchMock);

    expect(handler).toBeTypeOf("function");
    expect(legacyHandler).toBe(handler);
    await expect(
      handler?.(
        { query: "mcp" },
        {
          env: {},
          request: new Request("https://example.com/mcp", { method: "POST" })
        }
      )
    ).resolves.toEqual({
      ok: true,
      data: {
        query: "mcp",
        providers: ["crossref", "openalex"],
        partial: false,
        results: [
          {
            title: "Minimal Paper Title",
            authors: [],
            abstract: null,
            year: 2024,
            venue: null,
            doi: "10.1000/test",
            arxiv_id: null,
            paper_id: "https://openalex.org/W1234567890",
            source_links: ["https://doi.org/10.1000/test"],
            download_links: [],
            open_access: null,
            citation_count: null,
            reference_count: null,
            provider: "openalex"
          }
        ]
      }
    });

    await expect(
      legacyHandler?.(
        { query: "mcp" },
        {
          env: {},
          request: new Request("https://example.com/mcp", { method: "POST" })
        }
      )
    ).resolves.toEqual({
      ok: true,
      data: {
        query: "mcp",
        providers: ["crossref", "openalex"],
        partial: false,
        results: [
          {
            title: "Minimal Paper Title",
            authors: [],
            abstract: null,
            year: 2024,
            venue: null,
            doi: "10.1000/test",
            arxiv_id: null,
            paper_id: "https://openalex.org/W1234567890",
            source_links: ["https://doi.org/10.1000/test"],
            download_links: [],
            open_access: null,
            citation_count: null,
            reference_count: null,
            provider: "openalex"
          }
        ]
      }
    });

    expect(getToolHandler("paper_get_details")).toBeTypeOf("function");
    expect(getToolHandler("paper_get_related")).toBeTypeOf("function");
    expect(getToolHandler("paper_get_open_access")).toBeTypeOf("function");
  });

  it("aggregates paper details across providers and marks partial results when one provider fails", async () => {
    const detailsHandler = getToolHandler("paper_get_details");
    const legacyDetailsHandler = getToolHandler("paper-get-details");
    const context = {
      env: {
        PAPER_SEARCH_MCP_UNPAYWALL_EMAILS: "a@example.com"
      },
      request: new Request("https://example.com/mcp", { method: "POST" })
    };

    expect(legacyDetailsHandler).toBe(detailsHandler);

    const fetchMock = vi.fn(async (input: string | URL) => {
      const url = String(input);

      if (url.startsWith("https://api.crossref.org/works/10.1000%2Ftest")) {
        return Response.json({
          message: {
            DOI: "10.1000/test",
            title: ["Paper"],
            issued: { "date-parts": [[2024]] }
          }
        });
      }

      if (url.startsWith("https://api.openalex.org/works?filter=doi:10.1000%2Ftest")) {
        return Response.json({
          results: [
            {
              id: "https://openalex.org/W1234567890",
              doi: "https://doi.org/10.1000/test",
              title: "Paper Title",
              publication_year: 2024
            }
          ]
        });
      }

      if (url.startsWith("https://api.unpaywall.org/v2/10.1000%2Ftest?email=a%40example.com")) {
        return Response.json({
          doi: "10.1000/test",
          is_oa: true,
          best_oa_location: {
            url_for_pdf: "https://example.com/paper.pdf"
          },
          oa_locations: []
        });
      }

      throw new Error(`unexpected url ${url}`);
    });

    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(Math, "random").mockReturnValue(0);

    await expect(detailsHandler?.({ doi: "10.1000/test" }, context)).resolves.toEqual({
      ok: true,
      data: {
        paper_id: "10.1000/test",
        providers: ["crossref", "openalex", "unpaywall"],
        partial: false,
        result: {
          title: "Paper Title",
          authors: [],
          abstract: null,
          year: 2024,
          venue: null,
          doi: "10.1000/test",
          arxiv_id: null,
          paper_id: "https://openalex.org/W1234567890",
          source_links: ["https://doi.org/10.1000/test"],
          download_links: ["https://example.com/paper.pdf"],
          open_access: true,
          citation_count: null,
          reference_count: null,
          provider: "openalex"
        }
      }
    });
  });

  it("routes paper_get_open_access through Unpaywall", async () => {
    const openAccessHandler = getToolHandler("paper_get_open_access");
    const legacyOpenAccessHandler = getToolHandler("paper-get-open-access");
    const context = {
      env: {
        PAPER_SEARCH_MCP_UNPAYWALL_EMAILS: "a@example.com"
      },
      request: new Request("https://example.com/mcp", { method: "POST" })
    };

    expect(legacyOpenAccessHandler).toBe(openAccessHandler);

    const fetchMock = vi.fn(async () =>
      Response.json({
        doi: "10.1000/test",
        is_oa: true,
        best_oa_location: {
          url: "https://example.com/paper",
          url_for_pdf: "https://example.com/paper.pdf"
        },
        oa_locations: []
      })
    );

    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(Math, "random").mockReturnValue(0);

    await expect(openAccessHandler?.({ doi: "10.1000/test" }, context)).resolves.toEqual({
      ok: true,
      data: {
        doi: "10.1000/test",
        provider: "unpaywall",
        open_access: true,
        download_links: ["https://example.com/paper", "https://example.com/paper.pdf"]
      }
    });
  });

  it("returns controlled validation results for paper surfaces", async () => {
    const searchHandler = getToolHandler("paper_search");
    const detailsHandler = getToolHandler("paper_get_details");
    const relatedHandler = getToolHandler("paper_get_related");
    const openAccessHandler = getToolHandler("paper_get_open_access");
    const context = {
      env: {},
      request: new Request("https://example.com/mcp", { method: "POST" })
    };

    await expect(searchHandler?.({ query: "" }, context)).resolves.toEqual({
      ok: false,
      error: expect.objectContaining({
        type: "validation_error",
        message: "query must be a non-empty string"
      })
    });

    const searchFetchMock = vi.fn(async (input: string | URL) => {
      const url = String(input);

      if (url === "https://api.crossref.org/works?query=transformers&rows=10") {
        return Response.json({
          message: {
            items: [
              {
                DOI: "10.1000/transformers",
                title: ["Transformers from Crossref"],
                issued: { "date-parts": [[2017]] }
              }
            ]
          }
        });
      }

      if (url === "https://api.openalex.org/works?search=transformers&per-page=10") {
        throw new Error("OpenAlex unavailable");
      }

      throw new Error(`unexpected url ${url}`);
    });

    vi.stubGlobal("fetch", searchFetchMock);

    await expect(searchHandler?.({ query: "transformers" }, context)).resolves.toEqual({
      ok: true,
      data: {
        query: "transformers",
        providers: ["crossref"],
        partial: true,
        results: [
          {
            title: "Transformers from Crossref",
            authors: [],
            abstract: null,
            year: 2017,
            venue: null,
            doi: "10.1000/transformers",
            arxiv_id: null,
            paper_id: "10.1000/transformers",
            source_links: ["https://doi.org/10.1000/transformers"],
            download_links: [],
            open_access: null,
            citation_count: null,
            reference_count: null,
            provider: "crossref"
          }
        ]
      }
    });

    await expect(detailsHandler?.({ paper_id: "" }, context)).resolves.toEqual({
      ok: false,
      error: expect.objectContaining({
        type: "validation_error",
        message: "doi or arxiv_id must be a non-empty string"
      })
    });

    await expect(detailsHandler?.({ paper_id: "W1234567890" }, context)).resolves.toEqual({
      ok: false,
      error: expect.objectContaining({
        type: "validation_error",
        message: "doi or arxiv_id must be a non-empty string"
      })
    });

    const relatedFetchMock = vi.fn(async (input: string | URL) => {
      const url = String(input);

      if (url === "https://api.openalex.org/works/https%3A%2F%2Fdoi.org%2F10.1000%2Ftest") {
        return Response.json({
          id: "https://openalex.org/W1234567890",
          doi: "https://doi.org/10.1000/test",
          title: "Seed Paper",
          publication_year: 2024,
          related_works: ["https://openalex.org/W999"]
        });
      }

      if (url === "https://api.openalex.org/works/https%3A%2F%2Fdoi.org%2F10.3390%2Fmake6040126") {
        return new Response("primary DOI path unavailable", { status: 500 });
      }

      if (url === "https://api.openalex.org/works?filter=doi:10.3390%2Fmake6040126") {
        return Response.json({
          results: [
            {
              id: "https://openalex.org/W4404263292",
              doi: "https://doi.org/10.3390/make6040126",
              title: "Seed Paper",
              publication_year: 2024,
              related_works: ["https://openalex.org/W998"]
            }
          ]
        });
      }

      if (url === "https://api.openalex.org/works?filter=doi:10.1000%2Ftest") {
        return new Response("legacy DOI filter path should not be called", { status: 500 });
      }

      if (url === "https://api.openalex.org/works/W1234567890") {
        return Response.json({
          id: "https://openalex.org/W1234567890",
          title: "Seed Paper",
          publication_year: 2024,
          related_works: ["https://openalex.org/W999"]
        });
      }

      if (url === "https://api.openalex.org/works/W4404263292") {
        return Response.json({
          id: "https://openalex.org/W4404263292",
          doi: "https://doi.org/10.3390/make6040126",
          title: "Seed Paper",
          publication_year: 2024,
          related_works: ["https://openalex.org/W998"]
        });
      }

      if (url === "https://api.openalex.org/works/W999") {
        return Response.json({
          id: "https://openalex.org/W999",
          doi: "https://doi.org/10.1000/related",
          title: "Related Paper",
          publication_year: 2025
        });
      }

      if (url === "https://api.openalex.org/works/W998") {
        return Response.json({
          id: "https://openalex.org/W998",
          doi: "https://doi.org/10.3390/related",
          title: "Related Paper for Make",
          publication_year: 2025
        });
      }

      if (url.includes("filter=related_to:")) {
        return new Response("legacy path should not be called", { status: 500 });
      }

      return new Response("not found", { status: 404 });
    });

    vi.stubGlobal("fetch", relatedFetchMock);

    await expect(relatedHandler?.({ doi: "10.1000/test" }, context)).resolves.toEqual({
      ok: true,
      data: {
        paper_id: "10.1000/test",
        providers: ["openalex"],
        partial: false,
        results: [
          {
            title: "Related Paper",
            authors: [],
            abstract: null,
            year: 2025,
            venue: null,
            doi: "10.1000/related",
            arxiv_id: null,
            paper_id: "https://openalex.org/W999",
            source_links: ["https://doi.org/10.1000/related"],
            download_links: [],
            open_access: null,
            citation_count: null,
            reference_count: null,
            provider: "openalex"
          }
        ]
      }
    });

    await expect(relatedHandler?.({ paper_id: "10.1000/test" }, context)).resolves.toEqual({
      ok: true,
      data: {
        paper_id: "10.1000/test",
        providers: ["openalex"],
        partial: false,
        results: [
          {
            title: "Related Paper",
            authors: [],
            abstract: null,
            year: 2025,
            venue: null,
            doi: "10.1000/related",
            arxiv_id: null,
            paper_id: "https://openalex.org/W999",
            source_links: ["https://doi.org/10.1000/related"],
            download_links: [],
            open_access: null,
            citation_count: null,
            reference_count: null,
            provider: "openalex"
          }
        ]
      }
    });

    await expect(relatedHandler?.({ paper_id: "10.3390/make6040126" }, context)).resolves.toEqual({
      ok: true,
      data: {
        paper_id: "10.3390/make6040126",
        providers: ["openalex"],
        partial: false,
        results: [
          {
            title: "Related Paper for Make",
            authors: [],
            abstract: null,
            year: 2025,
            venue: null,
            doi: "10.3390/related",
            arxiv_id: null,
            paper_id: "https://openalex.org/W998",
            source_links: ["https://doi.org/10.3390/related"],
            download_links: [],
            open_access: null,
            citation_count: null,
            reference_count: null,
            provider: "openalex"
          }
        ]
      }
    });

    await expect(relatedHandler?.({ paper_id: "W1234567890" }, context)).resolves.toEqual({
      ok: true,
      data: {
        paper_id: "https://openalex.org/W1234567890",
        providers: ["openalex"],
        partial: false,
        results: [
          {
            title: "Related Paper",
            authors: [],
            abstract: null,
            year: 2025,
            venue: null,
            doi: "10.1000/related",
            arxiv_id: null,
            paper_id: "https://openalex.org/W999",
            source_links: ["https://doi.org/10.1000/related"],
            download_links: [],
            open_access: null,
            citation_count: null,
            reference_count: null,
            provider: "openalex"
          }
        ]
      }
    });

    await expect(relatedHandler?.({ paper_id: "W4404263292" }, context)).resolves.toEqual({
      ok: true,
      data: {
        paper_id: "https://openalex.org/W4404263292",
        providers: ["openalex"],
        partial: false,
        results: [
          {
            title: "Related Paper for Make",
            authors: [],
            abstract: null,
            year: 2025,
            venue: null,
            doi: "10.3390/related",
            arxiv_id: null,
            paper_id: "https://openalex.org/W998",
            source_links: ["https://doi.org/10.3390/related"],
            download_links: [],
            open_access: null,
            citation_count: null,
            reference_count: null,
            provider: "openalex"
          }
        ]
      }
    });

    await expect(relatedHandler?.({ paper_id: "https://openalex.org/W4404263292" }, context)).resolves.toEqual({
      ok: true,
      data: {
        paper_id: "https://openalex.org/W4404263292",
        providers: ["openalex"],
        partial: false,
        results: [
          {
            title: "Related Paper for Make",
            authors: [],
            abstract: null,
            year: 2025,
            venue: null,
            doi: "10.3390/related",
            arxiv_id: null,
            paper_id: "https://openalex.org/W998",
            source_links: ["https://doi.org/10.3390/related"],
            download_links: [],
            open_access: null,
            citation_count: null,
            reference_count: null,
            provider: "openalex"
          }
        ]
      }
    });

    await expect(relatedHandler?.({ paper_id: "not-openalex" }, context)).resolves.toEqual({
      ok: false,
      error: {
        type: "internal_error",
        message: "paper_get_related could not resolve an OpenAlex work id from paper_id or doi",
        details: {
          code: "openalex_seed_not_found",
          stage: "seed_resolution",
          provider: "openalex"
        }
      }
    });

    const relatedFetchDoiRateLimitedMock = vi.fn(async (input: string | URL) => {
      const url = String(input);

      if (url === "https://api.openalex.org/works/https%3A%2F%2Fdoi.org%2F10.5555%2Frate-limited") {
        return new Response("rate limited", { status: 429 });
      }

      if (url === "https://api.openalex.org/works?filter=doi:10.5555%2Frate-limited") {
        return Response.json({ results: [] });
      }

      if (url === "https://api.crossref.org/works/10.5555%2Frate-limited") {
        return Response.json({
          message: {
            reference: [
              {
                DOI: "10.5555/reference-doi",
                "article-title": "Fallback Reference Title",
                year: "2021",
                author: "Ada Lovelace",
                volume: "42",
                "journal-title": "Journal of Fallbacks"
              }
            ]
          }
        });
      }

      throw new Error(`unexpected url ${url}`);
    });

    vi.stubGlobal("fetch", relatedFetchDoiRateLimitedMock);

    await expect(relatedHandler?.({ paper_id: "10.5555/rate-limited" }, context)).resolves.toEqual({
      ok: true,
      data: {
        paper_id: "10.5555/rate-limited",
        providers: ["crossref"],
        partial: true,
        results: [
          {
            title: "Fallback Reference Title",
            authors: ["Ada Lovelace"],
            abstract: null,
            year: 2021,
            venue: "Journal of Fallbacks",
            doi: "10.5555/reference-doi",
            arxiv_id: null,
            paper_id: "10.5555/reference-doi",
            source_links: ["https://doi.org/10.5555/reference-doi"],
            download_links: [],
            open_access: null,
            citation_count: null,
            reference_count: null,
            provider: "crossref"
          }
        ]
      }
    });

    const relatedFetchDoiEmptyMock = vi.fn(async (input: string | URL) => {
      const url = String(input);

      if (url === "https://api.openalex.org/works/https%3A%2F%2Fdoi.org%2F10.5555%2Fmissing") {
        return new Response("missing", { status: 404 });
      }

      if (url === "https://api.openalex.org/works?filter=doi:10.5555%2Fmissing") {
        return Response.json({ results: [] });
      }

      throw new Error(`unexpected url ${url}`);
    });

    vi.stubGlobal("fetch", relatedFetchDoiEmptyMock);

    await expect(relatedHandler?.({ paper_id: "10.5555/missing" }, context)).resolves.toEqual({
      ok: false,
      error: {
        type: "internal_error",
        message: "paper_get_related could not resolve an OpenAlex work id from paper_id or doi",
        details: {
          code: "openalex_seed_not_found",
          stage: "seed_resolution",
          provider: "openalex",
          status: 200
        }
      }
    });

    const relatedFetchSeedFailureMock = vi.fn(async (input: string | URL) => {
      const url = String(input);

      if (url === "https://api.openalex.org/works/https%3A%2F%2Fdoi.org%2F10.5555%2Fbroken") {
        return new Response("primary DOI path unavailable", { status: 502 });
      }

      if (url === "https://api.openalex.org/works?filter=doi:10.5555%2Fbroken") {
        return new Response("filter DOI path unavailable", { status: 503 });
      }

      throw new Error(`unexpected url ${url}`);
    });

    vi.stubGlobal("fetch", relatedFetchSeedFailureMock);

    await expect(relatedHandler?.({ paper_id: "10.5555/broken" }, context)).resolves.toEqual({
      ok: false,
      error: {
        type: "internal_error",
        message: "paper_get_related could not resolve an OpenAlex work id from paper_id or doi",
        details: {
          code: "openalex_seed_upstream_failed",
          stage: "seed_resolution",
          provider: "openalex",
          status: 503
        }
      }
    });

    const relatedFetchEmptyMock = vi.fn(async (input: string | URL) => {
      const url = String(input);

      if (url === "https://api.openalex.org/works/W1234567890") {
        return Response.json({
          id: "https://openalex.org/W1234567890",
          title: "Seed Paper",
          publication_year: 2024
        });
      }

      if (url.includes("filter=related_to:")) {
        return new Response("legacy path should not be called", { status: 500 });
      }

      throw new Error(`unexpected url ${url}`);
    });

    vi.stubGlobal("fetch", relatedFetchEmptyMock);

    await expect(relatedHandler?.({ paper_id: "W1234567890" }, context)).resolves.toEqual({
      ok: true,
      data: {
        paper_id: "https://openalex.org/W1234567890",
        providers: ["openalex"],
        partial: false,
        results: []
      }
    });

    await expect(openAccessHandler?.({ doi: "" }, context)).resolves.toEqual({
      ok: false,
      error: expect.objectContaining({
        type: "validation_error",
        message: "doi must be a non-empty string"
      })
    });
  });
});

describe("paper normalization merge", () => {
  it("merges provider results by DOI and keeps the more complete fields", () => {
    expect(
      mergePaperResults([
        {
          title: " Paper title ",
          authors: ["Ada Lovelace"],
          abstract: null,
          year: 2024,
          venue: null,
          doi: "10.1000/test",
          arxiv_id: null,
          paper_id: "10.1000/test",
          source_links: ["https://doi.org/10.1000/test"],
          download_links: [],
          open_access: null,
          citation_count: null,
          reference_count: null,
          provider: "crossref"
        },
        {
          title: "Paper Title",
          authors: ["Ada Lovelace", "Grace Hopper"],
          abstract: "Detailed abstract",
          year: 2024,
          venue: "Journal of Tests",
          doi: "10.1000/test",
          arxiv_id: null,
          paper_id: "W123",
          source_links: ["https://openalex.org/W123"],
          download_links: ["https://example.com/paper.pdf"],
          open_access: true,
          citation_count: 12,
          reference_count: 5,
          provider: "openalex"
        }
      ])
    ).toEqual([
      {
        title: "Paper Title",
        authors: ["Ada Lovelace", "Grace Hopper"],
        abstract: "Detailed abstract",
        year: 2024,
        venue: "Journal of Tests",
        doi: "10.1000/test",
        arxiv_id: null,
        paper_id: "10.1000/test",
        source_links: ["https://doi.org/10.1000/test", "https://openalex.org/W123"],
        download_links: ["https://example.com/paper.pdf"],
        open_access: true,
        citation_count: 12,
        reference_count: 5,
        provider: "openalex"
      }
    ]);
  });

  it("merges source and download links without duplicates", () => {
    expect(
      mergePaperResults([
        {
          title: "Paper",
          authors: ["Ada Lovelace"],
          abstract: null,
          year: 2024,
          venue: null,
          doi: null,
          arxiv_id: "2401.12345",
          paper_id: "2401.12345",
          source_links: [
            "https://arxiv.org/abs/2401.12345",
            "https://doi.org/10.1000/test"
          ],
          download_links: ["https://arxiv.org/pdf/2401.12345.pdf"],
          open_access: true,
          citation_count: null,
          reference_count: null,
          provider: "arxiv"
        },
        {
          title: "Paper",
          authors: ["Ada Lovelace"],
          abstract: null,
          year: 2024,
          venue: null,
          doi: null,
          arxiv_id: "2401.12345",
          paper_id: "2401.12345v2",
          source_links: [
            "https://doi.org/10.1000/test",
            "https://arxiv.org/abs/2401.12345"
          ],
          download_links: [
            "https://arxiv.org/pdf/2401.12345.pdf",
            "https://mirror.example.com/paper.pdf"
          ],
          open_access: true,
          citation_count: null,
          reference_count: null,
          provider: "pubmed"
        }
      ])
    ).toEqual([
      {
        title: "Paper",
        authors: ["Ada Lovelace"],
        abstract: null,
        year: 2024,
        venue: null,
        doi: null,
        arxiv_id: "2401.12345",
        paper_id: "2401.12345",
        source_links: [
          "https://arxiv.org/abs/2401.12345",
          "https://doi.org/10.1000/test"
        ],
        download_links: [
          "https://arxiv.org/pdf/2401.12345.pdf",
          "https://mirror.example.com/paper.pdf"
        ],
        open_access: true,
        citation_count: null,
        reference_count: null,
        provider: "arxiv"
      }
    ]);
  });

  it("falls back to a normalized title year first-author key when ids are missing", () => {
    expect(
      mergePaperResults([
        {
          title: "A Study on Testing!",
          authors: [" Ada Lovelace ", "Grace Hopper"],
          abstract: null,
          year: 2024,
          venue: null,
          doi: null,
          arxiv_id: null,
          paper_id: null,
          source_links: [],
          download_links: [],
          open_access: null,
          citation_count: null,
          reference_count: null,
          provider: "openalex"
        },
        {
          title: "a study on testing",
          authors: ["Ada Lovelace"],
          abstract: "Abstract",
          year: 2024,
          venue: "Conference",
          doi: null,
          arxiv_id: null,
          paper_id: "fallback-id",
          source_links: ["https://example.com/paper"],
          download_links: [],
          open_access: false,
          citation_count: 3,
          reference_count: 7,
          provider: "openalex"
        }
      ])
    ).toEqual([
      {
        title: "A Study on Testing!",
        authors: ["Ada Lovelace", "Grace Hopper"],
        abstract: "Abstract",
        year: 2024,
        venue: "Conference",
        doi: null,
        arxiv_id: null,
        paper_id: "fallback-id",
        source_links: ["https://example.com/paper"],
        download_links: [],
        open_access: false,
        citation_count: 3,
        reference_count: 7,
        provider: "openalex"
      }
    ]);
  });
});

describe("Unpaywall paper provider", () => {
  it("maps doi, open_access, provider, and download_links", async () => {
    const fetchMock = vi.fn(async () =>
      Response.json({
        doi: "10.1000/test",
        is_oa: true,
        best_oa_location: {
          url: "https://example.com/paper",
          url_for_pdf: "https://example.com/paper.pdf",
          host_type: "publisher"
        },
        oa_locations: [
          {
            url: "https://mirror.example.com/paper",
            url_for_pdf: "https://mirror.example.com/paper.pdf",
            host_type: "repository"
          }
        ]
      })
    );
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(Math, "random").mockReturnValue(0);

    const result = await lookupUnpaywallByDoi("10.1000/test", {
      PAPER_SEARCH_MCP_UNPAYWALL_EMAILS: "a@example.com,b@example.com"
    });

    expect(result).toEqual({
      ok: true,
      data: {
        doi: "10.1000/test",
        open_access: true,
        provider: "unpaywall",
        download_links: [
          "https://example.com/paper",
          "https://example.com/paper.pdf",
          "https://mirror.example.com/paper",
          "https://mirror.example.com/paper.pdf"
        ]
      }
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.unpaywall.org/v2/10.1000%2Ftest?email=a%40example.com",
      expect.objectContaining({ method: "GET" })
    );
  });

  it("can select a random email from the configured pool", async () => {
    const fetchMock = vi.fn(async () =>
      Response.json({
        doi: "10.1000/test",
        is_oa: false,
        oa_locations: []
      })
    );
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(Math, "random").mockReturnValue(0.75);

    const result = await lookupUnpaywallByDoi("10.1000/test", {
      PAPER_SEARCH_MCP_UNPAYWALL_EMAILS: "a@example.com,b@example.com"
    });

    expect(result).toEqual({
      ok: true,
      data: {
        doi: "10.1000/test",
        open_access: false,
        provider: "unpaywall",
        download_links: []
      }
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.unpaywall.org/v2/10.1000%2Ftest?email=b%40example.com",
      expect.objectContaining({ method: "GET" })
    );
  });
});
