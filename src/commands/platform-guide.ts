import {
  buildPlatformGuideJson,
  buildPlatformGuideMarkdown,
  resolvePlatformGuideTopics,
  warnLegacyPlatformGuideChecklist,
} from "../lib/platform-implement-guide.js";

export interface PlatformGuideOptions {
  topic?: string;
  json?: boolean;
}

export function runPlatformGuide(opts: PlatformGuideOptions = {}): void {
  warnLegacyPlatformGuideChecklist();
  let topics;
  try {
    topics = resolvePlatformGuideTopics(opts.topic);
  } catch (err) {
    console.error(String(err));
    process.exit(1);
  }

  if (opts.json) {
    console.log(JSON.stringify(buildPlatformGuideJson(topics), null, 2));
    return;
  }

  process.stdout.write(buildPlatformGuideMarkdown(topics));
}
