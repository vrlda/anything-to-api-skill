import type { SiteSpec } from "@anything-to-api/schema";

export interface AuthContext {
  values?: Record<string, unknown>;
  headers?: Record<string, string>;
  /** Return credentials scoped to one validated destination. */
  headersForUrl?: (url: URL) => Record<string, string> | Promise<Record<string, string>>;
}

export interface AuthProvider {
  readonly id: string;
  getAuth(site: SiteSpec): Promise<AuthContext>;
}

export class NoAuthProvider implements AuthProvider {
  readonly id = "none";
  async getAuth(): Promise<AuthContext> { return {}; }
}

export class StaticAuthProvider implements AuthProvider {
  constructor(public readonly id: string, private readonly context: AuthContext) {}
  async getAuth(): Promise<AuthContext> { return this.context; }
}

export class EnvironmentAuthProvider implements AuthProvider {
  constructor(public readonly id = "environment", private readonly prefix = "ANYTHING_AUTH_") {}
  async getAuth(site: SiteSpec): Promise<AuthContext> {
    const values: Record<string, string> = {};
    for (const key of site.auth.requirements) {
      const envName = `${this.prefix}${site.site.id}_${key}`.toUpperCase().replace(/[^A-Z0-9_]/g, "_");
      if (process.env[envName]) values[key] = process.env[envName]!;
    }
    return { values };
  }
}

export class CallbackAuthProvider implements AuthProvider {
  constructor(public readonly id: string, private readonly callback: (site: SiteSpec) => Promise<AuthContext>) {}
  getAuth(site: SiteSpec): Promise<AuthContext> { return this.callback(site); }
}
