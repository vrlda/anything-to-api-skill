import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { CommandSpec, SiteSpec } from "@anything-to-api/schema";
import { Ajv } from "ajv";
import type { AuthContext, AuthProvider } from "./auth.js";
import { NoAuthProvider } from "./auth.js";
import { AnythingError, GraphqlError, HttpError, ResponseValidationError } from "./errors.js";
import { SiteRegistry, type RegistryOptions } from "./registry.js";
import { getPath, resolveTemplates } from "./template.js";
import { executeWebSocket } from "./websocket.js";

export * from "./auth.js";
export * from "./errors.js";
export * from "./registry.js";
export * from "./template.js";
export * from "./websocket.js";

export interface AnythingOptions extends RegistryOptions {
  registry?: SiteRegistry;
  authProviders?: AuthProvider[];
  fetch?: typeof globalThis.fetch;
  authorize?: (site: SiteSpec, command: string, sideEffect: CommandSpec["sideEffect"]) => boolean | Promise<boolean>;
  browserExecutor?: BrowserExecutor;
}
export interface BrowserExecutor { execute<T>(site: SiteSpec, command: string, spec: CommandSpec, args: Record<string, unknown>, auth: AuthContext, steps: Record<string, unknown>, options: CallOptions): Promise<CallResult<T>>; }
export interface CallOptions { outputPath?: string; signal?: AbortSignal; }
export interface ExecutionMetadata { command: string; site: string; status: number; durationMs: number; attempts: number; pages: number; }
export interface CallResult<T = unknown> { data: T; extracted: Record<string, unknown>; metadata: ExecutionMetadata; }

export class Anything {
  readonly registry: SiteRegistry;
  private readonly providers = new Map<string, AuthProvider>();
  private readonly fetcher: typeof globalThis.fetch;
  private readonly authorize?: AnythingOptions["authorize"];
  private readonly browserExecutor?: BrowserExecutor;

  constructor(options: AnythingOptions = {}) {
    this.registry = options.registry ?? new SiteRegistry(options);
    this.fetcher = options.fetch ?? globalThis.fetch;
    this.authorize = options.authorize;
    this.browserExecutor = options.browserExecutor;
    this.registerAuthProvider(new NoAuthProvider());
    for (const provider of options.authProviders ?? []) this.registerAuthProvider(provider);
  }

  registerAuthProvider(provider: AuthProvider): this { this.providers.set(provider.id, provider); return this; }
  async sites(): Promise<SiteSpec[]> { return (await this.registry.all()).map(({ spec }) => spec); }
  async commands(site: string): Promise<Record<string, CommandSpec>> { return (await this.registry.resolve(site)).spec.commands; }
  async describe(site: string, command: string): Promise<CommandSpec> { return this.getCommand((await this.registry.resolve(site)).spec, command); }

  async call<T = unknown>(siteName: string, commandName: string, args: Record<string, unknown> = {}, options: CallOptions = {}): Promise<CallResult<T>> {
    const { spec } = await this.registry.resolve(siteName);
    const command = this.getCommand(spec, commandName);
    const validatedArgs = validateArguments(command, args);
    const provider = this.providers.get(spec.auth.provider);
    if (!provider) throw new AnythingError(`Auth provider not registered: ${spec.auth.provider}`, "AUTH_PROVIDER_NOT_FOUND");
    let auth = await provider.getAuth(spec);
    try { return await this.runWithPrerequisites<T>(spec, commandName, validatedArgs, auth, options, []); }
    catch (error) {
      const refresh = spec.auth.session?.refreshCommand;
      if (!(error instanceof HttpError) || error.status !== 401 || !refresh || refresh === commandName) throw error;
      const refreshed = await this.runWithPrerequisites(spec, refresh, {}, auth, options, []);
      auth = await provider.getAuth(spec);
      auth.values = { ...auth.values, ...refreshed.extracted };
      return this.runWithPrerequisites<T>(spec, commandName, validatedArgs, auth, options, []);
    }
  }

  private async runWithPrerequisites<T>(spec: SiteSpec, commandName: string, args: Record<string, unknown>, auth: AuthContext, options: CallOptions, stack: string[]): Promise<CallResult<T>> {
    if (stack.includes(commandName)) throw new AnythingError(`Command dependency cycle: ${[...stack, commandName].join(" -> ")}`, "DEPENDENCY_CYCLE", { stack: [...stack, commandName] });
    const command = this.getCommand(spec, commandName);
    if (this.authorize && !await this.authorize(spec, commandName, command.sideEffect)) throw new AnythingError(`Execution denied for ${commandName} (${command.sideEffect})`, "EXECUTION_DENIED", { site: spec.site.id, command: commandName, sideEffect: command.sideEffect });
    const steps: Record<string, unknown> = {};
    for (const prerequisite of command.prerequisites ?? []) {
      const prerequisiteArgs = resolveTemplates(prerequisite.arguments ?? {}, { args, auth: auth.values ?? {}, steps });
      const prerequisiteSpec = this.getCommand(spec, prerequisite.command);
      steps[prerequisite.as] = await this.runWithPrerequisites(spec, prerequisite.command, validateArguments(prerequisiteSpec, prerequisiteArgs), auth, options, [...stack, commandName]);
    }
    return this.execute<T>(spec, commandName, command, args, auth, steps, options);
  }

