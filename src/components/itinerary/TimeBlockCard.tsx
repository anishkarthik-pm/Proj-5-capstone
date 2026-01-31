"use client";

import React, { useState } from "react";
import {
  Clock,
  MapPin,
  IndianRupee,
  ChevronDown,
  ChevronUp,
  Edit2,
  Sun,
  Sunset,
  Moon,
  RefreshCw,
  Info,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import type { TimeBlock } from "@/types";
import { useUIStore } from "@/lib/stores/uiStore";

interface TimeBlockCardProps {
  block: TimeBlock;
  className?: string;
  onEdit?: () => void;
  onReplace?: (spotNumber: number, spotName: string) => void; // Trigger replacement flow
  onInfo?: (spotNumber: number, spotName: string) => void; // Trigger info summary
  isFood?: boolean; // Different styling for food/restaurant spots
  spotNumber?: number; // Spot number for easy reference (1, 2, 3...)
}

export function TimeBlockCard({ block, className, onEdit, onReplace, onInfo, isFood, spotNumber }: TimeBlockCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const { highlightedBlocks } = useUIStore();
  const isHighlighted = highlightedBlocks.includes(block.id);

  const { poi, timeSlot, startTime, endTime } = block;

  const getTimeSlotIcon = () => {
    switch (timeSlot) {
      case "morning":
        return <Sun className="w-4 h-4 text-amber-500" />;
      case "afternoon":
        return <Sunset className="w-4 h-4 text-orange-500" />;
      case "evening":
        return <Moon className="w-4 h-4 text-indigo-500" />;
    }
  };

  const getTimeSlotColor = () => {
    switch (timeSlot) {
      case "morning":
        return "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300";
      case "afternoon":
        return "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300";
      case "evening":
        return "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-300";
    }
  };

  const getCrowdBadgeColor = () => {
    switch (poi.crowd_level) {
      case "low":
        return "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300";
      case "medium":
        return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300";
      case "high":
        return "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300";
    }
  };

  const formatTime = (time: string) => {
    const [hours, minutes] = time.split(":");
    const hour = parseInt(hours, 10);
    const ampm = hour >= 12 ? "PM" : "AM";
    const displayHour = hour % 12 || 12;
    return `${displayHour}:${minutes} ${ampm}`;
  };

  return (
    <div
      className={cn(
        "bg-card border rounded-lg overflow-hidden transition-all duration-300",
        isHighlighted && "animate-highlight ring-2 ring-primary",
        isFood && "border-amber-200 bg-amber-50/50 dark:border-amber-800 dark:bg-amber-950/20",
        className
      )}
    >
      {/* Main Content */}
      <div className="p-4">
        <div className="flex items-start justify-between gap-4">
          {/* Time and Info */}
          <div className="flex-1">
            {/* Time Slot Badge */}
            <div className="flex items-center gap-2 mb-2">
              <span
                className={cn(
                  "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium capitalize",
                  getTimeSlotColor()
                )}
              >
                {getTimeSlotIcon()}
                {timeSlot}
              </span>
              <span className="text-sm text-muted-foreground">
                {formatTime(startTime)} - {formatTime(endTime)}
              </span>
            </div>

            {/* POI Name with Spot Number */}
            <h4 className="font-semibold text-lg flex items-center gap-2">
              {spotNumber && (
                <span className="flex items-center justify-center w-6 h-6 bg-primary text-primary-foreground rounded-full text-sm font-bold flex-shrink-0">
                  {spotNumber}
                </span>
              )}
              <MapPin className="w-4 h-4 text-primary flex-shrink-0" />
              {poi.name}
            </h4>

            {/* Quick Stats */}
            <div className="flex flex-wrap items-center gap-3 mt-2 text-sm text-muted-foreground">
              <span className="flex items-center gap-1">
                <Clock className="w-3.5 h-3.5" />
                {poi.estimated_duration_mins} mins
              </span>
              {poi.cost_inr > 0 && (
                <span className="flex items-center gap-1">
                  <IndianRupee className="w-3.5 h-3.5" />
                  {poi.cost_inr}
                </span>
              )}
              <span className={cn("px-2 py-0.5 rounded text-xs", getCrowdBadgeColor())}>
                {poi.crowd_level} crowd
              </span>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-1">
            {/* Info Icon - shows AI summary */}
            {onInfo && spotNumber && (
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-blue-500 hover:text-blue-700 hover:bg-blue-50"
                onClick={() => onInfo(spotNumber, poi.name)}
                title="Get AI summary"
              >
                <Info className="w-4 h-4" />
              </Button>
            )}
            {/* Replace Icon - triggers replacement options */}
            {onReplace && spotNumber && (
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-orange-500 hover:text-orange-700 hover:bg-orange-50"
                onClick={() => onReplace(spotNumber, poi.name)}
                title="Replace this spot"
              >
                <RefreshCw className="w-4 h-4" />
              </Button>
            )}
            {onEdit && (
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={onEdit}
              >
                <Edit2 className="w-4 h-4" />
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => setIsExpanded(!isExpanded)}
            >
              {isExpanded ? (
                <ChevronUp className="w-4 h-4" />
              ) : (
                <ChevronDown className="w-4 h-4" />
              )}
            </Button>
          </div>
        </div>
      </div>

      {/* Expanded Content */}
      {isExpanded && (
        <div className="px-4 pb-4 pt-2 border-t bg-muted/30">
          {/* Description */}
          <p className="text-sm text-muted-foreground mb-3">{poi.description}</p>

          {/* Categories */}
          <div className="flex flex-wrap gap-1 mb-3">
            {poi.category.map((cat) => (
              <span
                key={cat}
                className="px-2 py-0.5 bg-secondary text-secondary-foreground rounded text-xs"
              >
                {cat}
              </span>
            ))}
          </div>

          {/* Tips */}
          {poi.tips && poi.tips.length > 0 && (
            <div className="mt-3">
              <h5 className="text-sm font-medium mb-1">Tips:</h5>
              <ul className="text-sm text-muted-foreground space-y-1">
                {poi.tips.slice(0, 3).map((tip, idx) => (
                  <li key={idx} className="flex items-start gap-2">
                    <span className="text-primary">•</span>
                    {tip}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Reasoning with Citation */}
          {block.reasoning && (
            <div className="mt-3 p-2 bg-primary/5 rounded text-sm border-l-2 border-primary">
              <span className="font-medium text-primary">Why this place: </span>
              {block.reasoning}
              <div className="mt-1 text-xs text-muted-foreground flex items-center gap-1">
                <span className="px-1.5 py-0.5 bg-muted rounded">
                  Source: {poi.source === "osm" ? "OpenStreetMap" : poi.source === "wikivoyage" ? "Wikivoyage" : "Local Data"}
                </span>
              </div>
            </div>
          )}

          {/* Notes */}
          {block.notes && (
            <div className="mt-3 text-sm italic text-muted-foreground border-l-2 border-muted pl-2">
              Note: {block.notes}
            </div>
          )}

          {/* POI Source Badge */}
          {!block.reasoning && (
            <div className="mt-3 text-xs text-muted-foreground">
              <span className="px-1.5 py-0.5 bg-muted rounded">
                Data: {poi.source === "osm" ? "OpenStreetMap" : poi.source === "wikivoyage" ? "Wikivoyage" : "Local Data"}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default TimeBlockCard;
