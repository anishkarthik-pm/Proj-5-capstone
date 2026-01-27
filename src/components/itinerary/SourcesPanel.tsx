"use client";

import React from "react";
import { ChevronDown, ChevronUp, ExternalLink, BookOpen, MapPin, Cloud } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useUIStore } from "@/lib/stores/uiStore";
import { useTripStore } from "@/lib/stores/tripStore";
import type { Citation } from "@/types";

interface SourcesPanelProps {
  className?: string;
}

export function SourcesPanel({ className }: SourcesPanelProps) {
  const { isSourcesPanelOpen, toggleSourcesPanel } = useUIStore();
  const { itinerary } = useTripStore();

  // Group sources by type
  const sources = itinerary?.sources || [];

  const groupedSources = {
    poi: sources.filter((s) =>
      ["osm", "OpenStreetMap"].some((k) =>
        s.source.toLowerCase().includes(k.toLowerCase())
      )
    ),
    guide: sources.filter((s) =>
      ["wikivoyage", "city guide", "local"].some((k) =>
        s.source.toLowerCase().includes(k.toLowerCase())
      )
    ),
    other: sources.filter(
      (s) =>
        !["osm", "OpenStreetMap", "wikivoyage", "city guide", "local"].some((k) =>
          s.source.toLowerCase().includes(k.toLowerCase())
        )
    ),
  };

  const getSourceIcon = (source: string) => {
    if (source.toLowerCase().includes("osm") || source.toLowerCase().includes("openstreetmap")) {
      return <MapPin className="w-4 h-4" />;
    }
    if (source.toLowerCase().includes("weather")) {
      return <Cloud className="w-4 h-4" />;
    }
    return <BookOpen className="w-4 h-4" />;
  };

  const getSourceUrl = (source: string): string | undefined => {
    if (source.toLowerCase().includes("wikivoyage")) {
      return "https://en.wikivoyage.org/wiki/Ooty";
    }
    if (source.toLowerCase().includes("openstreetmap") || source.toLowerCase().includes("osm")) {
      return "https://www.openstreetmap.org/";
    }
    return undefined;
  };

  return (
    <div
      className={cn(
        "border-t bg-background transition-all duration-300",
        className
      )}
    >
      {/* Toggle Button */}
      <button
        onClick={toggleSourcesPanel}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/50 transition-colors"
      >
        <div className="flex items-center gap-2 text-sm font-medium">
          <BookOpen className="w-4 h-4 text-primary" />
          <span>Sources & References</span>
          {sources.length > 0 && (
            <span className="px-2 py-0.5 bg-primary/10 text-primary rounded-full text-xs">
              {sources.length}
            </span>
          )}
        </div>
        {isSourcesPanelOpen ? (
          <ChevronDown className="w-4 h-4 text-muted-foreground" />
        ) : (
          <ChevronUp className="w-4 h-4 text-muted-foreground" />
        )}
      </button>

      {/* Content */}
      {isSourcesPanelOpen && (
        <div className="px-4 pb-4 max-h-64 overflow-y-auto">
          {sources.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              No sources available yet. Create an itinerary to see data sources.
            </p>
          ) : (
            <div className="space-y-4">
              {/* POI Data Sources */}
              {groupedSources.poi.length > 0 && (
                <SourceGroup
                  title="POI Data"
                  sources={groupedSources.poi}
                  getIcon={getSourceIcon}
                  getUrl={getSourceUrl}
                />
              )}

              {/* City Guide Sources */}
              {groupedSources.guide.length > 0 && (
                <SourceGroup
                  title="City Guide"
                  sources={groupedSources.guide}
                  getIcon={getSourceIcon}
                  getUrl={getSourceUrl}
                />
              )}

              {/* Other Sources */}
              {groupedSources.other.length > 0 && (
                <SourceGroup
                  title="Other"
                  sources={groupedSources.other}
                  getIcon={getSourceIcon}
                  getUrl={getSourceUrl}
                />
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

interface SourceGroupProps {
  title: string;
  sources: Citation[];
  getIcon: (source: string) => React.ReactNode;
  getUrl: (source: string) => string | undefined;
}

function SourceGroup({ title, sources, getIcon, getUrl }: SourceGroupProps) {
  // Deduplicate sources by name
  const uniqueSources = Array.from(
    new Map(sources.map((s) => [s.source, s])).values()
  );

  return (
    <div>
      <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
        {title}
      </h4>
      <ul className="space-y-1">
        {uniqueSources.map((source, idx) => {
          const url = source.url || getUrl(source.source);
          return (
            <li key={idx} className="flex items-center gap-2 text-sm">
              <span className="text-muted-foreground">
                {getIcon(source.source)}
              </span>
              {url ? (
                <a
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline flex items-center gap-1"
                >
                  {source.source}
                  <ExternalLink className="w-3 h-3" />
                </a>
              ) : (
                <span>{source.source}</span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export default SourcesPanel;
