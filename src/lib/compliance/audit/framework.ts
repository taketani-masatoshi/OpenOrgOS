export type AuditFramework = "iso" | "financial" | "jsox";

export function resolveAuditFramework(standard: string, explicit?: AuditFramework): AuditFramework {
  if (explicit === "financial" || explicit === "jsox") return explicit;
  if (standard === "financial" || standard === "jsox") return standard;
  return "iso";
}
