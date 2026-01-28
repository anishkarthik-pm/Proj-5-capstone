import { create } from "zustand";

interface UIStore {
  // State
  activeDay: number;
  isSourcesPanelOpen: boolean;
  isEvalPanelOpen: boolean;
  highlightedBlocks: string[];
  isDemoMode: boolean;
  isMobileMenuOpen: boolean;

  // Actions
  setActiveDay: (day: number) => void;
  toggleSourcesPanel: () => void;
  toggleEvalPanel: () => void;
  toggleMobileMenu: () => void;
  highlightBlock: (blockId: string, duration?: number) => void;
  clearHighlights: () => void;
  setDemoMode: (enabled: boolean) => void;
  reset: () => void;
}

const initialState = {
  activeDay: 1,
  isSourcesPanelOpen: false,
  isEvalPanelOpen: false,
  highlightedBlocks: [] as string[],
  isDemoMode: false,
  isMobileMenuOpen: false,
};

export const useUIStore = create<UIStore>((set) => ({
  ...initialState,

  setActiveDay: (activeDay) => set({ activeDay }),

  toggleSourcesPanel: () =>
    set((state) => ({ isSourcesPanelOpen: !state.isSourcesPanelOpen })),

  toggleEvalPanel: () =>
    set((state) => ({ isEvalPanelOpen: !state.isEvalPanelOpen })),

  toggleMobileMenu: () =>
    set((state) => ({ isMobileMenuOpen: !state.isMobileMenuOpen })),

  highlightBlock: (blockId, duration = 2000) => {
    set((state) => ({
      highlightedBlocks: [...state.highlightedBlocks, blockId],
    }));

    // Auto-remove highlight after duration
    setTimeout(() => {
      set((state) => ({
        highlightedBlocks: state.highlightedBlocks.filter((id) => id !== blockId),
      }));
    }, duration);
  },

  clearHighlights: () => set({ highlightedBlocks: [] }),

  setDemoMode: (isDemoMode) => set({ isDemoMode }),

  reset: () => set(initialState),
}));
