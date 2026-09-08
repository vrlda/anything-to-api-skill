import { access, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, expect, it } from "vitest";
import { BrowserSessionAuthProvider, chromiumExecutablePath } from "@anything-to-api/browser-adapter";
import { Anything } from "@anything-to-api/runtime";
import { createDemoServer } from "../../../examples/demo-site/src/server.js";
import { discoverWebsite } from "../src/index.js";

const chrome = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ?? chromiumExecutablePath();
const hasChrome = await access(chrome).then(() => true, () => false);
let close: () => Promise<void>;
let url: string;

beforeAll(async () => {
  const server = createDemoServer().listen(0);
  await new Promise<void>((done) => server.once("listening", done));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("No demo address");
  url = `http://127.0.0.1:${address.port}`;
  close = () => new Promise((done, reject) => server.close((error) => error ? reject(error) : done()));
});
afterAll(async () => close());

it.skipIf(!hasChrome)("captures UI traffic and replays learned request without UI", async () => {
  const root = await mkdtemp(join(tmpdir(), "anything-discover-e2e-"));
  const state = join(root, "session.json");
  const discovered = await discoverWebsite(url, {
    outputRoot: root, storageStatePath: state, executablePath: chrome, headless: true,
    waitForDone: async (page) => {
      await Promise.all([page.waitForResponse("**/login"), page.locator("#login").click()]);
      await Promise.all([page.waitForResponse("**/api/customers?page=1"), page.locator("#customers").click()]);
    },
  });
  expect(discovered.spec.commands).toHaveProperty("get_api_customers");
  const provider = new BrowserSessionAuthProvider({ storageStatePath: state });
  const result = await new Anything({ paths: [discovered.siteDirectory], authProviders: [provider] }).call<{ items: unknown[] }>(discovered.spec.site.id, "get_api_customers", { page: "1" });
  expect(result.data.items).toHaveLength(3);
}, 60_000);
