"use client";

import React, { useMemo } from "react";
import { IndianRupee, Calculator, Info, Car, Hotel } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Itinerary } from "@/types";
import { VEHICLE_RATES, type VehicleType } from "@/services/mcp/travelCostCalculator";
import { getRecommendedHotel, calculateHotelCost, type HotelRecommendation } from "@/services/mcp/hotelCalculator";

interface CostBreakdownProps {
  itinerary: Itinerary;
  className?: string;
}

interface CategoryCost {
  category: string;
  displayName: string;
  baseCost: number;
  gstRate: number;
  gstAmount: number;
  totalCost: number;
  items: { name: string; cost: number }[];
}

// GST rates for different categories
const GST_RATES: Record<string, number> = {
  nature: 0, // Entry fees typically exempted
  scenic: 0,
  gardens: 0,
  heritage: 0.05, // 5% GST on heritage sites
  museum: 0.05,
  culture: 0.05,
  food: 0.05, // 5% GST on restaurants (non-AC)
  cafe: 0.05,
  restaurant: 0.05,
  shopping: 0.12, // 12% GST on most goods
  activity: 0.18, // 18% GST on services
  boating: 0.18,
  experience: 0.18,
  trekking: 0.18,
  adventure: 0.18,
};

const CATEGORY_DISPLAY_NAMES: Record<string, string> = {
  nature: "Nature & Scenic Spots",
  gardens: "Gardens & Parks",
  heritage: "Heritage & Museums",
  food: "Food & Dining",
  shopping: "Shopping",
  activity: "Activities & Experiences",
};

