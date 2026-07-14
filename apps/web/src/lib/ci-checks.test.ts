import { describe, expect, it } from "bun:test";
import type { CICheck } from "@review365/api/types";
import { groupChecks } from "./ci-checks";

const check = (name: string, state: CICheck["state"]): CICheck => ({ name, state });

describe("groupChecks", () => {
  it("shows failed and pending checks first while limiting initially visible passed checks", () => {
    const checks = [
      check("passed 1", "success"),
      check("failed", "failure"),
      check("running", "pending"),
      ...Array.from({ length: 11 }, (_, index) => check(`passed ${index + 2}`, "success")),
    ];

    expect(groupChecks(checks)).toEqual({
      attention: [check("failed", "failure"), check("running", "pending")],
      passed: checks.filter((item) => item.state === "success"),
      visiblePassed: checks.filter((item) => item.state === "success").slice(0, 10),
      hiddenPassedCount: 2,
      failedCount: 1,
      pendingCount: 1,
    });
  });
});
