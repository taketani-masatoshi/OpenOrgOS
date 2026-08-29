import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const THEME_PATH = join(ROOT, "apps/shared/oorgos-theme.css");
const APP_CSS = [
  "apps/shared/oorgos-theme.css",
  "apps/shared/operator-shell.css",
  "apps/shared/passkey-auth.css",
  "apps/steward-chat/src/app.css",
  "apps/steward-chat/src/orchestration-runs.css",
  "apps/steward-chat/src/receipt.css",
  "apps/wire-console/src/app.css",
];

type Rgb = [number, number, number];
type Color = { rgb: Rgb; alpha: number };

const AAA = 7;
const AA = 4.5;
const PAGE_SURFACES = ["--surface", "--surface-elevated", "--section-alt"] as const;

function channel(value: number): number {
  const v = value / 255;
  return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
}

function luminance(rgb: Rgb): number {
  return 0.2126 * channel(rgb[0]) + 0.7152 * channel(rgb[1]) + 0.0722 * channel(rgb[2]);
}

function contrastRatio(a: Rgb, b: Rgb): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

function overlay(fg: Color, bg: Rgb): Rgb {
  const a = fg.alpha;
  return [
    Math.round(fg.rgb[0] * a + bg[0] * (1 - a)),
    Math.round(fg.rgb[1] * a + bg[1] * (1 - a)),
    Math.round(fg.rgb[2] * a + bg[2] * (1 - a)),
  ];
}

function parseHex(value: string): Color | null {
  const hex = value.trim();
  const short = /^#([0-9a-f]{3})$/i.exec(hex);
  if (short) {
    const [r, g, b] = short[1].split("").map((c) => parseInt(c + c, 16));
    return { rgb: [r, g, b], alpha: 1 };
  }
  const full = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!full) return null;
  return {
    rgb: [
      parseInt(full[1].slice(0, 2), 16),
      parseInt(full[1].slice(2, 4), 16),
      parseInt(full[1].slice(4, 6), 16),
    ],
    alpha: 1,
  };
}

function parseRgba(value: string): Color | null {
  const m = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)$/i.exec(
    value.trim(),
  );
  if (!m) return null;
  return {
    rgb: [Number(m[1]), Number(m[2]), Number(m[3])],
    alpha: m[4] === undefined ? 1 : Number(m[4]),
  };
}

function extractBlock(css: string, selector: string): string {
  const start = css.indexOf(selector);
  if (start < 0) throw new Error(`Missing ${selector}`);
  const open = css.indexOf("{", start);
  let depth = 0;
  for (let i = open; i < css.length; i++) {
    if (css[i] === "{") depth++;
    else if (css[i] === "}") {
      depth--;
      if (depth === 0) return css.slice(open + 1, i);
    }
  }
  throw new Error(`Unclosed ${selector}`);
}

