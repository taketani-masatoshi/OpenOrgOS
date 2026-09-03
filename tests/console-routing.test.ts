import { describe, expect, it } from "vitest";
import {
  operatorShellTabFromRoute,
  pathActive,
  spaPathFromHref,
} from "../apps/steward-chat/src/console-routing";

describe("console-routing", () => {
  it("maps /wire/ to wire shell route", () => {
    expect(pathActive("/wire/")).toBe("wire");
    expect(pathActive("/wire")).toBe("wire");
  });

  it("maps /wire/settings to settings", () => {
    expect(pathActive("/wire/settings/")).toBe("settings");
  });

  it("soft-nav includes /wire/", () => {
    expect(spaPathFromHref("/wire/", "http://127.0.0.1:9470")).toBe("/wire/");
    expect(spaPathFromHref("http://127.0.0.1:9470/wire/", "http://127.0.0.1:9470")).toBe("/wire/");
  });

  it("rejects external origins", () => {
    expect(spaPathFromHref("https://example.com/wire/", "http://127.0.0.1:9470")).toBeNull();
  });

  it("maps contracts and stays console routes", () => {
    expect(pathActive("/contracts/")).toBe("contracts");
    expect(pathActive("/stays/")).toBe("stays");
    expect(spaPathFromHref("/contracts/", "http://127.0.0.1:9470")).toBe("/contracts/");
    expect(spaPathFromHref("/stays/", "http://127.0.0.1:9470")).toBe("/stays/");
  });

  it("keeps one-time configuration routes outside primary navigation", () => {
    expect(operatorShellTabFromRoute("agent-add")).toBeUndefined();
    expect(operatorShellTabFromRoute("module-list")).toBeUndefined();
    expect(operatorShellTabFromRoute("llm-workers")).toBeUndefined();
    expect(operatorShellTabFromRoute("agent-list")).toBe("agent-list");
  });
});
