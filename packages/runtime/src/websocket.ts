import WebSocket from "ws";
import type { CommandSpec, SiteSpec } from "@anything-to-api/schema";
import { AnythingError } from "./errors.js";
import { getPath, resolveTemplates } from "./template.js";

type WebSocketRequest = Extract<CommandSpec["request"], { kind: "websocket" }>;

export async function executeWebSocket(spec: SiteSpec, raw: WebSocketRequest, context: Record<string, unknown>): Promise<{ data: unknown[]; status: number }> {
  const request = resolveTemplates(raw, context);
  const url = new URL(request.url, spec.baseUrls.default).href;
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url, request.protocols, { headers: request.headers });
    const results: unknown[] = [];
    const timer = setTimeout(() => { socket.close(); reject(new AnythingError(`WebSocket timed out after ${request.timeoutMs}ms`, "WEBSOCKET_TIMEOUT")); }, request.timeoutMs);
    socket.once("error", (error) => { clearTimeout(timer); reject(new AnythingError(error.message, "WEBSOCKET_ERROR", { url })); });
    socket.once("open", () => { for (const message of request.messages) socket.send(typeof message === "string" ? message : JSON.stringify(message)); });
    socket.on("message", (buffer) => {
      const text = buffer.toString();
      let value: unknown;
      try { value = JSON.parse(text); } catch { value = text; }
      if (request.response.matchPath && getPath(value, request.response.matchPath) !== request.response.equals) return;
      results.push(value);
      if (results.length >= request.response.count) { clearTimeout(timer); socket.close(); resolve({ data: results, status: 101 }); }
    });
  });
}
