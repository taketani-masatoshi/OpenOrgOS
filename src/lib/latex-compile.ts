import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { ASSETS_DIR } from "./utils.js";

export type LatexEngine = "xelatex" | "tectonic" | "pdflatex";

const ENGINE_ORDER: LatexEngine[] = ["xelatex", "tectonic", "pdflatex"];

export function detectLatexEngine(): LatexEngine | null {
  for (const engine of ENGINE_ORDER) {
    try {
      execFileSync("which", [engine], { stdio: "ignore" });
      return engine;
    } catch {
      // try next
    }
  }
  return null;
}

export function resolveJapaneseLatexFont(): string | null {
  const candidates = [
    join(ASSETS_DIR, "fonts/NotoSansCJKjp-Regular.otf"),
    "/System/Library/Fonts/Hiragino Sans GB.ttc",
    "/System/Library/Fonts/Supplemental/Arial Unicode.ttf",
  ];
  for (const path of candidates) {
    if (existsSync(path)) return path;
  }
  return null;
}

/** Fontspec lines for Japanese PDF (repo Noto or system fallback). */
export function buildJapaneseLatexFontSetup(): string {
  const fontPath = resolveJapaneseLatexFont();
  if (!fontPath) {
    return [
      "\\usepackage{fontspec}",
      "\\usepackage{xeCJK}",
      "\\usepackage{geometry}",
      "\\geometry{margin=22mm}",
    ].join("\n");
  }
  const dir = `${dirname(fontPath)}/`;
  const file = basename(fontPath);
  const stem = file.replace(/\.(otf|ttf|ttc)$/i, "");
  const ext = file.slice(stem.length);
  return [
    "\\usepackage{fontspec}",
    "\\usepackage{xeCJK}",
    "\\usepackage{geometry}",
    "\\geometry{margin=22mm}",
    `\\setmainfont{${stem}${ext}}[Path=${dir}]`,
    `\\setCJKmainfont{${stem}${ext}}[Path=${dir}]`,
  ].join("\n");
}

export interface CompileLatexOptions {
  engine?: LatexEngine;
  workDir?: string;
  passes?: number;
}

export interface CompileLatexResult {
  pdfPath: string;
  engine: LatexEngine;
  logPath: string;
}

/** Compile a .tex file to PDF. Prefers xelatex for Japanese templates. */
export function compileLatexToPdf(
  texPath: string,
  options: CompileLatexOptions = {}
): CompileLatexResult {
  const engine = options.engine ?? detectLatexEngine();
  if (!engine) {
    throw new Error(
      "LaTeX engine not found. Install MacTeX / TeX Live (xelatex) or `brew install tectonic`."
    );
  }
  if (!existsSync(texPath)) {
    throw new Error(`TeX source not found: ${texPath}`);
  }

  const workDir = options.workDir ?? dirname(texPath);
  mkdirSync(workDir, { recursive: true });
  const passes = options.passes ?? 1;
  const base = basename(texPath, ".tex");

  if (engine === "tectonic") {
    execFileSync(
      "tectonic",
      ["-X", "compile", texPath, "--outdir", workDir],
      { cwd: workDir, stdio: "pipe" }
    );
  } else {
    for (let i = 0; i < passes; i++) {
      execFileSync(
        engine,
        ["-interaction=nonstopmode", "-halt-on-error", `-output-directory=${workDir}`, texPath],
        { cwd: workDir, stdio: "pipe" }
      );
    }
  }

  const pdfPath = join(workDir, `${base}.pdf`);
  if (!existsSync(pdfPath)) {
    throw new Error(`PDF was not produced: ${pdfPath}`);
  }

  const logPath = join(workDir, `${base}.log`);
  return { pdfPath, engine, logPath };
}

/** Inject Japanese font setup for xelatex when template omits fontspec. */
export function ensureJapaneseLatexPreamble(tex: string): string {
  if (tex.includes("\\usepackage{fontspec}") || tex.includes("\\usepackage{xeCJK}")) {
    return tex;
  }
  const font = resolveJapaneseLatexFont();
  if (!font) return tex;
  const preamble = buildJapaneseLatexFontSetup();
  if (tex.includes("\\begin{document}")) {
    return tex.replace("\\begin{document}", `${preamble}\n\\begin{document}`);
  }
  return `${preamble}\n${tex}`;
}

export function writeTexAndCompile(
  texContent: string,
  outTexPath: string,
  options: CompileLatexOptions = {}
): CompileLatexResult {
  const prepared = ensureJapaneseLatexPreamble(texContent);
  mkdirSync(dirname(outTexPath), { recursive: true });
  writeFileSync(outTexPath, prepared, "utf-8");
  return compileLatexToPdf(outTexPath, options);
}
