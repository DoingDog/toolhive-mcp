import { internalError, validationError } from "../../lib/errors";
import type { ToolExecutionResult } from "../../mcp/result";
import { isAuxiliaryPaperRecord, mergePaperResults, normalizeSearchTitleKey, scorePaperForQuery } from "./normalize";
import { normalizeArxivEntry } from "./providers/arxiv";
import { normalizeCrossrefReference, normalizeCrossrefWork } from "./providers/crossref";
import { normalizeOpenAlexWork } from "./providers/openalex";
import { lookupUnpaywallByDoi } from "./providers/unpaywall";
import type { NormalizedPaper, PaperProvider } from "./types";
import type { ToolContext } from "../types";

type PaperSearchArgs = {
  query?: unknown;
};

type PaperDetailsArgs = {
  doi?: unknown;
  arxiv_id?: unknown;
};

type PaperOpenAccessArgs = {
  doi?: unknown;
};

type PaperRelatedArgs = {
  paper_id?: unknown;
  doi?: unknown;
};

type ProviderPaperResult = {
  provider: Extract<PaperProvider, "arxiv" | "crossref" | "openalex">;
  paper: NormalizedPaper | null;
};

type ProviderPaperSearchResult = {
  provider: Extract<PaperProvider, "crossref" | "openalex" | "arxiv">;
  papers: NormalizedPaper[];
};

function scoreRelatedPaperCompleteness(paper: NormalizedPaper): number {
  return [
    paper.title,
    paper.abstract,
    paper.venue,
    paper.doi,
    paper.arxiv_id,
    paper.year,
    paper.open_access,
    paper.citation_count,
    paper.reference_count
  ].filter((value) => value !== null).length
    + paper.authors.filter((author) => author.trim().length > 0).length;
}

async function hydrateRelatedResults(papers: NormalizedPaper[], limit = 5): Promise<NormalizedPaper[]> {
  const hydratedPapers = [...papers];
  let hydrationCount = 0;

  for (let index = 0; index < hydratedPapers.length; index += 1) {
    const paper = hydratedPapers[index];
    if (!paper) {
      continue;
    }

    const doi = paper.doi;
    const needsHydration = doi !== null
      && hydrationCount < limit
      && (paper.title === null || paper.authors.length === 0 || paper.venue === null);

    if (!needsHydration) {
      continue;
    }

    try {
      const detail = await fetchCrossrefDetails(doi);
      if (detail.paper) {
        hydratedPapers[index] = mergePaperResults([paper, detail.paper])[0] ?? paper;
      }
    } catch {
      // keep original paper when hydration fails
    }

    hydrationCount += 1;
  }

  return hydratedPapers;
}

function finalizeRelatedResults(papers: NormalizedPaper[]): NormalizedPaper[] {
  return mergePaperResults(papers)
    .filter((paper) => paper.title !== null)
    .sort((left, right) => scoreRelatedPaperCompleteness(right) - scoreRelatedPaperCompleteness(left));
}

function normalizeNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalizedValue = value.trim();
  return normalizedValue.length > 0 ? normalizedValue : null;
}

function looksLikeDoi(value: string): boolean {
  return /^10\.\S+\/\S+$/i.test(value.trim());
}

function looksLikeArxivId(value: string): boolean {
  const normalizedValue = value.trim();
  return /^(?:arxiv:)?(?:\d{4}\.\d{4,5}|[a-z.-]+\/\d{7})(?:v\d+)?$/i.test(normalizedValue);
}

type PaperQueryClassification =
  | { kind: "doi"; doi: string }
  | { kind: "arxiv_id"; arxivId: string; doi?: string }
  | { kind: "text"; query: string };

function normalizeArxivIdentifier(value: string): string {
  return value.trim().replace(/^arxiv:/i, "").replace(/v\d+$/i, "");
}

