import { copyFile, rename, writeFile } from "node:fs/promises";
import YAML from "yaml";
import { parseSiteSpec, type SiteSpec } from "@anything-to-api/schema";
import { Anything, AnythingError, type CallOptions, type CallResult } from "@anything-to-api/runtime";

const REPAIRABLE = new Set(["HTTP_ERROR", "GRAPHQL_ERROR", "RESPONSE_SCHEMA_MISMATCH", "UNRESOLVED_REFERENCE", "WEBSOCKET_ERROR", "WEBSOCKET_TIMEOUT"]);
export interface RepairContext { site: SiteSpec; sitePath: string; command: string; args: Record<string, unknown>; error: AnythingError; }
export type Repairer = (context: RepairContext) => Promise<SiteSpec>;
export interface RepairOptions extends CallOptions { allowConsequentialRetry?: boolean; }

export async function callWithRepair<T>(anything: Anything, siteName: string, commandName: string, args: Record<string, unknown>, repairer: Repairer, options: RepairOptions = {}): Promise<CallResult<T>> {
  try { return await anything.call<T>(siteName, commandName, args, options); }
  catch (error) {
    if (!(error instanceof AnythingError) || !REPAIRABLE.has(error.code)) throw error;
    const entry = await anything.registry.resolve(siteName);
    const command = entry.spec.commands[commandName];
    if (!command) throw error;
    if (command.sideEffect !== "read" && !options.allowConsequentialRetry) throw new AnythingError(`Automatic retry refused for ${command.sideEffect} command`, "UNSAFE_REPAIR_RETRY", { cause: error, command: commandName });
    const repaired = parseSiteSpec(await repairer({ site: entry.spec, sitePath: entry.path, command: commandName, args, error }));
    if (repaired.site.id !== entry.spec.site.id) throw new AnythingError("Repair changed site identity", "INVALID_REPAIR");
    const backup = `${entry.path}.backup`;
    const temporary = `${entry.path}.repairing`;
    await copyFile(entry.path, backup);
    await writeFile(temporary, entry.path.endsWith(".json") ? JSON.stringify(repaired, null, 2) : YAML.stringify(repaired), { mode: 0o600 });
    await rename(temporary, entry.path);
    await anything.registry.all(true);
    return anything.call<T>(siteName, commandName, args, options);
  }
}
