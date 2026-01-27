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
 * Search for POIs based on preferences
 */
export async function searchPOIs(input: POISearchInput): Promise<POISearchOutput> {
  const {
    interests,
    pace = "moderate",
    excludeIds = [],
    timeSlot,
    maxResults = 10,
  } = input;

  const startTime = Date.now();

  // Get all POIs
  const allPOIs = poiData.pois as POI[];

  // Filter out excluded POIs
  const availablePOIs = allPOIs.filter((poi) => !excludeIds.includes(poi.id));

  // Score and rank POIs
  const scoredPOIs = availablePOIs.map((poi) => ({
    poi,
    score: calculatePOIScore(poi, interests, pace, timeSlot, excludeIds),
  }));

  // Sort by score descending
  scoredPOIs.sort((a, b) => b.score - a.score);

  // Take top results
  const topPOIs = scoredPOIs.slice(0, maxResults).map((item) => item.poi);

  // Generate reasoning
  const reasoning = generateReasoning(interests, pace, timeSlot, topPOIs);

  // Collect sources
  const sources = [...new Set(topPOIs.map((poi) => poi.source))].map(
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

  const processingTime = Date.now() - startTime;

  return {
    pois: topPOIs,
    reasoning,
    sources,
  };
}

/**
 * Calculate a score for a POI based on preferences
 */
function calculatePOIScore(
  poi: POI,
  interests: string[],
  pace: string,
  timeSlot?: string,
  excludeIds?: string[]
): number {
  let score = 0;

  // 1. Interest relevance (40%)
  const interestScore = calculateInterestScore(poi, interests);
  score += interestScore * SCORE_WEIGHTS.interestRelevance;

  // 2. Best time match (20%)
  const timeScore = calculateTimeScore(poi, timeSlot);
  score += timeScore * SCORE_WEIGHTS.bestTimeMatch;

  // 3. Crowd level vs pace (20%)
  const crowdScore = calculateCrowdScore(poi, pace);
  score += crowdScore * SCORE_WEIGHTS.crowdLevelMatch;

  // 4. Diversity bonus (20%)
  const diversityScore = calculateDiversityScore(poi, excludeIds || []);
  score += diversityScore * SCORE_WEIGHTS.diversityBonus;

  return score;
}

/**
 * Calculate interest relevance score
 */
function calculateInterestScore(poi: POI, interests: string[]): number {
  let matchCount = 0;
  let totalPossible = interests.length;

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
        break;
      }
    }
  }

  return totalPossible > 0 ? matchCount / totalPossible : 0.5;
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

  const categories = [...new Set(pois.flatMap((p) => p.category))];
  parts.push(`Found ${pois.length} places across categories: ${categories.slice(0, 5).join(", ")}.`);

  return parts.join(" ");
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

export default searchPOIs;
