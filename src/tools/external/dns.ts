import { upstreamError, validationError } from "../../lib/errors";
import { createResponseMetadata } from "../../lib/response-metadata";
import type { ToolExecutionResult } from "../../mcp/result";

const DNS_GOOGLE_RESOLVE_URL = "https://dns.google/resolve";
const MAX_DNS_NAME_LENGTH = 253;
const MIN_RR_TYPE_CODE = 1;
const MAX_RR_TYPE_CODE = 65535;
const MAX_RCODE = 65535;

const RR_TYPE_BY_NAME = {
  A: 1,
  NS: 2,
  CNAME: 5,
  SOA: 6,
  PTR: 12,
  MX: 15,
  TXT: 16,
  AAAA: 28,
  SRV: 33,
  DS: 43,
  RRSIG: 46,
  NSEC: 47,
  DNSKEY: 48,
  NSEC3: 50,
  SVCB: 64,
  HTTPS: 65,
  ANY: 255,
  CAA: 257
} as const;

const RR_TYPE_BY_CODE = Object.fromEntries(
  Object.entries(RR_TYPE_BY_NAME).map(([name, code]) => [code, name])
) as Record<number, string | undefined>;

const RCODE_BY_CODE: Record<number, string | undefined> = {
  0: "NOERROR",
  1: "FORMERR",
  2: "SERVFAIL",
  3: "NXDOMAIN",
  4: "NOTIMP",
  5: "REFUSED"
};

type NormalizedQuery = {
  name: string;
  type: string;
  type_code: number;
  requestType: string;
  do: boolean;
  cd: boolean;
};

type DnsQuestion = {
  name: string;
  type: number;
  type_name: string;
};

type DnsRecord = {
  name: string;
  type: number;
  type_name: string;
  ttl: number | null;
  data: string;
};

type SectionReadResult<T> = {
  records?: T[];
  error?: string;
};

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function typeNameForCode(code: number): string {
  return RR_TYPE_BY_CODE[code] ?? `TYPE_${code}`;
}

function rcodeNameForCode(code: number): string {
  return RCODE_BY_CODE[code] ?? `RCODE_${code}`;
}

function normalizeName(value: unknown): { name?: string; error?: string } {
  if (typeof value !== "string") {
    return { error: "name must be a string" };
  }

  const name = value.trim();
  if (name === "") {
    return { error: "name must be a non-empty string" };
  }

  if (name.length > MAX_DNS_NAME_LENGTH) {
    return { error: `name must be ${MAX_DNS_NAME_LENGTH} characters or fewer` };
  }

  return { name };
}

function normalizeBoolean(value: unknown, field: "do" | "cd"): { value?: boolean; error?: string } {
  if (value === undefined) {
    return { value: false };
  }

  if (typeof value !== "boolean") {
    return { error: `${field} must be a boolean` };
  }

  return { value };
}

function normalizeType(value: unknown): { type?: string; typeCode?: number; requestType?: string; error?: string } {
  if (value === undefined) {
    return { type: "A", typeCode: 1, requestType: "A" };
  }

  if (typeof value === "number") {
    if (!Number.isSafeInteger(value) || value < MIN_RR_TYPE_CODE || value > MAX_RR_TYPE_CODE) {
      return { error: "type must be an integer between 1 and 65535" };
    }

    return { type: typeNameForCode(value), typeCode: value, requestType: String(value) };
  }

  if (typeof value !== "string") {
    return { error: "type must be a DNS RR type name or integer between 1 and 65535" };
  }

  const trimmed = value.trim();
  if (/^[0-9]+$/.test(trimmed)) {
    const typeCode = Number(trimmed);
    if (!Number.isSafeInteger(typeCode) || typeCode < MIN_RR_TYPE_CODE || typeCode > MAX_RR_TYPE_CODE) {
      return { error: "type must be an integer between 1 and 65535" };
    }

    return { type: typeNameForCode(typeCode), typeCode, requestType: String(typeCode) };
  }

  const upper = trimmed.toUpperCase();
  const typeCode = RR_TYPE_BY_NAME[upper as keyof typeof RR_TYPE_BY_NAME];
  if (typeCode === undefined) {
    return { error: "type must be a supported DNS RR type name or integer between 1 and 65535" };
  }

  return { type: upper, typeCode, requestType: upper };
}

function normalizeQuery(args: unknown): { query?: NormalizedQuery; error?: string } {
  const input = isObject(args) ? args : {};

  const name = normalizeName(input.name);
  if (name.error) return { error: name.error };

  const type = normalizeType(input.type);
  if (type.error) return { error: type.error };

  const dnssecOk = normalizeBoolean(input.do, "do");
  if (dnssecOk.error) return { error: dnssecOk.error };

  const checkingDisabled = normalizeBoolean(input.cd, "cd");
  if (checkingDisabled.error) return { error: checkingDisabled.error };

  return {
    query: {
      name: name.name!,
      type: type.type!,
      type_code: type.typeCode!,
      requestType: type.requestType!,
      do: dnssecOk.value!,
      cd: checkingDisabled.value!
    }
  };
}

