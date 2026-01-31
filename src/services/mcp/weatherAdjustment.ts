/**
 * Weather Adjustment MCP Tool
 * Provides weather-based recommendations and itinerary adjustments
 */

import type { POI, TimeBlock, Itinerary } from "@/types";
import { getAllPOIs } from "./poiSearch";

// Types
export interface WeatherCondition {
  condition: "sunny" | "cloudy" | "rainy" | "foggy" | "stormy";
  temperature: number; // Celsius
  humidity: number; // Percentage
  visibility: "good" | "moderate" | "poor";
}

export interface SeasonInfo {
  season: "summer" | "monsoon" | "winter" | "spring";
  month: number;
  typicalWeather: WeatherCondition;
  recommendations: string[];
}

export interface WeatherAdjustmentInput {
  itinerary: Itinerary;
  weather?: WeatherCondition;
  date?: Date;
}

export interface WeatherAdjustmentOutput {
  adjustedItinerary: Itinerary;
  changes: WeatherChange[];
  warnings: string[];
  recommendations: string[];
}

export interface WeatherChange {
  dayNumber: number;
  originalPOI: string;
  replacementPOI?: string;
  reason: string;
  type: "replaced" | "removed" | "reordered" | "time_adjusted";
}

export interface IndoorAlternative {
  poiId: string;
  name: string;
  suitability: number; // 0-1
  reason: string;
}

// Ooty seasonal data (typical conditions)
const OOTY_SEASONS: Record<number, SeasonInfo> = {
  1: { // January
    season: "winter",
    month: 1,
    typicalWeather: { condition: "sunny", temperature: 15, humidity: 60, visibility: "good" },
    recommendations: ["Perfect weather for outdoor activities", "Morning mist common, clears by 10 AM"],
  },
  2: { // February
    season: "winter",
    month: 2,
    typicalWeather: { condition: "sunny", temperature: 17, humidity: 55, visibility: "good" },
    recommendations: ["Ideal for sightseeing", "Flower shows in Botanical Garden"],
  },
  3: { // March
    season: "spring",
    month: 3,
    typicalWeather: { condition: "sunny", temperature: 20, humidity: 50, visibility: "good" },
    recommendations: ["Good weather", "Start of peak tourist season"],
  },
  4: { // April
    season: "summer",
    month: 4,
    typicalWeather: { condition: "sunny", temperature: 22, humidity: 55, visibility: "good" },
    recommendations: ["Peak summer", "Book accommodations in advance"],
  },
  5: { // May
    season: "summer",
    month: 5,
    typicalWeather: { condition: "cloudy", temperature: 20, humidity: 65, visibility: "moderate" },
    recommendations: ["Summer fruit festival", "Occasional pre-monsoon showers"],
  },
  6: { // June
    season: "monsoon",
    month: 6,
    typicalWeather: { condition: "rainy", temperature: 16, humidity: 85, visibility: "poor" },
    recommendations: ["Monsoon begins", "Carry rain gear", "Roads may be slippery"],
  },
  7: { // July
    season: "monsoon",
    month: 7,
    typicalWeather: { condition: "rainy", temperature: 15, humidity: 90, visibility: "poor" },
    recommendations: ["Peak monsoon", "Waterfalls at best", "Foggy mornings"],
  },
  8: { // August
    season: "monsoon",
    month: 8,
    typicalWeather: { condition: "rainy", temperature: 15, humidity: 90, visibility: "poor" },
    recommendations: ["Continued rains", "Lush greenery", "Indoor activities recommended"],
  },
  9: { // September
    season: "monsoon",
    month: 9,
    typicalWeather: { condition: "cloudy", temperature: 16, humidity: 80, visibility: "moderate" },
    recommendations: ["Monsoon receding", "Occasional showers", "Good for nature photography"],
  },
  10: { // October
    season: "winter",
    month: 10,
    typicalWeather: { condition: "cloudy", temperature: 17, humidity: 70, visibility: "moderate" },
    recommendations: ["Pleasant weather returning", "Festival season"],
  },
  11: { // November
    season: "winter",
    month: 11,
    typicalWeather: { condition: "sunny", temperature: 16, humidity: 65, visibility: "good" },
    recommendations: ["Great for trekking", "Clear skies"],
  },
  12: { // December
    season: "winter",
    month: 12,
    typicalWeather: { condition: "sunny", temperature: 14, humidity: 60, visibility: "good" },
    recommendations: ["Peak tourist season", "Cold mornings", "Christmas celebrations"],
  },
};

