export function normalizeNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalizedValue = value.trim();
  return normalizedValue.length > 0 ? normalizedValue : null;
}

export function normalizeArxivIdentifier(value: string): string {
  return value.trim().replace(/^arxiv:/i, "").replace(/v\d+$/i, "");
}

export function looksLikeDoi(value: string): boolean {
  return /^10\.\S+\/\S+$/i.test(value.trim());
}

export function looksLikeArxivId(value: string): boolean {
  const normalizedValue = value.trim();
  return /^(?:arxiv:)?(?:\d{4}\.\d{4,5}|[a-z.-]+\/\d{7})(?:v\d+)?$/i.test(normalizedValue);
}

export type PaperInputClassification =
  | { kind: "doi"; doi: string }
  | { kind: "arxiv_id"; arxivId: string; doi?: string }
  | { kind: "text"; query: string };

export function classifyPaperInput(input: string): PaperInputClassification {
  const normalizedInput = input.trim();

  if (/^10\.48550\/arxiv\./i.test(normalizedInput)) {
    return {
      kind: "arxiv_id",
      arxivId: normalizeArxivIdentifier(normalizedInput.replace(/^10\.48550\/arxiv\./i, "")),
      doi: normalizedInput
    };
  }

  if (looksLikeArxivId(normalizedInput)) {
    return {
      kind: "arxiv_id",
      arxivId: normalizeArxivIdentifier(normalizedInput)
    };
  }

  if (looksLikeDoi(normalizedInput)) {
    return {
      kind: "doi",
      doi: normalizedInput
    };
  }

  return {
    kind: "text",
    query: normalizedInput
  };
}