function classifyPaperQuery(query: string): PaperQueryClassification {
  const normalizedQuery = query.trim();

  if (/^10\.48550\/arxiv\./i.test(normalizedQuery)) {
    return {
      kind: "arxiv_id",
      arxivId: normalizeArxivIdentifier(normalizedQuery.replace(/^10\.48550\/arxiv\./i, "")),
      doi: normalizedQuery
    };
  }

  if (looksLikeArxivId(normalizedQuery)) {
    return {
      kind: "arxiv_id",
      arxivId: normalizeArxivIdentifier(normalizedQuery)
    };
  }

  if (looksLikeDoi(normalizedQuery)) {
    return {
      kind: "doi",
      doi: normalizedQuery
    };
  }

  return {
    kind: "text",
    query: normalizedQuery
  };
}

type RelatedPaperIdClassification =
  | { kind: "doi"; value: string }
  | { kind: "openalex_id"; value: string }
  | { kind: "openalex_url"; value: string; workId: string }
  | { kind: "invalid"; value: string };

export function classifyRelatedPaperId(value: string): RelatedPaperIdClassification {
  const normalizedValue = value.trim();

  if (looksLikeDoi(normalizedValue)) {
    return {
      kind: "doi",
      value: normalizedValue
    };
  }

  const openAlexWorkId = normalizeOpenAlexWorkId(normalizedValue);
  if (!openAlexWorkId) {
    return {
      kind: "invalid",
      value: normalizedValue
    };
  }

  if (/^https?:\/\/openalex\.org\//i.test(normalizedValue)) {
    return {
      kind: "openalex_url",
      value: `https://openalex.org/${openAlexWorkId}`,
      workId: openAlexWorkId
    };
  }

  return {
    kind: "openalex_id",
    value: openAlexWorkId
  };
}

function withOpenAccessData(paper: NormalizedPaper, openAccess: { open_access: boolean; download_links: string[] }): NormalizedPaper {
  return {
    ...paper,
    open_access: openAccess.open_access,
    download_links: Array.from(new Set([...paper.download_links, ...openAccess.download_links]))
  };
}

async function fetchCrossrefDetails(doi: string): Promise<ProviderPaperResult> {
  const response = await fetch(`https://api.crossref.org/works/${encodeURIComponent(doi)}`, { method: "GET" });
  if (!response.ok) {
    throw new Error(`Crossref API returned ${response.status}`);
  }

  const json = await response.json() as { message?: unknown };
  return {
    provider: "crossref",
    paper: json.message ? normalizeCrossrefWork(json.message as Record<string, unknown>) : null
  };
}

async function fetchOpenAlexDetails(doi: string): Promise<ProviderPaperResult> {
  const response = await fetch(`https://api.openalex.org/works?filter=doi:${encodeURIComponent(doi)}`, { method: "GET" });
  if (!response.ok) {
    throw new Error(`OpenAlex API returned ${response.status}`);
  }

  const json = await response.json() as { results?: unknown };
  const firstResult = Array.isArray(json.results) ? json.results[0] : null;

  return {
    provider: "openalex",
    paper: firstResult ? normalizeOpenAlexWork(firstResult as Record<string, unknown>) : null
  };
}

async function searchCrossrefWorks(query: string): Promise<ProviderPaperSearchResult> {
  const response = await fetch(
    `https://api.crossref.org/works?query=${encodeURIComponent(query)}&rows=10`,
    { method: "GET" }
  );
  if (!response.ok) {
    throw new Error(`Crossref API returned ${response.status}`);
  }

  const json = await response.json() as { message?: { items?: unknown } };
  const items = Array.isArray(json.message?.items) ? json.message.items : [];

  return {
    provider: "crossref",
    papers: items.map((item) => normalizeCrossrefWork(item as Record<string, unknown>))
  };
}

async function searchOpenAlexWorks(query: string): Promise<ProviderPaperSearchResult> {
  const response = await fetch(
    `https://api.openalex.org/works?search=${encodeURIComponent(query)}&per-page=10`,
    { method: "GET" }
  );
  if (!response.ok) {
    throw new Error(`OpenAlex API returned ${response.status}`);
  }

  const json = await response.json() as { results?: unknown };
  const results = Array.isArray(json.results) ? json.results : [];

  return {
    provider: "openalex",
    papers: results.map((result) => normalizeOpenAlexWork(result as Record<string, unknown>))
  };
}

