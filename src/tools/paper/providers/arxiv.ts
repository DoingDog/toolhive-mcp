import type { NormalizedPaper } from "../types";

type ArxivEntry = {
  id?: unknown;
  title?: unknown;
  summary?: unknown;
};

function normalizeText(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalizedValue = value.trim();
  return normalizedValue.length > 0 ? normalizedValue : null;
}

function normalizeArxivId(id: unknown): string | null {
  if (typeof id !== "string") {
    return null;
  }

  const normalizedId = id
    .replace(/^https?:\/\/(www\.)?arxiv\.org\/abs\//i, "")
    .replace(/v\d+$/i, "")
    .trim();

  return normalizedId.length > 0 ? normalizedId : null;
}

function normalizeYear(arxivId: string | null): number | null {
  if (!arxivId) {
    return null;
  }

  const match = arxivId.match(/^(\d{2})(\d{2})\.\d+(v\d+)?$/);
  if (!match) {
    return null;
  }

  return 2000 + Number(match[1]);
}

export function normalizeArxivEntry(entry: ArxivEntry): NormalizedPaper {
  const arxivId = normalizeArxivId(entry.id);

  return {
    title: normalizeText(entry.title),
    authors: [],
    abstract: normalizeText(entry.summary),
    year: normalizeYear(arxivId),
    venue: null,
    doi: null,
    arxiv_id: arxivId,
    paper_id: arxivId,
    source_links: arxivId === null ? [] : [`https://arxiv.org/abs/${arxivId}`],
    download_links: arxivId === null ? [] : [`https://arxiv.org/pdf/${arxivId}.pdf`],
    open_access: arxivId === null ? null : true,
    citation_count: null,
    reference_count: null,
    provider: "arxiv"
  };
}
