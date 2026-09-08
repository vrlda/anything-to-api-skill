import { expect, it } from "vitest";
import { toOpenApi, toTypeScriptSdk } from "../src/index.js";
const spec = { specVersion: "1.0", site: { id: "demo", name: "Demo" }, baseUrls: { default: "https://example.com" }, commands: { get_invoice: { description: "Get invoice", sideEffect: "read", arguments: { id: { type: "string", required: true } }, request: { kind: "http", method: "GET", url: "/invoices/{{args.id}}" }, output: { type: "json" }, validation: { status: "verified" } } } } as never;
it("exports HTTP commands as OpenAPI operations", () => expect(toOpenApi(spec)).toHaveProperty("paths./invoices/{id}.get.operationId", "get_invoice"));
it("generates typed TypeScript wrapper", () => expect(toTypeScriptSdk(spec)).toContain("get_invoice(args: { \"id\": string })"));
