import { readdir } from "node:fs/promises";
import { homedir } from "node:os";
import { resolve, join } from "node:path";
import { loadSiteSpec, type SiteSpec } from "@anything-to-api/schema";
import { AnythingError } from "./errors.js";

export interface RegistryOptions { paths?: string[]; }

export class SiteRegistry {
  readonly paths: string[];
  private cache?: Map<string, { spec: SiteSpec; path: string }>;

  constructor(options: RegistryOptions = {}) {
    this.paths = options.paths?.map((p) => resolve(p)) ?? [join(homedir(), ".anything-to-api", "sites")];
  }

  async all(refresh = false): Promise<Array<{ spec: SiteSpec; path: string }>> {
    if (this.cache && !refresh) return [...new Set(this.cache.values())];
    const map = new Map<string, { spec: SiteSpec; path: string }>();
    for (const root of this.paths) {
      for (const path of await findSpecs(root)) {
        const spec = await loadSiteSpec(path);
        const entry = { spec, path };
        for (const key of [spec.site.id, ...spec.site.domains, ...spec.site.aliases]) map.set(normalize(key), entry);
      }
    }
    this.cache = map;
    return [...new Set(map.values())];
  }

  async resolve(name: string): Promise<{ spec: SiteSpec; path: string }> {
    await this.all();
    const key = normalize(name);
    const found = this.cache!.get(key);
    if (!found) throw new AnythingError(`Unknown site: ${name}`, "SITE_NOT_FOUND", { searched: this.paths });
    return found;
  }
}

function normalize(value: string): string {
  try { return new URL(value.includes("://") ? value : `https://${value}`).hostname.toLowerCase(); }
  catch { return value.toLowerCase(); }
}

async function findSpecs(root: string): Promise<string[]> {
  let entries;
  try { entries = await readdir(root, { withFileTypes: true }); } catch { return []; }
  const paths: string[] = [];
  for (const entry of entries) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) paths.push(...await findSpecs(path));
    else if (!entry.name.startsWith("_") && (/^(site\.)?(json|ya?ml)$/.test(entry.name) || /\.(json|ya?ml)$/.test(entry.name))) paths.push(path);
  }
  return paths;
}
