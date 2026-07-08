import { z } from "zod";

/** Universal activity boundary — internal org ops vs inter-org wire. */
export const orgActivityScopeSchema = z.enum(["internal", "wire"]);

export type OrgActivityScope = z.output<typeof orgActivityScopeSchema>;
