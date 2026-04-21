import type { NormalizedPaper } from "../types";

type EuropePmcResult = {
  id?: unknown;
  doi?: unknown;
  title?: unknown;
  pubYear?: unknown;
};

function normalizeText(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalizedValue = value.trim();
  return normalizedValue.length > 0 ? normalizedValue : null;
}

function normalizeYear(value: unknown): number | null {
  if (typeof value === "number") {
    return Number.isInteger(value) ? value : null;
  }

  if (typeof value !== "string") {
    return null;
  }

  const normalizedValue = value.trim();
  if (!/^\d{4}$/.test(normalizedValue)) {
    return null;
  }

  return Number(normalizedValue);
}

export function normalizeEuropePmcResult(result: EuropePmcResult): NormalizedPaper {
  const doi = normalizeText(result.doi);
  const paperId = doi ?? normalizeText(result.id);

  return {
    title: normalizeText(result.title),
    authors: [],
    abstract: null,
    year: normalizeYear(result.pubYear),
    venue: null,
    doi,
    arxiv_id: null,
    paper_id: paperId,
    source_links: doi === null ? [] : [`https://doi.org/${doi}`],
    download_links: [],
    open_access: null,
    citation_count: null,
    reference_count: null,
    provider: "pubmed"
  };
}
