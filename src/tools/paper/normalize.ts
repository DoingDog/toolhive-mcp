import type { NormalizedPaper } from "./types";

function normalizeText(value: string | null): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalizedValue = value.trim();
  return normalizedValue.length > 0 ? normalizedValue : null;
}

function normalizeDoi(doi: string | null): string | null {
  const normalizedDoi = normalizeText(doi);
  if (normalizedDoi === null) {
    return null;
  }

  return normalizedDoi.replace(/^https?:\/\/doi\.org\//i, "").toLowerCase();
}

function normalizeArxivId(arxivId: string | null): string | null {
  const normalizedArxivId = normalizeText(arxivId);
  if (normalizedArxivId === null) {
    return null;
  }

  return normalizedArxivId.replace(/v\d+$/i, "").toLowerCase();
}

function normalizeKeyPart(value: string | null): string | null {
  const normalizedValue = normalizeText(value)?.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  return normalizedValue && normalizedValue.length > 0 ? normalizedValue : null;
}

function buildFallbackKey(paper: NormalizedPaper): string | null {
  const normalizedTitle = normalizeKeyPart(paper.title);
  const normalizedFirstAuthor = normalizeKeyPart(paper.authors[0] ?? null);

  if (normalizedTitle === null || paper.year === null || normalizedFirstAuthor === null) {
    return null;
  }

  return `${normalizedTitle}::${paper.year}::${normalizedFirstAuthor}`;
}

function getMergeKey(paper: NormalizedPaper, index: number): string {
  const doi = normalizeDoi(paper.doi);
  if (doi !== null) {
    return `doi:${doi}`;
  }

  const arxivId = normalizeArxivId(paper.arxiv_id);
  if (arxivId !== null) {
    return `arxiv:${arxivId}`;
  }

  const fallbackKey = buildFallbackKey(paper);
  if (fallbackKey !== null) {
    return `fallback:${fallbackKey}`;
  }

  return `unique:${index}`;
}

function countTitleCaseWords(value: string): number {
  return value.split(/\s+/).filter((word) => /^[A-Z]/.test(word)).length;
}

function chooseBetterString(current: string | null, candidate: string | null): string | null {
  const normalizedCurrent = normalizeText(current);
  const normalizedCandidate = normalizeText(candidate);

  if (normalizedCurrent === null) {
    return normalizedCandidate;
  }

  if (normalizedCandidate === null) {
    return normalizedCurrent;
  }

  const currentKey = normalizeKeyPart(normalizedCurrent);
  const candidateKey = normalizeKeyPart(normalizedCandidate);
  if (currentKey !== null && currentKey === candidateKey) {
    return countTitleCaseWords(normalizedCandidate) > countTitleCaseWords(normalizedCurrent)
      ? normalizedCandidate
      : normalizedCurrent;
  }

  return normalizedCandidate.length > normalizedCurrent.length ? normalizedCandidate : normalizedCurrent;
}

function isGarbageVenue(value: string | null): boolean {
  const normalizedValue = normalizeText(value);
  if (normalizedValue === null) {
    return false;
  }

  return /^\d{4,}(?:[ ._-]?\d{4,})+$/.test(normalizedValue);
}

function scoreAuthors(authors: string[]): number {
  const normalizedAuthors = authors
    .map((author) => author.trim())
    .filter((author) => author.length > 0);

  return normalizedAuthors.length * 100
    + normalizedAuthors.reduce((total, author) => total + author.split(/\s+/).filter((token) => token.length > 0).length, 0);
}

function chooseBetterAuthors(current: string[], candidate: string[]): string[] {
  const normalizedCurrent = current.map((author) => author.trim()).filter((author) => author.length > 0);
  const normalizedCandidate = candidate.map((author) => author.trim()).filter((author) => author.length > 0);

  return scoreAuthors(normalizedCandidate) > scoreAuthors(normalizedCurrent) ? normalizedCandidate : normalizedCurrent;
}

function chooseBetterVenue(current: string | null, candidate: string | null): string | null {
  const normalizedCurrent = normalizeText(current);
  const normalizedCandidate = normalizeText(candidate);

  if (normalizedCurrent === null) {
    return normalizedCandidate;
  }

  if (normalizedCandidate === null) {
    return normalizedCurrent;
  }

  const currentIsGarbage = isGarbageVenue(normalizedCurrent);
  const candidateIsGarbage = isGarbageVenue(normalizedCandidate);

  if (currentIsGarbage !== candidateIsGarbage) {
    return currentIsGarbage ? normalizedCandidate : normalizedCurrent;
  }

  return chooseBetterString(normalizedCurrent, normalizedCandidate);
}

function chooseBetterNumber(current: number | null, candidate: number | null): number | null {
  if (current === null) {
    return candidate;
  }

  return candidate ?? current;
}

function chooseBetterBoolean(current: boolean | null, candidate: boolean | null): boolean | null {
  if (current === null) {
    return candidate;
  }

  return candidate ?? current;
}

function mergeLinks(current: string[], candidate: string[]): string[] {
  const merged = [...current, ...candidate]
    .map((link) => link.trim())
    .filter((link) => link.length > 0);

  return [...new Set(merged)];
}

function scorePaperCompleteness(paper: NormalizedPaper): number {
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

function scorePaperQuality(paper: NormalizedPaper): number {
  return [paper.title, paper.abstract, paper.venue]
    .map((value) => normalizeText(value)?.length ?? 0)
    .reduce((total, value) => total + value, 0);
}

function chooseProvider(current: NormalizedPaper, candidate: NormalizedPaper): NormalizedPaper["provider"] {
  const currentScore = scorePaperCompleteness(current);
  const candidateScore = scorePaperCompleteness(candidate);

  if (candidateScore !== currentScore) {
    return candidateScore > currentScore ? candidate.provider : current.provider;
  }

  return scorePaperQuality(candidate) > scorePaperQuality(current) ? candidate.provider : current.provider;
}

function mergeTwoPapers(current: NormalizedPaper, candidate: NormalizedPaper): NormalizedPaper {
  const doi = normalizeDoi(current.doi) ?? normalizeDoi(candidate.doi);
  const arxivId = normalizeArxivId(current.arxiv_id) ?? normalizeArxivId(candidate.arxiv_id);
  const currentPaperId = normalizeText(current.paper_id);
  const candidatePaperId = normalizeText(candidate.paper_id);
  const fallbackPaperId = currentPaperId ?? candidatePaperId;
  const openAlexPaperId = [currentPaperId, candidatePaperId].find((paperId) => paperId?.includes("openalex.org/W")) ?? null;

  return {
    title: chooseBetterString(current.title, candidate.title),
    authors: chooseBetterAuthors(current.authors, candidate.authors),
    abstract: chooseBetterString(current.abstract, candidate.abstract),
    year: chooseBetterNumber(current.year, candidate.year),
    venue: chooseBetterVenue(current.venue, candidate.venue),
    doi,
    arxiv_id: arxivId,
    paper_id: openAlexPaperId ?? doi ?? arxivId ?? fallbackPaperId,
    source_links: mergeLinks(current.source_links, candidate.source_links),
    download_links: mergeLinks(current.download_links, candidate.download_links),
    open_access: chooseBetterBoolean(current.open_access, candidate.open_access),
    citation_count: chooseBetterNumber(current.citation_count, candidate.citation_count),
    reference_count: chooseBetterNumber(current.reference_count, candidate.reference_count),
    provider: chooseProvider(current, candidate)
  };
}

export function mergePaperResults(papers: NormalizedPaper[]): NormalizedPaper[] {
  const mergedPapers = new Map<string, NormalizedPaper>();

  papers.forEach((paper, index) => {
    const key = getMergeKey(paper, index);
    const existingPaper = mergedPapers.get(key);

    if (!existingPaper) {
      mergedPapers.set(key, mergeTwoPapers(paper, paper));
      return;
    }

    mergedPapers.set(key, mergeTwoPapers(existingPaper, paper));
  });

  return [...mergedPapers.values()];
}
