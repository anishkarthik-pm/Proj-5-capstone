import type {
  POI,
  DayPlan,
  TimeBlock,
  ItineraryBuilderInput,
  ItineraryBuilderOutput,
} from "@/types";

/**
 * MCP Tool: Itinerary Builder
 *
 * Converts ranked POIs into a feasible day-wise schedule.
 * Uses a greedy scheduling algorithm that respects time constraints.
 */
export const itineraryBuilderMeta = {
  name: "itinerary_builder",
  description:
    "Build a feasible day-wise itinerary from selected POIs, respecting time constraints and travel times.",
  inputSchema: {
    type: "object",
    properties: {
      pois: {
        type: "array",
        items: { $ref: "#/definitions/POI" },
        description: "Ranked list of POIs to schedule",
      },
      numDays: {
        type: "number",
        description: "Number of days for the trip",
      },
      pace: {
        type: "string",
        enum: ["relaxed", "moderate", "packed"],
        description: "Trip pace affecting daily activity time",
      },
      startTime: {
        type: "string",
        description: "Daily start time (HH:MM format)",
      },
      endTime: {
        type: "string",
        description: "Daily end time (HH:MM format)",
      },
      travelTimeMatrix: {
        type: "object",
        description: "Matrix of travel times between POIs in minutes",
      },
    },
    required: ["pois", "numDays", "pace", "travelTimeMatrix"],
  },
  outputSchema: {
    type: "object",
    properties: {
      days: {
        type: "array",
        items: { $ref: "#/definitions/DayPlan" },
      },
      unscheduled: {
        type: "array",
        items: { $ref: "#/definitions/POI" },
      },
      feasibilityScore: {
        type: "number",
      },
      warnings: {
        type: "array",
        items: { type: "string" },
      },
    },
  },
};

/**
 * Time budgets based on pace (in minutes)
 */
const PACE_BUDGETS = {
  relaxed: {
    activityTime: 360, // 6 hours
    maxTravelTime: 120, // 2 hours
    maxActivitiesPerDay: 3,
    bufferTime: 30,
  },
  moderate: {
    activityTime: 480, // 8 hours
    maxTravelTime: 150, // 2.5 hours
    maxActivitiesPerDay: 4,
    bufferTime: 20,
  },
  packed: {
    activityTime: 600, // 10 hours
    maxTravelTime: 180, // 3 hours
    maxActivitiesPerDay: 5,
    bufferTime: 15,
  },
};

/**
 * Build an itinerary from POIs
 */
export async function buildItinerary(
  input: ItineraryBuilderInput
): Promise<ItineraryBuilderOutput> {
  const {
    pois,
    numDays,
    pace = "moderate",
    startTime = "09:00",
    endTime = "20:00",
    travelTimeMatrix,
  } = input;

  const budget = PACE_BUDGETS[pace];
  const warnings: string[] = [];

  // Group POIs by best time
  const morningPOIs: POI[] = [];
  const afternoonPOIs: POI[] = [];
  const eveningPOIs: POI[] = [];
  const anyTimePOIs: POI[] = [];

  for (const poi of pois) {
    switch (poi.best_time) {
      case "morning":
        morningPOIs.push(poi);
        break;
      case "afternoon":
        afternoonPOIs.push(poi);
        break;
      case "evening":
        eveningPOIs.push(poi);
        break;
      default:
        anyTimePOIs.push(poi);
    }
  }

  // Initialize days
  const days: DayPlan[] = [];
  const scheduledPOIIds = new Set<string>();

  // Schedule each day
  for (let dayNum = 1; dayNum <= numDays; dayNum++) {
    const dayPlan = scheduleDayGreedy({
      dayNumber: dayNum,
      morningPOIs: morningPOIs.filter((p) => !scheduledPOIIds.has(p.id)),
      afternoonPOIs: afternoonPOIs.filter((p) => !scheduledPOIIds.has(p.id)),
      eveningPOIs: eveningPOIs.filter((p) => !scheduledPOIIds.has(p.id)),
      anyTimePOIs: anyTimePOIs.filter((p) => !scheduledPOIIds.has(p.id)),
      budget,
      startTime,
      endTime,
      travelTimeMatrix,
    });

    // Mark POIs as scheduled
    for (const block of dayPlan.blocks) {
      scheduledPOIIds.add(block.poi.id);
    }

    // Check for warnings
    if (dayPlan.blocks.length === budget.maxActivitiesPerDay) {
      warnings.push(`Day ${dayNum} is fully packed with ${dayPlan.blocks.length} activities.`);
    }

    const longTravels = dayPlan.blocks.filter((b) => b.travelTimeFromPrev > 45);
    if (longTravels.length > 0) {
      warnings.push(
        `Day ${dayNum} has a long travel segment of ${Math.max(...longTravels.map((b) => b.travelTimeFromPrev))} minutes.`
      );
    }

    days.push(dayPlan);
  }

  // Find unscheduled POIs
  const unscheduled = pois.filter((p) => !scheduledPOIIds.has(p.id));

  if (unscheduled.length > 0) {
    warnings.push(
      `${unscheduled.length} place(s) couldn't fit in the schedule: ${unscheduled.map((p) => p.name).slice(0, 3).join(", ")}${unscheduled.length > 3 ? "..." : ""}`
    );
  }

  // Calculate feasibility score
  const feasibilityScore = calculateFeasibilityScore(days, budget, numDays);

  return {
    days,
    unscheduled,
    feasibilityScore,
    warnings,
  };
}

