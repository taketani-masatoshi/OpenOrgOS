import type { Command } from "commander";
import { currentDate } from "../../../../src/lib/utils.js";
import { checkOperationsRecords, formatRecordsCheck } from "./records-check.js";
import {
  validateGuestRegister,
  formatGuestRegisterReport,
  appendGuestRegisterRow,
} from "./guest-register.js";
import {
  cleaningAccept,
  cleaningComplete,
  cleaningIssue,
  cleaningMessage,
  cleaningOrder,
  cleaningReportUpdate,
} from "./cleaning.js";
import { damageClaim, damageEvidence, damageLog } from "./damage.js";
import {
  loadRecurringTasks,
  recurringComplete,
  seedDefaultRecurringTasks,
} from "./recurring.js";
import {
  listIdDocsDuePurge,
  loadIdDocIndex,
  registerIdDoc,
  setAccessCode,
} from "./access-and-docs.js";
import { computeNightsCap } from "./nights-cap.js";
import { listGuestMessageTemplates, renderGuestMessage } from "./guest-message.js";
import { listHospitalityBlockers } from "./blockers.js";
import {
  formatSyncDerivedResult,
  runHospitalitySyncDerived,
} from "./sync-derived.js";
import {
  checkInStay,
  checkOutStay,
  computeStayMetrics,
  computeLodgingTax,
  defaultHospitalityPropertyId,
  importOtaFile,
  listHospitalityOpsDue,
  loadStays,
  markTaxFiled,
  markTaxPaid,
  taxStatus,
  upsertStay,
  writeTaxPack,
  type HospitalityStay,
} from "./ops-lib.js";

function printJson(value: unknown): void {
  console.log(JSON.stringify(value, null, 2));
}

function printStay(stay: HospitalityStay): void {
  console.log(
    `${stay.id}  ${stay.property_id}  ${stay.status}  ${stay.check_in}→${stay.check_out}  ${stay.party_size}名  ${stay.channel}`
  );
}

function periodOption(value?: string): string {
  return value || currentDate().slice(0, 7);
}