function buildDnsGoogleUrl(query: NormalizedQuery): string {
  const url = new URL(DNS_GOOGLE_RESOLVE_URL);
  url.searchParams.set("name", query.name);
  url.searchParams.set("type", query.requestType);
  if (query.do) url.searchParams.set("do", "true");
  if (query.cd) url.searchParams.set("cd", "true");
  return url.toString();
}

function isValidStatus(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= MAX_RCODE;
}

function readSection(value: unknown, sectionName: string): { items?: unknown[]; error?: string } {
  if (value === undefined) {
    return { items: [] };
  }

  if (!Array.isArray(value)) {
    return { error: `${sectionName} must be an array when present` };
  }

  return { items: value };
}

function normalizeQuestions(value: unknown): SectionReadResult<DnsQuestion> {
  const section = readSection(value, "Question");
  if (section.error) return { error: section.error };

  const records: DnsQuestion[] = [];
  for (const item of section.items!) {
    if (!isObject(item) || !Number.isInteger(item.type)) {
      continue;
    }

    records.push({
      name: typeof item.name === "string" ? item.name : "",
      type: item.type,
      type_name: typeNameForCode(item.type)
    });
  }

  return { records };
}

function normalizeRecord(item: unknown): DnsRecord | undefined {
  if (!isObject(item) || !Number.isInteger(item.type) || typeof item.data !== "string") {
    return undefined;
  }

  return {
    name: typeof item.name === "string" ? item.name : "",
    type: item.type,
    type_name: typeNameForCode(item.type),
    ttl: typeof item.TTL === "number" ? item.TTL : null,
    data: item.data
  };
}

function normalizeRecords(value: unknown, sectionName: string): SectionReadResult<DnsRecord> {
  const section = readSection(value, sectionName);
  if (section.error) return { error: section.error };

  const records: DnsRecord[] = [];
  for (const item of section.items!) {
    const record = normalizeRecord(item);
    if (record) records.push(record);
  }

  return { records };
}

function normalizeDnsResponse(raw: unknown, query: NormalizedQuery): ToolExecutionResult {
  if (!isObject(raw)) {
    return upstreamError("Google Public DNS returned an invalid response shape");
  }

  if (!isValidStatus(raw.Status)) {
    return upstreamError("Google Public DNS response is missing a valid numeric Status");
  }

  const question = normalizeQuestions(raw.Question);
  if (question.error) return upstreamError(`Google Public DNS returned invalid Question: ${question.error}`);

  const answer = normalizeRecords(raw.Answer, "Answer");
  if (answer.error) return upstreamError(`Google Public DNS returned invalid Answer: ${answer.error}`);

  const authority = normalizeRecords(raw.Authority, "Authority");
  if (authority.error) return upstreamError(`Google Public DNS returned invalid Authority: ${authority.error}`);

  const additional = normalizeRecords(raw.Additional, "Additional");
  if (additional.error) return upstreamError(`Google Public DNS returned invalid Additional: ${additional.error}`);

  return {
    ok: true,
    data: {
      query: {
        name: query.name,
        type: query.type,
        type_code: query.type_code,
        do: query.do,
        cd: query.cd
      },
      status: {
        code: raw.Status,
        name: rcodeNameForCode(raw.Status)
      },
      flags: {
        truncated: raw.TC === true,
        recursion_desired: raw.RD === true,
        recursion_available: raw.RA === true,
        authenticated_data: raw.AD === true,
        checking_disabled: raw.CD === true
      },
      question: question.records!,
      answer: answer.records!,
      authority: authority.records!,
      additional: additional.records!,
      comment: typeof raw.Comment === "string" ? raw.Comment : null,
      ...createResponseMetadata({ providerUsed: "dns.google", cached: false, partial: false })
    }
  };
}

export async function handleDnsQuery(args: unknown): Promise<ToolExecutionResult> {
  const normalized = normalizeQuery(args);
  if (normalized.error) {
    return validationError(normalized.error);
  }

  const query = normalized.query!;
  let response: Response;
  try {
    response = await fetch(buildDnsGoogleUrl(query));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return upstreamError(`Google Public DNS request failed: ${message}`);
  }

  if (!response.ok) {
    return upstreamError(
      `Google Public DNS returned ${response.status}: ${await response.text()}`,
      response.status
    );
  }

  let data: unknown;
  try {
    data = await response.json();
  } catch {
    return upstreamError("Google Public DNS returned invalid JSON");
  }

  return normalizeDnsResponse(data, query);
}
