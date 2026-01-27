"use client";

import React from "react";
import { Calendar, MapPin, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTripStore } from "@/lib/stores/tripStore";
import { useUIStore } from "@/lib/stores/uiStore";
import { DayCard } from "./DayCard";

interface ItineraryViewProps {
  className?: string;
}

export function ItineraryView({ className }: ItineraryViewProps) {
  const { itinerary, isLoading } = useTripStore();
  const { activeDay, setActiveDay } = useUIStore();

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
              Tell me about your trip to Ooty, and I'll create a personalized
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
              {preferences.numDays} days • {preferences.pace} pace •{" "}
              {preferences.travelParty}
            </p>
          </div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Clock className="w-4 h-4" />
            <span>
              {days.reduce((sum, d) => sum + d.blocks.length, 0)} activities
            </span>
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
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {days.map((day) => (
          <div
            key={day.dayNumber}
            className={cn(
              "transition-opacity duration-200",
              activeDay === day.dayNumber ? "opacity-100" : "hidden"
            )}
          >
            <DayCard day={day} />
          </div>
        ))}
      </div>
    </div>
  );
}

export default ItineraryView;
