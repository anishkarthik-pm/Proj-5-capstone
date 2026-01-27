import type { Itinerary, EvalResult } from "@/types";
import { evaluateFeasibility } from "./feasibilityEval";
import { evaluateEditCorrectness } from "./editCorrectnessEval";
import { evaluateGrounding } from "./groundingEval";

/**
 * Run all evaluations on an itinerary
 */
export async function runAllEvaluations(
  itinerary: Itinerary
): Promise<EvalResult[]> {
  const results: EvalResult[] = [];

  // Run feasibility evaluation
  console.log("Running feasibility evaluation...");
  const feasibilityResult = evaluateFeasibility(itinerary);
  results.push(feasibilityResult);
  console.log(
    `Feasibility: ${feasibilityResult.passed ? "PASSED" : "FAILED"} (${feasibilityResult.score}/100)`
  );

  // Run grounding evaluation
  console.log("Running grounding evaluation...");
  const groundingResult = evaluateGrounding(itinerary);
  results.push(groundingResult);
  console.log(
    `Grounding: ${groundingResult.passed ? "PASSED" : "FAILED"} (${groundingResult.score}/100)`
  );

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
  const results: EvalResult[] = [];

  // Run edit correctness evaluation
  console.log("Running edit correctness evaluation...");
  const editResult = evaluateEditCorrectness(before, after, editDescription);
  results.push(editResult);
  console.log(
    `Edit Correctness: ${editResult.passed ? "PASSED" : "FAILED"} (${editResult.score}/100)`
  );

  // Also run feasibility on the new itinerary
  console.log("Running feasibility evaluation on updated itinerary...");
  const feasibilityResult = evaluateFeasibility(after);
  results.push(feasibilityResult);
  console.log(
    `Feasibility: ${feasibilityResult.passed ? "PASSED" : "FAILED"} (${feasibilityResult.score}/100)`
  );

  // Run grounding evaluation
  console.log("Running grounding evaluation...");
  const groundingResult = evaluateGrounding(after);
  results.push(groundingResult);
  console.log(
    `Grounding: ${groundingResult.passed ? "PASSED" : "FAILED"} (${groundingResult.score}/100)`
  );

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
