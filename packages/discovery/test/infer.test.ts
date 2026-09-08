import { expect, it } from "vitest";
import { inferCandidateSpec, mergeSiteSpecs } from "../src/index.js";

it("turns same-origin XHR captures into redacted unverified candidates", () => {
  const spec = inferCandidateSpec(new URL("https://app.example.com/dashboard"), [{
    id: "one", startedAt: "2026-09-08T00:00:00.000Z",
    request: { method: "GET", url: "https://app.example.com/api/invoices?year=2026", resourceType: "xhr", headers: {} },
    response: { status: 200, headers: {}, contentType: "application/json", bodySample: "{}" },
  }], new Date("2026-09-08T00:00:00.000Z"));
  expect(spec.commands.get_api_invoices?.validation.status).toBe("unverified");
  expect(spec.commands.get_api_invoices?.request).toHaveProperty("query.year", "{{args.year}}");
  expect(spec.baseUrls.default).toBe("https://app.example.com");
});

it("preserves verified commands during incremental discovery", () => {
  const existing = inferCandidateSpec(new URL("https://example.com"), [{ id: "a", startedAt: "2026-09-08T00:00:00.000Z", request: { method: "GET", url: "https://example.com/api/items", resourceType: "fetch", headers: {} }, response: { status: 200, headers: {}, contentType: "application/json" } }]);
  existing.commands.get_api_items!.validation.status = "verified";
  const candidate = structuredClone(existing);
  candidate.commands.get_api_items!.description = "new unverified observation";
  expect(mergeSiteSpecs(existing, candidate).commands.get_api_items?.description).not.toBe("new unverified observation");
});

it("detects GraphQL operations and parameterizes variables", () => {
  const spec = inferCandidateSpec(new URL("https://example.com/app"), [{ id: "g", startedAt: "2026-09-08T00:00:00.000Z", request: { method: "POST", url: "https://example.com/graphql", resourceType: "fetch", headers: {}, postData: JSON.stringify({ operationName: "ListInvoices", query: "query ListInvoices($year: Int!) { invoices(year: $year) { id } }", variables: { year: 2026 } }) }, response: { status: 200, headers: {}, contentType: "application/json" } }]);
  expect(spec.commands.list_invoices?.request).toMatchObject({ kind: "graphql", variables: { year: "{{args.year}}" } });
  expect(spec.commands.list_invoices?.arguments.year.type).toBe("integer");
});

it("drops analytics and cross-site requests", () => {
  const spec = inferCandidateSpec(new URL("https://example.com"), [{ id: "x", startedAt: "2026-09-08T00:00:00.000Z", request: { method: "POST", url: "https://metrics.other.com/collect", resourceType: "fetch", headers: {} }, response: { status: 204, headers: {} } }]);
  expect(spec.commands).toEqual({});
});
