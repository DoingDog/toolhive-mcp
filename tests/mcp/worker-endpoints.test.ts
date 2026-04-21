import { describe, expect, it } from "vitest";
import packageJson from "../../package.json";
import worker from "../../src/worker";

const env = {};
const ctx = { waitUntil() {}, passThroughOnException() {} } as unknown as ExecutionContext;

async function call(path: string): Promise<Response> {
  return worker.fetch(new Request(`https://example.com${path}`), env, ctx);
}

describe("worker deployment endpoints", () => {
  it("returns 200 JSON for /healthz", async () => {
    const response = await call("/healthz");
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(body).toEqual({ status: "ok" });
  });

  it("returns 200 JSON for /readyz", async () => {
    const response = await call("/readyz");
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(body).toEqual({ ready: true });
  });

  it("returns the package-backed release version from /version", async () => {
    const response = await call("/version");
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(body).toEqual({ name: packageJson.name, version: packageJson.version });
  });
});
