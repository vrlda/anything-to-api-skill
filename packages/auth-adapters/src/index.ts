import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { promisify } from "node:util";
import type { SiteSpec } from "@anything-to-api/schema";
import type { AuthContext, AuthProvider } from "@anything-to-api/runtime";
import { AnythingError } from "@anything-to-api/runtime";

const run = promisify(execFile);
export interface SecretStore { get(service: string, account: string): Promise<string | undefined>; }
export interface SecretReference { service: string; account: string; }
export interface AuthProfile {
  version: 1;
  name: string;
  site: string;
  provider: string;
  values?: Record<string, SecretReference>;
  headers?: Record<string, SecretReference>;
  literals?: { values?: Record<string, string>; headers?: Record<string, string> };
}

export class MemorySecretStore implements SecretStore {
  constructor(private readonly secrets: Record<string, string>) {}
  async get(service: string, account: string): Promise<string | undefined> { return this.secrets[`${service}:${account}`]; }
}

export class SystemKeychainSecretStore implements SecretStore {
  async get(service: string, account: string): Promise<string | undefined> {
    try {
      if (process.platform === "darwin") return (await run("security", ["find-generic-password", "-s", service, "-a", account, "-w"], { encoding: "utf8" })).stdout.trim();
      if (process.platform === "linux") return (await run("secret-tool", ["lookup", "service", service, "account", account], { encoding: "utf8" })).stdout.trim();
      throw new AnythingError(`OS keychain unsupported on ${process.platform}`, "KEYCHAIN_UNSUPPORTED");
    } catch (error) {
      if (error instanceof AnythingError) throw error;
      return undefined;
    }
  }
}

export class ProfileAuthProvider implements AuthProvider {
  readonly id: string;
  private constructor(private readonly profile: AuthProfile, private readonly store: SecretStore) { this.id = profile.provider; }
  static async load(path: string, store: SecretStore = new SystemKeychainSecretStore()): Promise<ProfileAuthProvider> {
    const profile = JSON.parse(await readFile(path, "utf8")) as AuthProfile;
    if (profile.version !== 1 || !profile.name || !profile.site || !profile.provider) throw new AnythingError(`Invalid auth profile: ${path}`, "INVALID_AUTH_PROFILE");
    return new ProfileAuthProvider(profile, store);
  }
  async getAuth(site: SiteSpec): Promise<AuthContext> {
    if (![site.site.id, ...site.site.domains, ...site.site.aliases].includes(this.profile.site)) throw new AnythingError(`Profile ${this.profile.name} does not match ${site.site.id}`, "PROFILE_SITE_MISMATCH");
    const values = { ...this.profile.literals?.values };
    const headers = { ...this.profile.literals?.headers };
    await hydrate(values, this.profile.values, this.store);
    await hydrate(headers, this.profile.headers, this.store);
    return { values, headers };
  }
}

async function hydrate(target: Record<string, string>, references: Record<string, SecretReference> | undefined, store: SecretStore): Promise<void> {
  for (const [name, reference] of Object.entries(references ?? {})) {
    const secret = await store.get(reference.service, reference.account);
    if (secret === undefined) throw new AnythingError(`Secret unavailable for ${name}`, "SECRET_NOT_FOUND", { service: reference.service, account: reference.account });
    target[name] = secret;
  }
}