type OpenAlexWorkLookupResult = {
  workId: string;
  paper: NormalizedPaper | null;
  relatedWorkIds: string[];
};

type OpenAlexRelatedLookupErrorCode =
  | "openalex_seed_not_found"
  | "openalex_seed_upstream_failed"
  | "openalex_related_fetch_failed";

type OpenAlexRelatedLookupError = {
  code: OpenAlexRelatedLookupErrorCode;
  stage: "seed_resolution" | "related_fetch";
  provider: "openalex";
  status?: number;
};

function normalizeOpenAlexWorkId(value: string): string | null {
  const normalizedValue = value.trim();
  const openAlexId = normalizedValue.match(/^(?:https?:\/\/openalex\.org\/)?(W\d+)$/i)?.[1];
  return openAlexId ? openAlexId.toUpperCase() : null;
}

function createOpenAlexRelatedLookupError(code: OpenAlexRelatedLookupErrorCode, stage: OpenAlexRelatedLookupError["stage"], status?: number): OpenAlexRelatedLookupError {
  return {
    code,
    stage,
    provider: "openalex",
    ...(status === undefined ? {} : { status })
  };
}

function parseOpenAlexWorkLookup(work: Record<string, unknown>, status?: number): OpenAlexWorkLookupResult {
  const workId = normalizeNonEmptyString(work.id);
  if (!workId) {
    throw createOpenAlexRelatedLookupError("openalex_seed_not_found", "seed_resolution", status);
  }

  return {
    workId,
    paper: normalizeOpenAlexWork(work),
    relatedWorkIds: Array.isArray(work.related_works)
      ? work.related_works
          .map((relatedWorkId) => typeof relatedWorkId === "string" ? normalizeOpenAlexWorkId(relatedWorkId) : null)
          .filter((relatedWorkId): relatedWorkId is string => relatedWorkId !== null)
      : []
  };
}

function normalizeOpenAlexLookupError(error: unknown, stage: OpenAlexRelatedLookupError["stage"]): OpenAlexRelatedLookupError {
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    "stage" in error &&
    "provider" in error
  ) {
    return error as OpenAlexRelatedLookupError;
  }

  if (error instanceof Response) {
    return createOpenAlexRelatedLookupError("openalex_seed_upstream_failed", stage, error.status);
  }

  if (typeof error === "object" && error !== null && "status" in error && typeof error.status === "number") {
    return createOpenAlexRelatedLookupError("openalex_seed_upstream_failed", stage, error.status);
  }

  return createOpenAlexRelatedLookupError(stage === "related_fetch" ? "openalex_related_fetch_failed" : "openalex_seed_not_found", stage);
}

async function fetchOpenAlexWorkById(id: string): Promise<OpenAlexWorkLookupResult> {
  const response = await fetch(`https://api.openalex.org/works/${encodeURIComponent(id)}`, { method: "GET" });
  if (!response.ok) {
    throw createOpenAlexRelatedLookupError("openalex_seed_upstream_failed", "seed_resolution", response.status);
  }

  const work = await response.json() as Record<string, unknown>;
  return parseOpenAlexWorkLookup(work, response.status);
}

async function fetchOpenAlexWorkByDoi(doi: string): Promise<OpenAlexWorkLookupResult> {
  const primaryResponse = await fetch(
    `https://api.openalex.org/works/${encodeURIComponent(`https://doi.org/${doi}`)}`,
    { method: "GET" }
  );
  if (primaryResponse.ok) {
    const primaryWork = await primaryResponse.json() as Record<string, unknown>;
    return parseOpenAlexWorkLookup(primaryWork, primaryResponse.status);
  }

  const primaryUpstreamFailure = primaryResponse.status !== 404
    ? createOpenAlexRelatedLookupError("openalex_seed_upstream_failed", "seed_resolution", primaryResponse.status)
    : null;

  const fallbackResponse = await fetch(
    `https://api.openalex.org/works?filter=doi:${encodeURIComponent(doi)}`,
    { method: "GET" }
  );
  if (!fallbackResponse.ok) {
    throw createOpenAlexRelatedLookupError("openalex_seed_upstream_failed", "seed_resolution", fallbackResponse.status);
  }

  const fallbackJson = await fallbackResponse.json() as { results?: unknown };
  const firstResult = Array.isArray(fallbackJson.results) ? fallbackJson.results[0] : null;
  if (!firstResult || typeof firstResult !== "object") {
    throw primaryUpstreamFailure ?? createOpenAlexRelatedLookupError("openalex_seed_not_found", "seed_resolution", fallbackResponse.status);
  }

  return parseOpenAlexWorkLookup(firstResult as Record<string, unknown>, fallbackResponse.status);
}

