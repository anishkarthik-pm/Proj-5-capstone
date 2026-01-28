import type { Itinerary, EvalResult, EvalIssue } from "@/types";

/**
 * Pace-based time limits
 */
const PACE_LIMITS = {
  relaxed: {
    maxActivityHours: 6,
    maxTravelMins: 120,
    maxStopsPerDay: 3,
  },
  moderate: {
    maxActivityHours: 8,
    maxTravelMins: 150,
    maxStopsPerDay: 4,
  },
  packed: {
    maxActivityHours: 10,
    maxTravelMins: 180,
    maxStopsPerDay: 6,
  },
};

/**
 * Evaluate the feasibility of an itinerary
 */
export function evaluateFeasibility(itinerary: Itinerary): EvalResult {
  const issues: EvalIssue[] = [];
  const limits = PACE_LIMITS[itinerary.preferences.pace];
  let totalScore = 100;

  for (const day of itinerary.days) {
    // Check 1: Daily duration within limits
    const activityHours = day.totalDuration / 60;
    if (activityHours > limits.maxActivityHours) {
      const overage = activityHours - limits.maxActivityHours;
      issues.push({
        day: day.dayNumber,
        issue: `Day exceeds ${limits.maxActivityHours} hours of activity time (${activityHours.toFixed(1)}h)`,
        severity: overage > 2 ? "high" : "medium",
      });
      totalScore -= overage > 2 ? 15 : 8;
    }

    // Check 2: Travel times reasonable
    if (day.totalTravelTime > limits.maxTravelMins) {
      issues.push({
        day: day.dayNumber,
        issue: `Travel time exceeds ${limits.maxTravelMins} minutes (${day.totalTravelTime} mins)`,
        severity: "medium",
      });
      totalScore -= 5;
    }

    // Check 3: No overlapping time blocks
    for (let i = 1; i < day.blocks.length; i++) {
      const prevEnd = parseTime(day.blocks[i - 1].endTime);
      const currStart = parseTime(day.blocks[i].startTime);
      if (prevEnd > currStart) {
        issues.push({
          day: day.dayNumber,
          blockId: day.blocks[i].id,
          issue: `Overlapping times: ${day.blocks[i - 1].poi.name} ends after ${day.blocks[i].poi.name} starts`,
          severity: "high",
        });
        totalScore -= 20;
      }
    }

    // Check 4: Start time after 8 AM, end before 9 PM
    if (day.blocks.length > 0) {
      const firstStart = parseTime(day.blocks[0].startTime);
      const lastEnd = parseTime(day.blocks[day.blocks.length - 1].endTime);

      if (firstStart < 8 * 60) {
        issues.push({
          day: day.dayNumber,
          issue: `Day starts too early (${day.blocks[0].startTime})`,
          severity: "low",
        });
        totalScore -= 3;
      }

      if (lastEnd > 21 * 60) {
        issues.push({
          day: day.dayNumber,
          issue: `Day ends too late (${day.blocks[day.blocks.length - 1].endTime})`,
          severity: "medium",
        });
        totalScore -= 5;
      }
    }

    // Check 5: Number of stops vs pace
    if (day.blocks.length > limits.maxStopsPerDay) {
      issues.push({
        day: day.dayNumber,
        issue: `Too many stops (${day.blocks.length}) for ${itinerary.preferences.pace} pace`,
        severity: "medium",
      });
      totalScore -= 5;
    }

    // Check 6: Long travel segments
    for (const block of day.blocks) {
      if (block.travelTimeFromPrev > 60) {
        issues.push({
          day: day.dayNumber,
          blockId: block.id,
          issue: `Long travel segment (${block.travelTimeFromPrev} mins) before ${block.poi.name}`,
          severity: "medium",
        });
        totalScore -= 3;
      }
    }
  }

  // Ensure score is within bounds
  totalScore = Math.max(0, Math.min(100, totalScore));

  return {
    evalType: "feasibility",
    passed: totalScore >= 70 && !issues.some((i) => i.severity === "high"),
    score: totalScore,
    issues,
    details: {
      pace: itinerary.preferences.pace,
      limits,
      totalDays: itinerary.days.length,
      totalActivities: itinerary.days.reduce((sum, d) => sum + d.blocks.length, 0),
    },
    timestamp: new Date(),
  };
}

/**
 * Parse time string to minutes since midnight
 */
function parseTime(time: string): number {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

export default evaluateFeasibility;
