"use client";

import React from "react";
import { Calendar, Clock, Car, Cloud, Sun, CloudRain, CloudFog, Thermometer, IndianRupee, MapPin } from "lucide-react";
import { cn } from "@/lib/utils";
import type { DayPlan } from "@/types";
import { TimeBlockCard } from "./TimeBlockCard";
import { TravelSegment } from "./TravelSegment";



// Weather icon based on condition
function WeatherIcon({ condition }: { condition?: string }) {
  switch (condition?.toLowerCase()) {
    case "sunny":
    case "clear":
      return <Sun className="w-4 h-4 text-yellow-500" />;
    case "rainy":
    case "rain":
      return <CloudRain className="w-4 h-4 text-blue-500" />;
    case "misty":
    case "foggy":
    case "mist":
      return <CloudFog className="w-4 h-4 text-gray-400" />;
    default:
      return <Cloud className="w-4 h-4 text-gray-400" />;
  }
}

interface DayCardProps {
  day: DayPlan;
  className?: string;
  onEdit?: (dayNumber: number, spotNumber: number) => void;
  onExplain?: (poiName: string) => void;
}

export function DayCard({ day, className, onEdit, onExplain }: DayCardProps) {
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
          {day.totalDistanceKm && (
            <div className="flex items-center gap-1">
              <MapPin className="w-4 h-4" />
              <span>{day.totalDistanceKm} km</span>
            </div>
          )}
        </div>
      </div>

      {/* Weather & Theme Row */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Theme Badge */}
        {day.theme && (
          <div className="inline-flex items-center px-3 py-1 bg-primary/10 text-primary rounded-full text-sm font-medium">
            {day.theme}
          </div>
        )}

        {/* Weather Badge */}
        {day.weather && (
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-sky-50 dark:bg-sky-950/30 border border-sky-200 dark:border-sky-900 rounded-full text-sm">
            <WeatherIcon condition={day.weather.condition} />
            <span className="text-sky-800 dark:text-sky-200">
              {day.weather.temperature.min}°-{day.weather.temperature.max}°C
            </span>
            <span className="text-sky-600 dark:text-sky-300 capitalize">
              {day.weather.condition}
            </span>
          </div>
        )}

        {/* Travel Cost Badge */}
        {day.travelCostInr && day.travelCostInr > 0 && (
          <div className="inline-flex items-center gap-1 px-3 py-1 bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-900 rounded-full text-sm text-green-800 dark:text-green-200">
            <IndianRupee className="w-3 h-3" />
            <span>₹{day.travelCostInr} travel</span>
          </div>
        )}
      </div>

      {/* Weather Note/Tip */}
      {(day.weatherNote || day.weather?.tip) && (
        <div className="p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 rounded-lg text-sm text-amber-800 dark:text-amber-200">
          <Thermometer className="w-4 h-4 inline mr-2" />
          {day.weather?.tip || day.weatherNote}
        </div>
      )}

      {/* Chronological Activities List */}
      <div className="space-y-2">
        {day.blocks.length > 0 ? (
          day.blocks.map((block, index) => {
            const currentSpotNumber = index + 1;
            const isFood = block.poi.category.some(
              (c) => c.toLowerCase().includes("food") ||
                c.toLowerCase().includes("restaurant") ||
                c.toLowerCase().includes("cafe") ||
                c.toLowerCase().includes("dining")
            );

            return (
              <React.Fragment key={block.id}>
                {index > 0 && block.travelTimeFromPrev > 0 && (
                  <TravelSegment travelTime={block.travelTimeFromPrev} />
                )}
                <TimeBlockCard
                  block={block}
                  isFood={isFood}
                  spotNumber={currentSpotNumber}
                  onEdit={() => onEdit?.(day.dayNumber, currentSpotNumber)}
                  onExplain={onExplain}
                />
              </React.Fragment>
            );
          })
        ) : null}
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