// POI weather suitability
const POI_WEATHER_SUITABILITY: Record<string, {
  outdoorOnly: boolean;
  rainSuitable: boolean;
  fogSuitable: boolean;
  bestConditions: string[];
}> = {
  // Outdoor attractions
  "botanical-gardens": { outdoorOnly: true, rainSuitable: false, fogSuitable: true, bestConditions: ["sunny", "cloudy"] },
  "doddabetta-peak": { outdoorOnly: true, rainSuitable: false, fogSuitable: false, bestConditions: ["sunny"] },
  "ooty-lake": { outdoorOnly: true, rainSuitable: false, fogSuitable: false, bestConditions: ["sunny", "cloudy"] },
  "rose-garden": { outdoorOnly: true, rainSuitable: false, fogSuitable: true, bestConditions: ["sunny", "cloudy"] },
  "pykara-lake": { outdoorOnly: true, rainSuitable: false, fogSuitable: false, bestConditions: ["sunny"] },
  "avalanche-lake": { outdoorOnly: true, rainSuitable: false, fogSuitable: false, bestConditions: ["sunny"] },
  "tea-factory": { outdoorOnly: false, rainSuitable: true, fogSuitable: true, bestConditions: ["any"] },
  "thread-garden": { outdoorOnly: false, rainSuitable: true, fogSuitable: true, bestConditions: ["any"] },
  "wax-museum": { outdoorOnly: false, rainSuitable: true, fogSuitable: true, bestConditions: ["any"] },
  "tribal-museum": { outdoorOnly: false, rainSuitable: true, fogSuitable: true, bestConditions: ["any"] },
  "chocolate-factory": { outdoorOnly: false, rainSuitable: true, fogSuitable: true, bestConditions: ["any"] },
};

/**
 * Get season info for a date
 */
export function getSeasonInfo(date: Date): SeasonInfo {
  const month = date.getMonth() + 1;
  return OOTY_SEASONS[month];
}

/**
 * Get typical weather for a date
 */
export function getTypicalWeather(date: Date): WeatherCondition {
  const seasonInfo = getSeasonInfo(date);
  return seasonInfo.typicalWeather;
}

/**
 * Check if a POI is suitable for given weather
 */
export function isPOISuitableForWeather(poi: POI, weather: WeatherCondition): {
  suitable: boolean;
  score: number;
  reason: string;
} {
  const poiId = poi.id.toLowerCase();
  const suitability = POI_WEATHER_SUITABILITY[poiId];

  // Default: assume outdoor attractions are weather-sensitive
  if (!suitability) {
    const isOutdoor = poi.category.some(c =>
      ["nature", "scenic", "viewpoint", "lake", "garden", "park"].includes(c.toLowerCase())
    );

    if (isOutdoor && (weather.condition === "rainy" || weather.condition === "stormy")) {
      return {
        suitable: false,
        score: 0.3,
        reason: "Outdoor attraction not recommended in rainy weather",
      };
    }

    if (isOutdoor && weather.condition === "foggy" && weather.visibility === "poor") {
      return {
        suitable: false,
        score: 0.4,
        reason: "Poor visibility may affect the experience",
      };
    }

    return { suitable: true, score: 0.8, reason: "Weather conditions acceptable" };
  }

  // Check based on known suitability
  if (weather.condition === "rainy" || weather.condition === "stormy") {
    if (!suitability.rainSuitable) {
      return {
        suitable: false,
        score: 0.2,
        reason: "Not suitable for rainy conditions",
      };
    }
  }

  if (weather.condition === "foggy" && weather.visibility === "poor") {
    if (!suitability.fogSuitable) {
      return {
        suitable: false,
        score: 0.3,
        reason: "Fog may significantly reduce visibility and experience",
      };
    }
  }

  if (suitability.bestConditions.includes("any") ||
    suitability.bestConditions.includes(weather.condition)) {
    return { suitable: true, score: 1.0, reason: "Ideal weather for this attraction" };
  }

  return { suitable: true, score: 0.7, reason: "Weather conditions acceptable" };
}

/**
 * Find indoor alternatives for a POI
 */
export function findIndoorAlternatives(
  originalPOI: POI,
  excludeIds: string[] = []
): IndoorAlternative[] {
  const allPOIs = getAllPOIs();

  const alternatives = allPOIs
    .filter(poi => {
      // Exclude already in itinerary
      if (excludeIds.includes(poi.id)) return false;

      // Check if indoor
      const poiSuitability = POI_WEATHER_SUITABILITY[poi.id.toLowerCase()];
      if (poiSuitability && !poiSuitability.outdoorOnly && poiSuitability.rainSuitable) {
        return true;
      }

      // Check category for indoor indicators
      return poi.category.some(c =>
        ["museum", "factory", "shopping", "restaurant", "cafe", "indoor"].includes(c.toLowerCase())
      );
    })
    .map(poi => {
      // Calculate suitability score based on similarity to original
      let suitability = 0.5;

      // Bonus for similar categories
      const sharedCategories = poi.category.filter(c =>
        originalPOI.category.includes(c)
      );
      suitability += sharedCategories.length * 0.1;

      // Bonus for similar duration
      const durationDiff = Math.abs(poi.estimated_duration_mins - originalPOI.estimated_duration_mins);
      if (durationDiff < 30) suitability += 0.2;

      // Bonus for similar accessibility
      if (poi.accessibility === originalPOI.accessibility) suitability += 0.1;

      return {
        poiId: poi.id,
        name: poi.name,
        suitability: Math.min(suitability, 1),
        reason: `Indoor alternative with ${sharedCategories.length > 0 ? `similar interests (${sharedCategories.join(", ")})` : "different experience"}`,
      };
    })
    .sort((a, b) => b.suitability - a.suitability)
    .slice(0, 5);

  return alternatives;
}

