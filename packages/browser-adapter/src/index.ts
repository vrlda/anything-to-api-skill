import { access, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { CommandSpec, SiteSpec } from "@anything-to-api/schema";
import type { AuthContext, AuthProvider, BrowserExecutor, CallOptions, CallResult } from "@anything-to-api/runtime";
import { AnythingError, assertSafeDestination, isUrlAllowed, resolveTemplates } from "@anything-to-api/runtime";
import { chromium, type BrowserContext, type Page, type Request, type Response } from "playwright";
export type { Page } from "playwright";
export function chromiumExecutablePath(): string { return chromium.executablePath(); }

export interface CaptureEntry {
  id: string;
  startedAt: string;
  durationMs?: number;
  request: { method: string; url: string; resourceType: string; headers: Record<string, string>; postData?: string };
  response?: { status: number; headers: Record<string, string>; contentType?: string; bodySample?: string };
  failure?: string;
}

const SECRET_HEADERS = new Set(["authorization", "cookie", "set-cookie", "proxy-authorization", "x-api-key", "x-csrf-token"]);
const SECRET_FIELD = /(pass(word)?|secret|token|authorization|cookie|csrf|api[-_]?key|signature|session)/i;
export function redactHeaders(headers: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(headers).map(([key, value]) => [key, SECRET_HEADERS.has(key.toLowerCase()) ? "{{redacted}}" : value]));
}

export function sanitizeUrl(raw: string): string {
  const url = new URL(raw);
  for (const key of [...url.searchParams.keys()]) if (SECRET_FIELD.test(key)) url.searchParams.set(key, "{{redacted}}");
  return url.href;
}

export function redactPayload(payload: string | null): string | undefined {
  if (!payload) return undefined;
  try { return JSON.stringify(scrub(JSON.parse(payload))); }
  catch {
    const form = new URLSearchParams(payload);
    if ([...form.keys()].length === 0) return payload;
    for (const key of [...form.keys()]) if (SECRET_FIELD.test(key)) form.set(key, "{{redacted}}");
    return form.toString();
  }
}

function scrub(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(scrub);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, SECRET_FIELD.test(key) ? "{{redacted}}" : scrub(item)]));
  return value;
}

export class NetworkRecorder {
  private readonly entries = new Map<Request, CaptureEntry>();
  private readonly pending = new Set<Promise<void>>();
  constructor(private readonly maxBodyBytes = 0) {}

  attach(page: Page): () => void {
    const request = (value: Request) => this.onRequest(value);
    const response = (value: Response) => this.track(this.onResponse(value));
    const failed = (value: Request) => this.onFailure(value);
    page.on("request", request); page.on("response", response); page.on("requestfailed", failed);
    return () => { page.off("request", request); page.off("response", response); page.off("requestfailed", failed); };
  }

  async results(): Promise<CaptureEntry[]> { await Promise.all(this.pending); return [...this.entries.values()]; }
  clear(): void { this.entries.clear(); }

  private onRequest(request: Request): void {
    this.entries.set(request, {
      id: crypto.randomUUID(), startedAt: new Date().toISOString(),
      request: { method: request.method(), url: sanitizeUrl(request.url()), resourceType: request.resourceType(), headers: redactHeaders(request.headers()), postData: redactPayload(request.postData()) },
    });
  }

  private async onResponse(response: Response): Promise<void> {
    const entry = this.entries.get(response.request());
    if (!entry) return;
    const type = response.headers()["content-type"];
    let bodySample: string | undefined;
    if (this.maxBodyBytes > 0 && type && /(json|text|javascript|xml|graphql)/i.test(type)) {
      try {
        const sample = (await response.body()).subarray(0, this.maxBodyBytes).toString("utf8");
        bodySample = /json/i.test(type) ? redactPayload(sample) : sample;
      } catch { /* body unavailable */ }
    }
    entry.durationMs = Date.now() - Date.parse(entry.startedAt);
    entry.response = { status: response.status(), headers: redactHeaders(response.headers()), contentType: type, bodySample };
  }

  private onFailure(request: Request): void {
    const entry = this.entries.get(request);
    if (entry) entry.failure = request.failure()?.errorText ?? "request failed";
  }
  private track(promise: Promise<void>): void { this.pending.add(promise); void promise.finally(() => this.pending.delete(promise)); }
}

export interface BrowserSessionOptions { storageStatePath: string; id?: string; csrf?: { cookie?: string; localStorage?: string; valueName?: string }; }
export class BrowserSessionAuthProvider implements AuthProvider {
  readonly id: string;
  constructor(private readonly options: BrowserSessionOptions) { this.id = options.id ?? "browser-session"; }
  async getAuth(site: SiteSpec): Promise<AuthContext> {
    const state = JSON.parse(await readFile(this.options.storageStatePath, "utf8")) as { cookies?: Array<{ name: string; value: string; domain: string; path?: string; secure?: boolean; expires?: number }>; origins?: Array<{ origin: string; localStorage: Array<{ name: string; value: string }> }> };
    const domains = new Set(site.site.domains.map((domain) => domain.replace(/^\./, "")));
    const cookies = (state.cookies ?? []).filter((cookie) => [...domains].some((domain) => domainMatches(cookie.domain, domain)));
    const values: Record<string, unknown> = {};
    const csrf = this.options.csrf;
    if (csrf?.cookie) values[csrf.valueName ?? "csrf_token"] = cookies.find((cookie) => cookie.name === csrf.cookie)?.value;
    if (csrf?.localStorage) {
      const item = (state.origins ?? []).flatMap((origin) => origin.localStorage).find((value) => value.name === csrf.localStorage);
      values[csrf.valueName ?? "csrf_token"] = item?.value;
    }
    const headersForUrl = (url: URL): Record<string, string> => {
      const now = Date.now() / 1000;
      const scoped = cookies.filter((cookie) => domainMatches(url.hostname, cookie.domain) && (!cookie.path || url.pathname.startsWith(cookie.path)) && (!cookie.secure || url.protocol === "https:") && (!cookie.expires || cookie.expires < 0 || cookie.expires > now));
      return scoped.length ? { cookie: scoped.map(({ name, value }) => `${name}=${value}`).join("; ") } : {} as Record<string, string>;
    };
    const primary = headersForUrl(new URL(`https://${site.site.domains[0]!}/`));
    return { headers: primary, headersForUrl, values };
  }
}

