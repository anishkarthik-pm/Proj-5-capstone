import { create } from "zustand";
import type { Message, VoiceIntent } from "@/types";

interface ConversationStore {
  // State
  messages: Message[];
  currentIntent: VoiceIntent | null;
  isProcessing: boolean;
  clarificationNeeded: boolean;
  pendingQuestion: string | null;

  // Actions
  addMessage: (message: Omit<Message, "id" | "timestamp">) => void;
  setIntent: (intent: VoiceIntent | null) => void;
  setProcessing: (processing: boolean) => void;
  setClarificationNeeded: (needed: boolean, question?: string) => void;
  clearConversation: () => void;
  reset: () => void;
}

const initialState = {
  messages: [] as Message[],
  currentIntent: null,
  isProcessing: false,
  clarificationNeeded: false,
  pendingQuestion: null,
};

export const useConversationStore = create<ConversationStore>((set, get) => ({
  ...initialState,

  addMessage: (message) =>
    set((state) => ({
      messages: [
        ...state.messages,
        {
          ...message,
          id: `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          timestamp: new Date(),
        },
      ],
    })),

  setIntent: (currentIntent) => set({ currentIntent }),

  setProcessing: (isProcessing) => set({ isProcessing }),

  setClarificationNeeded: (clarificationNeeded, pendingQuestion) =>
    set({
      clarificationNeeded,
      pendingQuestion: pendingQuestion || null,
    }),

  clearConversation: () =>
    set({
      messages: [],
      currentIntent: null,
      clarificationNeeded: false,
      pendingQuestion: null,
    }),

  reset: () => set(initialState),
}));
