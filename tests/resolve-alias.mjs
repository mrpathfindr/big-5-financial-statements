import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const ROOT = new URL("../", import.meta.url);
const EXTENSIONS = ["", ".ts", ".tsx", ".mts", ".js", ".mjs", ".json"];

export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith("@/")) {
    const base = new URL(specifier.slice(2), ROOT).href;
    for (const ext of EXTENSIONS) {
      if (existsSync(fileURLToPath(base + ext))) return nextResolve(base + ext, context);
    }
  }
  return nextResolve(specifier, context);
}
