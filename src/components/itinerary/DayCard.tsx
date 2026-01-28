"use client";

import React from "react";
import { Calendar, Clock, Car } from "lucide-react";
import { cn } from "@/lib/utils";
import type { DayPlan } from "@/types";
import { TimeBlockCard } from "./TimeBlockCard";
import { TravelSegment } from "./TravelSegment";

interface DayCardProps {
  day: DayPlan;
  className?: string;
}

export function DayCard({ day, className }: DayCardProps) {
  const formatDate = (date: Date) => {
    return new Date(date).toLocaleDateString("en-IN", {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
    });
  };

  const formatDuration = (mins: number) => {
    const hours = Math.floor(mins / 60);
    const minutes = mins % 60;
    if (hours === 0) return `${minutes}m`;
    if (minutes === 0) return `${hours}h`;
    return `${hours}h ${minutes}m`;
  };

  return (
    <div className={cn("space-y-4", className)}>
      {/* Day Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center">
            <span className="text-lg font-bold text-primary">
              {day.dayNumber}
            </span>
          </div>
          <div>
            <h3 className="font-semibold text-lg">Day {day.dayNumber}</h3>
            <p className="text-sm text-muted-foreground">
              {formatDate(day.date)}
            </p>
          </div>
        </div>

        {/* Day Stats */}
        <div className="flex items-center gap-4 text-sm text-muted-foreground">
          <div className="flex items-center gap-1">
            <Clock className="w-4 h-4" />
            <span>{formatDuration(day.totalDuration)}</span>
          </div>
          <div className="flex items-center gap-1">
            <Car className="w-4 h-4" />
            <span>{formatDuration(day.totalTravelTime)}</span>
          </div>
        </div>
      </div>

      {/* Theme Badge */}
      {day.theme && (
        <div className="inline-flex items-center px-3 py-1 bg-primary/10 text-primary rounded-full text-sm font-medium">
          {day.theme}
        </div>
      )}

      {/* Weather Note */}
      {day.weatherNote && (
        <div className="p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 rounded-lg text-sm text-amber-800 dark:text-amber-200">
          {day.weatherNote}
        </div>
      )}

      {/* Time Blocks */}
      <div className="space-y-2">
        {day.blocks.map((block, index) => (
          <React.Fragment key={block.id}>
            {/* Travel Segment (between blocks) */}
            {index > 0 && block.travelTimeFromPrev > 0 && (
              <TravelSegment
                travelTime={block.travelTimeFromPrev}
              />
            )}
            <TimeBlockCard block={block} />
          </React.Fragment>
        ))}
      </div>

      {/* Empty State */}
      {day.blocks.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          <Calendar className="w-12 h-12 mx-auto mb-4 opacity-50" />
          <p>No activities scheduled for this day</p>
          <p className="text-sm mt-1">
            Ask me to add activities to Day {day.dayNumber}
          </p>
        </div>
      )}
    </div>
  );
}

export default DayCard;
