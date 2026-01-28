import { create } from "zustand";

export type LogLevel = "info" | "success" | "warning" | "error";
export type LogCategory = "api" | "voice" | "llm" | "n8n" | "system" | "user" | "eval";

export interface DebugLogEntry {
  id: string;
  timestamp: Date;
  level: LogLevel;
  category: LogCategory;
  message: string;
  details?: Record<string, unknown>;
  duration?: number; // For API calls, in ms
}

interface DebugStore {
  // State
  logs: DebugLogEntry[];
  isOpen: boolean;
  filter: LogCategory | "all";
  maxLogs: number;

  // Actions
  log: (entry: Omit<DebugLogEntry, "id" | "timestamp">) => void;
  logApi: (endpoint: string, method: string, status: number, duration: number, details?: Record<string, unknown>) => void;
  logError: (category: LogCategory, message: string, error?: unknown) => void;
  logSuccess: (category: LogCategory, message: string, details?: Record<string, unknown>) => void;
  logInfo: (category: LogCategory, message: string, details?: Record<string, unknown>) => void;
  logWarning: (category: LogCategory, message: string, details?: Record<string, unknown>) => void;
  clearLogs: () => void;
  setOpen: (open: boolean) => void;
  toggleOpen: () => void;
  setFilter: (filter: LogCategory | "all") => void;
}

// Generate unique ID
const generateId = () => `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

export const useDebugStore = create<DebugStore>((set, get) => ({
  logs: [],
  isOpen: false,
  filter: "all",
  maxLogs: 500,

  log: (entry) => {
    const newEntry: DebugLogEntry = {
      ...entry,
      id: generateId(),
      timestamp: new Date(),
    };

    set((state) => ({
      logs: [newEntry, ...state.logs].slice(0, state.maxLogs),
    }));

    // Also log to console in development
    if (process.env.NODE_ENV === "development") {
      const consoleMethod = entry.level === "error" ? console.error :
                           entry.level === "warning" ? console.warn :
                           console.log;
      consoleMethod(`[${entry.category.toUpperCase()}] ${entry.message}`, entry.details || "");
    }
  },

  logApi: (endpoint, method, status, duration, details) => {
    const level: LogLevel = status >= 500 ? "error" :
                           status >= 400 ? "warning" :
                           "success";

    get().log({
      level,
      category: "api",
      message: `${method} ${endpoint} - ${status}`,
      duration,
      details: { endpoint, method, status, ...details },
    });
  },

  logError: (category, message, error) => {
    get().log({
      level: "error",
      category,
      message,
      details: error ? {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      } : undefined,
    });
  },

  logSuccess: (category, message, details) => {
    get().log({
      level: "success",
      category,
      message,
      details,
    });
  },

  logInfo: (category, message, details) => {
    get().log({
      level: "info",
      category,
      message,
      details,
    });
  },

  logWarning: (category, message, details) => {
    get().log({
      level: "warning",
      category,
      message,
      details,
    });
  },

  clearLogs: () => set({ logs: [] }),

  setOpen: (isOpen) => set({ isOpen }),

  toggleOpen: () => set((state) => ({ isOpen: !state.isOpen })),

  setFilter: (filter) => set({ filter }),
}));

// Helper to wrap fetch with logging
export async function fetchWithLogging(
  url: string,
  options?: RequestInit
): Promise<Response> {
  const { logApi } = useDebugStore.getState();
  const method = options?.method || "GET";
  const startTime = Date.now();

  try {
    const response = await fetch(url, options);
    const duration = Date.now() - startTime;

    logApi(url, method, response.status, duration);

    return response;
  } catch (error) {
    const duration = Date.now() - startTime;
    logApi(url, method, 0, duration, { error: error instanceof Error ? error.message : "Network error" });
    throw error;
  }
}

export default useDebugStore;
