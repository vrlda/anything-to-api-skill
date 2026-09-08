import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it, vi } from "vitest";
import { Anything } from "@anything-to-api/runtime";
import { callWithRepair } from "../src/index.js";

it("atomically repairs and retries read commands", async () => {
  const root = await mkdtemp(join(tmpdir(), "anything-repair-"));
  const stamp = "2026-09-08T00:00:00.000Z";
  const spec = { specVersion: "1.0", site: { id: "demo", name: "Demo", domains: ["demo.local"], aliases: [], createdAt: stamp, updatedAt: stamp }, baseUrls: { default: "https://demo.local" }, auth: { required: false, provider: "none", requirements: [] }, commands: { status: { description: "Status", sideEffect: "read", arguments: {}, request: { kind: "http", method: "GET", url: "/old" }, output: { type: "json" }, validation: { status: "verified" } } }, discovery: { sourceUrl: "https://demo.local", learnedAt: stamp } } as const;
  await writeFile(join(root, "site.json"), JSON.stringify(spec));
  const fetch = vi.fn(async (input) => String(input).endsWith("/old") ? Response.json({ error: "gone" }, { status: 404 }) : Response.json({ ok: true })) as unknown as typeof globalThis.fetch;
  const anything = new Anything({ paths: [root], fetch });
  const result = await callWithRepair<{ ok: boolean }>(anything, "demo", "status", {}, async ({ site }) => ({ ...site, site: { ...site.site, updatedAt: new Date().toISOString() }, commands: { ...site.commands, status: { ...site.commands.status!, request: { kind: "http", method: "GET", url: "/new" }, validation: { status: "verified", lastSuccess: new Date().toISOString() } } } }));
  expect(result.data.ok).toBe(true);
  expect(fetch).toHaveBeenCalledTimes(2);
});
