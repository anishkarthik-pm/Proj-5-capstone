/**
 * Travel Cost Calculator MCP Tool
 * Calculates vehicle rental/travel costs based on distance and vehicle type
 */

import travelTimesData from "@/data/ooty-travel-times.json";

// Vehicle types with per-km rates (INR)
export const VEHICLE_RATES = {
  hatchback: {
    name: "Hatchback (4 seater)",
    perKmRate: 12,
    maxPassengers: 4,
    description: "Economical choice for small groups (e.g., Swift, i10)",
  },
  sedan: {
    name: "Sedan (4 seater)",
    perKmRate: 15,
    maxPassengers: 4,
    description: "Comfortable for couples/small families (e.g., Dzire, Etios)",
  },
  suv: {
    name: "SUV (6-7 seater)",
    perKmRate: 20,
    maxPassengers: 7,
    description: "Best for families/groups (e.g., Innova, Ertiga)",
  },
  tempo: {
    name: "Tempo Traveller (12 seater)",
    perKmRate: 28,
    maxPassengers: 12,
    description: "Ideal for large groups (12+ seater van)",
  },
};

export type VehicleType = keyof typeof VEHICLE_RATES;

// Approximate distances between POIs in km (derived from travel time assuming 30km/h avg in hills)
const AVG_SPEED_KMH = 25; // Conservative speed for hill roads

/**
 * Get recommended vehicle based on group size
 */
export function getRecommendedVehicle(groupSize: number): VehicleType {
  if (groupSize <= 2) return "hatchback";
  if (groupSize <= 4) return "sedan";
  if (groupSize <= 7) return "suv";
  return "tempo";
}

/**
 * Get all vehicle options with costs for a given distance
 */
export function getVehicleOptions(totalDistanceKm: number) {
  return Object.entries(VEHICLE_RATES).map(([type, info]) => ({
    type: type as VehicleType,
    name: info.name,
    description: info.description,
    maxPassengers: info.maxPassengers,
    perKmRate: info.perKmRate,
    estimatedCost: Math.round(totalDistanceKm * info.perKmRate),
  }));
}

/**
 * Calculate distance from travel time
 */
export function estimateDistanceKm(travelTimeMins: number): number {
  // Distance = Speed × Time, round to whole number for cleaner display
  return Math.round((AVG_SPEED_KMH * travelTimeMins) / 60);
}

/**
 * Calculate travel cost for a route
 */
export function calculateTravelCost(params: {
  poiIds: string[];
  vehicleType: VehicleType;
}): {
  totalDistanceKm: number;
  totalCostInr: number;
  segments: { from: string; to: string; distanceKm: number; costInr: number }[];
  vehicleInfo: typeof VEHICLE_RATES[VehicleType];
} {
  const { poiIds, vehicleType } = params;
  const rate = VEHICLE_RATES[vehicleType];
  const matrix = travelTimesData.matrix as Record<string, Record<string, number>>;

  const segments: { from: string; to: string; distanceKm: number; costInr: number }[] = [];
  let totalDistanceKm = 0;

  for (let i = 0; i < poiIds.length - 1; i++) {
    const from = poiIds[i];
    const to = poiIds[i + 1];
    const travelTimeMins = matrix[from]?.[to] || matrix[to]?.[from] || 20;
    const distanceKm = estimateDistanceKm(travelTimeMins);
    const costInr = Math.round(distanceKm * rate.perKmRate);

    segments.push({
      from,
      to,
      distanceKm,
      costInr,
    });

    totalDistanceKm += distanceKm;
  }

  return {
    totalDistanceKm: Math.round(totalDistanceKm),
    totalCostInr: Math.round(totalDistanceKm * rate.perKmRate),
    segments,
    vehicleInfo: rate,
  };
}

/**
 * Calculate travel cost for an entire itinerary
 */
export function calculateItineraryTravelCost(params: {
  days: Array<{ blocks: Array<{ poi: { id: string } }> }>;
  vehicleType: VehicleType;
}): {
  totalDistanceKm: number;
  totalCostInr: number;
  perDayCosts: Array<{ dayNumber: number; distanceKm: number; costInr: number }>;
  vehicleInfo: typeof VEHICLE_RATES[VehicleType];
} {
  const { days, vehicleType } = params;
  const rate = VEHICLE_RATES[vehicleType];

  const perDayCosts: Array<{ dayNumber: number; distanceKm: number; costInr: number }> = [];
  let totalDistanceKm = 0;

  for (let dayIdx = 0; dayIdx < days.length; dayIdx++) {
    const day = days[dayIdx];
    const poiIds = day.blocks.map((b) => b.poi.id);

    if (poiIds.length < 2) {
      perDayCosts.push({ dayNumber: dayIdx + 1, distanceKm: 0, costInr: 0 });
      continue;
    }

    const dayCost = calculateTravelCost({ poiIds, vehicleType });
    perDayCosts.push({
      dayNumber: dayIdx + 1,
      distanceKm: dayCost.totalDistanceKm,
      costInr: dayCost.totalCostInr,
    });
    totalDistanceKm += dayCost.totalDistanceKm;
  }

  return {
    totalDistanceKm: Math.round(totalDistanceKm),
    totalCostInr: Math.round(totalDistanceKm * rate.perKmRate),
    perDayCosts,
    vehicleInfo: rate,
  };
}

/**
 * Format cost breakdown for display
 */
export function formatCostBreakdown(params: {
  totalDistanceKm: number;
  vehicleType: VehicleType;
  numDays: number;
}): string {
  const { totalDistanceKm, vehicleType, numDays } = params;
  const rate = VEHICLE_RATES[vehicleType];
  const totalCost = Math.round(totalDistanceKm * rate.perKmRate);
  const perDayAvg = Math.round(totalCost / numDays);

  return `${rate.name}: ₹${rate.perKmRate}/km × ${totalDistanceKm}km = ₹${totalCost} total (avg ₹${perDayAvg}/day)`;
}

const travelCostCalculator = {
  VEHICLE_RATES,
  getRecommendedVehicle,
  getVehicleOptions,
  estimateDistanceKm,
  calculateTravelCost,
  calculateItineraryTravelCost,
  formatCostBreakdown,
};

export default travelCostCalculator;
