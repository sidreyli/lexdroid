/**
 * The interface reads the working store, and the store moves while a run does.
 * Prerendered, a page would serve whatever the build machine happened to see -- verified
 * against a real build, which baked the scoreboard, the run list and the review queue.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { describe, expect, it } from "vitest";

const APP = resolve(import.meta.dirname, "../../app");

function routesUnder(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return routesUnder(path);
    return name === "page.tsx" || name === "route.ts" ? [path] : [];
  });
}

const READS_STORE = /from "@\/lib\/(data|rubric|review)/;
const REQUEST_TIME = /export const dynamic = "force-dynamic"/;

function declares(file: string): boolean {
  try {
    return REQUEST_TIME.test(readFileSync(file, "utf8"));
  } catch {
    return false;
  }
}

/** The route itself, or any layout above it: segment config applies to everything below it. */
function renderedOnDemand(route: string): boolean {
  if (declares(route)) return true;
  for (let dir = dirname(route); dir.startsWith(APP); dir = dirname(dir)) {
    if (declares(join(dir, "layout.tsx"))) return true;
  }
  return false;
}

describe("routes that read the working store", () => {
  const routes = routesUnder(APP);

  it("are found at all, so an empty sweep cannot pass as a green test", () => {
    expect(routes.length).toBeGreaterThan(10);
  });

  it("are never prerendered", () => {
    const baked = routes
      .filter((r) => READS_STORE.test(readFileSync(r, "utf8")))
      .filter((r) => !renderedOnDemand(r))
      .map((r) => relative(APP, r).split(sep).join("/"));
    expect(baked).toEqual([]);
  });
});
