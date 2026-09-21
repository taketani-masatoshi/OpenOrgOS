import { realpathSync } from "node:fs";

function realPath(path: string | undefined): string | undefined {
  if (!path?.trim()) return undefined;
  try {
    return realpathSync(path.trim());
  } catch {
    return undefined;
  }
}

/** The standard fixture restore replaces tenant paths and requires an isolated checkout. */
export function assertDisposableTestWorkspace(
  workspaceRoot: string,
  env: NodeJS.ProcessEnv = process.env,
): void {
  const actual = realPath(workspaceRoot);
  const explicit = realPath(env.ORGOS_TEST_DISPOSABLE_ROOT);
  const githubJob = env.CI === "true" && env.GITHUB_ACTIONS === "true";
  if (actual && (actual === explicit || githubJob)) return;
  throw new Error(
    "Vitest fixture restore can replace tenant files. Run in a disposable checkout " +
      "with ORGOS_TEST_DISPOSABLE_ROOT set to that checkout path, or in GitHub Actions. " +
      `Refusing to modify ${workspaceRoot}.`,
  );
}
