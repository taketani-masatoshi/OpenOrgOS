#!/usr/bin/env node
/**
 * Fill in `impl.routes` for every OOO item from what the code and the surface
 * documents already agree on.
 *
 * Most `impl.sources` are shared dispatchers — `chat-api.ts` alone answers 55
 * routes — so an act scored against every route in its file is scored on the
 * file, not the act. The claimed set is the intersection of "routes this act's
 * sources answer" and "routes this act's documents describe", plus whatever the
 * HTTP evidence touches.
 *
 * Run it after adding an item or moving a route; review the diff.
 *
 *   npm run ooo:claim-routes
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import YAML from "yaml";
import { ROOT_DIR } from "../src/lib/tenant.js";
import { routeCatalog } from "./ooo-routes.js";

const ITEMS_PATH = join(ROOT_DIR, "docs/org-os/ooo-capability-items.yaml");
const DOC_ROUTE = /`(GET|POST|PUT|PATCH|DELETE)\s+(\/[^\s`]+)`/g;

interface ItemShape {
  spec?: { docs?: string[] } | null;
  impl?: { sources?: string[] } | null;
  http?: { route?: string } | null;
}

function normalize(path: string): string {
  return path.replace(/:[^/]+/g, ":id").replace(/\/$/, "");
}

function main(): void {
  const doc = YAML.parseDocument(readFileSync(ITEMS_PATH, "utf-8"));
  const items = (doc.toJS() as { items: ItemShape[] }).items;
  const catalog = routeCatalog();
  let filled = 0;

  items.forEach((item, index) => {
    const sources = new Set(item.impl?.sources ?? []);
    const own = catalog.filter((route) => sources.has(route.source));
    if (own.length === 0) return;

    const documented = new Set<string>();
    for (const path of item.spec?.docs ?? []) {
      const text = readFileSync(join(ROOT_DIR, path), "utf-8");
      for (const match of text.matchAll(DOC_ROUTE)) {
        documented.add(`${match[1]} ${normalize(match[2])}`);
      }
    }
    const httpRoute = item.http?.route ? normalize(item.http.route) : null;

    const claimed = [
      ...new Set(
        own.map((route) => `${route.method === "ANY" ? "POST" : route.method} ${normalize(route.path)}`),
      ),
    ].filter((key) => documented.has(key) || (httpRoute && key.endsWith(` ${httpRoute}`)));
    if (claimed.length === 0) return;

    doc.setIn(["items", index, "impl", "routes"], claimed.sort());
    filled += 1;
  });

  writeFileSync(ITEMS_PATH, doc.toString({ lineWidth: 0 }));
  console.log(`${filled} 件に経路を書き戻した / 全 ${items.length} 件`);
}

main();