  private getCommand(spec: SiteSpec, name: string): CommandSpec {
    const command = spec.commands[name];
    if (!command) throw new AnythingError(`Unknown command ${name} for ${spec.site.id}`, "COMMAND_NOT_FOUND");
    return command;
  }

  private async execute<T>(spec: SiteSpec, name: string, command: CommandSpec, args: Record<string, unknown>, auth: AuthContext, steps: Record<string, unknown>, options: CallOptions): Promise<CallResult<T>> {
    if (command.request.kind === "browser") {
      if (!this.browserExecutor) throw new AnythingError("Command requires browser adapter", "BROWSER_REQUIRED", { command: name, fallback: command.request });
      return this.browserExecutor.execute<T>(spec, name, command, args, auth, steps, options);
    }
    const started = Date.now();
    const context = { args, auth: auth.values ?? {}, steps, env: process.env, runtime: { now: new Date().toISOString(), uuid: crypto.randomUUID() } };
    if (command.request.kind === "websocket") {
      const result = await executeWebSocket(spec, { ...command.request, headers: { ...auth.headers, ...command.request.headers } }, context);
      const data = result.data as T;
      validateResponse(name, command, data);
      return { data, extracted: extractBody(command, data), metadata: { command: name, site: spec.site.id, status: result.status, durationMs: Date.now() - started, attempts: 1, pages: 1 } };
    }
    let cursor: unknown;
    let pages = 0;
    let attempts = 0;
    let lastStatus = 0;
    let lastData: unknown;
    let lastHeaders = new Headers();
    const allItems: unknown[] = [];
    const limit = command.pagination?.maxPages ?? 1;
    do {
      const resolved = resolveTemplates(command.request, context);
      const request: Extract<CommandSpec["request"], { kind: "http" }> = resolved.kind === "graphql" ? {
        kind: "http" as const, method: "POST" as const, url: resolved.url, headers: resolved.headers,
        query: {}, body: { query: resolved.query, variables: resolved.variables, ...(resolved.operationName ? { operationName: resolved.operationName } : {}) }, timeoutMs: resolved.timeoutMs,
      } : resolved;
      const url = new URL(request.url, spec.baseUrls.default);
      for (const [key, value] of Object.entries(request.query ?? {})) if (value !== undefined && value !== null) url.searchParams.set(key, String(value));
      if (cursor !== undefined && command.pagination) url.searchParams.set(command.pagination.cursorQuery, String(cursor));
      const headers = new Headers({ ...auth.headers, ...request.headers });
      if (request.contentType) headers.set("content-type", request.contentType);
      const body = await buildBody(request, headers);
      const timeoutSignal = request.timeoutMs ? AbortSignal.timeout(request.timeoutMs) : undefined;
      const signal = options.signal && timeoutSignal ? AbortSignal.any([options.signal, timeoutSignal]) : options.signal ?? timeoutSignal;
      const response = await retryFetch(this.fetcher, url, { method: request.method, headers, body, signal }, command.retry, (count) => { attempts += count; });
      lastStatus = response.status;
      lastHeaders = response.headers;
      lastData = await readResponse(response, command.output.type);
      if (!response.ok) throw new HttpError(response.status, lastData, name);
      if (resolved.kind === "graphql" && isGraphqlFailure(lastData)) throw new GraphqlError(lastData.errors, name);
      pages += 1;
      if (!command.pagination) break;
      const items = getPath(lastData, command.pagination.itemsPath);
      if (Array.isArray(items)) allItems.push(...items);
      cursor = getPath(lastData, command.pagination.cursorPath);
    } while (cursor !== undefined && cursor !== null && cursor !== "" && pages < limit);
    const data = (command.pagination ? allItems : lastData) as T;
    validateResponse(name, command, data);
    if (command.output.type === "file" && options.outputPath) await writeFile(resolve(options.outputPath), Buffer.from(data as ArrayBuffer));
    const extracted = Object.fromEntries((command.extract ?? []).map((rule) => {
      if (rule.from === "body") return [rule.name, getPath(data, rule.path ?? "")];
      if (rule.from === "header") return [rule.name, lastHeaders.get(rule.path ?? rule.name) ?? undefined];
      const cookies = lastHeaders.getSetCookie?.() ?? [];
      const cookieName = rule.path ?? rule.name;
      const cookie = cookies.find((entry) => entry.startsWith(`${cookieName}=`));
      return [rule.name, cookie?.slice(cookieName.length + 1).split(";", 1)[0]];
    }));
    return { data, extracted, metadata: { command: name, site: spec.site.id, status: lastStatus, durationMs: Date.now() - started, attempts, pages } };
  }
}

