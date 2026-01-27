import { create } from "zustand";
import type { VoiceHistoryEntry, VoiceStatus } from "@/types";

interface VoiceStore {
  // State
  status: VoiceStatus;
  isListening: boolean;
  isSpeaking: boolean;
  transcript: string;
  interimTranscript: string;
  error: string | null;
  history: VoiceHistoryEntry[];
  currentResponse: string;
  speakingRate: number;

  // Actions
  setStatus: (status: VoiceStatus) => void;
  setIsListening: (isListening: boolean) => void;
  setIsSpeaking: (isSpeaking: boolean) => void;
  setTranscript: (transcript: string) => void;
  setInterimTranscript: (interimTranscript: string) => void;
  setError: (error: string | null) => void;
  setCurrentResponse: (response: string) => void;
  setSpeakingRate: (rate: number) => void;
  addToHistory: (text: string, isUser: boolean) => void;
  clearHistory: () => void;
  reset: () => void;
}

const initialState = {
  status: "idle" as VoiceStatus,
  isListening: false,
  isSpeaking: false,
  transcript: "",
  interimTranscript: "",
  error: null,
  history: [] as VoiceHistoryEntry[],
  currentResponse: "",
  speakingRate: 1.0,
};

export const useVoiceStore = create<VoiceStore>((set) => ({
  ...initialState,

  setStatus: (status) => set({ status }),

  setIsListening: (isListening) =>
    set({
      isListening,
      status: isListening ? "listening" : "idle",
    }),

  setIsSpeaking: (isSpeaking) =>
    set({
      isSpeaking,
      status: isSpeaking ? "speaking" : "idle",
    }),

  setTranscript: (transcript) => set({ transcript }),

  setInterimTranscript: (interimTranscript) => set({ interimTranscript }),

  setError: (error) =>
    set({
      error,
      status: error ? "error" : "idle",
    }),

  setCurrentResponse: (currentResponse) => set({ currentResponse }),

  setSpeakingRate: (speakingRate) => set({ speakingRate }),

  addToHistory: (text, isUser) =>
    set((state) => ({
      history: [
        ...state.history,
        {
          text,
          timestamp: new Date(),
          isUser,
        },
      ],
    })),

  clearHistory: () => set({ history: [] }),

  reset: () => set(initialState),
}));
