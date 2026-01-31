import type { AppConfig } from "@/types";

export const config: AppConfig = {
  llm: {
    provider: (process.env.NEXT_PUBLIC_LLM_PROVIDER as "openai" | "anthropic" | "gemini") || "gemini",
    // Model can be set via GEMINI_MODEL or NEXT_PUBLIC_LLM_MODEL
    // Default to gemini-2.5-flash-lite (good balance of speed and quality)
    // Other available models: gemini-2.5-flash, gemini-3-flash, gemini-2.5-flash-tts
    model: process.env.GEMINI_MODEL || process.env.NEXT_PUBLIC_LLM_MODEL || "gemini-2.5-flash-lite",
    apiKey: process.env.GOOGLE_API_KEY || "",
  },
  voice: {
    silenceTimeout: 3000, // 3 seconds of silence before auto-stop
    maxDuration: 30000, // Maximum 30 seconds of recording
  },
  itinerary: {
    defaultStartTime: "09:00",
    defaultEndTime: "20:00",
    bufferMins: 15, // Buffer between activities
  },
};

// Feature flags
export const features = {
  enableTTS: true,
  enableLLM: Boolean(process.env.GOOGLE_API_KEY),
  enableDemoMode: process.env.NODE_ENV === "development",
  enableEvalPanel: process.env.NODE_ENV === "development",
  enableEmailWorkflow: Boolean(process.env.NEXT_PUBLIC_N8N_WEBHOOK_URL),
};

// API endpoints
export const endpoints = {
  n8nWebhook: process.env.NEXT_PUBLIC_N8N_WEBHOOK_URL || "",
};

export default config;
