import { AnythingError } from "./errors.js";

const WHOLE_REF = /^\{\{\s*([^}]+?)\s*\}\}$/;
const REF = /\{\{\s*([^}]+?)\s*\}\}/g;

export function getPath(source: unknown, path: string): unknown {
  if (!path) return source;
  return path.split(".").reduce<unknown>((value, key) => {
    if (value === null || typeof value !== "object") return undefined;
    return (value as Record<string, unknown>)[key];
  }, source);
}

export function resolveTemplates<T>(value: T, context: Record<string, unknown>): T {
  if (typeof value === "string") {
    const whole = value.match(WHOLE_REF);
    if (whole) return resolveRef(whole[1]!, context) as T;
    return value.replace(REF, (_, path: string) => String(resolveRef(path, context))) as T;
  }
  if (Array.isArray(value)) return value.map((item) => resolveTemplates(item, context)) as T;
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, resolveTemplates(item, context)])) as T;
  }
  return value;
}

function resolveRef(path: string, context: Record<string, unknown>): unknown {
  const value = getPath(context, path.trim());
  if (value === undefined) throw new AnythingError(`Unresolved reference: ${path}`, "UNRESOLVED_REFERENCE", { path });
  return value;
}
