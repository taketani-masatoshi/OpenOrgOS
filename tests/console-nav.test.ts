import { describe, expect, it } from "vitest";
import {
  buildConsoleHref,
  buildConsoleSearch,
  consoleSectionFromView,
  parseConsoleView,
  shellTabFromView,
  wantsExecutiveHome,
  wantsLedgerWorkbench,
} from "../apps/steward-chat/src/console-nav";
import {
  operatorShellTabFromRoute,
  pathActive,
  spaPathFromHref,
} from "../apps/steward-chat/src/console-routing";

describe("console-nav", () => {
  it("defaults to executive home on empty search", () => {
    expect(parseConsoleView("")).toBe("executive");
    expect(shellTabFromView("executive")).toBe("executive");
    expect(consoleSectionFromView("executive")).toBe("executive");
    expect(wantsExecutiveHome("")).toBe(true);
    expect(wantsLedgerWorkbench("")).toBe(false);
  });

  it("maps wallet query for budget reload resilience", () => {
    expect(parseConsoleView("?wallet=1")).toBe("wallet");
    expect(shellTabFromView("wallet")).toBe("yojitsu");
    expect(buildConsoleSearch("wallet")).toBe("?wallet=1");
    expect(buildConsoleHref("wallet")).toBe("/?wallet=1");
  });

  it("keeps legacy query URLs", () => {
    expect(parseConsoleView("?tax=1")).toBe("tax");
    expect(parseConsoleView("?onboarding=1")).toBe("onboarding");
    expect(parseConsoleView("?receipt=1")).toBe("receipt");
    expect(parseConsoleView("?receipt-issue=1")).toBe("receipt-issue");
    expect(shellTabFromView("tax")).toBe("ledger");
    expect(shellTabFromView("receipt")).toBe("torihiki");
    expect(shellTabFromView("onboarding")).toBeNull();
  });

  it("detects ledger workbench only with explicit query", () => {
    expect(wantsLedgerWorkbench("")).toBe(false);
    expect(wantsLedgerWorkbench("?ledger=1")).toBe(true);
    expect(wantsLedgerWorkbench("?wallet=1")).toBe(false);
    expect(wantsLedgerWorkbench("?tax=1")).toBe(false);
    expect(parseConsoleView("?ledger=1")).toBe("ledger");
  });
});

describe("console-routing secretary workbench", () => {
  it("resolves /secretary/workbench/ before /secretary/", () => {
    expect(pathActive("/secretary/workbench")).toBe("secretary-workbench");
    expect(pathActive("/secretary/workbench/")).toBe("secretary-workbench");
    expect(pathActive("/secretary/")).toBe("secretary");
    expect(operatorShellTabFromRoute("secretary-workbench")).toBe("secretary");
    expect(spaPathFromHref("/secretary/workbench/", "http://localhost")).toBe(
      "/secretary/workbench/",
    );
  });
});
