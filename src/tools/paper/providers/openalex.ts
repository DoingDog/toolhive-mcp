import type { NormalizedPaper } from "../types";

type OpenAlexAuthorship = {
  author?: {
    display_name?: unknown;
  };
};

type OpenAlexPrimaryLocation = {
  source?: {
    display_name?: unknown;
  };
};

type OpenAlexHostVenue = {
  display_name?: unknown;
};

type OpenAlexWork = {
  id?: unknown;
  doi?: unknown;
  title?: unknown;
  publication_year?: unknown;
  authorships?: unknown;
  primary_location?: unknown;
  host_venue?: unknown;
  abstract_inverted_index?: unknown;
  cited_by_count?: unknown;
  referenced_works_count?: unknown;
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

function normalizeOpenAlexAuthors(authorships: unknown): string[] {
  if (!Array.isArray(authorships)) {
    return [];
  }

  return authorships
    .map((authorship) => {
      const displayName = (authorship as OpenAlexAuthorship | undefined)?.author?.display_name;
      return typeof displayName === "string" ? displayName.trim() : "";
    })
    .filter((displayName) => displayName.length > 0);
}

function normalizeOpenAlexAbstract(abstractInvertedIndex: unknown): string | null {
  if (abstractInvertedIndex === null || typeof abstractInvertedIndex !== "object" || Array.isArray(abstractInvertedIndex)) {
    return null;
  }

  const entries: Array<[number, string]> = [];
  for (const [token, positions] of Object.entries(abstractInvertedIndex)) {
    if (!Array.isArray(positions)) {
      continue;
    }

    for (const position of positions) {
      if (typeof position === "number" && Number.isInteger(position)) {
        entries.push([position, token]);
      }
    }
  }

  if (entries.length === 0) {
    return null;
  }

  return entries
    .sort((left, right) => left[0] - right[0])
    .map(([, token]) => token)
    .join(" ");
}

function normalizeOpenAlexVenue(primaryLocation: unknown, hostVenue: unknown): string | null {
  const primaryVenue = (primaryLocation as OpenAlexPrimaryLocation | undefined)?.source?.display_name;
  if (typeof primaryVenue === "string" && primaryVenue.trim().length > 0) {
    return primaryVenue.trim();
  }

  const fallbackVenue = (hostVenue as OpenAlexHostVenue | undefined)?.display_name;
  return typeof fallbackVenue === "string" && fallbackVenue.trim().length > 0 ? fallbackVenue.trim() : null;
}

function normalizeCount(count: unknown): number | null {
  return typeof count === "number" && Number.isFinite(count) ? count : null;
}

export function normalizeOpenAlexWork(work: OpenAlexWork): NormalizedPaper {
  const doi = normalizeDoi(work.doi);
  const openAlexId = normalizeOpenAlexId(work.id);

  return {
    title: normalizeTitle(work.title),
    authors: normalizeOpenAlexAuthors(work.authorships),
    abstract: normalizeOpenAlexAbstract(work.abstract_inverted_index),
    year: typeof work.publication_year === "number" ? work.publication_year : null,
    venue: normalizeOpenAlexVenue(work.primary_location, work.host_venue),
    doi,
    arxiv_id: null,
    paper_id: openAlexId ?? doi,
    source_links: buildSourceLinks(doi),
    download_links: [],
    open_access: null,
    citation_count: normalizeCount(work.cited_by_count),
    reference_count: normalizeCount(work.referenced_works_count),
    provider: "openalex"
  };
}
