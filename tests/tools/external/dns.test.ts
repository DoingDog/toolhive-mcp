import { afterEach, describe, expect, it, vi } from "vitest";
import { handleDnsQuery } from "../../../src/tools/external/dns";

const RR_TYPE_CASES = [
  ["A", 1],
  ["NS", 2],
  ["CNAME", 5],
  ["SOA", 6],
  ["PTR", 12],
  ["MX", 15],
  ["TXT", 16],
  ["AAAA", 28],
  ["SRV", 33],
  ["DS", 43],
  ["RRSIG", 46],
  ["NSEC", 47],
  ["DNSKEY", 48],
  ["NSEC3", 50],
  ["SVCB", 64],
  ["HTTPS", 65],
  ["ANY", 255],
  ["CAA", 257]
] as const;

afterEach(() => {
  vi.restoreAllMocks();
});

describe("DNS query tool request handling", () => {
  it("trims name, defaults type to A, and queries dns.google", async () => {
    const fetchMock = vi.fn(async () =>
      Response.json({
        Status: 0,
        Question: [{ name: "example.com.", type: 1 }]
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await handleDnsQuery({ name: " example.com " });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected DNS query to succeed");
    expect(result.data).toEqual(
      expect.objectContaining({
        query: {
          name: "example.com",
          type: "A",
          type_code: 1,
          do: false,
          cd: false
        },
        provider_used: "dns.google",
        cached: false,
        partial: false
      })
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://dns.google/resolve?name=example.com&type=A",
      expect.objectContaining({ signal: expect.any(AbortSignal) })
    );
  });

  it("passes named type and DNSSEC flags to dns.google", async () => {
    const fetchMock = vi.fn(async () => Response.json({ Status: 0 }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await handleDnsQuery({
      name: "example.com",
      type: " mx ",
      do: true,
      cd: true
    });

    expect(result.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://dns.google/resolve?name=example.com&type=MX&do=true&cd=true",
      expect.objectContaining({ signal: expect.any(AbortSignal) })
    );
  });

  it.each(RR_TYPE_CASES)("normalizes named RR type %s", async (typeName, typeCode) => {
    const fetchMock = vi.fn(async () => Response.json({ Status: 0 }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await handleDnsQuery({ name: "example.com", type: typeName.toLowerCase() });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(`expected ${typeName} DNS query to succeed`);
    expect(result.data).toEqual(
      expect.objectContaining({
        query: expect.objectContaining({
          type: typeName,
          type_code: typeCode
        })
      })
    );
    expect(fetchMock).toHaveBeenCalledWith(
      `https://dns.google/resolve?name=example.com&type=${typeName}`,
      expect.objectContaining({ signal: expect.any(AbortSignal) })
    );
  });

  it("accepts integer and decimal-string RR type codes", async () => {
    const fetchMock = vi.fn(async () => Response.json({ Status: 0 }));
    vi.stubGlobal("fetch", fetchMock);

    const integerResult = await handleDnsQuery({ name: "example.com", type: 65 });
    const stringResult = await handleDnsQuery({ name: "example.com", type: "65400" });
    const leadingZeroResult = await handleDnsQuery({ name: "example.com", type: "001" });

    expect(integerResult.ok).toBe(true);
    expect(stringResult.ok).toBe(true);
    expect(leadingZeroResult.ok).toBe(true);

    if (!integerResult.ok || !stringResult.ok || !leadingZeroResult.ok) {
      throw new Error("expected numeric DNS type queries to succeed");
    }

    expect(integerResult.data).toEqual(expect.objectContaining({ query: expect.objectContaining({ type: "HTTPS", type_code: 65 }) }));
    expect(stringResult.data).toEqual(expect.objectContaining({ query: expect.objectContaining({ type: "TYPE_65400", type_code: 65400 }) }));
    expect(leadingZeroResult.data).toEqual(expect.objectContaining({ query: expect.objectContaining({ type: "A", type_code: 1 }) }));
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "https://dns.google/resolve?name=example.com&type=65",
      expect.objectContaining({ signal: expect.any(AbortSignal) })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "https://dns.google/resolve?name=example.com&type=65400",
      expect.objectContaining({ signal: expect.any(AbortSignal) })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      "https://dns.google/resolve?name=example.com&type=1",
      expect.objectContaining({ signal: expect.any(AbortSignal) })
    );
  });

  it("rejects invalid DNS query arguments before fetch", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const invalidInputs: unknown[] = [
      {},
      { name: "" },
      { name: "   " },
      { name: 123 },
      { name: "a".repeat(254) },
      { name: "example.com", type: "NO_SUCH_TYPE" },
      { name: "example.com", type: "+65" },
      { name: "example.com", type: "65.0" },
      { name: "example.com", type: "1e2" },
      { name: "example.com", type: "65 66" },
      { name: "example.com", type: "" },
      { name: "example.com", type: "-1" },
      { name: "example.com", type: 0 },
      { name: "example.com", type: 65536 },
      { name: "example.com", type: 65.5 },
      { name: "example.com", type: Number.NaN },
      { name: "example.com", type: Number.POSITIVE_INFINITY },
      { name: "example.com", do: "true" },
      { name: "example.com", cd: 1 },
      { name: "example.com", do: null },
      { name: "example.com", cd: {} }
    ];

    for (const input of invalidInputs) {
      const result = await handleDnsQuery(input);
      expect(result.ok).toBe(false);
      if (result.ok) throw new Error(`expected validation failure for ${JSON.stringify(input)}`);
      expect(result.error.type).toBe("validation_error");
    }

    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("DNS query tool response normalization", () => {
  it("normalizes DNS response flags, questions, answers, authority, and additional records", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          Status: 0,
          TC: false,
          RD: true,
          RA: true,
          AD: true,
          CD: false,
          Question: [{ name: "example.com.", type: 1 }],
          Answer: [
            { name: "example.com.", type: 1, TTL: 300, data: "93.184.216.34" },
            { name: "broken.example.", type: 1, TTL: 300 },
            "not-a-record"
          ],
          Authority: [{ name: "example.com.", type: 6, TTL: "not-a-number", data: "ns.example. hostmaster.example. 1 2 3 4 5" }],
          Additional: [{ name: "ns.example.com.", type: 28, TTL: 60, data: "2001:db8::1" }],
          Comment: "ok"
        })
      )
    );

    const result = await handleDnsQuery({ name: "example.com", type: "A" });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected DNS query to succeed");
    expect(result.data).toMatchObject({
      status: { code: 0, name: "NOERROR" },
      flags: {
        truncated: false,
        recursion_desired: true,
        recursion_available: true,
        authenticated_data: true,
        checking_disabled: false
      },
      question: [{ name: "example.com.", type: 1, type_name: "A" }],
      answer: [{ name: "example.com.", type: 1, type_name: "A", ttl: 300, data: "93.184.216.34" }],
      authority: [{ name: "example.com.", type: 6, type_name: "SOA", ttl: null, data: "ns.example. hostmaster.example. 1 2 3 4 5" }],
      additional: [{ name: "ns.example.com.", type: 28, type_name: "AAAA", ttl: 60, data: "2001:db8::1" }],
      comment: "ok"
    });
  });

  it("returns ok true for NXDOMAIN DNS status", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          Status: 3,
          Question: [{ name: "nonexistent-dns-query-smoke.invalid.", type: 1 }],
          Authority: [{ name: "invalid.", type: 6, TTL: 86400, data: "localhost. nobody.invalid. 1 3600 1200 604800 10800" }],
          Comment: "name does not exist"
        })
      )
    );

    const result = await handleDnsQuery({ name: "nonexistent-dns-query-smoke.invalid", type: "A" });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected NXDOMAIN to be a successful tool result");
    expect(result.data).toEqual(
      expect.objectContaining({
        status: { code: 3, name: "NXDOMAIN" },
        answer: [],
        comment: "name does not exist"
      })
    );
  });

  it("treats invalid top-level DNS JSON shapes as upstream errors", async () => {
    const cases: unknown[] = [
      null,
      [],
      { Status: "0" },
      { Status: 1.5 },
      { Status: -1 },
      { Status: 65536 },
      { Status: 0, Question: {} },
      { Status: 0, Answer: {} },
      { Status: 0, Authority: {} },
      { Status: 0, Additional: {} }
    ];

    for (const payload of cases) {
      vi.stubGlobal("fetch", vi.fn(async () => Response.json(payload)));
      const result = await handleDnsQuery({ name: "example.com" });
      expect(result.ok).toBe(false);
      if (result.ok) throw new Error(`expected upstream error for ${JSON.stringify(payload)}`);
      expect(result.error.type).toBe("upstream_error");
    }
  });

  it("returns upstream_error for HTTP and JSON failures", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("server exploded", { status: 502 })));
    const httpResult = await handleDnsQuery({ name: "example.com" });

    expect(httpResult).toEqual({
      ok: false,
      error: expect.objectContaining({
        type: "upstream_error",
        message: "Google Public DNS returned 502: server exploded"
      })
    });

    vi.stubGlobal("fetch", vi.fn(async () => new Response("not-json", { status: 200 })));
    const jsonResult = await handleDnsQuery({ name: "example.com" });

    expect(jsonResult).toEqual({
      ok: false,
      error: expect.objectContaining({
        type: "upstream_error",
        message: "Google Public DNS returned invalid JSON"
      })
    });
  });

  it("returns upstream_error when fetch rejects", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => {
      throw new Error("network down");
    }));

    const result = await handleDnsQuery({ name: "example.com" });

    expect(result).toEqual({
      ok: false,
      error: expect.objectContaining({
        type: "upstream_error",
        message: "network down"
      })
    });
  });
});

