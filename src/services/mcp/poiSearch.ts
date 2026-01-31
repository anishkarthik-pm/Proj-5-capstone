import type { POI, POISearchInput, POISearchOutput } from "@/types";
import poiData from "@/data/ooty-pois.json";

/**
 * MCP Tool: POI Search
 *
 * Searches and ranks Points of Interest based on user preferences.
 * This tool is used by the planning agent to find relevant attractions.
 */
export const poiSearchMeta = {
  name: "poi_search",
  description:
    "Search for points of interest in Ooty based on user preferences including interests, pace, and time of day.",
  inputSchema: {
    type: "object",
    properties: {
      city: {
        type: "string",
        description: "The city to search in (currently only 'ooty' supported)",
        enum: ["ooty"],
      },
      interests: {
        type: "array",
        items: { type: "string" },
        description:
          "User interests to match against POI categories (e.g., nature, food, culture, adventure, relaxation)",
      },
      pace: {
        type: "string",
        enum: ["relaxed", "moderate", "packed"],
        description:
          "Trip pace preference - affects ranking based on crowd levels and duration",
      },
      excludeIds: {
        type: "array",
        items: { type: "string" },
        description: "POI IDs to exclude from results (already selected)",
      },
      timeSlot: {
        type: "string",
        enum: ["morning", "afternoon", "evening"],
        description: "Preferred time slot for activities",
      },
      maxResults: {
        type: "number",
        description: "Maximum number of results to return (default: 10)",
      },
    },
    required: ["city", "interests"],
  },
  outputSchema: {
    type: "object",
    properties: {
      pois: {
        type: "array",
        items: { $ref: "#/definitions/POI" },
        description: "Ranked list of matching POIs",
      },
      reasoning: {
        type: "string",
        description: "Explanation of the ranking criteria used",
      },
      sources: {
        type: "array",
        items: { type: "string" },
        description: "Data sources used for the search",
      },
    },
  },
};

/**
 * Score weights for ranking
 */
const SCORE_WEIGHTS = {
  interestRelevance: 0.4,
  bestTimeMatch: 0.2,
  crowdLevelMatch: 0.2,
  diversityBonus: 0.2,
};

/**
 * Interest to category mapping for fuzzy matching
 */
const INTEREST_CATEGORY_MAP: Record<string, string[]> = {
  nature: ["nature", "scenic", "trekking", "waterfall", "gardens"],
  food: ["food", "restaurant", "cafe", "shopping", "tea"],
  culture: ["culture", "heritage", "museum", "architecture", "art"],
  adventure: ["adventure", "trekking", "activity", "boating"],
  relaxation: ["relaxation", "scenic", "gardens", "cafe"],
  photography: ["scenic", "nature", "photography"],
  family: ["family", "boating", "gardens", "easy"],
};

/**
 * Extended POI search output with per-POI reasoning
 */
export interface POISearchOutputWithReasons extends POISearchOutput {
  poiReasons: Map<string, string>;
}

/**
 * Search for POIs based on preferences
 */
export async function searchPOIs(input: POISearchInput): Promise<POISearchOutputWithReasons> {
  const {
    interests,
    pace = "moderate",
    excludeIds = [],
    timeSlot,
    maxResults = 10,
  } = input;

  // Get all POIs
  const allPOIs = poiData.pois as POI[];

  // Filter out excluded POIs
  const availablePOIs = allPOIs.filter((poi) => !excludeIds.includes(poi.id));

  // Score and rank POIs with detailed breakdown
  const scoredPOIs = availablePOIs.map((poi) => {
    const breakdown = calculatePOIScoreWithBreakdown(poi, interests, pace, timeSlot, excludeIds);
    return {
      poi,
      score: breakdown.total,
      breakdown,
    };
  });

  // Sort by score descending
  scoredPOIs.sort((a, b) => b.score - a.score);

  // Take top results and generate per-POI reasoning
  const topScoredPOIs = scoredPOIs.slice(0, maxResults);
  const topPOIs = topScoredPOIs.map((item) => item.poi);

  // Build reasoning map
  const poiReasons = new Map<string, string>();
  for (const item of topScoredPOIs) {
    const reason = generatePOIReason(item.poi, item.breakdown, interests, pace, timeSlot);
    poiReasons.set(item.poi.id, reason);
  }

  // Generate overall reasoning
  const reasoning = generateReasoning(interests, pace, timeSlot, topPOIs);

  // Collect sources
  const uniqueSources = Array.from(new Set(topPOIs.map((poi) => poi.source)));
  const sources = uniqueSources.map(
    (source) => {
      switch (source) {
        case "osm":
          return "OpenStreetMap";
        case "wikivoyage":
          return "Wikivoyage - Ooty";
        case "local":
          return "Local curated tips";
        default:
          return source;
      }
    }
  );

  return {
    pois: topPOIs,
    poiReasons,
    reasoning,
    sources,
  };
}

