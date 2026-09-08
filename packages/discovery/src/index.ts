import { access, mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import YAML from "yaml";
import { loadSiteSpec, parseSiteSpec, type JsonValue, type SiteSpec } from "@anything-to-api/schema";
import { launchSession, NetworkRecorder, type CaptureEntry, type LaunchSessionOptions, type Page } from "@anything-to-api/browser-adapter";

export interface DiscoveryOptions extends LaunchSessionOptions { outputRoot: string; waitForDone: (page: Page) => Promise<void>; }
export interface DiscoveryResult { spec: SiteSpec; captures: CaptureEntry[]; siteDirectory: string; }

export async function discoverWebsite(rawUrl: string, options: DiscoveryOptions): Promise<DiscoveryResult> {
  const url = new URL(rawUrl);
  const session = await launchSession(options);
  const recorder = new NetworkRecorder();
  const detach = recorder.attach(session.page);
  try {
    await session.page.goto(url.href, { waitUntil: "domcontentloaded" });
    await options.waitForDone(session.page);
    await session.page.waitForLoadState("networkidle").catch(() => undefined);
    const captures = await recorder.results();
    const candidate = inferCandidateSpec(url, captures);
    const siteDirectory = join(options.outputRoot, candidate.site.id);
    await mkdir(siteDirectory, { recursive: true, mode: 0o700 });
    const sitePath = join(siteDirectory, "site.yaml");
    const existing = await access(sitePath).then(() => loadSiteSpec(sitePath), () => undefined);
    const spec = existing ? mergeSiteSpecs(existing, candidate) : candidate;
    await writeFile(sitePath, YAML.stringify(spec), { mode: 0o600 });
    await writeFile(join(siteDirectory, "_capture.json"), JSON.stringify(captures, null, 2), { mode: 0o600 });
    if (options.storageStatePath) {
      await mkdir(dirname(options.storageStatePath), { recursive: true, mode: 0o700 });
      await session.context.storageState({ path: options.storageStatePath });
    }
    return { spec, captures, siteDirectory };
  } finally { detach(); await session.close(); }
}

export function mergeSiteSpecs(existing: SiteSpec, candidate: SiteSpec): SiteSpec {
  if (existing.site.id !== candidate.site.id) throw new Error(`Cannot merge different sites: ${existing.site.id} and ${candidate.site.id}`);
  const commands = { ...existing.commands };
  for (const [name, command] of Object.entries(candidate.commands)) {
    if (!commands[name]) commands[name] = command;
    else if (commands[name]!.validation.status === "broken") commands[uniqueName(commands, `${name}_candidate`, 0)] = command;
  }
  return parseSiteSpec({
    ...existing,
    site: { ...existing.site, domains: [...new Set([...existing.site.domains, ...candidate.site.domains])], aliases: [...new Set([...existing.site.aliases, ...candidate.site.aliases])], updatedAt: candidate.site.updatedAt },
    baseUrls: { ...existing.baseUrls, ...candidate.baseUrls },
    commands,
    discovery: candidate.discovery,
  });
}

export function inferCandidateSpec(source: URL, captures: CaptureEntry[], now = new Date()): SiteSpec {
  const commands: Record<string, unknown> = {};
  const candidates = captures.filter((entry) => isApplicationRequest(source, entry) && entry.response && entry.response.status < 500);
  for (const [index, entry] of candidates.entries()) {
    const parsed = new URL(entry.request.url);
    const parsedBody = parseBody(entry.request.postData);
    const graphql = parsedBody && typeof parsedBody === "object" && !Array.isArray(parsedBody) && typeof parsedBody.query === "string" ? parsedBody : undefined;
    const name = uniqueName(commands, graphql?.operationName ? snakeCase(String(graphql.operationName)) : semanticName(entry.request.method, parsed.pathname), index);
    const contentType = entry.response?.contentType ?? "";
    const argumentsSpec: Record<string, unknown> = {};
    const query = Object.fromEntries([...parsed.searchParams.entries()].map(([key, value]) => {
      argumentsSpec[key] = inferArgument(value);
      return [key, `{{args.${key}}}`];
    })) as Record<string, JsonValue>;
    let request: Record<string, unknown>;
    if (graphql) {
      const variables = Object.fromEntries(Object.entries((graphql.variables as Record<string, JsonValue> | undefined) ?? {}).map(([key, value]) => {
        argumentsSpec[key] = inferArgument(value);
        return [key, `{{args.${key}}}`];
      }));
      request = { kind: "graphql", url: parsed.pathname, query: graphql.query, operationName: graphql.operationName, variables };
    } else {
      const templatedPath = parameterizePath(parsed.pathname, argumentsSpec);
      request = { kind: "http", method: entry.request.method, url: templatedPath };
      if (Object.keys(query).length) request.query = query;
      if (entry.request.postData) {
        if (parsedBody !== undefined) request.body = parsedBody;
        else request.form = Object.fromEntries(new URLSearchParams(entry.request.postData));
      }
    }
    commands[name] = {
      description: `Observed ${entry.request.method} ${parsed.pathname}`,
      sideEffect: entry.request.method === "GET" || entry.request.method === "HEAD" ? "read" : "write",
      arguments: argumentsSpec, request,
      output: { type: /json/i.test(contentType) ? "json" : /octet-stream|pdf|zip|attachment/i.test(contentType) ? "file" : "text" },
      validation: { status: "unverified", confidence: 0.35 },
      provenance: { pageUrl: source.href, observedAt: now.toISOString(), notes: `capture:${entry.id}; agent must parameterize and independently replay` },
    };
  }
  return parseSiteSpec({
    specVersion: "1.0",
    site: { id: source.hostname.replace(/^www\./, "").replace(/[^a-z0-9.-]/g, "-"), name: source.hostname, domains: [source.hostname], aliases: [], createdAt: now.toISOString(), updatedAt: now.toISOString() },
    baseUrls: { default: source.origin }, auth: { required: true, provider: "browser-session", requirements: ["cookies"] }, commands,
    discovery: { sourceUrl: source.href, learnedAt: now.toISOString(), agent: "anything-to-api discovery recorder", notes: "Candidates require agent review, secret classification, parameterization, and replay." },
  });
}

function parseBody(value: string | undefined): Record<string, unknown> | undefined {
  if (!value) return undefined;
  try { const parsed = JSON.parse(value); return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : undefined; }
  catch { return undefined; }
}

function parameterizePath(path: string, argumentsSpec: Record<string, unknown>): string {
  return path.split("/").map((part) => {
    if (!/^\d+$/.test(part) && !/^[0-9a-f-]{16,}$/i.test(part)) return part;
    let name = "id"; let suffix = 2;
    while (name in argumentsSpec) name = `id_${suffix++}`;
    argumentsSpec[name] = { type: "string", required: true, description: "Identifier observed in request path" };
    return `{{args.${name}}}`;
  }).join("/");
}

function inferArgument(value: unknown): Record<string, unknown> {
  const type = typeof value === "number" ? (Number.isInteger(value) ? "integer" : "number") : typeof value === "boolean" ? "boolean" : Array.isArray(value) ? "array" : value && typeof value === "object" ? "object" : "string";
  return { type, required: true };
}

function snakeCase(value: string): string { return value.replace(/([a-z0-9])([A-Z])/g, "$1_$2").replace(/[^a-z0-9]+/gi, "_").replace(/^_|_$/g, "").toLowerCase(); }

function isApplicationRequest(source: URL, entry: CaptureEntry): boolean {
  const url = new URL(entry.request.url);
  if (!url.hostname.endsWith(source.hostname.split(".").slice(-2).join("."))) return false;
  if (["image", "font", "stylesheet", "media"].includes(entry.request.resourceType)) return false;
  return /^(fetch|xhr|document|websocket)$/.test(entry.request.resourceType) && !/(analytics|telemetry|metrics|collect|sentry)/i.test(url.pathname);
}

function semanticName(method: string, path: string): string {
  const parts = path.split("/").filter(Boolean).filter((part) => !/^\d+$/.test(part) && !/^[0-9a-f-]{16,}$/i.test(part));
  const resource = parts.slice(-2).join("_").replace(/[^a-z0-9_]/gi, "_").toLowerCase() || "root";
  const verb = method === "GET" ? "get" : method === "POST" ? "create" : method === "DELETE" ? "delete" : "update";
  return `${verb}_${resource}`.replace(/_+/g, "_");
}

function uniqueName(commands: Record<string, unknown>, candidate: string, index: number): string {
  if (!(candidate in commands)) return candidate;
  let suffix = 2;
  while (`${candidate}_${suffix}` in commands) suffix += 1;
  return `${candidate}_${suffix || index}`;
}
