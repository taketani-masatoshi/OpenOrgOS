import { describe, expect, it } from "vitest";
import {
  buildCommunityConsoleStartUrl,
  communityConnectionsPageUrl,
  communityConsoleOrigin,
} from "../apps/shared/community-console-handoff.js";

describe("community console handoff URL", () => {
  it("builds /ops/console/start with encoded next path", () => {
    const url = buildCommunityConsoleStartUrl("/settings/");
    expect(url).toBe(
      `${communityConsoleOrigin()}/ops/console/start?next=${encodeURIComponent("/settings/")}`,
    );
  });

  it("falls back to /settings/ for unsafe next paths", () => {
    const url = buildCommunityConsoleStartUrl("//evil.example/phish");
    expect(url).toContain("next=%2Fsettings%2F");
  });

  it("builds Community Connections URL", () => {
    expect(communityConnectionsPageUrl()).toBe(
      `${communityConsoleOrigin()}/settings/connections`,
    );
  });
});