/**
 * Score breakdown for detailed reasoning
 */
interface ScoreBreakdown {
  total: number;
  interestScore: number;
  timeScore: number;
  crowdScore: number;
  diversityScore: number;
  matchedInterests: string[];
}

/**
 * Calculate score with detailed breakdown for reasoning
 */
function calculatePOIScoreWithBreakdown(
  poi: POI,
  interests: string[],
  pace: string,
  timeSlot?: "morning" | "afternoon" | "evening",
  excludeIds?: string[]
): ScoreBreakdown {
  // 1. Interest relevance (40%)
  const { score: interestScore, matchedInterests } = calculateInterestScoreWithMatches(poi, interests);

  // 2. Best time match (20%)
  const timeScore = calculateTimeScore(poi, timeSlot);

  // 3. Crowd level vs pace (20%)
  const crowdScore = calculateCrowdScore(poi, pace);

  // 4. Diversity bonus (20%)
  const diversityScore = calculateDiversityScore(poi, excludeIds || []);

  const total =
    interestScore * SCORE_WEIGHTS.interestRelevance +
    timeScore * SCORE_WEIGHTS.bestTimeMatch +
    crowdScore * SCORE_WEIGHTS.crowdLevelMatch +
    diversityScore * SCORE_WEIGHTS.diversityBonus;

  return {
    total,
    interestScore,
    timeScore,
    crowdScore,
    diversityScore,
    matchedInterests,
  };
}

/**
 * Calculate interest relevance score with matched interests
 */
function calculateInterestScoreWithMatches(
  poi: POI,
  interests: string[]
): { score: number; matchedInterests: string[] } {
  let matchCount = 0;
  const totalPossible = interests.length;
  const matchedInterests: string[] = [];

  for (const interest of interests) {
    const categories = INTEREST_CATEGORY_MAP[interest.toLowerCase()] || [
      interest.toLowerCase(),
    ];

    // Check if POI category matches any mapped categories
    for (const category of poi.category) {
      if (
        categories.some(
          (c) =>
            category.toLowerCase().includes(c) ||
            c.includes(category.toLowerCase())
        )
      ) {
        matchCount++;
        matchedInterests.push(interest);
        break;
      }
    }
  }

  return {
    score: totalPossible > 0 ? matchCount / totalPossible : 0.5,
    matchedInterests,
  };
}

/**
 * Calculate time slot match score
 */
function calculateTimeScore(
  poi: POI,
  timeSlot?: "morning" | "afternoon" | "evening"
): number {
  if (!timeSlot) return 0.5; // Neutral if no preference

  if (poi.best_time === "any") return 0.7; // Good anytime is decent
  if (poi.best_time === timeSlot) return 1.0; // Perfect match

  // Slight penalty for mismatch
  return 0.3;
}

/**
 * Calculate crowd level vs pace preference score
 */
function calculateCrowdScore(poi: POI, pace: string): number {
  const crowdLevelMap: Record<string, number> = {
    low: 1,
    medium: 2,
    high: 3,
  };

  const pacePreferenceMap: Record<string, number> = {
    relaxed: 1, // Prefers low crowd
    moderate: 2, // Accepts medium crowd
    packed: 3, // Can handle high crowd
  };

  const crowdLevel = crowdLevelMap[poi.crowd_level] || 2;
  const pacePref = pacePreferenceMap[pace] || 2;

  // Score based on how well crowd matches pace tolerance
  if (crowdLevel <= pacePref) {
    return 1.0; // Within tolerance
  } else {
    // Penalize based on how much it exceeds tolerance
    return Math.max(0.2, 1 - (crowdLevel - pacePref) * 0.3);
  }
}

/**
 * Calculate diversity score to avoid similar POIs
 */
function calculateDiversityScore(poi: POI, excludeIds: string[]): number {
  if (excludeIds.length === 0) return 0.5;

  // Get categories of excluded POIs (would need to look them up)
  // For now, give a small bonus to all since we're already filtering excluded IDs
  return 0.5;
}

