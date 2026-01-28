import type { Itinerary, EvalResult, EvalIssue, TimeBlock } from "@/types";

/**
 * Evaluate the correctness of an edit operation
 * Compares before and after itineraries to ensure only intended changes were made
 */
export function evaluateEditCorrectness(
  before: Itinerary,
  after: Itinerary,
  intendedChange: {
    type: "add" | "remove" | "replace" | "swap" | "move";
    dayNumber?: number;
    blockId?: string;
    description: string;
  }
): EvalResult {
  const issues: EvalIssue[] = [];
  let score = 100;

  // Find all changes between before and after
  const changes = detectChanges(before, after);

  // Check 1: Only intended day was modified (if day specified)
  if (intendedChange.dayNumber) {
    const unintendedDayChanges = changes.filter(
      (c) => c.dayNumber !== intendedChange.dayNumber
    );

    if (unintendedDayChanges.length > 0) {
      const affectedDays = Array.from(new Set(unintendedDayChanges.map((c) => c.dayNumber)));
      issues.push({
        issue: `Unintended changes detected in days: ${affectedDays.join(", ")}`,
        severity: "high",
      });
      score -= 20;
    }
  }

  // Check 2: Only intended block was modified (if block specified)
  if (intendedChange.blockId) {
    const unintendedBlockChanges = changes.filter(
      (c) => c.blockId && c.blockId !== intendedChange.blockId
    );

    if (unintendedBlockChanges.length > 0) {
      issues.push({
        issue: `Unintended blocks were modified`,
        severity: "high",
      });
      score -= 15;
    }
  }

  // Check 3: Verify the intended change type occurred
  const hasCorrectChangeType = changes.some((c) => c.type === intendedChange.type);

  if (!hasCorrectChangeType && changes.length > 0) {
    issues.push({
      issue: `Expected '${intendedChange.type}' change but detected different change types`,
      severity: "medium",
    });
    score -= 10;
  }

  // Check 4: No data loss (POIs not accidentally removed for non-remove operations)
  if (intendedChange.type !== "remove") {
    const beforePOICount = before.days.reduce((sum, d) => sum + d.blocks.length, 0);
    const afterPOICount = after.days.reduce((sum, d) => sum + d.blocks.length, 0);

    if (intendedChange.type === "add" && afterPOICount <= beforePOICount) {
      issues.push({
        issue: "Add operation did not increase POI count",
        severity: "medium",
      });
      score -= 10;
    }

    if (
      intendedChange.type === "replace" &&
      afterPOICount !== beforePOICount
    ) {
      issues.push({
        issue: "Replace operation changed POI count unexpectedly",
        severity: "medium",
      });
      score -= 10;
    }
  }

  // Check 5: Verify at least one change was made
  if (changes.length === 0) {
    issues.push({
      issue: "No changes detected between before and after itineraries",
      severity: "high",
    });
    score -= 30;
  }

  // Ensure score is within bounds
  score = Math.max(0, Math.min(100, score));

  return {
    evalType: "edit_correctness",
    passed: score >= 70 && !issues.some((i) => i.severity === "high"),
    score,
    issues,
    details: {
      intendedChange,
      changesDetected: changes.length,
      changes,
    },
    timestamp: new Date(),
  };
}

interface Change {
  type: "add" | "remove" | "modify";
  dayNumber: number;
  blockId?: string;
  description: string;
}

/**
 * Detect changes between two itineraries
 */
function detectChanges(before: Itinerary, after: Itinerary): Change[] {
  const changes: Change[] = [];

  // Create maps of blocks by ID
  const beforeBlocks = new Map<string, { day: number; block: TimeBlock }>();
  const afterBlocks = new Map<string, { day: number; block: TimeBlock }>();

  for (const day of before.days) {
    for (const block of day.blocks) {
      beforeBlocks.set(block.id, { day: day.dayNumber, block });
    }
  }

  for (const day of after.days) {
    for (const block of day.blocks) {
      afterBlocks.set(block.id, { day: day.dayNumber, block });
    }
  }

  // Find removed blocks
  Array.from(beforeBlocks.entries()).forEach(([id, { day, block }]) => {
    if (!afterBlocks.has(id)) {
      changes.push({
        type: "remove",
        dayNumber: day,
        blockId: id,
        description: `Removed ${block.poi.name} from Day ${day}`,
      });
    }
  });

  // Find added blocks
  Array.from(afterBlocks.entries()).forEach(([id, { day, block }]) => {
    if (!beforeBlocks.has(id)) {
      changes.push({
        type: "add",
        dayNumber: day,
        blockId: id,
        description: `Added ${block.poi.name} to Day ${day}`,
      });
    }
  });

  // Find modified blocks
  Array.from(afterBlocks.entries()).forEach(([id, afterData]) => {
    const beforeData = beforeBlocks.get(id);
    if (beforeData) {
      // Check if POI changed
      if (beforeData.block.poi.id !== afterData.block.poi.id) {
        changes.push({
          type: "modify",
          dayNumber: afterData.day,
          blockId: id,
          description: `Changed ${beforeData.block.poi.name} to ${afterData.block.poi.name}`,
        });
      }
      // Check if day changed
      else if (beforeData.day !== afterData.day) {
        changes.push({
          type: "modify",
          dayNumber: afterData.day,
          blockId: id,
          description: `Moved ${afterData.block.poi.name} from Day ${beforeData.day} to Day ${afterData.day}`,
        });
      }
      // Check if time changed significantly
      else if (
        beforeData.block.startTime !== afterData.block.startTime ||
        beforeData.block.timeSlot !== afterData.block.timeSlot
      ) {
        changes.push({
          type: "modify",
          dayNumber: afterData.day,
          blockId: id,
          description: `Rescheduled ${afterData.block.poi.name} to ${afterData.block.timeSlot}`,
        });
      }
    }
  });

  return changes;
}

export default evaluateEditCorrectness;
