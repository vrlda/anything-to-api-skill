import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDemoServer } from "../../../examples/demo-site/src/server.js";
import { Anything, AnythingError, StaticAuthProvider } from "../src/index.js";

let root: string;
let baseUrl: string;
let close: () => Promise<void>;

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), "anything-test-"));
  const server = createDemoServer().listen(0);
  await new Promise<void>((done) => server.once("listening", done));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("No test address");
  baseUrl = `http://127.0.0.1:${address.port}`;
  close = () => new Promise((done, reject) => server.close((error) => error ? reject(error) : done()));
  const yaml = await (await import("node:fs/promises")).readFile("examples/sites/demo.local.yaml", "utf8");
  await writeFile(join(root, "demo.yaml"), yaml.replace("http://localhost:4317", baseUrl));
});

afterAll(async () => close());

function client() {
  return new Anything({
    paths: [root],
    authProviders: [new StaticAuthProvider("demo-session", {
      headers: { cookie: "demo_session=valid" }, values: { csrf_token: "demo-csrf" },
    })],
  });
}

describe("Anything runtime", () => {
  it("loads specs and resolves domain, alias, and id", async () => {
    expect((await client().sites())[0]?.site.id).toBe("demo");
    expect(await client().commands("demo.local")).toHaveProperty("list_customers");
    expect((await client().describe("localhost", "get_invoice")).sideEffect).toBe("read");
  });

  it("validates arguments and interpolates URLs", async () => {
    await expect(client().call("demo", "get_invoice", {})).rejects.toMatchObject({ code: "INVALID_ARGUMENTS" });
    const result = await client().call<{ id: string }>("demo", "get_invoice", { invoice_id: "inv_1" });
    expect(result.data.id).toBe("inv_1");
    await expect(client().call("demo", "get_invoice", { invoice_id: "x", extra: true })).rejects.toBeInstanceOf(AnythingError);
  });

  it("builds JSON bodies and supplies auth values", async () => {
    const result = await client().call<{ name: string }>("demo", "create_customer", { name: "Ada" });
    expect(result.data.name).toBe("Ada");
    expect(result.metadata.status).toBe(201);
  });

  it("follows cursor pagination and combines items", async () => {
    const result = await client().call<Array<{ id: string }>>("demo", "list_customers", { search: "Customer" });
    expect(result.data).toHaveLength(7);
    expect(result.metadata.pages).toBe(3);
  });

  it("returns file bytes", async () => {
    const result = await client().call<ArrayBuffer>("demo", "download_invoice", { invoice_id: "inv_2" });
    expect(Buffer.from(result.data).toString()).toBe("demo invoice inv_2");
  });
});
