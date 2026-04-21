import type { NormalizedPaper } from "../types";

type OpenAlexWork = {
  id?: unknown;
  doi?: unknown;
  title?: unknown;
  publication_year?: unknown;
};

function normalizeDoi(doi: unknown): string | null {
  if (typeof doi !== "string") {
    return null;
  }

  const normalizedDoi = doi.replace(/^https?:\/\/doi\.org\//i, "").trim();
  return normalizedDoi.length > 0 ? normalizedDoi : null;
}

function normalizeTitle(title: unknown): string | null {
  if (typeof title !== "string") {
    return null;
  }

  const normalizedTitle = title.trim();
  return normalizedTitle.length > 0 ? normalizedTitle : null;
}

function normalizeOpenAlexId(id: unknown): string | null {
  if (typeof id !== "string") {
    return null;
  }

  const normalizedId = id.trim();
  if (normalizedId.length === 0) {
    return null;
  }

  return /^https?:\/\//i.test(normalizedId) ? normalizedId : `https://openalex.org/${normalizedId.replace(/^https?:\/\/openalex\.org\//i, "")}`;
}

function buildSourceLinks(doi: string | null): string[] {
  return doi === null ? [] : [`https://doi.org/${doi}`];
}

export function normalizeOpenAlexWork(work: OpenAlexWork): NormalizedPaper {
  const doi = normalizeDoi(work.doi);
  const openAlexId = normalizeOpenAlexId(work.id);

  return {
    title: normalizeTitle(work.title),
    authors: [],
    abstract: null,
    year: typeof work.publication_year === "number" ? work.publication_year : null,
    venue: null,
    doi,
    arxiv_id: null,
    paper_id: openAlexId ?? doi,
    source_links: buildSourceLinks(doi),
    download_links: [],
    open_access: null,
    citation_count: null,
    reference_count: null,
    provider: "openalex"
  };
}