async function fetchOpenAlexWorksByIds(ids: string[]): Promise<{ papers: NormalizedPaper[]; partial: boolean }> {
  const results = await Promise.allSettled(
    ids.map(async (id) => (await fetchOpenAlexWorkById(id)).paper)
  );

  const papers: NormalizedPaper[] = [];
  let partial = false;

  results.forEach((result) => {
    if (result.status === "rejected") {
      partial = true;
      return;
    }

    if (result.value) {
      papers.push(result.value);
    }
  });

  return { papers, partial };
}

async function fetchCrossrefReferences(doi: string): Promise<NormalizedPaper[]> {
  const response = await fetch(`https://api.crossref.org/works/${encodeURIComponent(doi)}`, { method: "GET" });
  if (!response.ok) {
    throw new Error(`Crossref API returned ${response.status}`);
  }

  const json = await response.json() as { message?: { reference?: unknown } };
  const references = Array.isArray(json.message?.reference) ? json.message.reference : [];

  return references
    .map((reference) => normalizeCrossrefReference(reference as Record<string, unknown>))
    .filter((paper): paper is NormalizedPaper => paper !== null);
}

function parseArxivEntries(xml: string): NormalizedPaper[] {
  return Array.from(xml.matchAll(/<entry>([\s\S]*?)<\/entry>/gi))
    .map((match) => {
      const entryBody = match[1] ?? "";
      const id = entryBody.match(/<id>([\s\S]*?)<\/id>/i)?.[1]?.trim() ?? null;
      const title = entryBody.match(/<title>([\s\S]*?)<\/title>/i)?.[1]?.trim() ?? null;
      const summary = entryBody.match(/<summary>([\s\S]*?)<\/summary>/i)?.[1]?.trim() ?? null;
      const authors = Array.from(entryBody.matchAll(/<author>\s*<name>([\s\S]*?)<\/name>\s*<\/author>/gi))
        .map((authorMatch) => authorMatch[1]?.trim() ?? "")
        .filter((author) => author.length > 0);

      return normalizeArxivEntry({ id, title, summary, authors });
    })
    .filter((paper): paper is NormalizedPaper => paper !== null);
}

async function fetchArxivDetails(identifier: string): Promise<ProviderPaperResult> {
  const response = await fetch(
    `https://export.arxiv.org/api/query?search_query=id:${encodeURIComponent(identifier)}&start=0&max_results=1`,
    { method: "GET" }
  );
  if (!response.ok) {
    throw new Error(`arXiv API returned ${response.status}`);
  }

  return {
    provider: "arxiv",
    paper: parseArxivEntries(await response.text())[0] ?? null
  };
}

async function searchArxivExactTitle(query: string): Promise<ProviderPaperSearchResult> {
  const response = await fetch(
    `https://export.arxiv.org/api/query?search_query=ti:%22${encodeURIComponent(query)}%22&start=0&max_results=5`,
    { method: "GET" }
  );
  if (!response.ok) {
    throw new Error(`arXiv API returned ${response.status}`);
  }

  const normalizedQuery = normalizeSearchTitleKey(query);

  return {
    provider: "arxiv",
    papers: parseArxivEntries(await response.text())
      .filter((paper) => normalizeSearchTitleKey(paper.title) === normalizedQuery)
  };
}