export function registerHospitalityCommands(operationsCmd: Command): void {
  const h = operationsCmd
    .command("hospitality")
    .description("旅館業 — 滞在台帳 · 宿泊税 · OTA 取込 · 稼働指標");

  h.command("stays")
    .description("滞在一覧")
    .option("--property <id>", "PROP-xxx")
    .option("--json", "JSON 出力")
    .action((opts: { property?: string; json?: boolean }) => {
      const stays = loadStays().stays.filter((s) => !opts.property || s.property_id === opts.property);
      if (opts.json) {
        printJson(stays);
        return;
      }
      if (stays.length === 0) {
        console.log("滞在なし（data/operations/stays.yaml）");
        return;
      }
      for (const stay of stays) printStay(stay);
    });

  h.command("show")
    .description("滞在詳細")
    .requiredOption("--id <stayId>", "STAY-YYYY-nnn")
    .option("--json", "JSON 出力")
    .action((opts: { id: string; json?: boolean }) => {
      const stay = loadStays().stays.find((s) => s.id === opts.id);
      if (!stay) {
        console.error(`stay not found: ${opts.id}`);
        process.exitCode = 1;
        return;
      }
      if (opts.json) printJson(stay);
      else printStay(stay);
    });

  h.command("stay-upsert")
    .description("滞在を追加または更新（PII なし）")
    .option("--id <stayId>", "省略時は採番")
    .requiredOption("--check-in <YYYY-MM-DD>")
    .requiredOption("--check-out <YYYY-MM-DD>")
    .option("--property <id>", "PROP-xxx")
    .option("--party-size <n>", "人数", (v) => Number(v), 1)
    .option("--rate <yen>", "1泊料金（税抜）", (v) => Number(v))
    .option("--channel <name>", "airbnb | booking | direct | other", "direct")
    .option("--ota-ref <ref>", "OTA 予約番号（非PII）")
    .option("--json", "JSON 出力")
    .action(
      (opts: {
        id?: string;
        checkIn: string;
        checkOut: string;
        property?: string;
        partySize: number;
        rate?: number;
        channel: HospitalityStay["channel"];
        otaRef?: string;
        json?: boolean;
      }) => {
        const stay = upsertStay({
          id: opts.id,
          property_id: opts.property ?? defaultHospitalityPropertyId(),
          check_in: opts.checkIn,
          check_out: opts.checkOut,
          party_size: opts.partySize,
          rate_per_night_jpy: opts.rate,
          channel: opts.channel,
          ota_ref: opts.otaRef,
        });
        if (opts.json) printJson(stay);
        else printStay(stay);
      }
    );

  h.command("check-in")
    .description("チェックイン")
    .requiredOption("--id <stayId>")
    .action((opts: { id: string }) => {
      printStay(checkInStay(opts.id));
    });

  h.command("check-out")
    .description("チェックアウト（清掃を pending に）")
    .requiredOption("--id <stayId>")
    .action((opts: { id: string }) => {
      printStay(checkOutStay(opts.id));
    });

  h.command("metrics")
    .description("稼働 · ADR · RevPAR")
    .option("--period <YYYY-MM>")
    .option("--property <id>")
    .option("--json", "JSON 出力")
    .action((opts: { period?: string; property?: string; json?: boolean }) => {
      const metrics = computeStayMetrics(
        periodOption(opts.period),
        opts.property ?? defaultHospitalityPropertyId()
      );
      if (opts.json) {
        printJson(metrics);
        return;
      }
      console.log(
        `${metrics.period}  ${metrics.property_id}  稼働 ${Math.round(metrics.occupancy * 1000) / 10}%  ADR ¥${Math.round(metrics.adr)}  RevPAR ¥${Math.round(metrics.revpar)}  泊数 ${metrics.occupied_nights}/${metrics.available_nights}`
      );
    });

  h.command("ota-import")
    .description("OTA CSV / iCal を stays.yaml に取り込む（公式 API なし）")
    .requiredOption("--file <path>")
    .option("--property <id>")
    .option("--format <csv|ical>", "csv または ical", "csv")
    .action((opts: { file: string; property?: string; format: string }) => {
      const format = opts.format === "ical" || opts.format === "ics" ? "ical" : "csv";
      const result = importOtaFile(opts.file, format, opts.property ?? defaultHospitalityPropertyId());
      console.log(`imported ${result.imported.length} · skipped ${result.skipped.length}`);
      for (const stay of result.imported) printStay(stay);
      for (const id of result.skipped) console.log(`skip duplicate ${id}`);
    });

  h.command("tax-compute")
    .description("宿泊税を算定して台帳へ書く")
    .option("--period <YYYY-MM>")
    .action((opts: { period?: string }) => {
      const period = periodOption(opts.period);
      computeLodgingTax(period);
      const rows = taxStatus(period);
      printJson(rows);
    });

  h.command("tax-status")
    .description("宿泊税の申告・納付ギャップ")
    .option("--period <YYYY-MM>")
    .option("--json", "JSON 出力")
    .action((opts: { period?: string; json?: boolean }) => {
      const rows = taxStatus(periodOption(opts.period));
      if (opts.json) {
        printJson(rows);
        return;
      }
      for (const row of rows) {
        console.log(
          `${row.period}  ${row.filing?.status ?? "—"}  税¥${row.tax_jpy}  済¥${row.paid_jpy}  差¥${row.gap_jpy}  期限 ${row.filing?.due_on ?? "—"}`
        );
      }
    });

  h.command("tax-pack")
    .description("社内申告サマリ MD を生成（行政送信しない）")
    .option("--period <YYYY-MM>")
    .action((opts: { period?: string }) => {
      const path = writeTaxPack(periodOption(opts.period));
      console.log(path);
    });

  h.command("tax-filed")
    .description("行政への申告日を記録")
    .option("--period <YYYY-MM>")
    .requiredOption("--filed-on <YYYY-MM-DD>")
    .action((opts: { period?: string; filedOn: string }) => {
      const filing = markTaxFiled(periodOption(opts.period), opts.filedOn);
      printJson(filing);
    });

  h.command("tax-pay")
    .description("宿泊税の納付を記録")
    .option("--period <YYYY-MM>")
    .requiredOption("--amount <yen>")
    .requiredOption("--paid-on <YYYY-MM-DD>")
    .action((opts: { period?: string; amount: string; paidOn: string }) => {
      const period = periodOption(opts.period);
      markTaxPaid(period, Number(opts.amount), opts.paidOn);
      printJson(taxStatus(period));
    });

  h.command("ops-due")
    .description("Today 向け期限（税 · 滞在 · 清掃）")
    .option("--json", "JSON 出力")
    .action((opts: { json?: boolean }) => {
      const items = listHospitalityOpsDue();
      if (opts.json) {
        printJson(items);
        return;
      }
      if (items.length === 0) {
        console.log("期限なし");
        return;
      }
      for (const item of items) {
        console.log(`[${item.severity}] ${item.title}  ${item.cli_hint}`);
      }
    });

  h.command("register-validate")
    .description("宿泊者名簿の法定フィールド検証（PII 値は出力しない）")
    .option("--year <YYYY>")
    .option("--month <MM>")
    .option("--json", "JSON 出力")
    .option("--strict", "error 時に exit 1")
    .action((opts: { year?: string; month?: string; json?: boolean; strict?: boolean }) => {
      const result = validateGuestRegister({ year: opts.year, month: opts.month });
      if (opts.json) {
        printJson(result);
      } else {
        console.log(formatGuestRegisterReport(result));
      }
      if (opts.strict && result.issues.some((i) => i.level === "error")) {
        process.exitCode = 1;
      }
    });

  h.command("records-check")
    .description("operations/records の CSV 行数確認")
    .action(() => {
      console.log(formatRecordsCheck(checkOperationsRecords()));
    });

  h.command("cleaning-order")
    .description("清掃発注")
    .requiredOption("--stay-id <id>")
    .option("--vendor <ref>")
    .action((opts: { stayId: string; vendor?: string }) => {
      const report = cleaningOrder(opts.stayId, opts.vendor);
      console.log(`${report.id}  ${report.status}  stay=${report.stay_id}`);
    });

  h.command("cleaning-complete")
    .description("清掃完了（vendor submitted）")
    .requiredOption("--stay-id <id>")
    .action((opts: { stayId: string }) => {
      const report = cleaningComplete(opts.stayId);
      console.log(`${report.id}  ${report.status}`);
    });

  h.command("cleaning-report")
    .description("清掃レポート（Drive URL / path refs）")
    .requiredOption("--stay-id <id>")
    .option("--drive-folder-url <url>")
    .option("--photo-path <path>", "追加 path ref", (v, acc: string[] = []) => [...acc, v], [])
    .action((opts: { stayId: string; driveFolderUrl?: string; photoPath: string[] }) => {
      const report = cleaningReportUpdate(opts.stayId, {
        driveFolderUrl: opts.driveFolderUrl,
        photoPathRefs: opts.photoPath.length ? opts.photoPath : undefined,
      });
      console.log(`${report.id}  photos=${report.photo_path_refs.length}`);
    });

  h.command("cleaning-accept")
    .description("清掃検収（stay.cleaning_status → done）")
    .requiredOption("--stay-id <id>")
    .action((opts: { stayId: string }) => {
      const report = cleaningAccept(opts.stayId);
      console.log(`${report.id}  accepted ${report.accepted_on}`);
    });

  h.command("cleaning-issue")
    .description("清掃 issue 記録")
    .requiredOption("--stay-id <id>")
    .requiredOption("--summary <text>")
    .option("--liability <who>", "vendor|host|guest|shared|unclear")
    .action((opts: { stayId: string; summary: string; liability?: string }) => {
      const report = cleaningIssue(opts.stayId, opts.summary, opts.liability as never);
      console.log(`${report.id}  issue`);
    });

  h.command("cleaning-message")
    .description("清掃 vendor メッセージ log")
    .requiredOption("--stay-id <id>")
    .requiredOption("--direction <out|in>")
    .requiredOption("--summary <text>")
    .action((opts: { stayId: string; direction: "out" | "in"; summary: string }) => {
      cleaningMessage(opts.stayId, opts.direction, opts.summary);
      console.log("logged");
    });

  h.command("damage-log")
    .description("破損 incident 記録")
    .option("--id <damageId>")
    .option("--stay-id <id>")
    .requiredOption("--description <text>")
    .option("--estimated-jpy <n>", "見積 JPY", (v) => Number(v))
    .action(
      (opts: {
        id?: string;
        stayId?: string;
        description: string;
        estimatedJpy?: number;
      }) => {
        const incident = damageLog({
          id: opts.id,
          stayId: opts.stayId,
          itemDescription: opts.description,
          estimatedJpy: opts.estimatedJpy,
        });
        console.log(`${incident.id}  ${incident.claim_status}`);
      }
    );

  h.command("damage-evidence")
    .description("破損 evidence path refs")
    .requiredOption("--id <damageId>")
    .requiredOption("--path <ref>", "path ref", (v, acc: string[] = []) => [...acc, v], [])
    .option("--drive-folder-url <url>")
    .action((opts: { id: string; path: string[]; driveFolderUrl?: string }) => {
      const incident = damageEvidence(opts.id, opts.path, opts.driveFolderUrl);
      console.log(`${incident.id}  evidence=${incident.evidence_path_refs.length}`);
    });

  h.command("damage-claim")
    .description("破損 claim ステータス")
    .requiredOption("--id <damageId>")
    .requiredOption("--status <none|preparing|filed|settled|denied>")
    .option("--insurance-policy <ref>")
    .action((opts: { id: string; status: string; insurancePolicy?: string }) => {
      const incident = damageClaim(opts.id, opts.status as never, opts.insurancePolicy);
      console.log(`${incident.id}  ${incident.claim_status}`);
    });

  h.command("recurring-list")
    .description("定期 ops タスク一覧")
    .option("--json")
    .action((opts: { json?: boolean }) => {
      seedDefaultRecurringTasks();
      const tasks = loadRecurringTasks().tasks;
      if (opts.json) printJson(tasks);
      else for (const t of tasks) console.log(`${t.id}  ${t.next_due}  ${t.title}`);
    });

  h.command("recurring-complete")
    .description("定期タスク完了（next_due 繰上げ）")
    .requiredOption("--id <taskId>")
    .option("--completed-on <YYYY-MM-DD>")
    .action((opts: { id: string; completedOn?: string }) => {
      const task = recurringComplete(opts.id, opts.completedOn);
      console.log(`${task.id}  next=${task.next_due}`);
    });

  h.command("access-code")
    .description("鍵コード設定（値は出力しない）")
    .requiredOption("--stay-id <id>")
    .requiredOption("--code <code>")
    .action((opts: { stayId: string; code: string }) => {
      setAccessCode(opts.stayId, opts.code);
      console.log(`access code set for ${opts.stayId}`);
    });

  h.command("id-docs-list")
    .description("ID 文書索引")
    .option("--json")
    .action((opts: { json?: boolean }) => {
      const entries = loadIdDocIndex().entries;
      if (opts.json) printJson(entries);
      else for (const e of entries) console.log(`${e.id}  ${e.stay_id}  until ${e.retained_until}`);
    });

  h.command("id-docs-register")
    .description("ID 文書 path 登録")
    .requiredOption("--stay-id <id>")
    .requiredOption("--type <passport|residence_card|drivers_license|other>")
    .requiredOption("--path <relativePath>")
    .requiredOption("--retained-until <YYYY-MM-DD>")
    .action(
      (opts: {
        stayId: string;
        type: "passport" | "residence_card" | "drivers_license" | "other";
        path: string;
        retainedUntil: string;
      }) => {
        const entry = registerIdDoc({
          stayId: opts.stayId,
          docType: opts.type,
          relativePath: opts.path,
          retainedUntil: opts.retainedUntil,
        });
        console.log(`${entry.id}  registered`);
      }
    );

  h.command("id-docs-purge")
    .description("保持期限超過 ID 文書（削除候補 path のみ列挙）")
    .option("--json")
    .action((opts: { json?: boolean }) => {
      const due = listIdDocsDuePurge();
      if (opts.json) printJson(due.map((d) => ({ id: d.id, path: d.relative_path })));
      else for (const d of due) console.log(`${d.id}  ${d.relative_path}`);
    });

  h.command("register-append")
    .description("宿泊者名簿 CSV へ追記（PII は stdout に出さない）")
    .requiredOption("--i-understand-pii")
    .requiredOption("--stay-id <id>")
    .requiredOption("--guest-name <name>")
    .requiredOption("--address <text>")
    .requiredOption("--occupation <text>")
    .requiredOption("--check-in <YYYY-MM-DD>")
    .requiredOption("--check-out <YYYY-MM-DD>")
    .option("--nationality <code>")
    .option("--passport <ref>")
    .action(
      (opts: {
        iUnderstandPii: boolean;
        stayId: string;
        guestName: string;
        address: string;
        occupation: string;
        checkIn: string;
        checkOut: string;
        nationality?: string;
        passport?: string;
      }) => {
        if (!opts.iUnderstandPii) {
          console.error("--i-understand-pii が必要です");
          process.exitCode = 1;
          return;
        }
        const result = appendGuestRegisterRow({
          stayId: opts.stayId,
          guestName: opts.guestName,
          address: opts.address,
          occupation: opts.occupation,
          checkInDate: opts.checkIn,
          checkOutDate: opts.checkOut,
          nationality: opts.nationality,
          passportOrIdNumber: opts.passport,
        });
        console.log(`${result.rowsAppended} 行追記 (${result.file})`);
      }
    );

  const guestMessage = h
    .command("guest-message")
    .description("ゲスト向け文面生成（templates/messages/）");

  guestMessage
    .command("list")
    .description("テンプレ一覧")
    .action(() => {
      for (const t of listGuestMessageTemplates()) console.log(t.id);
    });

  guestMessage
    .command("render")
    .description("文面レンダリング（PII プレースホルダ）")
    .requiredOption("--template <id>")
    .requiredOption("--stay-id <id>")
    .action((opts: { template: string; stayId: string }) => {
      console.log(renderGuestMessage(opts.template, opts.stayId));
    });

  h.command("nights-cap")
    .description("民泊 180 日キャップ（簡易宿所は非適用）")
    .option("--year <YYYY>")
    .option("--json")
    .action((opts: { year?: string; json?: boolean }) => {
      const result = computeNightsCap(opts.year ?? currentDate().slice(0, 4));
      if (opts.json) printJson(result);
      else if (!result.cap_applies) {
        console.log(
          `${result.year}: ${result.occupied_nights} 泊 · キャップ非適用（${result.permit_kind}）`
        );
      } else {
        console.log(
          `${result.year}: ${result.occupied_nights}/${result.cap} 泊 · 残 ${result.remaining} 日 · ${result.severity}`
        );
      }
    });

  h.command("blockers")
    .description("P0 ゲート · コンプラ · 期限の集約")
    .option("--json")
    .action((opts: { json?: boolean }) => {
      const blockers = listHospitalityBlockers();
      if (opts.json) printJson(blockers);
      else if (!blockers.length) console.log("blocker なし");
      else for (const b of blockers) console.log(`[${b.severity}] ${b.title} — ${b.cli_hint}`);
    });

  h.command("sync-derived")
    .description("公開 YAML · ゲスト MD マーカーを kamezawa-public / PROP-002 から同期")
    .option("--write", "ファイルへ書き込み（省略時 dry-run）")
    .option("--dry-run", "変更内容のみ表示（既定）")
    .option("--json", "JSON 出力")
    .action((opts: { write?: boolean; dryRun?: boolean; json?: boolean }) => {
      const result = runHospitalitySyncDerived({
        write: Boolean(opts.write),
        dryRun: Boolean(opts.dryRun) || !opts.write,
      });
      if (opts.json) printJson(result);
      else console.log(formatSyncDerivedResult(result));
    });
}
