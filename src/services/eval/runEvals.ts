import type { Itinerary, EvalResult } from "@/types";
import { evaluateFeasibility } from "./feasibilityEval";
import { evaluateEditCorrectness } from "./editCorrectnessEval";
import { evaluateGrounding } from "./groundingEval";
import { useDebugStore } from "@/lib/stores/debugStore";

// Helper to log evaluation results to debug panel
function logEvalResult(result: EvalResult, description?: string) {
  const { log } = useDebugStore.getState();
  const level = result.passed ? "success" : result.score >= 50 ? "warning" : "error";

  log({
    level,
    category: "eval",
    message: `${result.evalType.toUpperCase()}: ${result.passed ? "PASSED" : "FAILED"} (${result.score}/100)${description ? ` - ${description}` : ""}`,
    details: {
      evalType: result.evalType,
      passed: result.passed,
      score: result.score,
      issueCount: result.issues.length,
      issues: result.issues.map(i => ({
        severity: i.severity,
        issue: i.issue,
        day: i.day,
      })),
    },
  });
}

/**
 * Run all evaluations on an itinerary
 */
export async function runAllEvaluations(
  itinerary: Itinerary
): Promise<EvalResult[]> {
  const { logInfo } = useDebugStore.getState();
  const results: EvalResult[] = [];

  logInfo("eval", "Starting itinerary evaluations...");

  // Run feasibility evaluation
  const feasibilityResult = evaluateFeasibility(itinerary);
  results.push(feasibilityResult);
  logEvalResult(feasibilityResult, "Schedule timing and travel feasibility");

  // Run grounding evaluation
  const groundingResult = evaluateGrounding(itinerary);
  results.push(groundingResult);
  logEvalResult(groundingResult, "Data source verification");

  // Log summary
  const allPassed = results.every(r => r.passed);
  const avgScore = Math.round(results.reduce((sum, r) => sum + r.score, 0) / results.length);

  const { log } = useDebugStore.getState();
  log({
    level: allPassed ? "success" : "warning",
    category: "eval",
    message: `Evaluation complete: ${allPassed ? "All checks passed" : "Some issues found"} (Avg: ${avgScore}/100)`,
    details: { totalEvals: results.length, allPassed, avgScore },
  });

  return results;
}

/**
 * Run evaluation after an edit
 */
export async function runEditEvaluation(
  before: Itinerary,
  after: Itinerary,
  editDescription: {
    type: "add" | "remove" | "replace" | "swap" | "move";
    dayNumber?: number;
    blockId?: string;
    description: string;
  }
): Promise<EvalResult[]> {
  const { logInfo } = useDebugStore.getState();
  const results: EvalResult[] = [];

  logInfo("eval", `Evaluating edit: ${editDescription.description}`, {
    editType: editDescription.type,
    dayNumber: editDescription.dayNumber,
  });

  // Run edit correctness evaluation
  const editResult = evaluateEditCorrectness(before, after, editDescription);
  results.push(editResult);
  logEvalResult(editResult, `Edit: ${editDescription.type}`);

  // Also run feasibility on the new itinerary
  const feasibilityResult = evaluateFeasibility(after);
  results.push(feasibilityResult);
  logEvalResult(feasibilityResult, "Post-edit feasibility");

  // Run grounding evaluation
  const groundingResult = evaluateGrounding(after);
  results.push(groundingResult);
  logEvalResult(groundingResult, "Post-edit grounding");

  // Log summary
  const allPassed = results.every(r => r.passed);
  const avgScore = Math.round(results.reduce((sum, r) => sum + r.score, 0) / results.length);

  const { log } = useDebugStore.getState();
  log({
    level: allPassed ? "success" : "warning",
    category: "eval",
    message: `Edit evaluation complete: ${allPassed ? "Edit validated" : "Issues detected"} (Avg: ${avgScore}/100)`,
    details: { editType: editDescription.type, totalEvals: results.length, allPassed, avgScore },
  });

  return results;
}

/**
 * Generate a summary report from eval results
 */
export function generateEvalReport(results: EvalResult[]): string {
  const lines: string[] = [];

  lines.push("=== Evaluation Report ===\n");

  let overallPassed = true;
  let totalScore = 0;

  for (const result of results) {
    lines.push(`${result.evalType.toUpperCase()}`);
    lines.push(`  Status: ${result.passed ? "PASSED" : "FAILED"}`);
    lines.push(`  Score: ${result.score}/100`);

    if (result.issues.length > 0) {
      lines.push(`  Issues (${result.issues.length}):`);
      for (const issue of result.issues) {
        const prefix =
          issue.severity === "high"
            ? "!!!"
            : issue.severity === "medium"
              ? "!!"
              : "!";
        const dayInfo = issue.day ? ` [Day ${issue.day}]` : "";
        lines.push(`    ${prefix}${dayInfo} ${issue.issue}`);
      }
    }

    lines.push("");

    if (!result.passed) overallPassed = false;
    totalScore += result.score;
  }

  const avgScore = results.length > 0 ? Math.round(totalScore / results.length) : 0;

  lines.push("=== Summary ===");
  lines.push(`Overall: ${overallPassed ? "PASSED" : "FAILED"}`);
  lines.push(`Average Score: ${avgScore}/100`);

  return lines.join("\n");
}

/**
 * Quick check if an itinerary passes basic validation
 */
export function quickValidate(itinerary: Itinerary): {
  isValid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  // Check basic structure
  if (!itinerary.days || itinerary.days.length === 0) {
    errors.push("Itinerary has no days");
  }

  // Check each day
  for (const day of itinerary.days) {
    if (!day.blocks) {
      errors.push(`Day ${day.dayNumber} has no blocks array`);
      continue;
    }

    for (const block of day.blocks) {
      if (!block.poi) {
        errors.push(`Day ${day.dayNumber} has block without POI`);
      }
      if (!block.startTime || !block.endTime) {
        errors.push(`Day ${day.dayNumber} has block without time info`);
      }
    }
  }

  // Check preferences
  if (!itinerary.preferences) {
    errors.push("Itinerary has no preferences");
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

export { evaluateFeasibility, evaluateEditCorrectness, evaluateGrounding };
