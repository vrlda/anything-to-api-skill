import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { BrowserSessionAuthProvider, PlaywrightBrowserExecutor, redactHeaders, redactPayload, sanitizeUrl } from "../src/index.js";

it("redacts captured credentials", () => expect(redactHeaders({ authorization: "Bearer secret", accept: "json" })).toEqual({ authorization: "{{redacted}}", accept: "json" }));
it("redacts URL and nested body secrets", () => {
  expect(sanitizeUrl("https://example.com/api?access_token=secret&page=2")).toBe("https://example.com/api?access_token=%7B%7Bredacted%7D%7D&page=2");
  expect(redactPayload(JSON.stringify({ profile: { name: "Ada", password: "secret" } }))).toBe('{"profile":{"name":"Ada","password":"{{redacted}}"}}');
});

it("executes structured browser fallback steps", async () => {
  let filled = "";
  const locator = { click: async () => undefined, fill: async (value: string) => { filled = value; }, selectOption: async () => undefined, press: async () => undefined, waitFor: async () => undefined, textContent: async () => "Result", inputValue: async () => filled, getAttribute: async () => null };
  const page = { context: () => ({ setExtraHTTPHeaders: async () => undefined }), goto: async () => undefined, locator: () => locator, keyboard: { press: async () => undefined } } as never;
  const executor = new PlaywrightBrowserExecutor({ page });
  const result = await executor.execute({ site: { id: "demo" }, baseUrls: { default: "https://example.com" } } as never, "search", { request: { kind: "browser", steps: [{ action: "fill", selector: "#q", value: "{{args.query}}" }, { action: "extract", selector: "#result", property: "text", as: "result" }] } } as never, { query: "hello" }, {}, {}, {});
  expect(result.data).toEqual({ result: "Result" });
  expect(filled).toBe("hello");
});
it("loads domain-scoped browser cookies without persisting them in specs", async () => {
  const path = join(await mkdtemp(join(tmpdir(), "anything-browser-")), "state.json");
  await writeFile(path, JSON.stringify({ cookies: [{ name: "session", value: "secret", domain: ".example.com" }, { name: "other", value: "no", domain: ".other.com" }], origins: [] }));
  const provider = new BrowserSessionAuthProvider({ storageStatePath: path });
  const auth = await provider.getAuth({ site: { domains: ["example.com"] } } as never);
  expect(auth.headers?.cookie).toBe("session=secret");
  expect(await auth.headersForUrl?.(new URL("https://notexample.com/"))).toEqual({});
  expect(await auth.headersForUrl?.(new URL("https://api.example.com/"))).toEqual({ cookie: "session=secret" });
});
