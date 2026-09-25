"""Run synthetic accounting audit regressions in a disposable current-source copy.
Never copies local tenant data or runs the repository-wide mutating test setup.
"""
from pathlib import Path
import subprocess, tempfile, tarfile, io, shutil, json
src=Path(__file__).resolve().parents[1]
root=Path(tempfile.mkdtemp(prefix='ooo-finance-audit-', dir='/private/tmp'))
paths=['src','schemas','tests','steward','packages','types','config','package.json','package-lock.json','tsconfig.json','tsconfig.build.json','.prettierrc.json']
archive=subprocess.check_output(['git','archive','HEAD',*paths],cwd=src)
with tarfile.open(fileobj=io.BytesIO(archive)) as tf: tf.extractall(root)
# Overlay only current source, schema and test files; no tenant runtime or worktrees.
files=subprocess.check_output(['git','ls-files','--cached','--others','--exclude-standard','-z','src','schemas','tests'],cwd=src).decode().split('\0')
for rel in files:
    if not rel or not (src/rel).is_file() or '/.fixture-' in rel: continue
    dest=root/rel; dest.parent.mkdir(parents=True,exist_ok=True); shutil.copy2(src/rel,dest)
seeds=root/'.audit-seeds';seeds.mkdir()
archive=subprocess.check_output(['git','archive','HEAD','tenants/_fixture-books','tenants/demo'],cwd=src)
with tarfile.open(fileobj=io.BytesIO(archive)) as tf: tf.extractall(seeds)
shutil.copytree(seeds/'tenants',root/'tenants')
(root/'node_modules').symlink_to(src/'node_modules',target_is_directory=True)
(root/'audit.setup.ts').write_text('''import { beforeEach } from "vitest";
import { cpSync, rmSync } from "node:fs";
import { join } from "node:path";
import { setTenantId } from "./src/lib/tenant.js";
import { clearOperatorsRegistryCacheForTests } from "./src/lib/org/operators.js";
if (process.env.ORGOS_TEST_DISPOSABLE_ROOT !== process.cwd()) throw new Error("Disposable finance test workspace required");
beforeEach(() => {
 for (const id of ["_fixture-books", "demo"]) {
  rmSync(join(process.cwd(), "tenants", id), { recursive: true, force: true });
  cpSync(join(process.cwd(), ".audit-seeds/tenants", id), join(process.cwd(), "tenants", id), { recursive: true });
 }
 setTenantId("_fixture-books"); clearOperatorsRegistryCacheForTests();
});
''')
selected=['finance-audit-regression','finance-audit-annual-regression','reconciliation-recovery','payroll-jp','consumption-tax-journal','consumption-tax-refund','electronic-ledger','payroll-yea-compute','payroll-remittance-loop','remittance-journal','finance-jurisdiction-safety']
(root/'vitest.audit.config.ts').write_text('import {defineConfig} from "vitest/config"; export default defineConfig({test:{include:'+json.dumps(['tests/'+s+'.test.ts' for s in selected])+',setupFiles:["audit.setup.ts"],fileParallelism:false,testTimeout:60000,hookTimeout:15000}});')
(root/'run-audit.py').write_text('''import os,subprocess,pathlib
root=str(pathlib.Path(__file__).parent)
env={k:v for k,v in os.environ.items() if not k.startswith(('ORGOS_','STEWARD_','WIRE_','STRIPE_','OPENAI_','ANTHROPIC_','OLLAMA_'))}
env.update(ORGOS_HOME=root,ORGOS_WORKSPACE=root,ORGOS_TENANT='_fixture-books',ORGOS_TEST_DISPOSABLE_ROOT=root,ORGOS_AUDIT_LOG=root+'/audit.jsonl',ORGOS_AUDIT_BRIDGE_DISABLED='1',ORGOS_LLM_MOCK='1',ORGOS_HUMAN_APPROVAL_STORE=root+'/human.json',ORGOS_STRIPE_SECRETS_FILE=root+'/stripe.env',NODE_ENV='test')
raise SystemExit(subprocess.call(['node','node_modules/vitest/vitest.mjs','run','--config','vitest.audit.config.ts','--reporter=default','--reporter=json','--outputFile.json=audit-results.json'],cwd=root,env=env))
''')
print('Finance audit disposable workspace:', root, flush=True)
raise SystemExit(subprocess.call([__import__('sys').executable, str(root/'run-audit.py')],cwd=root))