/**
 * Generate reasoning text for the search results
 */
function generateReasoning(
  interests: string[],
  pace: string,
  timeSlot: string | undefined,
  pois: POI[]
): string {
  const parts: string[] = [];

  parts.push(`Searched for POIs matching interests: ${interests.join(", ")}.`);
  parts.push(`Considering ${pace} pace preference.`);

  if (timeSlot) {
    parts.push(`Prioritized ${timeSlot} activities.`);
  }

  const categories = Array.from(new Set(pois.flatMap((p) => p.category)));
  parts.push(`Found ${pois.length} places across categories: ${categories.slice(0, 5).join(", ")}.`);

  return parts.join(" ");
}

/**
 * Generate specific reasoning for why a POI was selected
 */
function generatePOIReason(
  poi: POI,
  breakdown: ScoreBreakdown,
  interests: string[],
  pace: string,
  timeSlot?: string
): string {
  const reasons: string[] = [];

  // Interest match reason
  if (breakdown.matchedInterests.length > 0) {
    const matchedCategories = poi.category.filter((cat) =>
      breakdown.matchedInterests.some((interest) => {
        const mapped = INTEREST_CATEGORY_MAP[interest.toLowerCase()] || [interest.toLowerCase()];
        return mapped.some((m) => cat.toLowerCase().includes(m) || m.includes(cat.toLowerCase()));
      })
    );
    if (matchedCategories.length > 0) {
      reasons.push(`Matches your interest in ${breakdown.matchedInterests.join(" and ")} (${matchedCategories.join(", ")})`);
    }
  }

  // Time-based reason
  if (timeSlot && poi.best_time === timeSlot) {
    reasons.push(`Best visited in the ${timeSlot}`);
  } else if (poi.best_time === "morning") {
    reasons.push("Best visited in the morning for clear views");
  } else if (poi.best_time === "evening") {
    reasons.push("Perfect for an evening visit");
  }

  // Crowd-based reason
  if (pace === "relaxed" && poi.crowd_level === "low") {
    reasons.push("Peaceful spot ideal for a relaxed pace");
  } else if (pace === "packed" && poi.crowd_level === "high") {
    reasons.push("Popular attraction - a must-see in Ooty");
  }

  // Accessibility reason
  if (poi.accessibility === "easy") {
    reasons.push("Easy to access");
  } else if (poi.accessibility === "moderate") {
    reasons.push("Moderate walking required");
  }

  // Duration reason
  if (poi.estimated_duration_mins <= 45) {
    reasons.push("Quick visit fits well in the schedule");
  } else if (poi.estimated_duration_mins >= 120) {
    reasons.push("Worth spending time here for the full experience");
  }

  // Cost reason
  if (poi.cost_inr === 0) {
    reasons.push("Free entry");
  } else if (poi.cost_inr <= 50) {
    reasons.push("Budget-friendly entry fee");
  }

  // Add a tip if available
  if (poi.tips && poi.tips.length > 0) {
    reasons.push(`Tip: ${poi.tips[0]}`);
  }

  // Combine reasons into a coherent sentence
  if (reasons.length === 0) {
    return `A popular ${poi.category[0]} spot in Ooty.`;
  }

  return reasons.slice(0, 3).join(". ") + ".";
}

/**
 * Get a specific POI by ID
 */
export function getPOIById(id: string): POI | undefined {
  return (poiData.pois as POI[]).find((poi) => poi.id === id);
}

/**
 * Get all POIs
 */
export function getAllPOIs(): POI[] {
  return poiData.pois as POI[];
}

/**
 * Get POIs by category
 */
export function getPOIsByCategory(category: string): POI[] {
  return (poiData.pois as POI[]).filter((poi) =>
    poi.category.some((c) => c.toLowerCase().includes(category.toLowerCase()))
  );
}

/**
 * Find a specific POI by name (case-insensitive fuzzy match)
 */
export function findPOIByName(name: string): POI | undefined {
  const allPOIs = poiData.pois as POI[];
  const lowerName = name.toLowerCase();

  // Try exact match first
  let found = allPOIs.find((poi) => poi.name.toLowerCase() === lowerName);

  // Try partial match if not found
  if (!found) {
    found = allPOIs.find((poi) =>
      poi.name.toLowerCase().includes(lowerName) ||
      lowerName.includes(poi.name.toLowerCase())
    );
  }

  return found;
}

export default searchPOIs;
