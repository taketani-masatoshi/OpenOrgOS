import type { ModuleCliBundle } from "../../../../../../src/lib/module-cli-types.js";
import type { SkillRunOptions } from "../../../../../../src/commands/skills.js";
import {
  attestCertification,
  grantCertification,
  listActiveCertTypeIds,
  loadCertificationRegistry,
  loadCertificationTypes,
  renewCertification,
  scanExpiredCertifications,
  startCertificationCase,
} from "../../../../../../src/lib/certification-workflow.js";
import { listPermitOpeningBlockers } from "../../../../../../src/lib/permit-opening-gate.js";

export const MODULE_ID = "jp_certification";


function runCertificationListSkill(opts: SkillRunOptions): void {
  const { data } = loadCertificationRegistry();
  if (opts.json) {
    console.log(JSON.stringify(data, null, 2));
    return;
  }
  console.log(`# Certifications (${data.certifications.length})\n`);
  for (const c of data.certifications) {
    console.log(
      `- ${c.id} · ${c.cert_type_id} · ${c.status}` +
        (c.expires_on ? ` · exp ${c.expires_on}` : "")
    );
  }
  if (!data.certifications.length) console.log("（なし）");
}

function runCertificationTypesSkill(opts: SkillRunOptions): void {
  const data = loadCertificationTypes();
  if (!data) {
    console.error("certification-types not found");
    process.exitCode = 1;
    return;
  }
  if (opts.json) {
    console.log(JSON.stringify(data, null, 2));
    return;
  }
  console.log(`# Certification types (${data.types.length})\n`);
  for (const t of data.types) {
    console.log(`- \`${t.id}\` — ${t.name_ja}${t.scheme ? ` [${t.scheme}]` : ""}`);
  }
}

