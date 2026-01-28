import type {
  POI,
  DayPlan,
  TimeBlock,
  ItineraryBuilderInput,
  ItineraryBuilderOutput,
} from "@/types";
import poiData from "@/data/ooty-pois.json";

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
 * Extended input with POI reasons and dietary preference
 */
export interface ItineraryBuilderInputWithReasons extends ItineraryBuilderInput {
  poiReasons?: Map<string, string>;
  dietaryPreference?: "veg" | "non-veg" | "any";
}

/**
 * Build an itinerary from POIs
 */
export async function buildItinerary(
  input: ItineraryBuilderInputWithReasons
): Promise<ItineraryBuilderOutput> {
  const {
    pois,
    numDays,
    pace = "moderate",
    startTime = "09:00",
    endTime = "20:00",
    travelTimeMatrix,
    poiReasons,
    dietaryPreference = "any",
  } = input;

  const budget = PACE_BUDGETS[pace];
  const warnings: string[] = [];

  // Get food spots based on dietary preference
  const foodSpots = getFoodSpots(dietaryPreference);

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
  const usedFoodSpotIds = new Set<string>();

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
      poiReasons,
    });

    // Mark POIs as scheduled
    for (const block of dayPlan.blocks) {
      scheduledPOIIds.add(block.poi.id);
    }

    // Add food spots for lunch and dinner
    const lastMorningPOI = dayPlan.blocks.find((b) => b.timeSlot === "morning")?.poi || null;
    const lastAfternoonPOI = dayPlan.blocks.find((b) => b.timeSlot === "afternoon")?.poi || lastMorningPOI;

    // Add lunch spot (between morning and afternoon activities)
    if (foodSpots.length > 0 && dayPlan.blocks.length >= 1) {
      const lunchSpot = findFoodSpotForMeal(foodSpots, "lunch", usedFoodSpotIds, lastMorningPOI, travelTimeMatrix);
      if (lunchSpot) {
        const lunchBlock = insertFoodSpot(dayPlan.blocks, lunchSpot, dayNum, "lunch", travelTimeMatrix, poiReasons);
        if (lunchBlock) {
          // Find insertion point for lunch (after morning blocks)
          let lunchIndex = 0;
          for (let i = 0; i < dayPlan.blocks.length; i++) {
            if (parseTime(dayPlan.blocks[i].startTime) > parseTime("12:00")) {
              lunchIndex = i;
              break;
            }
            lunchIndex = i + 1;
          }
          dayPlan.blocks.splice(lunchIndex, 0, lunchBlock);
          usedFoodSpotIds.add(lunchSpot.id);
        }
      }
    }

    // Add dinner spot (in the evening)
    if (foodSpots.length > 0 && pace !== "relaxed") {
      const dinnerSpot = findFoodSpotForMeal(foodSpots, "dinner", usedFoodSpotIds, lastAfternoonPOI, travelTimeMatrix);
      if (dinnerSpot) {
        const dinnerBlock = insertFoodSpot(dayPlan.blocks, dinnerSpot, dayNum, "dinner", travelTimeMatrix, poiReasons);
        if (dinnerBlock) {
          // Add dinner at the end
          dayPlan.blocks.push(dinnerBlock);
          usedFoodSpotIds.add(dinnerSpot.id);
        }
      }
    }

    // Recalculate day totals
    dayPlan.totalDuration = dayPlan.blocks.reduce(
      (sum, b) => sum + b.poi.estimated_duration_mins,
      0
    );
    dayPlan.totalTravelTime = dayPlan.blocks.reduce(
      (sum, b) => sum + b.travelTimeFromPrev,
      0
    );

    // Check for warnings
    if (dayPlan.blocks.length >= budget.maxActivitiesPerDay + 2) {
      warnings.push(`Day ${dayNum} has a lot of activities (${dayPlan.blocks.length} including meals).`);
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
  poiReasons?: Map<string, string>;
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
    poiReasons,
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
      reasoning: poiReasons?.get(poi.id) || generateDefaultReason(poi, timeSlot),
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
 * Generate a default reason for a POI when no specific reason is provided
 */
function generateDefaultReason(poi: POI, timeSlot: "morning" | "afternoon" | "evening"): string {
  const reasons: string[] = [];

  // Category-based reason
  const primaryCategory = poi.category[0] || "attraction";
  const categoryReasons: Record<string, string> = {
    nature: "A beautiful natural attraction",
    scenic: "Offers stunning views of the Nilgiris",
    gardens: "A well-maintained garden perfect for a stroll",
    food: "Great place to experience local flavors",
    culture: "Rich in local history and culture",
    heritage: "A heritage site worth exploring",
    trekking: "Perfect for adventure seekers",
    boating: "Enjoy the scenic waters",
    museum: "Learn about local history and traditions",
    cafe: "Perfect spot to relax and recharge",
    restaurant: "Highly recommended for its cuisine",
  };

  reasons.push(categoryReasons[primaryCategory] || `A popular ${primaryCategory} spot`);

  // Time-based reason
  if (poi.best_time === timeSlot) {
    reasons.push(`ideal to visit in the ${timeSlot}`);
  } else if (poi.best_time === "morning") {
    reasons.push("best visited in the morning for clear views");
  } else if (poi.best_time === "any") {
    reasons.push("can be enjoyed any time of day");
  }

  // Crowd and accessibility
  if (poi.crowd_level === "low") {
    reasons.push("offers a peaceful experience");
  }
  if (poi.accessibility === "easy") {
    reasons.push("easy to access");
  }

  return reasons.slice(0, 2).join(", ") + ".";
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
 * Get food spots matching dietary preference
 */
function getFoodSpots(dietaryPreference: "veg" | "non-veg" | "any"): POI[] {
  const allPOIs = poiData.pois as POI[];

  // Filter for food-related POIs
  const foodPOIs = allPOIs.filter((poi) =>
    poi.category.some((cat) =>
      ["food", "restaurant", "cafe"].includes(cat.toLowerCase())
    )
  );

  // Filter by dietary preference
  return foodPOIs.filter((poi) => {
    const poiDietary = (poi as POI & { dietary?: string }).dietary;
    if (!poiDietary || dietaryPreference === "any") return true;
    if (dietaryPreference === "veg") {
      return poiDietary === "veg" || poiDietary === "both";
    }
    if (dietaryPreference === "non-veg") {
      return poiDietary === "non-veg" || poiDietary === "both";
    }
    return true;
  });
}

/**
 * Find best food spot for a meal time
 */
function findFoodSpotForMeal(
  foodSpots: POI[],
  mealType: "lunch" | "dinner",
  usedFoodSpotIds: Set<string>,
  lastPOI: POI | null,
  travelTimeMatrix: Record<string, Record<string, number>>
): POI | null {
  // Filter to unused food spots
  const available = foodSpots.filter((spot) => !usedFoodSpotIds.has(spot.id));
  if (available.length === 0) return null;

  // Prefer spots that match the meal type
  const preferredMealTimes = mealType === "lunch" ? ["lunch", "any"] : ["dinner", "any"];
  const matchingMealTime = available.filter((spot) => {
    const spotMealType = (spot as POI & { mealType?: string }).mealType;
    return !spotMealType || preferredMealTimes.includes(spotMealType);
  });

  const candidates = matchingMealTime.length > 0 ? matchingMealTime : available;

  // If we have a last POI, prefer nearby food spots
  if (lastPOI) {
    candidates.sort((a, b) => {
      const travelA = travelTimeMatrix[lastPOI.id]?.[a.id] || 30;
      const travelB = travelTimeMatrix[lastPOI.id]?.[b.id] || 30;
      return travelA - travelB;
    });
  }

  return candidates[0] || null;
}

/**
 * Insert food spot into a day's schedule at appropriate time
 */
function insertFoodSpot(
  blocks: TimeBlock[],
  foodSpot: POI,
  dayNumber: number,
  mealType: "lunch" | "dinner",
  travelTimeMatrix: Record<string, Record<string, number>>,
  poiReasons?: Map<string, string>
): TimeBlock | null {
  const targetStartTime = mealType === "lunch" ? 12 * 60 + 30 : 19 * 60; // 12:30 PM or 7:00 PM

  // Find the best position to insert the food spot
  let insertIndex = blocks.length; // Default: append at end
  let travelTime = 15; // Default travel time

  for (let i = 0; i < blocks.length; i++) {
    const blockStartMins = parseTime(blocks[i].startTime);
    if (blockStartMins > targetStartTime) {
      insertIndex = i;
      break;
    }
  }

  // Calculate travel time from previous block
  if (insertIndex > 0) {
    const prevPOI = blocks[insertIndex - 1].poi;
    travelTime = travelTimeMatrix[prevPOI.id]?.[foodSpot.id] || 15;
  }

  // Calculate start time
  let startMins = targetStartTime;
  if (insertIndex > 0) {
    const prevEndMins = parseTime(blocks[insertIndex - 1].endTime);
    startMins = Math.max(targetStartTime, prevEndMins + travelTime);
  }

  const endMins = startMins + foodSpot.estimated_duration_mins;

  // Create the food block
  const foodBlock: TimeBlock = {
    id: `block-${dayNumber}-food-${mealType}`,
    timeSlot: mealType === "lunch" ? "afternoon" : "evening",
    startTime: formatTime(startMins),
    endTime: formatTime(endMins),
    poi: foodSpot,
    travelTimeFromPrev: travelTime,
    reasoning: poiReasons?.get(foodSpot.id) ||
      `Recommended ${mealType === "lunch" ? "lunch" : "dinner"} spot matching your dietary preference. ${foodSpot.tips?.[0] || ""}`,
    notes: mealType === "lunch" ? "Lunch break" : "Dinner stop",
  };

  return foodBlock;
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
