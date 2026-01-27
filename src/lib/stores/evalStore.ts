import { create } from "zustand";
import type { EvalResult, Itinerary } from "@/types";
import { runAllEvaluations } from "@/services/eval/runEvals";

interface EvalStore {
  // State
  lastEvalResults: EvalResult[];
  evalHistory: EvalResult[][];
  isRunning: boolean;
  error: string | null;

  // Actions
  runEvals: (itinerary: Itinerary) => Promise<void>;
  addResults: (results: EvalResult[]) => void;
  clearResults: () => void;
  reset: () => void;
}

const initialState = {
  lastEvalResults: [] as EvalResult[],
  evalHistory: [] as EvalResult[][],
  isRunning: false,
  error: null,
};

export const useEvalStore = create<EvalStore>((set, get) => ({
  ...initialState,

  runEvals: async (itinerary) => {
    set({ isRunning: true, error: null });

    try {
      const results = await runAllEvaluations(itinerary);

      set((state) => ({
        lastEvalResults: results,
        evalHistory: [...state.evalHistory, results],
        isRunning: false,
      }));
    } catch (error) {
      set({
        isRunning: false,
        error: error instanceof Error ? error.message : "Evaluation failed",
      });
    }
  },

  addResults: (results) =>
    set((state) => ({
      lastEvalResults: results,
      evalHistory: [...state.evalHistory, results],
    })),

  clearResults: () => set({ lastEvalResults: [], evalHistory: [] }),

  reset: () => set(initialState),
}));