export function CostBreakdown({ itinerary, className }: CostBreakdownProps) {
  const breakdown = useMemo(() => {
    const categoryMap = new Map<string, CategoryCost>();

    // Process all POIs in the itinerary
    for (const day of itinerary.days) {
      for (const block of day.blocks) {
        const poi = block.poi;

        // Determine primary category for GST grouping
        let gstRate = 0;

        // Find the category with highest GST (most specific)
        for (const cat of poi.category) {
          const catLower = cat.toLowerCase();
          const rate = GST_RATES[catLower] ?? 0;
          if (rate >= gstRate) {
            gstRate = rate;
          }
        }

        // Group into display categories
        let displayCategory = "nature";
        if (
          poi.category.some((c) =>
            ["food", "cafe", "restaurant", "vegetarian"].includes(c.toLowerCase())
          )
        ) {
          displayCategory = "food";
        } else if (
          poi.category.some((c) =>
            ["activity", "boating", "trekking", "adventure", "experience"].includes(
              c.toLowerCase()
            )
          )
        ) {
          displayCategory = "activity";
        } else if (
          poi.category.some((c) =>
            ["heritage", "museum", "culture", "architecture", "art"].includes(
              c.toLowerCase()
            )
          )
        ) {
          displayCategory = "heritage";
        } else if (poi.category.some((c) => ["shopping"].includes(c.toLowerCase()))) {
          displayCategory = "shopping";
        } else if (
          poi.category.some((c) => ["gardens", "garden"].includes(c.toLowerCase()))
        ) {
          displayCategory = "gardens";
        }

        // Get or create category entry
        if (!categoryMap.has(displayCategory)) {
          categoryMap.set(displayCategory, {
            category: displayCategory,
            displayName: CATEGORY_DISPLAY_NAMES[displayCategory] || displayCategory,
            baseCost: 0,
            gstRate: GST_RATES[displayCategory] ?? 0,
            gstAmount: 0,
            totalCost: 0,
            items: [],
          });
        }

        const catData = categoryMap.get(displayCategory)!;
        catData.baseCost += poi.cost_inr;
        catData.items.push({ name: poi.name, cost: poi.cost_inr });
      }
    }

    // Calculate GST for each category
    const categories: CategoryCost[] = [];
    let totalBase = 0;
    let totalGst = 0;

    Array.from(categoryMap.values()).forEach((catData) => {
      catData.gstAmount = Math.round(catData.baseCost * catData.gstRate);
      catData.totalCost = catData.baseCost + catData.gstAmount;
      totalBase += catData.baseCost;
      totalGst += catData.gstAmount;
      categories.push(catData);
    });

    // Sort by total cost descending
    categories.sort((a, b) => b.totalCost - a.totalCost);

    // Calculate travel cost
    const totalDistanceKm = itinerary.days.reduce((sum, d) => sum + (d.totalDistanceKm || 0), 0);
    const vehicleType = (itinerary.preferences.vehicleType || "sedan") as VehicleType;
    const vehicleInfo = VEHICLE_RATES[vehicleType];
    const travelBaseCost = Math.round(totalDistanceKm * vehicleInfo.perKmRate);
    const travelGst = Math.round(travelBaseCost * 0.05); // 5% GST on transport
    const travelTotalCost = travelBaseCost + travelGst;

    // Calculate hotel cost
    let hotelRecommendation: HotelRecommendation | null = null;
    const numNights = Math.max(itinerary.preferences.numDays - 1, 1);
    const groupSize = itinerary.preferences.groupSize || 2;

    if (itinerary.preferences.hotelId) {
      hotelRecommendation = calculateHotelCost({
        hotelId: itinerary.preferences.hotelId,
        groupSize,
        numNights,
      });
    } else {
      hotelRecommendation = getRecommendedHotel({
        groupSize,
        numNights,
        budget: itinerary.preferences.budget || "moderate",
      });
    }

    return {
      categories,
      totalBase,
      totalGst,
      activitiesTotal: totalBase + totalGst,
      // Travel
      travelDistanceKm: Math.round(totalDistanceKm),
      vehicleType,
      vehicleName: vehicleInfo.name,
      travelBaseCost,
      travelGst,
      travelTotalCost,
      // Hotel
      hotelRecommendation,
      // Grand total
      grandTotal: totalBase + totalGst + travelTotalCost + (hotelRecommendation?.totalPrice || 0),
    };
  }, [itinerary]);

  return (
    <div className={cn("bg-card rounded-lg border p-4", className)}>
      <div className="flex items-center gap-2 mb-4">
        <Calculator className="w-5 h-5 text-primary" />
        <h3 className="font-semibold">Estimated Trip Cost</h3>
      </div>

      {/* Category Breakdown */}
      <div className="space-y-3 mb-4">
        {breakdown.categories.map((cat) => (
          <div key={cat.category} className="border-b pb-3 last:border-0">
            <div className="flex items-center justify-between">
              <span className="font-medium text-sm">{cat.displayName}</span>
              <div className="text-right">
                <span className="font-semibold">
                  <IndianRupee className="w-3 h-3 inline" />
                  {cat.totalCost.toLocaleString("en-IN")}
                </span>
              </div>
            </div>
            <div className="mt-1 text-xs text-muted-foreground">
              <span>
                Base: <IndianRupee className="w-2.5 h-2.5 inline" />
                {cat.baseCost.toLocaleString("en-IN")}
              </span>
              {cat.gstAmount > 0 && (
                <span className="ml-2">
                  + GST ({(cat.gstRate * 100).toFixed(0)}%):{" "}
                  <IndianRupee className="w-2.5 h-2.5 inline" />
                  {cat.gstAmount.toLocaleString("en-IN")}
                </span>
              )}
            </div>
            {/* Individual items */}
            <div className="mt-1 text-xs text-muted-foreground/70">
              {cat.items.map((item, idx) => (
                <span key={idx}>
                  {item.name}
                  {idx < cat.items.length - 1 ? ", " : ""}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Travel Cost Section */}
      <div className="border-t pt-3 mt-3">
        <div className="flex items-center gap-2 mb-2">
          <Car className="w-4 h-4 text-blue-500" />
          <span className="font-medium text-sm">Travel (Vehicle)</span>
        </div>
        <div className="text-sm space-y-1">
          <div className="flex justify-between text-muted-foreground">
            <span>{breakdown.vehicleName}</span>
            <span>{breakdown.travelDistanceKm} km</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Base + GST (5%)</span>
            <span>
              <IndianRupee className="w-3 h-3 inline" />
              {breakdown.travelTotalCost.toLocaleString("en-IN")}
            </span>
          </div>
        </div>
      </div>

      {/* Hotel Cost Section */}
      {breakdown.hotelRecommendation && (
        <div className="border-t pt-3 mt-3">
          <div className="flex items-center gap-2 mb-2">
            <Hotel className="w-4 h-4 text-purple-500" />
            <span className="font-medium text-sm">Accommodation</span>
          </div>
          <div className="text-sm space-y-1">
            <div className="flex justify-between">
              <span className="text-muted-foreground truncate max-w-[60%]">
                {breakdown.hotelRecommendation.hotel.name}
              </span>
              <span className="text-xs text-muted-foreground">
                {breakdown.hotelRecommendation.hotel.category}
              </span>
            </div>
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>
                <IndianRupee className="w-2.5 h-2.5 inline" />
                {breakdown.hotelRecommendation.pricePerNight.toLocaleString("en-IN")}/night × {breakdown.hotelRecommendation.totalNights} nights
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Total + GST (12%)</span>
              <span>
                <IndianRupee className="w-3 h-3 inline" />
                {breakdown.hotelRecommendation.totalPrice.toLocaleString("en-IN")}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Totals */}
      <div className="border-t pt-3 mt-3 space-y-2">
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Activities & Entry</span>
          <span>
            <IndianRupee className="w-3 h-3 inline" />
            {breakdown.activitiesTotal.toLocaleString("en-IN")}
          </span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Travel</span>
          <span>
            <IndianRupee className="w-3 h-3 inline" />
            {breakdown.travelTotalCost.toLocaleString("en-IN")}
          </span>
        </div>
        {breakdown.hotelRecommendation && (
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Accommodation</span>
            <span>
              <IndianRupee className="w-3 h-3 inline" />
              {breakdown.hotelRecommendation.totalPrice.toLocaleString("en-IN")}
            </span>
          </div>
        )}
        <div className="flex justify-between font-semibold text-lg border-t pt-2">
          <span>Trip Total</span>
          <span className="text-primary">
            <IndianRupee className="w-4 h-4 inline" />
            {breakdown.grandTotal.toLocaleString("en-IN")}
          </span>
        </div>
      </div>

      {/* Note */}
      <div className="mt-4 flex items-start gap-2 text-xs text-muted-foreground bg-muted/50 p-2 rounded">
        <Info className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
        <p>
          Estimate includes entry fees, vehicle travel, and accommodation. Food and
          shopping not included. You can change hotel category in preferences.
        </p>
      </div>
    </div>
  );
}

export default CostBreakdown;
