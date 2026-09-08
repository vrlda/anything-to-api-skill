import type { ArgumentSpec, CommandSpec, SiteSpec } from "@anything-to-api/schema";

export function toOpenApi(spec: SiteSpec): Record<string, unknown> {
  const paths: Record<string, Record<string, unknown>> = {};
  for (const [name, command] of Object.entries(spec.commands)) {
    if (command.request.kind !== "http") continue;
    const path = command.request.url.replace(/\{\{args\.([a-zA-Z0-9_]+)\}\}/g, "{$1}");
    if (!path.startsWith("/")) continue;
    const parameters = Object.entries(command.arguments).map(([argument, definition]) => ({ name: argument, in: path.includes(`{${argument}}`) ? "path" : "query", required: definition.required || path.includes(`{${argument}}`), schema: argumentToJsonSchema(definition) }));
    paths[path] ??= {};
    paths[path]![command.request.method.toLowerCase()] = { operationId: name, summary: command.description, "x-anything-side-effect": command.sideEffect, parameters, responses: { "2XX": { description: "Successful learned response" } } };
  }
  return { openapi: "3.1.0", info: { title: `${spec.site.name} unofficial API`, version: spec.specVersion }, servers: Object.values(spec.baseUrls).map((url) => ({ url })), paths };
}

export function toTypeScriptSdk(spec: SiteSpec, className = "SiteApi"): string {
  const methods = Object.entries(spec.commands).map(([name, command]) => renderMethod(spec.site.id, name, command)).join("\n\n");
  return `import type { Anything, CallResult } from "@anything-to-api/runtime";\n\nexport class ${className} {\n  constructor(private readonly anything: Anything) {}\n\n${methods}\n}\n`;
}

function renderMethod(site: string, name: string, command: CommandSpec): string {
  const fields = Object.entries(command.arguments).map(([arg, value]) => `${JSON.stringify(arg)}${value.required ? "" : "?"}: ${tsType(value)}`).join("; ");
  return `  /** ${command.description.replace(/\*\//g, "")} Side effect: ${command.sideEffect}. */\n  ${name}(args: { ${fields} }): Promise<CallResult> {\n    return this.anything.call(${JSON.stringify(site)}, ${JSON.stringify(name)}, args);\n  }`;
}
function tsType(argument: ArgumentSpec): string { return argument.type === "integer" || argument.type === "number" ? "number" : argument.type === "array" ? "unknown[]" : argument.type === "object" ? "Record<string, unknown>" : argument.type; }
function argumentToJsonSchema(argument: ArgumentSpec): Record<string, unknown> { return { type: argument.type === "integer" ? "integer" : argument.type, ...(argument.description ? { description: argument.description } : {}), ...(argument.enum ? { enum: argument.enum } : {}) }; }
