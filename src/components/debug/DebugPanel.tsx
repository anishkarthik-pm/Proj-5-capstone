"use client";

import React, { useMemo, useEffect, useState, useCallback } from "react";
import {
  Bug,
  X,
  Trash2,
  AlertCircle,
  CheckCircle,
  Info,
  AlertTriangle,
  Globe,
  Mic,
  Bot,
  Mail,
  Settings,
  User,
  ChevronDown,
  ClipboardCheck,
  Key,
  RefreshCw,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  useDebugStore,
  type LogLevel,
  type LogCategory,
  type DebugLogEntry,
} from "@/lib/stores/debugStore";
import { cn } from "@/lib/utils";

// Use API route for validation (not direct import) for Vercel Edge compatibility
async function validateApiKey(): Promise<{
  valid: boolean;
  message: string;
  model?: string;
}> {
  try {
    const response = await fetch("/api/validate-key");
    const data = await response.json();
    return {
      valid: data.valid,
      message: data.message,
      model: data.model,
    };
  } catch (error) {
    return {
      valid: false,
      message: `Connection error: ${error instanceof Error ? error.message : "Unknown"}`,
    };
  }
}

// Icon mapping for log levels
const levelIcons: Record<LogLevel, React.ReactNode> = {
  info: <Info className="w-4 h-4 text-blue-500" />,
  success: <CheckCircle className="w-4 h-4 text-green-500" />,
  warning: <AlertTriangle className="w-4 h-4 text-amber-500" />,
  error: <AlertCircle className="w-4 h-4 text-red-500" />,
};

// Icon mapping for categories
const categoryIcons: Record<LogCategory, React.ReactNode> = {
  api: <Globe className="w-3 h-3" />,
  voice: <Mic className="w-3 h-3" />,
  llm: <Bot className="w-3 h-3" />,
  n8n: <Mail className="w-3 h-3" />,
  system: <Settings className="w-3 h-3" />,
  user: <User className="w-3 h-3" />,
  eval: <ClipboardCheck className="w-3 h-3" />,
};

// Category colors
const categoryColors: Record<LogCategory, string> = {
  api: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300",
  voice: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  llm: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300",
  n8n: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300",
  system: "bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-300",
  user: "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-300",
  eval: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300",
};

// Level background colors for the log entry
const levelBgColors: Record<LogLevel, string> = {
  info: "border-l-blue-500",
  success: "border-l-green-500",
  warning: "border-l-amber-500",
  error: "border-l-red-500 bg-red-50/50 dark:bg-red-900/10",
};

interface LogEntryProps {
  entry: DebugLogEntry;
}

