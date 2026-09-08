import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, expect, it } from "vitest";
import { WebSocketServer } from "ws";
import { Anything } from "../src/index.js";

let server: WebSocketServer;
let port: number;
beforeAll(async () => {
  server = new WebSocketServer({ port: 0 });
  await new Promise<void>((done) => server.once("listening", done));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("unexpected address");
  port = address.port;
  server.on("connection", (socket) => socket.on("message", (message) => socket.send(JSON.stringify({ type: "reply", echo: JSON.parse(message.toString()) }))));
});
afterAll(() => new Promise<void>((done) => server.close(() => done())));

it("executes WebSocket request/response commands", async () => {
  const root = await mkdtemp(join(tmpdir(), "anything-ws-"));
  const stamp = "2026-09-08T00:00:00.000Z";
  await writeFile(join(root, "site.json"), JSON.stringify({ specVersion: "1.1", site: { id: "socket", name: "Socket", domains: ["localhost"], aliases: [], createdAt: stamp, updatedAt: stamp }, baseUrls: { default: `http://localhost:${port}` }, auth: { required: false, provider: "none", requirements: [] }, commands: { ping: { description: "Ping socket", sideEffect: "read", arguments: { value: { type: "string", required: true } }, request: { kind: "websocket", url: `ws://localhost:${port}`, messages: [{ action: "ping", value: "{{args.value}}" }], response: { count: 1, matchPath: "type", equals: "reply" }, timeoutMs: 2000 }, output: { type: "json" }, validation: { status: "verified" } } }, discovery: { sourceUrl: `http://localhost:${port}`, learnedAt: stamp } }));
  const result = await new Anything({ paths: [root] }).call<Array<{ echo: { value: string } }>>("socket", "ping", { value: "hello" });
  expect(result.data[0]?.echo.value).toBe("hello");
});
