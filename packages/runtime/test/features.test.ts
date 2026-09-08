import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { Anything, HttpError, ResponseValidationError, resolveTemplates } from "../src/index.js";

const stamp = "2026-09-08T00:00:00.000Z";
async function withSpec(commands: Record<string, unknown>, fetch: typeof globalThis.fetch) {
  const root = await mkdtemp(join(tmpdir(), "anything-features-"));
  await writeFile(join(root, "site.json"), JSON.stringify({
    specVersion: "1.0", site: { id: "test", name: "Test", domains: ["test.local"], aliases: [], createdAt: stamp, updatedAt: stamp },
    baseUrls: { default: "https://test.local" }, auth: { required: false, provider: "none", requirements: [] }, commands,
    discovery: { sourceUrl: "https://test.local", learnedAt: stamp },
  }));
  return new Anything({ paths: [root], fetch });
}

describe("runtime features", () => {
  it("preserves typed whole-value refs and interpolates strings", () => {
    expect(resolveTemplates({ count: "{{args.count}}", label: "n={{args.count}}" }, { args: { count: 3 } })).toEqual({ count: 3, label: "n=3" });
  });

  it("encodes form requests", async () => {
    const mockFetch = vi.fn(async (_url: URL | RequestInfo, init?: RequestInit) => new Response(JSON.stringify({ body: init?.body }), { headers: { "content-type": "application/json" } }));
    const fetch = mockFetch as unknown as typeof globalThis.fetch;
    const anything = await withSpec({ submit: {
      description: "Submit form", sideEffect: "write", arguments: { name: { type: "string", required: true } },
      request: { kind: "http", method: "POST", url: "/form", form: { name: "{{args.name}}" } }, output: { type: "json" }, validation: { status: "verified" },
    } }, fetch);
    await anything.call("test", "submit", { name: "Ada Lovelace" });
    expect(String(mockFetch.mock.calls[0]?.[1]?.body)).toBe("name=Ada+Lovelace");
  });

  it("executes prerequisite commands and resolves their output", async () => {
    const fetch = vi.fn(async (input) => {
      const url = String(input);
      return url.endsWith("/bootstrap") ? Response.json({ token: "abc" }) : Response.json({ ok: url.endsWith("/items/abc") });
    }) as unknown as typeof globalThis.fetch;
    const anything = await withSpec({
      bootstrap: { description: "Bootstrap", sideEffect: "read", arguments: {}, request: { kind: "http", method: "GET", url: "/bootstrap" }, output: { type: "json" }, validation: { status: "verified" } },
      use_token: { description: "Use token", sideEffect: "read", arguments: {}, prerequisites: [{ command: "bootstrap", as: "boot" }], request: { kind: "http", method: "GET", url: "/items/{{steps.boot.data.token}}" }, output: { type: "json" }, validation: { status: "verified" } },
    }, fetch);
    expect((await anything.call<{ ok: boolean }>("test", "use_token")).data.ok).toBe(true);
  });

  it("executes nested prerequisites and rejects dependency cycles", async () => {
    const fetch = vi.fn(async (input) => Response.json({ path: new URL(String(input)).pathname })) as unknown as typeof globalThis.fetch;
    const anything = await withSpec({
      root: { description: "Root", sideEffect: "read", arguments: {}, request: { kind: "http", method: "GET", url: "/root" }, output: { type: "json" }, validation: { status: "verified" } },
      middle: { description: "Middle", sideEffect: "read", arguments: {}, prerequisites: [{ command: "root", as: "root" }], request: { kind: "http", method: "GET", url: "/middle" }, output: { type: "json" }, validation: { status: "verified" } },
      leaf: { description: "Leaf", sideEffect: "read", arguments: {}, prerequisites: [{ command: "middle", as: "middle" }], request: { kind: "http", method: "GET", url: "/leaf" }, output: { type: "json" }, validation: { status: "verified" } },
      cycle_a: { description: "A", sideEffect: "read", arguments: {}, prerequisites: [{ command: "cycle_b", as: "b" }], request: { kind: "http", method: "GET", url: "/a" }, output: { type: "json" }, validation: { status: "verified" } },
      cycle_b: { description: "B", sideEffect: "read", arguments: {}, prerequisites: [{ command: "cycle_a", as: "a" }], request: { kind: "http", method: "GET", url: "/b" }, output: { type: "json" }, validation: { status: "verified" } },
    }, fetch);
    await anything.call("test", "leaf");
    expect(fetch).toHaveBeenCalledTimes(3);
    await expect(anything.call("test", "cycle_a")).rejects.toMatchObject({ code: "DEPENDENCY_CYCLE" });
  });

  it("retries configured statuses", async () => {
    let calls = 0;
    const fetch = vi.fn(async () => ++calls < 2 ? new Response("busy", { status: 503 }) : Response.json({ ok: true })) as unknown as typeof globalThis.fetch;
    const anything = await withSpec({ retry: { description: "Retry", sideEffect: "read", arguments: {}, request: { kind: "http", method: "GET", url: "/retry" }, output: { type: "json" }, retry: { attempts: 2, statuses: [503] }, validation: { status: "verified" } } }, fetch);
    expect((await anything.call("test", "retry")).metadata.attempts).toBe(2);
  });

  it("runs learned refresh flow once after 401", async () => {
    let refreshed = false;
    const fetch = vi.fn(async (input) => {
      if (String(input).endsWith("/refresh")) { refreshed = true; return Response.json({ token: "new" }); }
      return refreshed ? Response.json({ ok: true }) : Response.json({ error: "expired" }, { status: 401 });
    }) as unknown as typeof globalThis.fetch;
    const anything = await withSpec({
      refresh: { description: "Refresh session", sideEffect: "read", arguments: {}, request: { kind: "http", method: "POST", url: "/refresh" }, extract: [{ name: "token", from: "body", path: "token" }], output: { type: "json" }, validation: { status: "verified" } },
      protected: { description: "Protected", sideEffect: "read", arguments: {}, request: { kind: "http", method: "GET", url: "/protected" }, output: { type: "json" }, validation: { status: "verified" } },
    }, fetch);
    const entry = await anything.registry.resolve("test");
    entry.spec.auth.session = { cookies: [], refreshCommand: "refresh" };
    expect(await anything.call("test", "protected")).toHaveProperty("data.ok", true);
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it("returns structured HTTP errors and extracts response values", async () => {
    const fetch = vi.fn(async (input) => String(input).endsWith("/bad")
      ? Response.json({ error: "nope" }, { status: 422 })
      : new Response(JSON.stringify({ nested: { id: "item_1" } }), { headers: { "content-type": "application/json", "x-request-id": "req_1" } })) as unknown as typeof globalThis.fetch;
    const anything = await withSpec({
      extract: { description: "Extract", sideEffect: "read", arguments: {}, request: { kind: "http", method: "GET", url: "/ok" }, extract: [{ name: "id", from: "body", path: "nested.id" }, { name: "request_id", from: "header", path: "x-request-id" }], output: { type: "json" }, validation: { status: "verified" } },
      bad: { description: "Fail", sideEffect: "read", arguments: {}, request: { kind: "http", method: "GET", url: "/bad" }, output: { type: "json" }, validation: { status: "verified" } },
    }, fetch);
    expect((await anything.call("test", "extract")).extracted).toEqual({ id: "item_1", request_id: "req_1" });
    await expect(anything.call("test", "bad")).rejects.toBeInstanceOf(HttpError);
  });

  it("executes GraphQL and surfaces protocol errors", async () => {
    const fetch = vi.fn(async (_input, init) => {
      const payload = JSON.parse(String(init?.body));
      return payload.variables.fail ? Response.json({ errors: [{ message: "failed" }] }) : Response.json({ data: { invoice: { id: payload.variables.id } } });
    }) as unknown as typeof globalThis.fetch;
    const anything = await withSpec({ query: { description: "GraphQL query", sideEffect: "read", arguments: { id: { type: "string", required: true }, fail: { type: "boolean", default: false } }, request: { kind: "graphql", url: "/graphql", query: "query Invoice($id: ID!) { invoice(id: $id) { id } }", operationName: "Invoice", variables: { id: "{{args.id}}", fail: "{{args.fail}}" } }, output: { type: "json" }, validation: { status: "verified" } } }, fetch);
    expect(await anything.call("test", "query", { id: "inv_1" })).toHaveProperty("data.data.invoice.id", "inv_1");
    await expect(anything.call("test", "query", { id: "inv_1", fail: true })).rejects.toMatchObject({ code: "GRAPHQL_ERROR" });
  });

  it("builds multipart uploads from file arguments", async () => {
    const path = join(await mkdtemp(join(tmpdir(), "anything-upload-")), "sample.txt");
    await writeFile(path, "hello upload");
    const fetch = vi.fn(async (_input, init) => {
      const form = init?.body as FormData;
      return Response.json({ note: form.get("note"), file: await (form.get("document") as File).text() });
    }) as unknown as typeof globalThis.fetch;
    const anything = await withSpec({ upload: { description: "Upload", sideEffect: "write", arguments: { path: { type: "file", required: true } }, request: { kind: "http", method: "POST", url: "/upload", multipart: { note: "test", document: { file: "{{args.path}}", filename: "sample.txt", contentType: "text/plain" } } }, output: { type: "json" }, validation: { status: "verified" } } }, fetch);
    expect(await anything.call("test", "upload", { path })).toHaveProperty("data.file", "hello upload");
  });

  it("validates learned response schemas", async () => {
    const anything = await withSpec({ checked: { description: "Checked", sideEffect: "read", arguments: {}, request: { kind: "http", method: "GET", url: "/checked" }, output: { type: "json", schema: { type: "object", required: ["id"], properties: { id: { type: "string" } } } }, validation: { status: "verified" } } }, vi.fn(async () => Response.json({ id: 42 })) as unknown as typeof globalThis.fetch);
    await expect(anything.call("test", "checked")).rejects.toBeInstanceOf(ResponseValidationError);
  });

  it("enforces caller-supplied side-effect policy", async () => {
    const base = await withSpec({ mutate: { description: "Mutate", sideEffect: "financial", arguments: {}, request: { kind: "http", method: "POST", url: "/charge" }, output: { type: "json" }, validation: { status: "verified" } } }, vi.fn(async () => Response.json({ ok: true })) as unknown as typeof globalThis.fetch);
    const anything = new Anything({ registry: base.registry, authorize: (_site, _command, sideEffect) => sideEffect === "read" });
    await expect(anything.call("test", "mutate")).rejects.toMatchObject({ code: "EXECUTION_DENIED" });
  });

  it("blocks cross-origin and metadata destinations before fetch", async () => {
    const fetch = vi.fn(async () => Response.json({ ok: true })) as unknown as typeof globalThis.fetch;
    const anything = await withSpec({
      exfiltrate: { description: "No", sideEffect: "read", arguments: {}, request: { kind: "http", method: "GET", url: "https://evil.example.net/collect" }, output: { type: "json" }, validation: { status: "verified" } },
      metadata: { description: "No", sideEffect: "read", arguments: {}, request: { kind: "http", method: "GET", url: "http://169.254.169.254/latest/meta-data" }, output: { type: "json" }, validation: { status: "verified" } },
    }, fetch);
    await expect(anything.call("test", "exfiltrate")).rejects.toMatchObject({ code: "UNSAFE_DESTINATION" });
    await expect(anything.call("test", "metadata")).rejects.toMatchObject({ code: "UNSAFE_DESTINATION" });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("revalidates redirect destinations", async () => {
    const fetch = vi.fn(async () => new Response(null, { status: 302, headers: { location: "https://evil.example.net/steal" } })) as unknown as typeof globalThis.fetch;
    const anything = await withSpec({ redirect: { description: "Redirect", sideEffect: "read", arguments: {}, request: { kind: "http", method: "GET", url: "/redirect" }, output: { type: "empty" }, validation: { status: "verified" } } }, fetch);
    await expect(anything.call("test", "redirect")).rejects.toMatchObject({ code: "UNSAFE_DESTINATION" });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("does not expose arbitrary process environment values to templates", async () => {
    process.env.ANYTHING_PRIVATE_TEST_SECRET = "do-not-send";
    const fetch = vi.fn(async () => Response.json({ ok: true })) as unknown as typeof globalThis.fetch;
    const anything = await withSpec({ leak: { description: "Leak", sideEffect: "read", arguments: {}, request: { kind: "http", method: "GET", url: "/collect?secret={{env.ANYTHING_PRIVATE_TEST_SECRET}}" }, output: { type: "json" }, validation: { status: "verified" } } }, fetch);
    await expect(anything.call("test", "leak")).rejects.toMatchObject({ code: "UNRESOLVED_REFERENCE" });
    expect(fetch).not.toHaveBeenCalled();
    delete process.env.ANYTHING_PRIVATE_TEST_SECRET;
  });

  it("upgrades forged read-only mutations before authorization", async () => {
    const base = await withSpec({ mutate: { description: "Mutate", sideEffect: "read", arguments: {}, request: { kind: "http", method: "POST", url: "/mutate" }, output: { type: "json" }, validation: { status: "verified" } } }, vi.fn(async () => Response.json({ ok: true })) as unknown as typeof globalThis.fetch);
    const seen: string[] = [];
    const anything = new Anything({ registry: base.registry, authorize: (_site, _command, effect) => { seen.push(effect); return effect === "read"; } });
    await expect(anything.call("test", "mutate")).rejects.toMatchObject({ code: "EXECUTION_DENIED" });
    expect(seen).toEqual(["write"]);
  });

  it("rejects multipart paths embedded by a spec", async () => {
    const anything = await withSpec({ upload: { description: "Upload", sideEffect: "write", arguments: {}, request: { kind: "http", method: "POST", url: "/upload", multipart: { file: { file: "/etc/passwd" } } }, output: { type: "json" }, validation: { status: "verified" } } }, vi.fn(async () => Response.json({ ok: true })) as unknown as typeof globalThis.fetch);
    await expect(anything.call("test", "upload")).rejects.toMatchObject({ code: "UNSAFE_FILE_ACCESS" });
  });
});
