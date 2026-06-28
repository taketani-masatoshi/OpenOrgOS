/** Default tenant for tests (mal instance). */
process.env.ORGOS_TENANT ??= "mal";
process.env.STEWARD_TENANT ??= process.env.ORGOS_TENANT;
/** Tests use minimal protocol fixtures — skip full pre-deliver validate (production enforces). */
process.env.STEWARD_SKIP_DELIVER_VALIDATE ??= "1";