export async function handlePaperSearch(args: unknown, _context: ToolContext): Promise<ToolExecutionResult> {
  const searchArgs = (args ?? {}) as PaperSearchArgs;
  const query = normalizeNonEmptyString(searchArgs.query);

  if (!query) {
    return validationError("query must be a non-empty string");
  }

  const classification = classifyPaperQuery(query);

  if (classification.kind === "arxiv_id") {
    let arxivLookupFailed = false;

    try {
      const providerResult = await fetchArxivDetails(classification.arxivId);
      if (providerResult.paper) {
        return {
          ok: true,
          data: {
            query,
            providers: [providerResult.provider],
            partial: false,
            results: [providerResult.paper]
          }
        };
      }

      arxivLookupFailed = classification.doi !== undefined;
    } catch {
      arxivLookupFailed = classification.doi !== undefined;
    }

    if (classification.doi) {
      const providerResults = await Promise.allSettled([
        fetchCrossrefDetails(classification.doi),
        fetchOpenAlexDetails(classification.doi)
      ]);

      const providers: PaperProvider[] = [];
      const papers: NormalizedPaper[] = [];

      providerResults.forEach((result) => {
        if (result.status === "rejected") {
          return;
        }

        if (!result.value.paper) {
          return;
        }

        providers.push(result.value.provider);
        papers.push(result.value.paper);
      });

      return {
        ok: true,
        data: {
          query,
          providers,
          partial: arxivLookupFailed,
          results: mergePaperResults(papers)
        }
      };
    }

    return {
      ok: true,
      data: {
        query,
        providers: [],
        partial: false,
        results: []
      }
    };
  }

  if (classification.kind === "doi") {
    const providerResults = await Promise.allSettled([
      fetchCrossrefDetails(classification.doi),
      fetchOpenAlexDetails(classification.doi)
    ]);

    const providers: PaperProvider[] = [];
    const papers: NormalizedPaper[] = [];
    let partial = false;

    providerResults.forEach((result) => {
      if (result.status === "rejected") {
        partial = true;
        return;
      }

      if (!result.value.paper) {
        return;
      }

      providers.push(result.value.provider);
      papers.push(result.value.paper);
    });

    return {
      ok: true,
      data: {
        query,
        providers,
        partial,
        results: mergePaperResults(papers)
      }
    };
  }

  const providerResults = await Promise.allSettled([
    searchCrossrefWorks(classification.query),
    searchOpenAlexWorks(classification.query)
  ]);

  const providers: ProviderPaperSearchResult["provider"][] = [];
  const papers: NormalizedPaper[] = [];
  let partial = false;
  let openAlexSearchRejected = false;

  providerResults.forEach((result, index) => {
    if (result.status === "rejected") {
      partial = true;
      if (index === 1) {
        openAlexSearchRejected = true;
      }
      return;
    }

    providers.push(result.value.provider);
    papers.push(...result.value.papers);
  });

  if (openAlexSearchRejected) {
    try {
      const arxivFallback = await searchArxivExactTitle(classification.query);
      if (arxivFallback.papers.length > 0) {
        providers.push(arxivFallback.provider);
        papers.push(...arxivFallback.papers);
      }
    } catch {
      // keep crossref-only degraded results when arXiv fallback fails
    }
  }

  const results = mergePaperResults(papers)
    .filter((paper) => !isAuxiliaryPaperRecord(paper))
    .sort((left, right) => scorePaperForQuery(right, classification.query) - scorePaperForQuery(left, classification.query));

  return {
    ok: true,
    data: {
      query,
      providers,
      partial,
      results
    }
  };
}

