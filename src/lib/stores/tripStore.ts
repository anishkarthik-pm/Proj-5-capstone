import { create } from "zustand";
import type { TripPreferences, Itinerary, DayPlan, TimeBlock } from "@/types";

interface TripStore {
  // State
  preferences: TripPreferences | null;
  itinerary: Itinerary | null;
  isLoading: boolean;
  error: string | null;

  // Actions
  setPreferences: (prefs: TripPreferences) => void;
  setItinerary: (itinerary: Itinerary | null) => void;
  updateDay: (dayNum: number, dayPlan: DayPlan) => void;
  updateBlock: (dayNum: number, blockId: string, block: Partial<TimeBlock>) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  reset: () => void;
}

const initialState = {
  preferences: null,
  itinerary: null,
  isLoading: false,
  error: null,
};

export const useTripStore = create<TripStore>((set, get) => ({
  ...initialState,

  setPreferences: (preferences) => set({ preferences }),

  setItinerary: (itinerary) =>
    set({
      itinerary,
      preferences: itinerary?.preferences || null,
      error: null,
    }),

  updateDay: (dayNum, dayPlan) => {
    const { itinerary } = get();
    if (!itinerary) return;

    const updatedDays = itinerary.days.map((day) =>
      day.dayNumber === dayNum ? dayPlan : day
    );

    set({
      itinerary: {
        ...itinerary,
        days: updatedDays,
        lastModified: new Date(),
        version: itinerary.version + 1,
      },
    });
  },

  updateBlock: (dayNum, blockId, blockUpdate) => {
    const { itinerary } = get();
    if (!itinerary) return;

    const updatedDays = itinerary.days.map((day) => {
      if (day.dayNumber !== dayNum) return day;

      const updatedBlocks = day.blocks.map((block) =>
        block.id === blockId ? { ...block, ...blockUpdate } : block
      );

      return { ...day, blocks: updatedBlocks };
    });

    set({
      itinerary: {
        ...itinerary,
        days: updatedDays,
        lastModified: new Date(),
        version: itinerary.version + 1,
      },
    });
  },

  setLoading: (isLoading) => set({ isLoading }),

  setError: (error) => set({ error, isLoading: false }),

  reset: () => set(initialState),
}));
