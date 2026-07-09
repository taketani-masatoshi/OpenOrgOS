import { describe, it, expect } from "vitest";
import {
  integrationsFileSchema,
  tenantSetupAnswersSchema,
} from "../schemas/integrations.js";

describe("integrations schema", () => {
  it("parses minimal integrations file", () => {
    const parsed = integrationsFileSchema.parse({
      version: "1",
      webhooks: [],
    });
    expect(parsed.version).toBe("1");
  });

  it("parses setup answers", () => {
    const parsed = tenantSetupAnswersSchema.parse({
      mail_provider: "smtp",
      from_email: "a@example.com",
      smtp_host: "smtp.example.com",
    });
    expect(parsed.mail_provider).toBe("smtp");
  });
});