function parseDeclarations(block: string): Map<string, string> {
  const tokens = new Map<string, string>();
  for (const raw of block.split(";")) {
    const line = raw.replace(/\/\*[\s\S]*?\*\//g, "").trim();
    const match = /^(--[a-z0-9-]+)\s*:\s*(.+)$/i.exec(line);
    if (match) tokens.set(match[1], match[2].trim());
  }
  return tokens;
}

function resolveValue(name: string, tokens: Map<string, string>, seen = new Set<string>()): string {
  if (seen.has(name)) throw new Error(`Cycle at ${name}`);
  seen.add(name);
  const raw = tokens.get(name);
  if (!raw) throw new Error(`Unknown token ${name}`);
  const ref = /^var\((--[a-z0-9-]+)\)$/i.exec(raw);
  return ref ? resolveValue(ref[1], tokens, seen) : raw;
}

function resolveColor(name: string, tokens: Map<string, string>): Color {
  const value = resolveValue(name, tokens);
  const color = parseHex(value) ?? parseRgba(value);
  if (!color) throw new Error(`${name} is not a color: ${value}`);
  return color;
}

function solidOn(name: string, tokens: Map<string, string>, fallback: Rgb): Rgb {
  const color = resolveColor(name, tokens);
  return color.alpha < 1 ? overlay(color, fallback) : color.rgb;
}

function loadThemes(): { light: Map<string, string>; dark: Map<string, string> } {
  const css = readFileSync(THEME_PATH, "utf8");
  const light = parseDeclarations(extractBlock(css, ":root"));
  const dark = new Map(light);
  for (const [key, value] of parseDeclarations(extractBlock(css, 'html[data-theme="dark"]'))) {
    dark.set(key, value);
  }
  return { light, dark };
}

function expectAtLeast(label: string, fg: Rgb, bg: Rgb, min: number): void {
  const ratio = contrastRatio(fg, bg);
  expect(ratio, `${label} ${ratio.toFixed(2)}:1 < ${min}:1`).toBeGreaterThanOrEqual(min);
}

describe("oorgos theme contrast", () => {
  const { light, dark } = loadThemes();

  it.each([
    ["light", light],
    ["dark", dark],
  ] as const)("%s body and secondary text are AAA on page surfaces", (_name, tokens) => {
    const ink = resolveColor("--ink", tokens).rgb;
    const soft = resolveColor("--ink-soft", tokens).rgb;
    for (const surface of PAGE_SURFACES) {
      const bg = resolveColor(surface, tokens).rgb;
      expectAtLeast(`--ink on ${surface}`, ink, bg, AAA);
      expectAtLeast(`--ink-soft on ${surface}`, soft, bg, AAA);
    }
  });

  it.each([
    ["light", light],
    ["dark", dark],
  ] as const)("%s links are AAA on page surfaces", (_name, tokens) => {
    const accent = resolveColor("--accent", tokens).rgb;
    for (const surface of PAGE_SURFACES) {
      expectAtLeast(`--accent on ${surface}`, accent, resolveColor(surface, tokens).rgb, AAA);
    }
  });

  it.each([
    ["light", light],
    ["dark", dark],
  ] as const)("%s filled controls keep white text AAA, including hover", (_name, tokens) => {
    const onAccent = resolveColor("--on-accent", tokens).rgb;
    const fill = resolveColor("--accent-fill", tokens).rgb;
    const hover = resolveColor("--accent-hover", tokens).rgb;
    expectAtLeast("--on-accent on --accent-fill", onAccent, fill, AAA);
    expectAtLeast("--on-accent on --accent-hover", onAccent, hover, AAA);
    expect(
      luminance(hover),
      "filled hover must darken, not lighten",
    ).toBeLessThanOrEqual(luminance(fill));
  });

  it.each([
    ["light", light],
    ["dark", dark],
  ] as const)("%s semantic text is AAA on pages and AA on own tints", (_name, tokens) => {
    const elevated = resolveColor("--surface-elevated", tokens).rgb;
    const pairs: Array<[string, string]> = [
      ["--danger", "--danger-soft"],
      ["--success-text", "--success-bg"],
      ["--warning", "--warning-bg"],
    ];
    for (const [fgName, tintName] of pairs) {
      const fg = resolveColor(fgName, tokens).rgb;
      for (const surface of PAGE_SURFACES) {
        expectAtLeast(`${fgName} on ${surface}`, fg, resolveColor(surface, tokens).rgb, AAA);
      }
      expectAtLeast(`${fgName} on ${tintName}`, fg, solidOn(tintName, tokens, elevated), AA);
    }
  });

  it.each([
    ["light", light],
    ["dark", dark],
  ] as const)("%s inverse / code text is AAA", (_name, tokens) => {
    expectAtLeast(
      "--code-ink on --code-bg",
      resolveColor("--code-ink", tokens).rgb,
      resolveColor("--code-bg", tokens).rgb,
      AAA,
    );
  });

  it("does not fade text with transparent color-mix", () => {
    const hits: string[] = [];
    for (const rel of APP_CSS) {
      const css = readFileSync(join(ROOT, rel), "utf8");
      const re = /(?:^|[^\w-])color:\s*color-mix\([^;]*transparent/g;
      if (re.test(css)) hits.push(rel);
    }
    expect(hits, `faded text color in ${hits.join(", ")}`).toEqual([]);
  });
});
