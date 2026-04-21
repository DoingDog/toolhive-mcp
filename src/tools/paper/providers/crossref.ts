import type { NormalizedPaper } from "../types";

type CrossrefDateParts = {
  "date-parts"?: unknown;
};

type CrossrefWork = {
  DOI?: unknown;
  title?: unknown;
  published?: unknown;
  issued?: unknown;
  "published-print"?: unknown;
  "published-online"?: unknown;
};

type CrossrefReference = {
  DOI?: unknown;
  "article-title"?: unknown;
  year?: unknown;
  author?: unknown;
  volume?: unknown;
  "journal-title"?: unknown;
};

function normalizeDoi(doi: unknown): string | null {
  if (typeof doi !== "string") {
    return null;
  }

  const normalizedDoi = doi.replace(/^https?:\/\/doi\.org\//i, "").trim();
  return normalizedDoi.length > 0 ? normalizedDoi : null;
}

function buildSourceLinks(doi: string | null): string[] {
  return doi === null ? [] : [`https://doi.org/${doi}`];
}

function normalizeTitle(title: unknown): string | null {
  if (Array.isArray(title)) {
    const firstTitle = title.find((value): value is string => typeof value === "string" && value.trim().length > 0);
    return firstTitle?.trim() ?? null;
  }

  if (typeof title !== "string") {
    return null;
  }

  const normalizedTitle = title.trim();
  return normalizedTitle.length > 0 ? normalizedTitle : null;
}

function normalizeYear(date: unknown): number | null {
  const dateParts = (date as CrossrefDateParts | undefined)?.["date-parts"];
  if (!Array.isArray(dateParts) || !Array.isArray(dateParts[0])) {
    return null;
  }

  const year = dateParts[0][0];
  return typeof year === "number" ? year : null;
}

function normalizeReferenceYear(year: unknown): number | null {
  if (typeof year === "number" && Number.isInteger(year)) {
    return year;
  }

  if (typeof year !== "string") {
    return null;
  }

  const normalizedYear = year.trim();
  if (!/^\d{4}$/.test(normalizedYear)) {
    return null;
  }

  return Number.parseInt(normalizedYear, 10);
}

function normalizeAuthor(author: unknown): string[] {
  if (typeof author !== "string") {
    return [];
  }

  const normalizedAuthor = author.trim();
  return normalizedAuthor.length > 0 ? [normalizedAuthor] : [];
}

export function normalizeCrossrefReference(reference: CrossrefReference): NormalizedPaper | null {
  const doi = normalizeDoi(reference.DOI);
  const title = normalizeTitle(reference["article-title"]);
  const authors = normalizeAuthor(reference.author);
  const venue = normalizeTitle(reference["journal-title"]);

  if (doi === null && title === null) {
    return null;
  }

  return {
    title,
    authors,
    abstract: null,
    year: normalizeReferenceYear(reference.year),
    venue,
    doi,
    arxiv_id: null,
    paper_id: doi ?? title,
    source_links: buildSourceLinks(doi),
    download_links: [],
    open_access: null,
    citation_count: null,
    reference_count: null,
    provider: "crossref"
  };
}

export function normalizeCrossrefWork(work: CrossrefWork): NormalizedPaper {
  const doi = normalizeDoi(work.DOI);

  return {
    title: normalizeTitle(work.title),
    authors: [],
    abstract: null,
    year: normalizeYear(work.published)
      ?? normalizeYear(work.issued)
      ?? normalizeYear(work["published-print"])
      ?? normalizeYear(work["published-online"]),
    venue: null,
    doi,
    arxiv_id: null,
    paper_id: doi,
    source_links: buildSourceLinks(doi),
    download_links: [],
    open_access: null,
    citation_count: null,
    reference_count: null,
    provider: "crossref"
  };
}
