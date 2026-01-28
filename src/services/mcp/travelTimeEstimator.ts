/**
 * Travel Time Estimator MCP Tool
 * Provides travel time estimates between POIs with various adjustments
 */

import travelTimesData from "@/data/ooty-travel-times.json";
import type { POI } from "@/types";

// Types
export interface TravelTimeInput {
  fromPOI: string; // POI ID or name
  toPOI: string; // POI ID or name
  mode?: "car" | "auto" | "walk";
  departureTime?: string; // HH:MM format
  weather?: "clear" | "rainy" | "foggy";
}

export interface TravelTimeOutput {
  durationMins: number;
  distanceKm?: number;
  adjustedDurationMins: number;
  adjustments: TravelAdjustment[];
  confidence: "high" | "medium" | "low";
  source: string;
}

export interface TravelAdjustment {
  factor: string;
  multiplier: number;
  reason: string;
}

export interface RouteSegment {
  from: string;
  to: string;
  durationMins: number;
  adjustedDurationMins: number;
}

// Travel time matrix from data
const travelMatrix = travelTimesData.matrix as Record<string, Record<string, number>>;
const poiLocations = travelTimesData.locations as string[];

// Time-based adjustment factors
const TIME_ADJUSTMENTS: Record<string, number> = {
  "06:00-08:00": 0.9,  // Early morning - less traffic
  "08:00-10:00": 1.2,  // Morning rush
  "10:00-12:00": 1.0,  // Normal
  "12:00-14:00": 1.1,  // Lunch traffic
  "14:00-17:00": 1.0,  // Normal
  "17:00-19:00": 1.3,  // Evening rush (peak tourist time)
  "19:00-21:00": 1.1,  // Evening
  "21:00-06:00": 0.8,  // Night - minimal traffic
};

// Weather adjustment factors
const WEATHER_ADJUSTMENTS: Record<string, number> = {
  clear: 1.0,
  rainy: 1.4,  // Slower due to wet roads, reduced visibility
  foggy: 1.6,  // Common in Ooty hills, significantly slower
};

// Mode adjustment factors (base times are for car)
const MODE_ADJUSTMENTS: Record<string, number> = {
  car: 1.0,
  auto: 1.2,  // Auto-rickshaws slightly slower
  walk: 8.0,  // Walking is much slower (rough estimate)
};

/**
 * Get time slot for departure time
 */
function getTimeSlot(time: string): string {
  const [hours] = time.split(":").map(Number);

  if (hours >= 6 && hours < 8) return "06:00-08:00";
  if (hours >= 8 && hours < 10) return "08:00-10:00";
  if (hours >= 10 && hours < 12) return "10:00-12:00";
  if (hours >= 12 && hours < 14) return "12:00-14:00";
  if (hours >= 14 && hours < 17) return "14:00-17:00";
  if (hours >= 17 && hours < 19) return "17:00-19:00";
  if (hours >= 19 && hours < 21) return "19:00-21:00";
  return "21:00-06:00";
}

/**
 * Normalize POI name to match travel matrix keys
 */
function normalizePOIName(name: string): string {
  const lowerName = name.toLowerCase();

  // Direct match in locations
  for (const location of poiLocations) {
    if (location.toLowerCase() === lowerName) {
      return location;
    }
  }

  // Partial match - check if name is contained in location or vice versa
  for (const location of poiLocations) {
    const locationLower = location.toLowerCase();
    // Handle POI IDs like "poi-doddabetta" matching "doddabetta"
    const cleanLocation = locationLower.replace("poi-", "").replace(/-/g, " ");
    const cleanName = lowerName.replace("poi-", "").replace(/-/g, " ");

    if (cleanLocation.includes(cleanName) || cleanName.includes(cleanLocation)) {
      return location;
    }
  }

  // Try matrix keys directly
  const matrixKeys = Object.keys(travelMatrix);
  for (const key of matrixKeys) {
    if (key.toLowerCase() === lowerName ||
        lowerName.includes(key.toLowerCase().replace("poi-", "").replace(/-/g, " ")) ||
        key.toLowerCase().replace("poi-", "").replace(/-/g, " ").includes(lowerName)) {
      return key;
    }
  }

  return name;
}

/**
 * Get base travel time between two POIs
 */
function getBaseTravelTime(from: string, to: string): number | null {
  const normalizedFrom = normalizePOIName(from);
  const normalizedTo = normalizePOIName(to);

  if (travelMatrix[normalizedFrom]?.[normalizedTo] !== undefined) {
    return travelMatrix[normalizedFrom][normalizedTo];
  }

  // Try reverse lookup
  if (travelMatrix[normalizedTo]?.[normalizedFrom] !== undefined) {
    return travelMatrix[normalizedTo][normalizedFrom];
  }

  return null;
}

/**
 * Estimate travel time between two POIs
 */
