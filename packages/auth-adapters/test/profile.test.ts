import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { MemorySecretStore, ProfileAuthProvider } from "../src/index.js";

it("hydrates non-secret profiles from secret stores", async () => {
  const path = join(await mkdtemp(join(tmpdir(), "anything-profile-")), "work.json");
  await writeFile(path, JSON.stringify({ version: 1, name: "work", site: "example.com", provider: "profile:work", values: { csrf_token: { service: "anything", account: "csrf" } }, headers: { authorization: { service: "anything", account: "token" } } }));
  const provider = await ProfileAuthProvider.load(path, new MemorySecretStore({ "anything:csrf": "csrf-secret", "anything:token": "Bearer token" }));
  const context = await provider.getAuth({ site: { id: "example", domains: ["example.com"], aliases: [] } } as never);
  expect(context).toEqual({ values: { csrf_token: "csrf-secret" }, headers: { authorization: "Bearer token" } });
});
