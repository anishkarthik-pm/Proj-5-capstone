import type { AppConfig } from "@/types";

export const config: AppConfig = {
  llm: {
    provider: (process.env.NEXT_PUBLIC_LLM_PROVIDER as "openai" | "anthropic") || "openai",
    model: process.env.NEXT_PUBLIC_LLM_MODEL || "gpt-4-turbo",
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
  enableDemoMode: process.env.NODE_ENV === "development",
  enableEvalPanel: process.env.NODE_ENV === "development",
  enableEmailWorkflow: Boolean(process.env.NEXT_PUBLIC_N8N_WEBHOOK_URL),
};

// API endpoints
export const endpoints = {
  n8nWebhook: process.env.NEXT_PUBLIC_N8N_WEBHOOK_URL || "",
};

export default config;