export const jp_certificationCli: ModuleCliBundle = {
  moduleId: MODULE_ID,
  register(ctx) {
    const cmd = ctx.operationsCmd
      .command("certification")
      .description(
        "Certification Fulfilment — obtain/renew/attest/gate (ISO/ISMS/CE/FDA)"
      );

    cmd
      .command("types")
      .description("List certification types")
      .option("--json", "JSON")
      .action((opts: { json?: boolean }) => {
        const data = loadCertificationTypes();
        if (!data) {
          console.error("certification-types not found");
          process.exitCode = 1;
          return;
        }
        if (opts.json) {
          console.log(JSON.stringify(data, null, 2));
          return;
        }
        console.log(`# Certification types (${data.types.length})\n`);
        for (const t of data.types) {
          console.log(`- \`${t.id}\` — ${t.name_ja}${t.scheme ? ` [${t.scheme}]` : ""}`);
        }
      });

    cmd
      .command("list")
      .description("List CERT-* instances")
      .option("--json", "JSON")
      .action((opts: { json?: boolean }) => {
        const { data } = loadCertificationRegistry();
        if (opts.json) {
          console.log(JSON.stringify(data, null, 2));
          return;
        }
        console.log(`# Certifications (${data.certifications.length})\n`);
        for (const c of data.certifications) {
          console.log(
            `- ${c.id} · ${c.cert_type_id} · ${c.status}` +
              (c.expires_on ? ` · exp ${c.expires_on}` : "")
          );
        }
        if (!data.certifications.length) console.log("（なし）");
      });

    cmd
      .command("start")
      .description("Start obtain case (status=in_progress)")
      .requiredOption("--type <cert_type_id>", "e.g. cert-iso-27001")
      .option("--notes <text>")
      .option("--write")
      .option("--json")
      .action((opts) => {
        try {
          const r = startCertificationCase({
            type: opts.type,
            notes: opts.notes,
            write: opts.write,
          });
          if (opts.json) {
            console.log(JSON.stringify(r, null, 2));
            return;
          }
          console.log(`# Certification start — ${r.cert.id}\n`);
          console.log(`${r.cert.cert_type_id} · ${r.cert.status}`);
          if (r.event_id) console.log(`event: ${r.event_id}`);
          if (!opts.write) console.log("\n`--write` で registry 保存");
        } catch (e) {
          console.error(e instanceof Error ? e.message : e);
          process.exit(1);
        }
      });

    cmd
      .command("attest")
      .description("Declare pre-existing / store certificate → active")
      .requiredOption("--type <cert_type_id>")
      .requiredOption("--certificate-number <no>")
      .requiredOption("--issued-on <YYYY-MM-DD>")
      .option("--expires-on <YYYY-MM-DD>")
      .requiredOption("--evidence <path>", "Certificate PDF")
      .option("--write")
      .option("--json")
      .action((opts) => {
        try {
          const r = attestCertification({
            type: opts.type,
            certificateNumber: opts.certificateNumber,
            issuedOn: opts.issuedOn,
            expiresOn: opts.expiresOn,
            evidence: opts.evidence,
            write: opts.write,
          });
          if (opts.json) {
            console.log(JSON.stringify(r, null, 2));
            return;
          }
          console.log(`# Certification attest — ${r.cert.id}\n`);
          console.log(`${r.cert.cert_type_id} · ${r.cert.status} · ${r.cert.evidence_path ?? ""}`);
          if (r.event_id) console.log(`event: ${r.event_id}`);
          if (!opts.write) console.log("\n`--write` で保存");
        } catch (e) {
          console.error(e instanceof Error ? e.message : e);
          process.exit(1);
        }
      });

    cmd
      .command("grant")
      .description("Complete obtain (in_progress → active)")
      .requiredOption("--id <CERT-…>")
      .requiredOption("--certificate-number <no>")
      .requiredOption("--issued-on <YYYY-MM-DD>")
      .option("--expires-on <YYYY-MM-DD>")
      .option("--evidence <path>")
      .option("--write")
      .option("--json")
      .action((opts) => {
        try {
          const r = grantCertification({
            id: opts.id,
            certificateNumber: opts.certificateNumber,
            issuedOn: opts.issuedOn,
            expiresOn: opts.expiresOn,
            evidence: opts.evidence,
            write: opts.write,
          });
          if (opts.json) {
            console.log(JSON.stringify(r, null, 2));
            return;
          }
          console.log(`# Certification grant — ${r.cert.id} · ${r.cert.status}`);
          if (r.event_id) console.log(`event: ${r.event_id}`);
        } catch (e) {
          console.error(e instanceof Error ? e.message : e);
          process.exit(1);
        }
      });

    cmd
      .command("renew")
      .description("Start renewal (active|expired → in_progress)")
      .requiredOption("--id <CERT-…>")
      .option("--write")
      .option("--json")
      .action((opts) => {
        try {
          const r = renewCertification({ id: opts.id, write: opts.write });
          if (opts.json) {
            console.log(JSON.stringify(r, null, 2));
            return;
          }
          console.log(`# Certification renew — ${r.cert.id} · ${r.cert.status}`);
          if (r.event_id) console.log(`event: ${r.event_id}`);
          console.log("次: grant --id … --certificate-number … --issued-on …");
        } catch (e) {
          console.error(e instanceof Error ? e.message : e);
          process.exit(1);
        }
      });

    cmd
      .command("scan-expiry")
      .description("Mark active certs past expires_on as expired")
      .option("--write")
      .option("--json")
      .action((opts) => {
        const r = scanExpiredCertifications({ write: opts.write });
        if (opts.json) {
          console.log(JSON.stringify(r, null, 2));
          return;
        }
        console.log(`# Expired scan — ${r.expired.length} updated`);
        for (const c of r.expired) console.log(`- ${c.id} · ${c.cert_type_id}`);
      });

    cmd
      .command("gate")
      .description("Show certification fulfilment blockers (G-01 cert)")
      .option("--json")
      .action((opts: { json?: boolean }) => {
        const blockers = listPermitOpeningBlockers().filter(
          (b) => b.fulfilment === "certification"
        );
        if (opts.json) {
          console.log(
            JSON.stringify(
              { blockers, active_types: [...listActiveCertTypeIds()] },
              null,
              2
            )
          );
          return;
        }
        console.log("# Certification gate\n");
        if (!blockers.length) {
          console.log("✓ 認証ブロッカーなし");
          return;
        }
        for (const b of blockers) {
          console.log(`- ${b.title}`);
          console.log(`  ${b.detail}`);
        }
        process.exitCode = 1;
      });
  },
  skillHandlers: {
    jp_certification_list: runCertificationListSkill,
    jp_certification_types: runCertificationTypesSkill,
  },
};
