import type { Itinerary, EvalResult, EvalIssue } from "@/types";
import { getAllPOIs } from "@/services/mcp/poiSearch";
import travelTimesData from "@/data/ooty-travel-times.json";

/**
 * Evaluate the grounding of an itinerary
 * Checks that all data is factual and sourced from the dataset
 */
export function evaluateGrounding(itinerary: Itinerary): EvalResult {
  const issues: EvalIssue[] = [];
  let score = 100;

  // Get all valid POIs
  const validPOIs = getAllPOIs();
  const validPOIIds = new Set(validPOIs.map((p) => p.id));
  const travelMatrix = travelTimesData.matrix as Record<string, Record<string, number>>;

  // Check 1: All POIs in itinerary exist in dataset
  for (const day of itinerary.days) {
    for (const block of day.blocks) {
      if (!validPOIIds.has(block.poi.id)) {
        issues.push({
          day: day.dayNumber,
          blockId: block.id,
          issue: `POI "${block.poi.name}" (${block.poi.id}) not found in dataset`,
          severity: "high",
        });
        score -= 20;
      }
    }
  }

  // Check 2: Travel times match data file (±20% tolerance)
  for (const day of itinerary.days) {
    for (let i = 1; i < day.blocks.length; i++) {
      const prevPOI = day.blocks[i - 1].poi;
      const currBlock = day.blocks[i];
      const currPOI = currBlock.poi;

      const expectedTravelTime = travelMatrix[prevPOI.id]?.[currPOI.id];

      if (expectedTravelTime !== undefined) {
        const tolerance = expectedTravelTime * 0.2;
        const diff = Math.abs(currBlock.travelTimeFromPrev - expectedTravelTime);

        if (diff > tolerance) {
          issues.push({
            day: day.dayNumber,
            blockId: currBlock.id,
            issue: `Travel time (${currBlock.travelTimeFromPrev}m) differs from expected (${expectedTravelTime}m) between ${prevPOI.name} and ${currPOI.name}`,
            severity: diff > expectedTravelTime * 0.5 ? "medium" : "low",
          });
          score -= diff > expectedTravelTime * 0.5 ? 5 : 2;
        }
      }
    }
  }

  // Check 3: POI data integrity
  for (const day of itinerary.days) {
    for (const block of day.blocks) {
      const sourcePOI = validPOIs.find((p) => p.id === block.poi.id);

      if (sourcePOI) {
        // Check duration matches
        if (block.poi.estimated_duration_mins !== sourcePOI.estimated_duration_mins) {
          issues.push({
            day: day.dayNumber,
            blockId: block.id,
            issue: `Duration mismatch for ${block.poi.name}: ${block.poi.estimated_duration_mins}m vs source ${sourcePOI.estimated_duration_mins}m`,
            severity: "low",
          });
          score -= 2;
        }

        // Check cost matches
        if (block.poi.cost_inr !== sourcePOI.cost_inr) {
          issues.push({
            day: day.dayNumber,
            blockId: block.id,
            issue: `Cost mismatch for ${block.poi.name}`,
            severity: "low",
          });
          score -= 1;
        }
      }
    }
  }

  // Check 4: Verify sources are cited
  if (!itinerary.sources || itinerary.sources.length === 0) {
    issues.push({
      issue: "No sources cited for the itinerary",
      severity: "medium",
    });
    score -= 10;
  }

  // Check 5: Look for potential hallucinations in tips/notes
  for (const day of itinerary.days) {
    for (const block of day.blocks) {
      const sourcePOI = validPOIs.find((p) => p.id === block.poi.id);

      if (sourcePOI && block.poi.tips) {
        // Check if tips are from the source
        for (const tip of block.poi.tips) {
          const isFromSource = sourcePOI.tips?.some(
            (sourceTip) =>
              sourceTip.toLowerCase().includes(tip.toLowerCase().slice(0, 20)) ||
              tip.toLowerCase().includes(sourceTip.toLowerCase().slice(0, 20))
          );

          if (!isFromSource && tip.length > 30) {
            // Long tips not from source may be hallucinated
            issues.push({
              day: day.dayNumber,
              blockId: block.id,
              issue: `Tip may not be grounded: "${tip.slice(0, 50)}..."`,
              severity: "low",
            });
            score -= 1;
          }
        }
      }
    }
  }

  // Ensure score is within bounds
  score = Math.max(0, Math.min(100, score));

  return {
    evalType: "grounding",
    passed: score >= 70 && !issues.some((i) => i.severity === "high"),
    score,
    issues,
    details: {
      totalPOIs: itinerary.days.reduce((sum, d) => sum + d.blocks.length, 0),
      validPOICount: validPOIs.length,
      sourcesCount: itinerary.sources?.length || 0,
    },
    timestamp: new Date(),
  };
}

export default evaluateGrounding;