/**
 * Adjust itinerary based on weather conditions
 */
export function adjustItineraryForWeather(input: WeatherAdjustmentInput): WeatherAdjustmentOutput {
  const { itinerary, date } = input;
  const weather = input.weather || getTypicalWeather(date || new Date());

  const changes: WeatherChange[] = [];
  const warnings: string[] = [];
  const recommendations: string[] = [];

  // Get season recommendations
  const seasonInfo = getSeasonInfo(date || new Date());
  recommendations.push(...seasonInfo.recommendations);

  // Clone itinerary for modifications
  const adjustedItinerary: Itinerary = JSON.parse(JSON.stringify(itinerary));

  // Get all POI IDs in itinerary
  const existingPOIIds = adjustedItinerary.days.flatMap(day =>
    day.blocks.map(block => block.poi.id)
  );

  // Check each day and block
  for (const day of adjustedItinerary.days) {
    const blocksToReplace: { index: number; block: TimeBlock; alternatives: IndoorAlternative[] }[] = [];

    for (let i = 0; i < day.blocks.length; i++) {
      const block = day.blocks[i];
      const suitability = isPOISuitableForWeather(block.poi, weather);

      if (!suitability.suitable) {
        const alternatives = findIndoorAlternatives(block.poi, existingPOIIds);

        if (alternatives.length > 0) {
          blocksToReplace.push({ index: i, block, alternatives });
        } else {
          warnings.push(
            `${block.poi.name} on Day ${day.dayNumber} may not be ideal in ${weather.condition} weather, but no alternatives found`
          );
        }
      } else if (suitability.score < 0.7) {
        warnings.push(
          `${block.poi.name} on Day ${day.dayNumber}: ${suitability.reason}`
        );
      }
    }

    // Apply replacements
    for (const replacement of blocksToReplace) {
      const bestAlternative = replacement.alternatives[0];
      const allPOIs = getAllPOIs();
      const newPOI = allPOIs.find(p => p.id === bestAlternative.poiId);

      if (newPOI) {
        const oldPOIName = replacement.block.poi.name;

        // Update the block
        day.blocks[replacement.index] = {
          ...replacement.block,
          poi: newPOI,
          notes: `Weather alternative for ${oldPOIName}. ${bestAlternative.reason}`,
        };

        existingPOIIds.push(newPOI.id);

        changes.push({
          dayNumber: day.dayNumber,
          originalPOI: oldPOIName,
          replacementPOI: newPOI.name,
          reason: `${weather.condition} weather - ${bestAlternative.reason}`,
          type: "replaced",
        });
      }
    }
  }

  // Add weather-specific recommendations
  if (weather.condition === "rainy") {
    recommendations.push("Carry an umbrella and waterproof jacket");
    recommendations.push("Roads may be slippery - allow extra travel time");
    recommendations.push("Some viewpoints may have reduced visibility");
  } else if (weather.condition === "foggy") {
    recommendations.push("Early morning fog is common - plan outdoor activities for late morning");
    recommendations.push("Doddabetta and other viewpoints best visited after 10 AM");
  } else if (weather.condition === "sunny" && weather.temperature > 25) {
    recommendations.push("Carry sunscreen and stay hydrated");
    recommendations.push("Best to visit outdoor attractions early morning or late afternoon");
  }

  // Update itinerary metadata
  adjustedItinerary.lastModified = new Date();
  adjustedItinerary.version++;

  return {
    adjustedItinerary,
    changes,
    warnings,
    recommendations,
  };
}

/**
 * Get weather-based tips for a specific POI
 */
export function getWeatherTipsForPOI(poi: POI, weather: WeatherCondition): string[] {
  const tips: string[] = [];
  const suitability = isPOISuitableForWeather(poi, weather);

  if (!suitability.suitable) {
    tips.push(`Consider visiting on a clearer day for the best experience`);
  }

  // POI-specific tips
  const poiId = poi.id.toLowerCase();

  if (poiId.includes("doddabetta") || poiId.includes("viewpoint")) {
    if (weather.condition === "foggy") {
      tips.push("Visit after 10 AM when morning fog typically clears");
    }
    if (weather.condition === "sunny") {
      tips.push("Morning visits offer clearer views before afternoon haze");
    }
  }

  if (poiId.includes("lake") || poiId.includes("boating")) {
    if (weather.condition === "rainy") {
      tips.push("Boating may be suspended during heavy rain");
    }
  }

  if (poiId.includes("garden") || poiId.includes("botanical")) {
    if (weather.condition === "rainy") {
      tips.push("Gardens are less crowded in light rain - can be pleasant with an umbrella");
    }
  }

  return tips;
}

const weatherAdjustment = {
  getSeasonInfo,
  getTypicalWeather,
  isPOISuitableForWeather,
  findIndoorAlternatives,
  adjustItineraryForWeather,
  getWeatherTipsForPOI,
};

export default weatherAdjustment;