export function estimateTravelTime(input: TravelTimeInput): TravelTimeOutput {
  const {
    fromPOI,
    toPOI,
    mode = "car",
    departureTime = "10:00",
    weather = "clear",
  } = input;

  const adjustments: TravelAdjustment[] = [];
  let confidence: "high" | "medium" | "low" = "high";

  // Get base travel time
  let baseDuration = getBaseTravelTime(fromPOI, toPOI);

  if (baseDuration === null) {
    // Fallback: estimate based on average (20 mins within Ooty)
    baseDuration = 20;
    confidence = "low";
    adjustments.push({
      factor: "estimated",
      multiplier: 1.0,
      reason: "Route not in database, using average estimate",
    });
  }

  let adjustedDuration = baseDuration;

  // Apply mode adjustment
  if (mode !== "car") {
    const modeMultiplier = MODE_ADJUSTMENTS[mode];
    adjustedDuration *= modeMultiplier;
    adjustments.push({
      factor: "transport_mode",
      multiplier: modeMultiplier,
      reason: `${mode} travel mode`,
    });
  }

  // Apply time-of-day adjustment
  const timeSlot = getTimeSlot(departureTime);
  const timeMultiplier = TIME_ADJUSTMENTS[timeSlot];
  if (timeMultiplier !== 1.0) {
    adjustedDuration *= timeMultiplier;
    adjustments.push({
      factor: "time_of_day",
      multiplier: timeMultiplier,
      reason: `Departure at ${departureTime} (${timeSlot})`,
    });
  }

  // Apply weather adjustment
  if (weather !== "clear") {
    const weatherMultiplier = WEATHER_ADJUSTMENTS[weather];
    adjustedDuration *= weatherMultiplier;
    adjustments.push({
      factor: "weather",
      multiplier: weatherMultiplier,
      reason: `${weather} weather conditions`,
    });
    if (confidence === "high") confidence = "medium";
  }

  return {
    durationMins: baseDuration,
    adjustedDurationMins: Math.round(adjustedDuration),
    adjustments,
    confidence,
    source: "Ooty Travel Time Matrix v1.0",
  };
}

/**
 * Calculate total travel time for a route (multiple POIs)
 */
export function calculateRouteTime(
  pois: (POI | string)[],
  options?: {
    mode?: "car" | "auto" | "walk";
    startTime?: string;
    weather?: "clear" | "rainy" | "foggy";
  }
): {
  totalMins: number;
  adjustedTotalMins: number;
  segments: RouteSegment[];
  warnings: string[];
} {
  const segments: RouteSegment[] = [];
  const warnings: string[] = [];
  let totalMins = 0;
  let adjustedTotalMins = 0;
  let currentTime = options?.startTime || "09:00";

  for (let i = 0; i < pois.length - 1; i++) {
    const currentPOI = pois[i];
    const nextPOI = pois[i + 1];
    const fromPOI = typeof currentPOI === "string" ? currentPOI : currentPOI.name;
    const toPOI = typeof nextPOI === "string" ? nextPOI : nextPOI.name;

    const estimate = estimateTravelTime({
      fromPOI,
      toPOI,
      mode: options?.mode,
      departureTime: currentTime,
      weather: options?.weather,
    });

    segments.push({
      from: fromPOI,
      to: toPOI,
      durationMins: estimate.durationMins,
      adjustedDurationMins: estimate.adjustedDurationMins,
    });

    totalMins += estimate.durationMins;
    adjustedTotalMins += estimate.adjustedDurationMins;

    // Check for long segments
    if (estimate.adjustedDurationMins > 45) {
      warnings.push(`Long travel time (${estimate.adjustedDurationMins} mins) from ${fromPOI} to ${toPOI}`);
    }

    if (estimate.confidence === "low") {
      warnings.push(`Estimated travel time for ${fromPOI} to ${toPOI} (not in database)`);
    }

    // Update current time for next segment (rough estimate)
    const [hours, mins] = currentTime.split(":").map(Number);
    const newMins = mins + estimate.adjustedDurationMins + 60; // Add 1hr for activity
    const newHours = hours + Math.floor(newMins / 60);
    currentTime = `${String(newHours % 24).padStart(2, "0")}:${String(newMins % 60).padStart(2, "0")}`;
  }

  return {
    totalMins,
    adjustedTotalMins,
    segments,
    warnings,
  };
}

/**
 * Get travel time between two POIs (simple interface)
 */
export function getTravelTime(from: string, to: string): number {
  const result = estimateTravelTime({ fromPOI: from, toPOI: to });
  return result.durationMins;
}

/**
 * Check if travel time exists in the matrix
 */
export function hasTravelTime(from: string, to: string): boolean {
  return getBaseTravelTime(from, to) !== null;
}

export default {
  estimateTravelTime,
  calculateRouteTime,
  getTravelTime,
  hasTravelTime,
};