/**
 * Greedy scheduling for a single day
 */
function scheduleDayGreedy(params: {
  dayNumber: number;
  morningPOIs: POI[];
  afternoonPOIs: POI[];
  eveningPOIs: POI[];
  anyTimePOIs: POI[];
  budget: (typeof PACE_BUDGETS)["moderate"];
  startTime: string;
  endTime: string;
  travelTimeMatrix: Record<string, Record<string, number>>;
}): DayPlan {
  const {
    dayNumber,
    morningPOIs,
    afternoonPOIs,
    eveningPOIs,
    anyTimePOIs,
    budget,
    startTime,
    endTime,
    travelTimeMatrix,
  } = params;

  const blocks: TimeBlock[] = [];
  let currentTimeMinutes = parseTime(startTime);
  const endTimeMinutes = parseTime(endTime);
  let totalTravelTime = 0;
  let totalActivityTime = 0;

  // Helper to add a POI to the schedule
  const addPOI = (
    poi: POI,
    timeSlot: "morning" | "afternoon" | "evening"
  ): boolean => {
    // Check if we've hit max activities
    if (blocks.length >= budget.maxActivitiesPerDay) return false;

    // Calculate travel time from previous POI
    let travelTime = 0;
    if (blocks.length > 0) {
      const lastPOI = blocks[blocks.length - 1].poi;
      travelTime = travelTimeMatrix[lastPOI.id]?.[poi.id] || 20; // Default 20 mins
    }

    // Check if we have enough time
    const requiredTime =
      travelTime + poi.estimated_duration_mins + budget.bufferTime;
    if (currentTimeMinutes + requiredTime > endTimeMinutes) return false;

    // Check if we'd exceed travel time budget
    if (totalTravelTime + travelTime > budget.maxTravelTime) return false;

    // Check if we'd exceed activity time budget
    if (totalActivityTime + poi.estimated_duration_mins > budget.activityTime)
      return false;

    // Add to schedule
    const block: TimeBlock = {
      id: `block-${dayNumber}-${blocks.length + 1}`,
      timeSlot,
      startTime: formatTime(currentTimeMinutes + travelTime),
      endTime: formatTime(
        currentTimeMinutes + travelTime + poi.estimated_duration_mins
      ),
      poi,
      travelTimeFromPrev: travelTime,
    };

    blocks.push(block);
    currentTimeMinutes += requiredTime;
    totalTravelTime += travelTime;
    totalActivityTime += poi.estimated_duration_mins;

    return true;
  };

  // Schedule morning POIs first
  for (const poi of morningPOIs) {
    if (currentTimeMinutes < parseTime("12:00")) {
      if (!addPOI(poi, "morning")) break;
    }
  }

  // Fill remaining morning with any-time POIs if needed
  if (blocks.length < 2 && currentTimeMinutes < parseTime("12:00")) {
    for (const poi of anyTimePOIs) {
      if (!addPOI(poi, "morning")) break;
      if (blocks.length >= 2 || currentTimeMinutes >= parseTime("12:00")) break;
    }
  }

  // Schedule afternoon POIs
  for (const poi of afternoonPOIs) {
    if (
      currentTimeMinutes >= parseTime("12:00") &&
      currentTimeMinutes < parseTime("17:00")
    ) {
      if (!addPOI(poi, "afternoon")) break;
    }
  }

  // Fill afternoon with any-time POIs if needed
  const scheduledIds = new Set(blocks.map((b) => b.poi.id));
  const remainingAnyTime = anyTimePOIs.filter((p) => !scheduledIds.has(p.id));

  for (const poi of remainingAnyTime) {
    const slot =
      currentTimeMinutes < parseTime("12:00")
        ? "morning"
        : currentTimeMinutes < parseTime("17:00")
          ? "afternoon"
          : "evening";
    if (!addPOI(poi, slot)) break;
  }

  // Schedule evening POIs
  for (const poi of eveningPOIs) {
    if (currentTimeMinutes >= parseTime("17:00")) {
      if (!addPOI(poi, "evening")) break;
    }
  }

  // Calculate day totals
  const dayPlan: DayPlan = {
    dayNumber,
    date: new Date(Date.now() + (dayNumber - 1) * 24 * 60 * 60 * 1000),
    blocks,
    totalDuration: totalActivityTime,
    totalTravelTime,
  };

  // Add theme based on categories
  dayPlan.theme = determineDayTheme(blocks);

  return dayPlan;
}

