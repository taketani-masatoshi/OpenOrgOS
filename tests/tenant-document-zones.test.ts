import { describe, expect, it } from "vitest";
import {
  CORE_DOC_DIRS,
  getModuleExtensionPaths,
  PROPERTY_OPERATIONS_SUBDIRS,
} from "../src/lib/tenant-document-zones.js";

describe("tenant-document-zones", () => {
  it("defines core doc dirs without property paths", () => {
    const joined = CORE_DOC_DIRS.join(",");
    expect(joined).toContain("contracts");
    expect(joined).not.toContain("properties/");
  });

  it("extends rental module with property operations subdirs", () => {
    const paths = getModuleExtensionPaths({
      id: "rental",
      enabled: true,
      agent: "rental",
      docs_root: "docs/properties/PROP-001-minato/operations/",
      property_ids: ["PROP-001"],
      summary_dir: "agent-summaries/rental/",
    });
    expect(paths).toContain("docs/properties/PROP-001-minato/operations");
    for (const sub of PROPERTY_OPERATIONS_SUBDIRS) {
      expect(paths).toContain(`docs/properties/PROP-001-minato/operations/${sub}`);
    }
    expect(paths).toContain("docs/reports/agent-summaries/rental");
  });

  it("returns empty paths for disabled module", () => {
    const paths = getModuleExtensionPaths({
      id: "rental",
      enabled: false,
      agent: "rental",
    });
    expect(paths).toEqual([]);
  });

  it("adds venture_capital default docs_root", () => {
    const paths = getModuleExtensionPaths({
      id: "venture_capital",
      enabled: true,
      agent: "venture_capital",
      data_root: "data/venture-capital/",
    });
    expect(paths).toContain("docs/venture-capital");
    expect(paths).toContain("data/venture-capital");
  });
});
