import { readFile } from "node:fs/promises";
import { extname } from "node:path";
import YAML from "yaml";
import { z } from "zod";

export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };
const valueSource: z.ZodType<JsonValue> = z.union([
  z.string(), z.number(), z.boolean(), z.null(),
  z.array(z.lazy(() => valueSource)),
  z.record(z.string(), z.lazy(() => valueSource)),
]);

export const argumentSchema = z.object({
  type: z.enum(["string", "number", "integer", "boolean", "object", "array", "file"]),
  required: z.boolean().default(false),
  description: z.string().optional(),
  default: valueSource.optional(),
  enum: z.array(valueSource).optional(),
});

const extractionSchema = z.object({
  name: z.string().min(1),
  from: z.enum(["body", "header", "cookie"]),
  path: z.string().optional(),
});

const httpRequestSchema = z.object({
  kind: z.literal("http"),
  method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD"]),
  url: z.string().min(1),
  headers: z.record(z.string(), z.string()).optional(),
  query: z.record(z.string(), valueSource).optional(),
  body: valueSource.optional(),
  form: z.record(z.string(), valueSource).optional(),
  multipart: z.record(z.string(), z.union([valueSource, z.object({
    file: z.string(),
    filename: z.string().optional(),
    contentType: z.string().optional(),
  })])).optional(),
  timeoutMs: z.number().int().positive().optional(),
  contentType: z.string().optional(),
});

const graphqlRequestSchema = z.object({
  kind: z.literal("graphql"),
  url: z.string().min(1),
  query: z.string().min(1),
  operationName: z.string().optional(),
  variables: z.record(z.string(), valueSource).default({}),
  headers: z.record(z.string(), z.string()).optional(),
  timeoutMs: z.number().int().positive().optional(),
});

const websocketRequestSchema = z.object({
  kind: z.literal("websocket"),
  url: z.string().min(1),
  protocols: z.array(z.string()).optional(),
  headers: z.record(z.string(), z.string()).optional(),
  messages: z.array(valueSource).min(1),
  response: z.object({
    count: z.number().int().positive().default(1),
    matchPath: z.string().optional(),
    equals: valueSource.optional(),
  }).default({ count: 1 }),
  timeoutMs: z.number().int().positive().default(30_000),
});

const browserActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("goto"), url: z.string() }),
  z.object({ action: z.literal("click"), selector: z.string() }),
  z.object({ action: z.literal("fill"), selector: z.string(), value: z.string() }),
  z.object({ action: z.literal("select"), selector: z.string(), value: z.string() }),
  z.object({ action: z.literal("press"), selector: z.string().optional(), key: z.string() }),
  z.object({ action: z.literal("wait"), selector: z.string(), state: z.enum(["attached", "detached", "visible", "hidden"]).default("visible") }),
  z.object({ action: z.literal("extract"), selector: z.string(), property: z.enum(["text", "value", "attribute"]).default("text"), attribute: z.string().optional(), as: z.string() }),
  z.object({ action: z.literal("download"), selector: z.string(), path: z.string() }),
]);

const browserRequestSchema = z.object({
  kind: z.literal("browser"),
  instructions: z.string().min(1).optional(),
  startUrl: z.string().optional(),
  steps: z.array(browserActionSchema).min(1).optional(),
}).refine((value) => value.instructions || value.steps, "Browser request needs instructions or steps");

