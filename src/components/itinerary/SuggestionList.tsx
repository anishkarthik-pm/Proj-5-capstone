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
  onSelect: (suggestion: SuggestionItem, dayNumber?: number) => void;
  availableDays?: number[];
  className?: string;
  title?: string;
}

export function SuggestionList({
  suggestions,
  onSelect,
  availableDays = [1, 2, 3],
  className,
  title = "Suggested Places",
}: SuggestionListProps) {
  const [selectedDay, setSelectedDay] = React.useState<number | null>(null);
  const [selectedSuggestion, setSelectedSuggestion] = React.useState<SuggestionItem | null>(null);

  const handleSuggestionClick = (suggestion: SuggestionItem) => {
    setSelectedSuggestion(suggestion);
    setSelectedDay(null); // Reset day selection
  };

  const handleDaySelect = (dayNumber: number) => {
    if (selectedSuggestion) {
      onSelect(selectedSuggestion, dayNumber);
      setSelectedSuggestion(null);
      setSelectedDay(null);
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

            {/* Day selection panel */}
            {selectedSuggestion?.name === suggestion.name && (
              <div className="mt-3 pt-3 border-t flex items-center gap-2 flex-wrap">
                <span className="text-xs text-muted-foreground">Add to:</span>
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
            )}
          </div>
        ))}
      </div>

      <p className="text-xs text-muted-foreground text-center pt-2 border-t">
        Click a suggestion to add it to your itinerary, or say &quot;add [name] to Day [number]&quot;
      </p>
    </div>
  );
}

export default SuggestionList;
