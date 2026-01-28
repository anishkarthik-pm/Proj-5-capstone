"use client";

import React from "react";
import { Car } from "lucide-react";
import { cn } from "@/lib/utils";

interface TravelSegmentProps {
  travelTime: number;
  className?: string;
}

export function TravelSegment({
  travelTime,
  className,
}: TravelSegmentProps) {
  const isLongTravel = travelTime > 45;

  return (
    <div
      className={cn(
        "flex items-center justify-center py-2",
        className
      )}
    >
      <div className="flex items-center gap-3">
        {/* Dotted line */}
        <div className="w-8 border-t-2 border-dashed border-muted-foreground/30" />

        {/* Travel indicator */}
        <div
          className={cn(
            "flex items-center gap-2 px-3 py-1.5 rounded-full text-sm",
            isLongTravel
              ? "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300"
              : "bg-muted text-muted-foreground"
          )}
        >
          <Car className="w-4 h-4" />
          <span>{travelTime} mins</span>
        </div>

        {/* Dotted line */}
        <div className="w-8 border-t-2 border-dashed border-muted-foreground/30" />
      </div>
    </div>
  );
}

export default TravelSegment;
