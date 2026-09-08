#!/usr/bin/env node
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { createInterface } from "node:readline/promises";
import { writeFile } from "node:fs/promises";
import { Command } from "commander";
import { Anything, AnythingError, EnvironmentAuthProvider } from "@anything-to-api/runtime";
import { formatValidationError, loadSiteSpec } from "@anything-to-api/schema";
import { discoverWebsite } from "@anything-to-api/discovery";
import { ProfileAuthProvider } from "@anything-to-api/auth-adapters";
import { toOpenApi, toTypeScriptSdk } from "@anything-to-api/exporters";
import { serveSiteOverStdio } from "@anything-to-api/mcp";
import { BrowserSessionDirectoryAuthProvider } from "@anything-to-api/browser-adapter";

const program = new Command().name("anything").description("Execute learned website APIs").version("1.1.1");
program.option("--registry <path>", "site registry path; repeat for multiple", (value, previous: string[]) => [...previous, value], []);
program.option("--profile <path>", "non-secret auth profile JSON");

async function runtime(allowConsequential = true): Promise<Anything> {
  const configured = program.opts<{ registry?: string[] }>().registry;
  const roots = configured?.length ? configured : process.env.ANYTHING_SITES?.split(":").filter(Boolean);
  const profile = program.opts<{ profile?: string }>().profile;
  const providers = [new EnvironmentAuthProvider(), new BrowserSessionDirectoryAuthProvider(join(homedir(), ".anything-to-api", "sessions")), ...(profile ? [await ProfileAuthProvider.load(resolve(profile))] : [])];
  return new Anything({ paths: roots, authProviders: providers, authorize: (_site, _command, effect) => effect === "read" || allowConsequential });
}

program.command("sites").description("List learned sites").action(async () => {
  for (const site of await (await runtime()).sites()) console.log(`${site.site.id}\t${site.site.domains.join(", ")}\t${Object.keys(site.commands).length} commands`);
});

program.command("commands <site>").description("List site commands").action(async (site) => {
  for (const [name, command] of Object.entries(await (await runtime()).commands(site))) console.log(`${name}\t${command.sideEffect}\t${command.description}`);
});

program.command("describe <site> <command>").description("Describe one command").action(async (site, command) => {
  console.log(JSON.stringify(await (await runtime()).describe(site, command), null, 2));
});

program.command("call <site> <command>")
  .description("Execute a command")
  .option("--arg <key=value...>", "typed argument; JSON values accepted")
  .option("--output <path>", "write file output")
  .option("--yes", "allow non-read side effects", false)
  .action(async (site, command, options: { arg?: string[]; output?: string; yes: boolean }) => {
    const args = Object.fromEntries((options.arg ?? []).map((entry) => {
      const at = entry.indexOf("=");
      if (at < 1) throw new AnythingError(`Expected key=value, got ${entry}`, "INVALID_ARGUMENTS");
      const raw = entry.slice(at + 1);
      try { return [entry.slice(0, at), JSON.parse(raw)]; } catch { return [entry.slice(0, at), raw]; }
    }));
    const result = await (await runtime(options.yes)).call(site, command, args, { outputPath: options.output });
    if (options.output) console.log(resolve(options.output));
    else if (result.data instanceof ArrayBuffer) process.stdout.write(Buffer.from(result.data));
    else console.log(JSON.stringify(result, null, 2));
  });

program.command("export-openapi <site> <output>").description("Export learned HTTP commands as OpenAPI").action(async (site, output) => {
  const anything = await runtime();
  const spec = (await anything.registry.resolve(site)).spec;
  await writeFile(resolve(output), JSON.stringify(toOpenApi(spec), null, 2));
});

program.command("export-sdk <site> <output>").description("Generate a typed TypeScript SDK wrapper").action(async (site, output) => {
  const anything = await runtime();
  const spec = (await anything.registry.resolve(site)).spec;
  await writeFile(resolve(output), toTypeScriptSdk(spec));
});

program.command("mcp <site>").description("Expose learned commands over MCP stdio").action(async (site) => {
  await serveSiteOverStdio(await runtime(process.env.ANYTHING_ALLOW_SIDE_EFFECTS === "1"), site);
});

program.command("validate <file>").description("Validate a site spec").action(async (file) => {
  const spec = await loadSiteSpec(resolve(file));
  console.log(`${spec.site.id}: valid (${Object.keys(spec.commands).length} commands)`);
});

program.command("discover <url>")
  .description("Capture website traffic and create a candidate site spec")
  .option("--output <directory>", "registry output", join(homedir(), ".anything-to-api", "sites"))
  .option("--storage-state <path>", "load and save Playwright browser session")
  .option("--headless", "run without visible browser", false)
  .action(async (url, options: { output: string; storageState?: string; headless: boolean }) => {
    const terminal = createInterface({ input: process.stdin, output: process.stdout });
    try {
      const storageState = options.storageState ?? join(homedir(), ".anything-to-api", "sessions", `${new URL(url).hostname}.json`);
      const result = await discoverWebsite(url, {
        outputRoot: resolve(options.output), storageStatePath: storageState, headless: options.headless,
        waitForDone: async () => { await terminal.question("Explore representative safe flows, then press Enter to finish capture. "); },
      });
      console.log(`${result.spec.site.id}: ${Object.keys(result.spec.commands).length} candidate commands\n${result.siteDirectory}\nsession: ${storageState}`);
    } finally { terminal.close(); }
  });

program.parseAsync().catch((error: unknown) => {
  console.error(formatValidationError(error instanceof AnythingError ? `${error.code}: ${error.message}` : error));
  process.exitCode = 1;
});