/**
 * Parse time string to minutes since midnight
 */
function parseTime(time: string): number {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

/**
 * Format minutes since midnight to time string
 */
function formatTime(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hours.toString().padStart(2, "0")}:${mins.toString().padStart(2, "0")}`;
}

/**
 * Determine a theme for the day based on scheduled activities
 */
function determineDayTheme(blocks: TimeBlock[]): string {
  if (blocks.length === 0) return "Free Day";

  const categories = blocks.flatMap((b) => b.poi.category);
  const categoryCounts: Record<string, number> = {};

  for (const cat of categories) {
    categoryCounts[cat] = (categoryCounts[cat] || 0) + 1;
  }

  // Find dominant category
  let maxCount = 0;
  let dominantCat = "mixed";

  for (const [cat, count] of Object.entries(categoryCounts)) {
    if (count > maxCount) {
      maxCount = count;
      dominantCat = cat;
    }
  }

  // Map category to theme
  const themeMap: Record<string, string> = {
    nature: "Nature & Scenery",
    scenic: "Scenic Views",
    gardens: "Gardens & Parks",
    food: "Food & Culture",
    culture: "Cultural Exploration",
    heritage: "Heritage Tour",
    adventure: "Adventure Day",
    relaxation: "Relaxation Day",
    trekking: "Trekking & Adventure",
    museum: "Museums & Heritage",
  };

  return themeMap[dominantCat] || "Exploring Ooty";
}

/**
 * Calculate a feasibility score for the itinerary
 */
function calculateFeasibilityScore(
  days: DayPlan[],
  budget: (typeof PACE_BUDGETS)["moderate"],
  numDays: number
): number {
  let score = 100;

  for (const day of days) {
    // Penalize if day is too packed
    if (day.totalDuration > budget.activityTime) {
      score -= 10;
    }

    // Penalize if too much travel
    if (day.totalTravelTime > budget.maxTravelTime) {
      score -= 5;
    }

    // Penalize if day has no activities
    if (day.blocks.length === 0) {
      score -= 15;
    }

    // Check for unreasonable schedules
    for (const block of day.blocks) {
      if (block.travelTimeFromPrev > 60) {
        score -= 5; // Long travel penalty
      }
    }
  }

  // Bonus for variety across days
  const uniqueCategories = new Set(
    days.flatMap((d) => d.blocks.flatMap((b) => b.poi.category))
  );
  if (uniqueCategories.size >= numDays * 2) {
    score += 5;
  }

  return Math.max(0, Math.min(100, score));
}

/**
 * Validate an existing itinerary
 */
export function validateItinerary(
  days: DayPlan[],
  pace: "relaxed" | "moderate" | "packed"
): {
  isValid: boolean;
  issues: string[];
} {
  const budget = PACE_BUDGETS[pace];
  const issues: string[] = [];

  for (const day of days) {
    // Check activity time
    if (day.totalDuration > budget.activityTime * 1.2) {
      issues.push(
        `Day ${day.dayNumber} exceeds activity time budget (${day.totalDuration} mins vs ${budget.activityTime} mins allowed)`
      );
    }

    // Check travel time
    if (day.totalTravelTime > budget.maxTravelTime * 1.2) {
      issues.push(
        `Day ${day.dayNumber} exceeds travel time budget (${day.totalTravelTime} mins vs ${budget.maxTravelTime} mins allowed)`
      );
    }

    // Check for overlapping times
    for (let i = 1; i < day.blocks.length; i++) {
      const prev = day.blocks[i - 1];
      const curr = day.blocks[i];
      if (parseTime(prev.endTime) > parseTime(curr.startTime)) {
        issues.push(
          `Day ${day.dayNumber}: ${prev.poi.name} ends after ${curr.poi.name} starts`
        );
      }
    }

    // Check for unreasonable times
    if (day.blocks.length > 0) {
      const firstStart = parseTime(day.blocks[0].startTime);
      const lastEnd = parseTime(day.blocks[day.blocks.length - 1].endTime);

      if (firstStart < parseTime("07:00")) {
        issues.push(`Day ${day.dayNumber} starts too early (${day.blocks[0].startTime})`);
      }
      if (lastEnd > parseTime("22:00")) {
        issues.push(
          `Day ${day.dayNumber} ends too late (${day.blocks[day.blocks.length - 1].endTime})`
        );
      }
    }
  }

  return {
    isValid: issues.length === 0,
    issues,
  };
}

export default buildItinerary;