function extractBody(command: CommandSpec, data: unknown): Record<string, unknown> {
  return Object.fromEntries((command.extract ?? []).filter((rule) => rule.from === "body").map((rule) => [rule.name, getPath(data, rule.path ?? "")]));
}

async function buildBody(request: Extract<CommandSpec["request"], { kind: "http" }>, headers: Headers): Promise<BodyInit | undefined> {
  if (request.multipart) {
    const form = new FormData();
    for (const [name, value] of Object.entries(request.multipart)) {
      if (value && typeof value === "object" && !Array.isArray(value) && "file" in value && typeof value.file === "string") {
        const descriptor = value as { file: string; filename?: string; contentType?: string };
        const bytes = await readFile(descriptor.file);
        form.append(name, new Blob([bytes], { type: descriptor.contentType }), descriptor.filename);
      } else form.append(name, typeof value === "string" ? value : JSON.stringify(value));
    }
    return form;
  }
  if (request.form) { headers.set("content-type", "application/x-www-form-urlencoded"); return new URLSearchParams(Object.entries(request.form).map(([key, value]) => [key, String(value)])); }
  if (request.body !== undefined) { headers.set("content-type", headers.get("content-type") ?? "application/json"); return headers.get("content-type")!.includes("json") ? JSON.stringify(request.body) : String(request.body); }
  return undefined;
}

function isGraphqlFailure(value: unknown): value is { errors: unknown[] } { return !!value && typeof value === "object" && Array.isArray((value as { errors?: unknown }).errors); }

function validateResponse(name: string, command: CommandSpec, data: unknown): void {
  if (!command.output.schema) return;
  const validate = new Ajv({ allErrors: true, strict: false }).compile(command.output.schema);
  if (!validate(data)) throw new ResponseValidationError(name, validate.errors);
}

function validateArguments(command: CommandSpec, args: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [name, definition] of Object.entries(command.arguments)) {
    const value = args[name] ?? definition.default;
    if (value === undefined && definition.required) throw new AnythingError(`Missing required argument: ${name}`, "INVALID_ARGUMENTS");
    if (value !== undefined) {
      const valid = definition.type === "file" ? typeof value === "string" || value instanceof Blob
        : definition.type === "array" ? Array.isArray(value)
        : definition.type === "object" ? typeof value === "object" && value !== null && !Array.isArray(value)
        : definition.type === "integer" ? typeof value === "number" && Number.isInteger(value)
        : typeof value === definition.type;
      if (!valid) throw new AnythingError(`Invalid type for ${name}: expected ${definition.type}`, "INVALID_ARGUMENTS");
      if (definition.enum && !definition.enum.includes(value as never)) throw new AnythingError(`Invalid value for ${name}`, "INVALID_ARGUMENTS");
      result[name] = value;
    }
  }
  const unknown = Object.keys(args).filter((key) => !(key in command.arguments));
  if (unknown.length) throw new AnythingError(`Unknown arguments: ${unknown.join(", ")}`, "INVALID_ARGUMENTS");
  return result;
}

async function retryFetch(fetcher: typeof fetch, url: URL, init: RequestInit, retry: CommandSpec["retry"], report: (attempts: number) => void): Promise<Response> {
  const max = retry?.attempts ?? 1;
  let response!: Response;
  for (let attempt = 1; attempt <= max; attempt++) {
    report(1);
    response = await fetcher(url, init);
    if (!retry?.statuses.includes(response.status) || attempt === max) return response;
    const retryAfter = response.headers.get("retry-after");
    const serverDelay = retryAfter ? (/^\d+$/.test(retryAfter) ? Number(retryAfter) * 1000 : Math.max(0, Date.parse(retryAfter) - Date.now())) : undefined;
    const delay = serverDelay ?? Math.min(5_000, 100 * 2 ** (attempt - 1));
    await new Promise((done) => setTimeout(done, delay));
  }
  return response;
}

async function readResponse(response: Response, type: CommandSpec["output"]["type"]): Promise<unknown> {
  if (type === "empty") return undefined;
  if (type === "file") return response.arrayBuffer();
  if (type === "text") return response.text();
  const text = await response.text();
  try { return text ? JSON.parse(text) : null; } catch { return text; }
}
