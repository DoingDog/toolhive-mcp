export type PaperProvider = "arxiv" | "crossref" | "openalex" | "pubmed" | "unpaywall";

export type NormalizedPaper = {
  title: string | null;
  authors: string[];
  abstract: string | null;
  year: number | null;
  venue: string | null;
  doi: string | null;
  arxiv_id: string | null;
  paper_id: string | null;
  source_links: string[];
  download_links: string[];
  open_access: boolean | null;
  citation_count: number | null;
  reference_count: number | null;
  provider: Extract<PaperProvider, "arxiv" | "crossref" | "openalex" | "pubmed">;
};

export type PaperRecord = {
  doi: string;
  open_access: boolean;
  provider: Extract<PaperProvider, "unpaywall">;
  download_links: string[];
};

export type PaperLookupResult = {
  ok: true;
  data: PaperRecord;
} | {
  ok: false;
  error: {
    type: "validation_error" | "config_error" | "upstream_error" | "internal_error";
    message: string;
    details?: unknown;
  };
};
