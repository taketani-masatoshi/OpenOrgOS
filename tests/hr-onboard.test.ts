import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cpSync, existsSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  applyFactRefusalGuard,
  handleFactChatMessage,
  matchProviderByIntent,
} from "../src/lib/operator-facts/index.js";
import {
  applyHrOnboard,
  buildHrOnboardPlan,
  isHrOnboardIntent,
  parseHrOnboardIntent,
} from "../src/lib/hr/onboard.js";
import { handleHrOnboardChatMessage } from "../src/lib/steward-chat/hr-onboard-intent.js";
import {
  applyFakeDelegationGuard,
  looksLikeFakeDelegation,
} from "../src/lib/steward-chat/fake-delegation-guard.js";
import { loadEmployees } from "../src/lib/data.js";
import { getInstallRoot, refreshOrgOsPaths } from "../src/lib/orgos-paths.js";
import { setTenantId } from "../src/lib/tenant.js";

const HIRE_PHRASE = "社員が入社した。名前は大谷です。手続きを進めてほしい。";

describe("HR onboard intent vs headcount", () => {
  beforeEach(() => {
    setTenantId("mal");
  });

  it("matches the Otani hire phrase for onboard, not headcount", () => {
    expect(isHrOnboardIntent(HIRE_PHRASE)).toBe(true);
    expect(parseHrOnboardIntent(HIRE_PHRASE)?.name).toBe("大谷");
    expect(matchProviderByIntent(HIRE_PHRASE)).toBeUndefined();
    expect(handleFactChatMessage(HIRE_PHRASE).handled).toBe(false);
  });

  it("still answers headcount for count questions", () => {
    expect(matchProviderByIntent("従業員数は何人？")?.id).toBe("hr_headcount");
    const result = handleFactChatMessage("従業員数は何人？");
    expect(result.handled).toBe(true);
    expect(result.reply).toBe("4名");
  });

  it("returns a confirmation card plan for hire chat", async () => {
    const result = await handleHrOnboardChatMessage(HIRE_PHRASE, {
      fromAgent: "executive_steward",
    });
    expect(result.handled).toBe(true);
    expect(result.plan?.skill_id).toBe("hr_onboard");
    expect(result.plan?.status).toBe("needs_confirmation");
    expect(result.reply).toMatch(/入社手続き|EMP-|実行確認/);
    expect(result.reply).not.toMatch(/依頼しました/);
  });
});

describe("fake delegation guard", () => {
  beforeEach(() => {
    setTenantId("mal");
  });

  it("detects fake inbox claims without IMP", () => {
    expect(
      looksLikeFakeDelegation(
        "Human Resources Agent に大谷さんの入社手続きを依頼しました。結果はインボックスに届きます。"
      )
    ).toBe(true);
    expect(
      looksLikeFakeDelegation("人事担当に確認を依頼しました（受付 IMP-20260901-001）。")
    ).toBe(false);
  });

  it("replaces theater reply with onboard confirmation", async () => {
    const guarded = await applyFakeDelegationGuard(
      HIRE_PHRASE,
      "Human Resources Agent に大谷さんの入社手続きを依頼しました。結果はインボックスに届きます。",
      { fromAgent: "executive_steward" }
    );
    expect(guarded.guarded).toBe(true);
    expect(guarded.reply).toMatch(/入社手続き|実行確認|EMP-/);
    expect(guarded.reply).not.toMatch(/インボックスに届きます/);
  });

  it("does not treat headcount refusal as onboard theater", () => {
    const guarded = applyFactRefusalGuard(
      HIRE_PHRASE,
      "Human Resources Agent に確認が必要です。",
      { fromAgent: "executive_steward" }
    );
    expect(guarded.guarded).toBe(false);
  });
});

describe("hr onboard plan/apply on fixture tenant", () => {
  let restore: (() => void) | undefined;

  beforeEach(() => {
    const install = getInstallRoot();
    const srcTenant = join(install, "tenants", "southwood");
    const dir = mkdtempSync(join(tmpdir(), "orgos-hr-onboard-"));
    const destTenant = join(dir, "tenants", "southwood");
    mkdirSync(join(dir, "tenants"), { recursive: true });
    if (existsSync(srcTenant)) {
      cpSync(srcTenant, destTenant, { recursive: true });
    }
    const prevWorkspace = process.env.ORGOS_WORKSPACE;
    const prevTenant = process.env.ORGOS_TENANT;
    process.env.ORGOS_WORKSPACE = dir;
    process.env.ORGOS_TENANT = "southwood";
    refreshOrgOsPaths();
    setTenantId("southwood");
    restore = () => {
      rmSync(dir, { recursive: true, force: true });
      if (prevWorkspace === undefined) delete process.env.ORGOS_WORKSPACE;
      else process.env.ORGOS_WORKSPACE = prevWorkspace;
      if (prevTenant === undefined) delete process.env.ORGOS_TENANT;
      else process.env.ORGOS_TENANT = prevTenant;
      refreshOrgOsPaths();
      setTenantId("mal");
    };
  });

  afterEach(() => {
    restore?.();
    restore = undefined;
  });

  it("plans next EMP id without writing", () => {
    const plan = buildHrOnboardPlan({ name: "テスト太郎" });
    expect(plan.employee_id).toMatch(/^EMP-\d{3}$/);
    expect(plan.already_on_roster).toBe(false);
    const dry = applyHrOnboard({ name: "テスト太郎" }, { write: false });
    expect(dry.wrote).toBe(false);
    expect(dry.work_order_ids).toEqual([]);
  });

  it("applies L1 roster append and files work orders", () => {
    const before = loadEmployees().employees.length;
    const result = applyHrOnboard(
      { name: "テスト太郎", hired_date: "2026-09-01" },
      { write: true, fromAgent: "executive_steward" }
    );
    expect(result.ok).toBe(true);
    expect(result.wrote).toBe(true);
    expect(result.work_order_ids.length).toBeGreaterThan(0);
    expect(result.reply).toMatch(/IMP-\d{8}-\d+/);
    expect(result.reply).toMatch(/委譲と回答|実行状況/);
    expect(loadEmployees().employees.length).toBe(before + 1);
  });
});