export class BrowserSessionDirectoryAuthProvider implements AuthProvider {
  readonly id = "browser-session";
  constructor(private readonly directory: string) {}
  async getAuth(site: SiteSpec): Promise<AuthContext> {
    const filename = `${encodeURIComponent(site.site.domains[0]!)}.json`;
    return new BrowserSessionAuthProvider({ storageStatePath: resolve(this.directory, filename) }).getAuth(site);
  }
}

export interface LaunchSessionOptions { storageStatePath?: string; headless?: boolean; executablePath?: string; }
export async function launchSession(options: LaunchSessionOptions = {}): Promise<{ context: BrowserContext; page: Page; close: () => Promise<void> }> {
  const browser = await chromium.launch({ headless: options.headless ?? false, executablePath: options.executablePath });
  const hasState = options.storageStatePath ? await access(options.storageStatePath).then(() => true, () => false) : false;
  const context = await browser.newContext(hasState ? { storageState: options.storageStatePath } : {});
  const page = await context.newPage();
  return { context, page, close: () => browser.close() };
}

export async function executeBrowserInstructions(page: Page, instructions: string): Promise<never> {
  throw new AnythingError("Natural-language browser fallback requires an agent driver", "AGENT_BROWSER_REQUIRED", { instructions, url: page.url() });
}

export interface PlaywrightBrowserExecutorOptions extends LaunchSessionOptions { page?: Page; keepOpen?: boolean; }
export class PlaywrightBrowserExecutor implements BrowserExecutor {
  constructor(private readonly options: PlaywrightBrowserExecutorOptions = {}) {}
  async execute<T>(site: SiteSpec, commandName: string, command: CommandSpec, args: Record<string, unknown>, auth: AuthContext, steps: Record<string, unknown>, callOptions: CallOptions): Promise<CallResult<T>> {
    if (command.request.kind !== "browser") throw new AnythingError("Expected browser command", "INVALID_BROWSER_COMMAND");
    const started = Date.now();
    const owned = this.options.page ? undefined : await launchSession(this.options);
    const page = this.options.page ?? owned!.page;
    const output: Record<string, unknown> = {};
    try {
      if (typeof page.route === "function") await page.route("**/*", async (route) => {
        const url = new URL(route.request().url());
        if (!isUrlAllowed(site, url)) {
          const type = route.request().resourceType();
          return ["document", "fetch", "xhr", "websocket"].includes(type) ? route.abort("blockedbyclient") : route.continue();
        }
        const scoped = auth.headersForUrl ? await auth.headersForUrl(url) : auth.headers ?? {};
        await route.continue({ headers: { ...route.request().headers(), ...scoped } });
      });
      if (command.request.startUrl) {
        const url = new URL(resolveTemplates(command.request.startUrl, { args, auth: auth.values ?? {}, steps }), site.baseUrls.default);
        assertSafeDestination(site, url); await page.goto(url.href);
      }
      if (!command.request.steps) return executeBrowserInstructions(page, command.request.instructions!);
      const actions = resolveTemplates(command.request.steps, { args, auth: auth.values ?? {}, steps });
      for (const step of actions) {
        if (step.action === "goto") { const url = new URL(step.url, site.baseUrls.default); assertSafeDestination(site, url); await page.goto(url.href); }
        else if (step.action === "click") await page.locator(step.selector).click();
        else if (step.action === "fill") await page.locator(step.selector).fill(step.value);
        else if (step.action === "select") await page.locator(step.selector).selectOption(step.value);
        else if (step.action === "press") await (step.selector ? page.locator(step.selector).press(step.key) : page.keyboard.press(step.key));
        else if (step.action === "wait") await page.locator(step.selector).waitFor({ state: step.state });
        else if (step.action === "extract") {
          const locator = page.locator(step.selector);
          output[step.as] = step.property === "text" ? await locator.textContent() : step.property === "value" ? await locator.inputValue() : await locator.getAttribute(step.attribute ?? "value");
        } else if (step.action === "download") {
          const [download] = await Promise.all([page.waitForEvent("download"), page.locator(step.selector).click()]);
          if (!callOptions.outputPath) throw new AnythingError("Browser downloads require the caller to provide outputPath", "UNSAFE_FILE_ACCESS");
          const path = resolve(callOptions.outputPath); await download.saveAs(path); output.path = path;
        }
      }
      return { data: output as T, extracted: output, metadata: { command: commandName, site: site.site.id, status: 200, durationMs: Date.now() - started, attempts: 1, pages: 1 } };
    } finally { if (owned && !this.options.keepOpen) await owned.close(); }
  }
}

function domainMatches(hostname: string, domain: string): boolean {
  const host = hostname.toLowerCase().replace(/^\./, "").replace(/\.$/, "");
  const expected = domain.toLowerCase().replace(/^\./, "").replace(/\.$/, "");
  return host === expected || host.endsWith(`.${expected}`);
}