export const commandSchema = z.object({
  description: z.string().min(1),
  sideEffect: z.enum(["read", "write", "destructive", "financial", "external_communication"]),
  arguments: z.record(z.string(), argumentSchema).default({}),
  request: z.discriminatedUnion("kind", [httpRequestSchema, graphqlRequestSchema, websocketRequestSchema, browserRequestSchema]),
  prerequisites: z.array(z.object({
    command: z.string(),
    arguments: z.record(z.string(), valueSource).optional(),
    as: z.string().min(1),
  })).optional(),
  extract: z.array(extractionSchema).optional(),
  output: z.object({
    type: z.enum(["json", "text", "file", "empty"]),
    schema: z.record(z.string(), z.unknown()).optional(),
    filename: z.string().optional(),
    contentTypes: z.array(z.string()).optional(),
  }),
  pagination: z.object({
    cursorPath: z.string(),
    cursorQuery: z.string(),
    itemsPath: z.string(),
    maxPages: z.number().int().positive().default(100),
  }).optional(),
  retry: z.object({
    attempts: z.number().int().min(1).max(10).default(1),
    statuses: z.array(z.number().int()).default([429, 500, 502, 503, 504]),
  }).optional(),
  errors: z.array(z.object({
    status: z.number().int().optional(),
    code: z.string().optional(),
    meaning: z.string(),
    retryable: z.boolean().default(false),
  })).optional(),
  rateLimit: z.object({
    limit: z.number().positive().optional(),
    windowSeconds: z.number().positive().optional(),
    remainingHeader: z.string().optional(),
    resetHeader: z.string().optional(),
    retryAfterHeader: z.string().default("retry-after"),
    observedAt: z.string().datetime().optional(),
  }).optional(),
  examples: z.array(z.object({
    name: z.string().optional(),
    arguments: z.record(z.string(), valueSource),
    output: valueSource.optional(),
  })).optional(),
  validation: z.object({
    status: z.enum(["unverified", "verified", "broken"]),
    lastSuccess: z.string().datetime().optional(),
    confidence: z.number().min(0).max(1).optional(),
  }),
  uiFallback: browserRequestSchema.optional(),
  provenance: z.object({ pageUrl: z.string().optional(), observedAt: z.string().datetime().optional(), notes: z.string().optional() }).optional(),
});

export const siteSpecSchema = z.object({
  specVersion: z.enum(["1.0", "1.1"]),
  site: z.object({
    id: z.string().regex(/^[a-z0-9][a-z0-9._-]*$/),
    name: z.string().min(1),
    domains: z.array(z.string().min(1)).min(1),
    aliases: z.array(z.string()).default([]),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  }),
  baseUrls: z.record(z.string(), z.string().url()).default({}),
  apiFamilies: z.record(z.string(), z.object({
    transport: z.enum(["http", "graphql", "websocket", "browser"]),
    baseUrl: z.string(),
    description: z.string().optional(),
    version: z.string().optional(),
  })).default({}),
  auth: z.object({
    required: z.boolean(),
    provider: z.string().default("none"),
    requirements: z.array(z.string()).default([]),
    session: z.object({
      cookies: z.array(z.string()).default([]),
      csrf: z.object({ source: z.enum(["cookie", "header", "body", "dom", "local_storage"]), name: z.string(), targetHeader: z.string().optional() }).optional(),
      refreshCommand: z.string().optional(),
      expiresAfterSeconds: z.number().positive().optional(),
    }).optional(),
  }),
  dynamicValues: z.record(z.string(), z.object({
    source: z.enum(["auth", "argument", "step", "environment", "runtime"]),
    description: z.string().optional(),
    ephemeral: z.boolean().default(true),
  })).default({}),
  commands: z.record(z.string().regex(/^[a-z][a-z0-9_]*$/), commandSchema),
  discovery: z.object({
    sourceUrl: z.string().url(),
    learnedAt: z.string().datetime(),
    agent: z.string().optional(),
    notes: z.string().optional(),
  }),
});

export const siteSpecJsonSchema = z.toJSONSchema(siteSpecSchema, { target: "draft-7" });

export type SiteSpec = z.infer<typeof siteSpecSchema>;
export type CommandSpec = z.infer<typeof commandSchema>;
export type ArgumentSpec = z.infer<typeof argumentSchema>;

export function parseSiteSpec(input: unknown): SiteSpec {
  return siteSpecSchema.parse(input);
}

export async function loadSiteSpec(path: string): Promise<SiteSpec> {
  const text = await readFile(path, "utf8");
  const raw = [".yaml", ".yml"].includes(extname(path).toLowerCase()) ? YAML.parse(text) : JSON.parse(text);
  return parseSiteSpec(raw);
}

export function formatValidationError(error: unknown): string {
  if (!(error instanceof z.ZodError)) return String(error);
  return error.issues.map((issue) => `${issue.path.join(".") || "spec"}: ${issue.message}`).join("\n");
}
