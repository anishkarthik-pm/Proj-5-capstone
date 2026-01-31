"use client";

import { useState, useCallback } from "react";
import { useDebugStore } from "@/lib/stores/debugStore";
import { config } from "@/lib/config";

export interface Message {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface GenerateOptions {
  temperature?: number;
  maxTokens?: number;
  model?: string;
}

export interface UseGeminiReturn {
  generate: (messages: Message[], options?: GenerateOptions) => Promise<string>;
  isLoading: boolean;
  error: string | null;
  isConfigured: boolean;
  checkStatus: () => Promise<boolean>;
}

/**
 * Hook for using Gemini LLM in components
 */
export function useGemini(): UseGeminiReturn {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isConfigured, setIsConfigured] = useState(false);
  const { logApi, logInfo, logError: logDebugError } = useDebugStore();

  /**
   * Check if the LLM API is configured
   */
  const checkStatus = useCallback(async (): Promise<boolean> => {
    const startTime = Date.now();
    try {
      const response = await fetch("/api/llm");
      const data = await response.json();
      const configured = data.status === "configured";
      setIsConfigured(configured);
      logApi("/api/llm", "GET", response.status, Date.now() - startTime, { configured });
      return configured;
    } catch {
      logApi("/api/llm", "GET", 0, Date.now() - startTime, { error: "Network error" });
      setIsConfigured(false);
      return false;
    }
  }, [logApi]);

  /**
   * Generate a response from the LLM
   */
  const generate = useCallback(
    async (messages: Message[], options?: GenerateOptions): Promise<string> => {
      setIsLoading(true);
      setError(null);

      const startTime = Date.now();
      logInfo("llm", `Generating response (${messages.length} messages)`, {
        model: options?.model || config.llm.model,
      });

      try {
        const response = await fetch("/api/llm", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ messages, options }),
        });

        const data = await response.json();
        const duration = Date.now() - startTime;

        logApi("/api/llm", "POST", response.status, duration, {
          model: options?.model,
          messageCount: messages.length,
        });

        if (!response.ok) {
          throw new Error(data.error || "Failed to generate response");
        }

        return data.content;
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : "Unknown error";
        setError(errorMessage);
        logDebugError("llm", `LLM generation failed: ${errorMessage}`, err);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [logApi, logInfo, logDebugError]
  );

  return {
    generate,
    isLoading,
    error,
    isConfigured,
    checkStatus,
  };
}

/**
 * Utility function for one-off LLM calls (outside React components)
 */
export async function generateWithGemini(
  messages: Message[],
  options?: GenerateOptions
): Promise<string> {
  const { logApi, logInfo, logError } = useDebugStore.getState();
  const startTime = Date.now();

  logInfo("llm", `Generating response (${messages.length} messages)`);

  try {
    const response = await fetch("/api/llm", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ messages, options }),
    });

    const data = await response.json();
    const duration = Date.now() - startTime;

    logApi("/api/llm", "POST", response.status, duration);

    if (!response.ok) {
      throw new Error(data.error || "Failed to generate response");
    }

    return data.content;
  } catch (err) {
    logError("llm", "LLM generation failed", err);
    throw err;
  }
}

export default useGemini;
