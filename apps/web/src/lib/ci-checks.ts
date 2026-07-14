import type { CICheck } from "@review365/api/types";

const INITIAL_PASSED_CHECKS = 10;

export function groupChecks(checks: CICheck[]) {
  const attention = checks.filter((check) => check.state !== "success");
  const passed = checks.filter((check) => check.state === "success");
  const visiblePassed = passed.slice(0, INITIAL_PASSED_CHECKS);

  return {
    attention,
    passed,
    visiblePassed,
    hiddenPassedCount: passed.length - visiblePassed.length,
    failedCount: attention.filter((check) => check.state === "failure").length,
    pendingCount: attention.filter((check) => check.state === "pending").length,
  };
}