function LogEntry({ entry }: LogEntryProps) {
  const [isExpanded, setIsExpanded] = React.useState(false);
  const hasDetails = entry.details && Object.keys(entry.details).length > 0;

  const formattedTime = entry.timestamp.toLocaleTimeString("en-US", {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  return (
    <div
      className={cn(
        "border-l-4 px-3 py-2 text-sm",
        levelBgColors[entry.level]
      )}
    >
      <div className="flex items-start gap-2">
        {/* Level icon */}
        <div className="flex-shrink-0 mt-0.5">{levelIcons[entry.level]}</div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            {/* Category badge */}
            <span
              className={cn(
                "inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium",
                categoryColors[entry.category]
              )}
            >
              {categoryIcons[entry.category]}
              {entry.category}
            </span>

            {/* Timestamp */}
            <span className="text-xs text-muted-foreground font-mono">
              {formattedTime}
            </span>

            {/* Duration (for API calls) */}
            {entry.duration !== undefined && (
              <span
                className={cn(
                  "text-xs font-mono px-1.5 py-0.5 rounded",
                  entry.duration > 2000
                    ? "bg-red-100 text-red-700"
                    : entry.duration > 500
                      ? "bg-amber-100 text-amber-700"
                      : "bg-green-100 text-green-700"
                )}
              >
                {entry.duration}ms
              </span>
            )}
          </div>

          {/* Message */}
          <p className="mt-1 text-foreground break-words">{entry.message}</p>

          {/* Expandable details */}
          {hasDetails && (
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className="flex items-center gap-1 mt-1 text-xs text-muted-foreground hover:text-foreground"
            >
              <ChevronDown
                className={cn(
                  "w-3 h-3 transition-transform",
                  isExpanded && "rotate-180"
                )}
              />
              {isExpanded ? "Hide details" : "Show details"}
            </button>
          )}

          {isExpanded && hasDetails && (
            <pre className="mt-2 p-2 bg-muted rounded text-xs overflow-x-auto">
              {JSON.stringify(entry.details, null, 2)}
            </pre>
          )}
        </div>
      </div>
    </div>
  );
}

// API Status indicator component
function ApiStatusIndicator() {
  const [status, setStatus] = useState<{
    checking: boolean;
    valid: boolean | null;
    message: string;
    model?: string;
  }>({
    checking: true,
    valid: null,
    message: "Checking API key...",
  });

  const checkApiKey = useCallback(async () => {
    setStatus((prev) => ({ ...prev, checking: true }));
    try {
      const result = await validateApiKey();
      setStatus({
        checking: false,
        valid: result.valid,
        message: result.message,
        model: result.model,
      });
    } catch {
      setStatus({
        checking: false,
        valid: false,
        message: "Failed to validate API key",
      });
    }
  }, []);

  useEffect(() => {
    checkApiKey();
  }, [checkApiKey]);

  return (
    <div className="px-4 py-2 border-b bg-muted/30">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Key className="w-4 h-4 text-muted-foreground" />
          <span className="text-xs font-medium">Gemini API</span>
        </div>
        <div className="flex items-center gap-2">
          {status.checking ? (
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <Loader2 className="w-3 h-3 animate-spin" />
              Checking...
            </span>
          ) : status.valid ? (
            <span className="flex items-center gap-1 text-xs text-green-600">
              <CheckCircle className="w-3 h-3" />
              Connected
              {status.model && (
                <span className="text-muted-foreground">({status.model})</span>
              )}
            </span>
          ) : (
            <span className="flex items-center gap-1 text-xs text-red-600">
              <AlertCircle className="w-3 h-3" />
              {status.message}
            </span>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={checkApiKey}
            className="h-6 w-6 p-0"
            disabled={status.checking}
            title="Recheck API key"
          >
            <RefreshCw className={cn("w-3 h-3", status.checking && "animate-spin")} />
          </Button>
        </div>
      </div>
    </div>
  );
}

export function DebugPanel() {
  const { logs, isOpen, filter, setOpen, setFilter, clearLogs } = useDebugStore();

  // Filter logs
  const filteredLogs = useMemo(() => {
    if (filter === "all") return logs;
    return logs.filter((log) => log.category === filter);
  }, [logs, filter]);

  // Count by level
  const counts = useMemo(() => {
    return {
      error: logs.filter((l) => l.level === "error").length,
      warning: logs.filter((l) => l.level === "warning").length,
      total: logs.length,
    };
  }, [logs]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-y-0 right-0 w-full sm:w-[450px] bg-background border-l shadow-xl z-50 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b bg-muted/50">
        <div className="flex items-center gap-2">
          <Bug className="w-5 h-5 text-primary" />
          <h2 className="font-semibold">Debug Console</h2>
          <div className="flex items-center gap-1 ml-2">
            {counts.error > 0 && (
              <span className="px-1.5 py-0.5 text-xs font-medium bg-red-100 text-red-700 rounded">
                {counts.error} errors
              </span>
            )}
            {counts.warning > 0 && (
              <span className="px-1.5 py-0.5 text-xs font-medium bg-amber-100 text-amber-700 rounded">
                {counts.warning} warnings
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={clearLogs}
            className="h-8 px-2"
          >
            <Trash2 className="w-4 h-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setOpen(false)}
            className="h-8 px-2"
          >
            <X className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* API Status */}
      <ApiStatusIndicator />

      {/* Filter tabs */}
      <div className="flex items-center gap-1 px-4 py-2 border-b overflow-x-auto">
        {(["all", "api", "llm", "voice", "eval", "n8n", "system", "user"] as const).map(
          (cat) => (
            <button
              key={cat}
              onClick={() => setFilter(cat)}
              className={cn(
                "px-2 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap",
                filter === cat
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted hover:bg-muted/80 text-muted-foreground"
              )}
            >
              {cat === "all" ? `All (${counts.total})` : cat}
            </button>
          )
        )}
      </div>

      {/* Logs */}
      <div className="flex-1 overflow-y-auto">
        {filteredLogs.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
            <Bug className="w-12 h-12 mb-4 opacity-20" />
            <p>No logs yet</p>
            <p className="text-xs mt-1">System events will appear here</p>
          </div>
        ) : (
          <div className="divide-y">
            {filteredLogs.map((entry) => (
              <LogEntry key={entry.id} entry={entry} />
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="px-4 py-2 border-t bg-muted/50 text-xs text-muted-foreground">
        Showing {filteredLogs.length} of {logs.length} logs
      </div>
    </div>
  );
}

export function DebugButton() {
  const { logs, toggleOpen } = useDebugStore();

  // Count errors
  const errorCount = logs.filter((l) => l.level === "error").length;
  const warningCount = logs.filter((l) => l.level === "warning").length;

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={toggleOpen}
      className="relative"
      title="Open Debug Console"
    >
      <Bug className="w-4 h-4" />
      {errorCount > 0 && (
        <span className="absolute -top-1 -right-1 w-4 h-4 text-[10px] font-bold bg-red-500 text-white rounded-full flex items-center justify-center">
          {errorCount > 9 ? "9+" : errorCount}
        </span>
      )}
      {errorCount === 0 && warningCount > 0 && (
        <span className="absolute -top-1 -right-1 w-4 h-4 text-[10px] font-bold bg-amber-500 text-white rounded-full flex items-center justify-center">
          {warningCount > 9 ? "9+" : warningCount}
        </span>
      )}
    </Button>
  );
}

export default DebugPanel;
