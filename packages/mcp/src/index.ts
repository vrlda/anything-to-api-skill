import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import type { ArgumentSpec } from "@anything-to-api/schema";
import type { Anything } from "@anything-to-api/runtime";

export async function createSiteMcpServer(anything: Anything, site: string): Promise<McpServer> {
  const server = new McpServer({ name: `anything-to-api:${site}`, version: "1.1.1" });
  const commands = await anything.commands(site);
  for (const [name, command] of Object.entries(commands)) {
    const shape = Object.fromEntries(Object.entries(command.arguments).map(([argument, definition]) => [argument, argumentToZod(definition)]));
    server.registerTool(name, { description: `${command.description} [${command.sideEffect}]`, inputSchema: shape }, async (args) => {
      const result = await anything.call(site, name, args);
      if (result.data instanceof ArrayBuffer) return { content: [{ type: "text", text: JSON.stringify({ bytes: result.data.byteLength, metadata: result.metadata }) }] };
      return { content: [{ type: "text", text: JSON.stringify(result.data) }], structuredContent: { data: result.data, metadata: result.metadata } as Record<string, unknown> };
    });
  }
  return server;
}

export async function serveSiteOverStdio(anything: Anything, site: string): Promise<void> {
  const server = await createSiteMcpServer(anything, site);
  await server.connect(new StdioServerTransport());
}

function argumentToZod(argument: ArgumentSpec): z.ZodType {
  let schema: z.ZodType = argument.type === "string" ? z.string() : argument.type === "number" ? z.number() : argument.type === "integer" ? z.number().int() : argument.type === "boolean" ? z.boolean() : argument.type === "array" ? z.array(z.unknown()) : z.record(z.string(), z.unknown());
  if (argument.description) schema = schema.describe(argument.description);
  return argument.required ? schema : schema.optional();
}
