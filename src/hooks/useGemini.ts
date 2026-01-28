"use client";

import { useState, useCallback } from "react";

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

  /**
   * Check if the LLM API is configured
   */
  const checkStatus = useCallback(async (): Promise<boolean> => {
    try {
      const response = await fetch("/api/llm");
      const data = await response.json();
      const configured = data.status === "configured";
      setIsConfigured(configured);
      return configured;
    } catch {
      setIsConfigured(false);
      return false;
    }
  }, []);

  /**
   * Generate a response from the LLM
   */
  const generate = useCallback(
    async (messages: Message[], options?: GenerateOptions): Promise<string> => {
      setIsLoading(true);
      setError(null);

      try {
        const response = await fetch("/api/llm", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ messages, options }),
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || "Failed to generate response");
        }

        return data.content;
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : "Unknown error";
        setError(errorMessage);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    []
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
  const response = await fetch("/api/llm", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ messages, options }),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || "Failed to generate response");
  }

  return data.content;
}

export default useGemini;