describe("DNS query tool record parsers", () => {
  it("adds parsed data for A, AAAA, MX, TXT, and CAA records", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          Status: 0,
          Answer: [
            { name: "example.com.", type: 1, TTL: 300, data: "93.184.216.34" },
            { name: "example.com.", type: 28, TTL: 300, data: "2606:2800:220:1:248:1893:25c8:1946" },
            { name: "example.com.", type: 15, TTL: 300, data: "10 mail.example.com." },
            { name: "example.com.", type: 16, TTL: 300, data: "\"hello\" \"world\"" },
            { name: "example.com.", type: 16, TTL: 300, data: "\"escaped \\\"quote\\\" and \\\\ slash\"" },
            { name: "example.com.", type: 257, TTL: 300, data: "0 issue \"letsencrypt.org\"" },
            { name: "example.com.", type: 257, TTL: 300, data: "0 iodef \"mailto:security team@example.com\"" },
            { name: "example.com.", type: 257, TTL: 300, data: "0 issuewild sectigo.com" }
          ],
          Authority: [{ name: "example.com.", type: 15, TTL: 300, data: "20 backup.example.com." }],
          Additional: [{ name: "example.com.", type: 1, TTL: 60, data: "192.0.2.10" }]
        })
      )
    );

    const result = await handleDnsQuery({ name: "example.com", type: "A" });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected DNS query to succeed");
    expect(result.data).toMatchObject({
      answer: [
        expect.objectContaining({ parsed: { address: "93.184.216.34" } }),
        expect.objectContaining({ parsed: { address: "2606:2800:220:1:248:1893:25c8:1946" } }),
        expect.objectContaining({ parsed: { preference: 10, exchange: "mail.example.com." } }),
        expect.objectContaining({ parsed: { text: "helloworld", strings: ["hello", "world"] } }),
        expect.objectContaining({ parsed: { text: "escaped \"quote\" and \\ slash", strings: ["escaped \"quote\" and \\ slash"] } }),
        expect.objectContaining({ parsed: { flags: 0, tag: "issue", value: "letsencrypt.org" } }),
        expect.objectContaining({ parsed: { flags: 0, tag: "iodef", value: "mailto:security team@example.com" } }),
        expect.objectContaining({ parsed: { flags: 0, tag: "issuewild", value: "sectigo.com" } })
      ],
      authority: [expect.objectContaining({ parsed: { preference: 20, exchange: "backup.example.com." } })],
      additional: [expect.objectContaining({ parsed: { address: "192.0.2.10" } })]
    });
  });

  it("omits parsed when records are unsupported or parsing fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          Status: 0,
          Answer: [
            { name: "example.com.", type: 2, TTL: 300, data: "ns1.example.com." },
            { name: "example.com.", type: 15, TTL: 300, data: "mail.example.com." },
            { name: "example.com.", type: 16, TTL: 300, data: "\"unterminated" },
            { name: "example.com.", type: 257, TTL: 300, data: "999 issue \"letsencrypt.org\"" },
            { name: "example.com.", type: 257, TTL: 300, data: "0 issue \"\"" }
          ]
        })
      )
    );

    const result = await handleDnsQuery({ name: "example.com" });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected DNS query to succeed");
    const data = result.data as { answer: Array<Record<string, unknown>> };
    const records = data.answer;
    expect(records[0]).not.toHaveProperty("parsed");
    expect(records[1]).not.toHaveProperty("parsed");
    expect(records[2]).toEqual(expect.objectContaining({ parsed: { text: "\"unterminated", strings: ["\"unterminated"] } }));
    expect(records[3]).not.toHaveProperty("parsed");
    expect(records[4]).not.toHaveProperty("parsed");
  });
});