export async function handlePaperGetDetails(args: unknown, context: ToolContext): Promise<ToolExecutionResult> {
  const detailsArgs = (args ?? {}) as PaperDetailsArgs;
  const doi = normalizeNonEmptyString(detailsArgs.doi);
  const arxivId = normalizeNonEmptyString(detailsArgs.arxiv_id);
  const resolvedPaperId = doi ?? arxivId;

  if (!resolvedPaperId) {
    return validationError("doi or arxiv_id must be a non-empty string");
  }

  const providerResults = await Promise.allSettled([
    ...(doi ? [fetchCrossrefDetails(doi), fetchOpenAlexDetails(doi)] : []),
    ...(arxivId ? [fetchArxivDetails(arxivId)] : []),
    ...(doi ? [lookupUnpaywallByDoi(doi, context.env)] : [])
  ]);

  const providers: PaperProvider[] = [];
  const papers: NormalizedPaper[] = [];
  let partial = false;
  let openAccess: { open_access: boolean; download_links: string[] } | null = null;

  providerResults.forEach((result) => {
    if (result.status === "rejected") {
      partial = true;
      return;
    }

    const value = result.value;
    if ("provider" in value) {
      if (value.paper) {
        providers.push(value.provider);
        papers.push(value.paper);
      }
      return;
    }

    if (!value.ok) {
      partial = true;
      return;
    }

    providers.push(value.data.provider);
    openAccess = {
      open_access: value.data.open_access,
      download_links: value.data.download_links
    };
  });

  const mergedResult = mergePaperResults(papers)[0] ?? null;

  return {
    ok: true,
    data: {
      paper_id: resolvedPaperId,
      providers,
      partial,
      result: mergedResult && openAccess ? withOpenAccessData(mergedResult, openAccess) : mergedResult
    }
  };
}

export async function handlePaperGetRelated(args: unknown, _context: ToolContext): Promise<ToolExecutionResult> {
  const relatedArgs = (args ?? {}) as PaperRelatedArgs;
  const paperId = normalizeNonEmptyString(relatedArgs.paper_id);
  const doi = normalizeNonEmptyString(relatedArgs.doi);
  const resolvedPaperId = paperId ?? doi;

  if (!resolvedPaperId) {
    return validationError("paper_id or doi must be a non-empty string");
  }

  const classification = doi
    ? { kind: "doi", value: doi } as const
    : classifyRelatedPaperId(resolvedPaperId);

  let lookup: OpenAlexWorkLookupResult;

  try {
    switch (classification.kind) {
      case "doi":
        lookup = await fetchOpenAlexWorkByDoi(classification.value);
        break;
      case "openalex_id":
        lookup = await fetchOpenAlexWorkById(classification.value);
        break;
      case "openalex_url":
        lookup = await fetchOpenAlexWorkById(classification.workId);
        break;
      case "invalid":
        throw createOpenAlexRelatedLookupError("openalex_seed_not_found", "seed_resolution");
    }
  } catch (error) {
    if (classification.kind === "doi") {
      const lookupError = normalizeOpenAlexLookupError(error, "seed_resolution");

      try {
        const fallbackResults = finalizeRelatedResults(
          await hydrateRelatedResults(await fetchCrossrefReferences(classification.value))
        );
        return {
          ok: true,
          data: {
            paper_id: classification.value,
            providers: ["crossref"],
            partial: true,
            relationship_type: "reference",
            degraded_reason: lookupError.code,
            results: fallbackResults
          }
        };
      } catch {
        // fall through to original OpenAlex error
      }
    }

    return internalError("paper_get_related could not resolve an OpenAlex work id from paper_id or doi", normalizeOpenAlexLookupError(error, "seed_resolution"));
  }

  try {
    const relatedLookup = lookup.relatedWorkIds.length > 0
      ? await fetchOpenAlexWorksByIds(lookup.relatedWorkIds.slice(0, 10))
      : { papers: [], partial: false };
    const relatedResults = finalizeRelatedResults(
      await hydrateRelatedResults(relatedLookup.papers)
    );

    return {
      ok: true,
      data: {
        paper_id: classification.kind === "doi" ? classification.value : lookup.workId,
        providers: ["openalex"],
        partial: relatedLookup.partial,
        relationship_type: "related",
        results: relatedResults
      }
    };
  } catch (error) {
    return internalError("paper_get_related could not fetch related papers from OpenAlex", normalizeOpenAlexLookupError(error, "related_fetch"));
  }
}

export async function handlePaperGetOpenAccess(args: unknown, context: ToolContext): Promise<ToolExecutionResult> {
  const openAccessArgs = (args ?? {}) as PaperOpenAccessArgs;

  if (typeof openAccessArgs.doi !== "string" || openAccessArgs.doi.trim() === "") {
    return validationError("doi must be a non-empty string");
  }

  return lookupUnpaywallByDoi(openAccessArgs.doi, context.env);
}
