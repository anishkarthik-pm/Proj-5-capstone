"use client";

import React from "react";
import { Plus, MapPin, Star } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import type { POI } from "@/types";

export interface SuggestionItem {
  name: string;
  reason: string;
  poi?: POI;
}

interface SuggestionListProps {
  suggestions: SuggestionItem[];
  onSelect: (suggestion: SuggestionItem, dayNumber?: number, timeSlot?: "morning" | "afternoon" | "evening") => void;
  availableDays?: number[];
  className?: string;
  title?: string;
  mode?: "add" | "swap"; // Add swap mode
  swapTarget?: { dayNumber: number; timeSlot: "morning" | "afternoon" | "evening" }; // For swap mode
}

export function SuggestionList({
  suggestions,
  onSelect,
  availableDays = [1, 2, 3],
  className,
  title = "Suggested Places",
  mode = "add",
  swapTarget,
}: SuggestionListProps) {
  const [selectedDay, setSelectedDay] = React.useState<number | null>(swapTarget?.dayNumber || null);
  const [selectedTimeSlot, setSelectedTimeSlot] = React.useState<"morning" | "afternoon" | "evening" | null>(swapTarget?.timeSlot || null);
  const [selectedSuggestion, setSelectedSuggestion] = React.useState<SuggestionItem | null>(null);

  const handleSuggestionClick = (suggestion: SuggestionItem) => {
    // If in swap mode with swapTarget, complete immediately
    if (swapTarget) {
      onSelect(suggestion, swapTarget.dayNumber, swapTarget.timeSlot);
      return;
    }
    // Otherwise, select the suggestion and show day/time selection
    setSelectedSuggestion(suggestion);
    if (mode === "add") {
      setSelectedDay(null); // Reset for add mode
      setSelectedTimeSlot(null);
    }
  };

  const handleDaySelect = (dayNumber: number) => {
    setSelectedDay(dayNumber);
    // In add mode, if we have a suggestion, we can complete (time slot optional)
    if (mode === "add" && selectedSuggestion) {
      // For add mode, time slot is optional - complete if suggestion is selected
      onSelect(selectedSuggestion, dayNumber);
      setSelectedSuggestion(null);
      setSelectedDay(null);
      setSelectedTimeSlot(null);
    }
    // In swap mode without swapTarget, wait for time slot selection
  };

  const handleTimeSlotSelect = (timeSlot: "morning" | "afternoon" | "evening") => {
    setSelectedTimeSlot(timeSlot);
    // If we have both day and suggestion, complete the selection
    if (selectedDay && selectedSuggestion) {
      onSelect(selectedSuggestion, selectedDay, timeSlot);
      setSelectedSuggestion(null);
      setSelectedDay(null);
      setSelectedTimeSlot(null);
    }
  };

  const handleQuickAdd = (suggestion: SuggestionItem, e: React.MouseEvent) => {
    e.stopPropagation();
    // Quick add to the first available day
    onSelect(suggestion, availableDays[0]);
  };

  if (!suggestions || suggestions.length === 0) {
    return null;
  }

  return (
    <div className={cn("bg-card border rounded-lg p-4 space-y-3", className)}>
      <div className="flex items-center gap-2 text-sm font-medium text-primary">
        <Star className="w-4 h-4" />
        <span>{title}</span>
      </div>

      <div className="space-y-2">
        {suggestions.map((suggestion, index) => (
          <div
            key={suggestion.name}
            className={cn(
              "group relative p-3 rounded-lg border transition-all cursor-pointer",
              selectedSuggestion?.name === suggestion.name
                ? "border-primary bg-primary/5 ring-1 ring-primary"
                : "hover:border-primary/50 hover:bg-muted/50"
            )}
            onClick={() => handleSuggestionClick(suggestion)}
          >
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/10 text-primary text-sm flex items-center justify-center font-medium">
                {index + 1}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                  <span className="font-medium text-sm truncate">{suggestion.name}</span>
                </div>
                <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                  {suggestion.reason}
                </p>

                {/* Category badges if POI data available */}
                {suggestion.poi?.category && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {suggestion.poi.category.slice(0, 3).map((cat) => (
                      <span
                        key={cat}
                        className="px-2 py-0.5 text-xs bg-muted rounded-full text-muted-foreground"
                      >
                        {cat}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Quick add button */}
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
                onClick={(e) => handleQuickAdd(suggestion, e)}
                title={`Add to Day ${availableDays[0]}`}
              >
                <Plus className="w-4 h-4" />
              </Button>
            </div>

            {/* Day and Time Slot selection panel */}
            {selectedSuggestion?.name === suggestion.name && (
              <div className="mt-3 pt-3 border-t space-y-2">
                {/* Day selection */}
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs text-muted-foreground">{mode === "swap" ? "Swap on:" : "Add to:"}</span>
                  {availableDays.map((day) => (
                    <Button
                      key={day}
                      variant="outline"
                      size="sm"
                      className={cn(
                        "h-7 px-3 text-xs",
                        selectedDay === day && "bg-primary text-primary-foreground"
                      )}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDaySelect(day);
                      }}
                    >
                      Day {day}
                    </Button>
                  ))}
                </div>
                {/* Time slot selection (only show if day is selected and in swap mode without swapTarget) */}
                {(selectedDay && mode === "swap" && !swapTarget) && (
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs text-muted-foreground">Time:</span>
                    {(["morning", "afternoon", "evening"] as const).map((slot) => (
                      <Button
                        key={slot}
                        variant="outline"
                        size="sm"
                        className={cn(
                          "h-7 px-3 text-xs capitalize",
                          selectedTimeSlot === slot && "bg-primary text-primary-foreground"
                        )}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleTimeSlotSelect(slot);
                        }}
                      >
                        {slot}
                      </Button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      <p className="text-xs text-muted-foreground text-center pt-2 border-t">
        {mode === "swap"
          ? "Click a suggestion to swap, then select day and time slot"
          : "Click a suggestion to add it to your itinerary, or say \"add [name] to Day [number]\""}
      </p>
    </div>
  );
}

export default SuggestionList;
