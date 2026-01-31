"use client";

import React, { useState } from "react";
import { Calendar, MapPin, Clock, Download, FileText, BookOpen, ChevronDown, ChevronUp, Users, Car, Hotel, Utensils, Plane, Train, Bus } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTripStore } from "@/lib/stores/tripStore";
import { useUIStore } from "@/lib/stores/uiStore";
import { DayCard } from "./DayCard";
import { CostBreakdown } from "./CostBreakdown";
import { exportToPdf, downloadAsHtml } from "@/services/pdf/exportPdf";
import { VEHICLE_RATES } from "@/services/mcp/travelCostCalculator";

interface ItineraryViewProps {
  className?: string;
  onEdit?: (dayNumber: number, spotNumber: number) => void;
  onExplain?: (poiName: string) => void;
}

export function ItineraryView({ className, onEdit, onExplain }: ItineraryViewProps) {
  const { itinerary, isLoading } = useTripStore();
  const { activeDay, setActiveDay } = useUIStore();
  const [showSources, setShowSources] = useState(false);

  if (isLoading) {
    return (
      <div className={cn("flex items-center justify-center h-full", className)}>
        <div className="text-center space-y-4">
          <div className="relative w-16 h-16 mx-auto">
            <div className="absolute inset-0 border-4 border-primary/30 rounded-full" />
            <div className="absolute inset-0 border-4 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
          <p className="text-muted-foreground">Creating your itinerary...</p>
        </div>
      </div>
    );
  }

  if (!itinerary) {
    return (
      <div className={cn("flex items-center justify-center h-full", className)}>
        <div className="text-center space-y-6 max-w-md px-4">
          <div className="w-24 h-24 mx-auto bg-primary/10 rounded-full flex items-center justify-center">
            <MapPin className="w-12 h-12 text-primary" />
          </div>
          <div className="space-y-2">
            <h2 className="text-2xl font-semibold">Welcome to Ooty Trip Planner</h2>
            <p className="text-muted-foreground">
              Tell me about your trip to Ooty, and I&apos;ll create a personalized
              itinerary for you. Just click the microphone and start speaking!
            </p>
          </div>
          <div className="flex flex-wrap justify-center gap-2 text-sm text-muted-foreground">
            <span className="px-3 py-1 bg-muted rounded-full">Nature</span>
            <span className="px-3 py-1 bg-muted rounded-full">Tea Gardens</span>
            <span className="px-3 py-1 bg-muted rounded-full">Scenic Views</span>
            <span className="px-3 py-1 bg-muted rounded-full">Local Food</span>
          </div>
        </div>
      </div>
    );
  }

  const { days, preferences } = itinerary;

  // Calculate derived values
  const groupSize = preferences.groupSize || 2;
  const roomsNeeded = preferences.roomsNeeded || Math.ceil(groupSize / 2);
  const vehicleType = preferences.vehicleType || "sedan";
  const vehicleInfo = VEHICLE_RATES[vehicleType as keyof typeof VEHICLE_RATES];

  // Get arrival icon
  const ArrivalIcon = preferences.arrivalPoint === "airport" ? Plane :
    preferences.arrivalPoint === "railway" ? Train :
      preferences.arrivalPoint === "bus" ? Bus : Car;

  return (
    <div className={cn("flex flex-col h-full", className)}>
      {/* Header */}
      <div className="flex-shrink-0 border-b p-4 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold flex items-center gap-2">
              <Calendar className="w-5 h-5 text-primary" />
              Your Ooty Itinerary
            </h2>
            <p className="text-sm text-muted-foreground mt-1">
              {new Date(preferences.startDate).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })} • {preferences.numDays} days • {preferences.pace} pace
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => exportToPdf(itinerary)}
              className="flex items-center gap-1 px-3 py-1.5 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
              title="Export as PDF"
            >
              <Download className="w-4 h-4" />
              <span className="hidden sm:inline">PDF</span>
            </button>
            <button
              onClick={() => downloadAsHtml(itinerary)}
              className="flex items-center gap-1 px-3 py-1.5 text-sm bg-muted hover:bg-muted/80 rounded-md transition-colors"
              title="Download HTML"
            >
              <FileText className="w-4 h-4" />
              <span className="hidden sm:inline">HTML</span>
            </button>
          </div>
        </div>

        {/* Trip Details Row */}
        <div className="flex flex-wrap gap-3 mt-3 text-sm">
          <div className="flex items-center gap-1.5 px-2 py-1 bg-muted rounded-md">
            <Users className="w-3.5 h-3.5 text-muted-foreground" />
            <span>{groupSize} guests</span>
          </div>
          <div className="flex items-center gap-1.5 px-2 py-1 bg-muted rounded-md">
            <Hotel className="w-3.5 h-3.5 text-muted-foreground" />
            <span>{roomsNeeded} {preferences.hotelCategory || "4-star"} room{roomsNeeded > 1 ? "s" : ""}</span>
          </div>
          <div className="flex items-center gap-1.5 px-2 py-1 bg-muted rounded-md">
            <Car className="w-3.5 h-3.5 text-muted-foreground" />
            <span>{vehicleInfo.name}</span>
          </div>
          {preferences.arrivalPoint && preferences.arrivalPoint !== "self-drive" && (
            <div className="flex items-center gap-1.5 px-2 py-1 bg-muted rounded-md">
              <ArrivalIcon className="w-3.5 h-3.5 text-muted-foreground" />
              <span>Arriving by {preferences.arrivalPoint}</span>
            </div>
          )}
          <div className="flex items-center gap-1.5 px-2 py-1 bg-muted rounded-md">
            <Utensils className="w-3.5 h-3.5 text-muted-foreground" />
            <span>{preferences.dietaryPreference === "veg" ? "Pure Veg" : "Veg & Non-veg"}</span>
          </div>
          <div className="flex items-center gap-1.5 px-2 py-1 bg-muted rounded-md">
            <Clock className="w-3.5 h-3.5 text-muted-foreground" />
            <span>{days.reduce((sum, d) => sum + d.blocks.length, 0)} activities</span>
          </div>
        </div>

        {/* Day Tabs */}
        <div className="flex gap-2 mt-4 overflow-x-auto pb-1">
          {days.map((day) => (
            <button
              key={day.dayNumber}
              onClick={() => setActiveDay(day.dayNumber)}
              className={cn(
                "px-4 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap",
                activeDay === day.dayNumber
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted hover:bg-muted/80"
              )}
            >
              Day {day.dayNumber}
              {day.theme && (
                <span className="ml-2 opacity-75">• {day.theme}</span>
              )}
            </button>
          ))}
          {/* Cost Summary Tab */}
          <button
            onClick={() => setActiveDay(0)}
            className={cn(
              "px-4 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap",
              activeDay === 0
                ? "bg-amber-500 text-white"
                : "bg-amber-100 hover:bg-amber-200 text-amber-800"
            )}
          >
            Cost Summary
          </button>
        </div>

        {/* Sources Panel Toggle */}
        {itinerary.sources && itinerary.sources.length > 0 && (
          <div className="mt-3 border-t pt-3">
            <button
              onClick={() => setShowSources(!showSources)}
              className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <BookOpen className="w-4 h-4" />
              <span>Data Sources ({itinerary.sources.length})</span>
              {showSources ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>

            {showSources && (
              <div className="mt-2 p-3 bg-muted/50 rounded-lg text-sm space-y-2">
                <p className="text-xs text-muted-foreground mb-2">
                  This itinerary is grounded in the following data sources:
                </p>
                {itinerary.sources.map((citation, idx) => (
                  <div key={idx} className="flex items-start gap-2 p-2 bg-background rounded border">
                    <span className="flex-shrink-0 w-5 h-5 rounded-full bg-primary/10 text-primary text-xs flex items-center justify-center">
                      {idx + 1}
                    </span>
                    <div className="flex-1">
                      <p className="text-foreground">{citation.text}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {citation.source}
                        {citation.url && (
                          <a
                            href={citation.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="ml-2 text-primary hover:underline"
                          >
                            Learn more →
                          </a>
                        )}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {/* Cost Summary View */}
        {activeDay === 0 && (
          <div className="transition-opacity duration-200">
            <CostBreakdown itinerary={itinerary} />
          </div>
        )}

        {/* Day Views */}
        {days.map((day) => (
          <div
            key={day.dayNumber}
            className={cn(
              "transition-opacity duration-200",
              activeDay === day.dayNumber ? "opacity-100" : "hidden"
            )}
          >
            <DayCard
              day={day}
              onEdit={onEdit}
              onExplain={onExplain}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

export default ItineraryView;
