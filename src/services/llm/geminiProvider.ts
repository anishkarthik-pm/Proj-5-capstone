import { GoogleGenerativeAI, GenerativeModel, Content } from "@google/generative-ai";
import { config, features } from "@/lib/config";

// Types for LLM interactions
export interface LLMMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface LLMResponse {
  content: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

export interface LLMStreamCallbacks {
  onToken?: (token: string) => void;
  onComplete?: (fullResponse: string) => void;
  onError?: (error: Error) => void;
}

// Singleton Gemini client
let geminiClient: GoogleGenerativeAI | null = null;
let geminiModel: GenerativeModel | null = null;

/**
 * Initialize the Gemini client
 */
export function initializeGemini(apiKey?: string): boolean {
  const key = apiKey || config.llm.apiKey || process.env.GOOGLE_API_KEY;

  if (!key) {
    console.warn("Gemini API key not configured");
    return false;
  }

  try {
    geminiClient = new GoogleGenerativeAI(key);
    // Use config model or fallback to gemini-2.5-flash-lite
    const modelName = config.llm.model || "gemini-2.5-flash-lite";
    console.log(`Initializing Gemini with model: ${modelName}`);
    geminiModel = geminiClient.getGenerativeModel({
      model: modelName
    });
    return true;
  } catch (error) {
    console.error("Failed to initialize Gemini:", error);
    return false;
  }
}

/**
 * Check if Gemini is available and configured
 */
export function isGeminiAvailable(): boolean {
  return features.enableLLM && geminiModel !== null;
}

/**
 * Convert our message format to Gemini's format
 */
function convertToGeminiFormat(messages: LLMMessage[]): { history: Content[]; userMessage: string } {
  const history: Content[] = [];
  let systemPrompt = "";
  let userMessage = "";

  for (const msg of messages) {
    if (msg.role === "system") {
      // Gemini doesn't have system messages, prepend to first user message
      systemPrompt = msg.content + "\n\n";
    } else if (msg.role === "user") {
      userMessage = msg.content;
    } else if (msg.role === "assistant") {
      history.push({
        role: "model",
        parts: [{ text: msg.content }],
      });
    }
  }

  // If there's a system prompt, prepend it to the user message
  if (systemPrompt && userMessage) {
    userMessage = systemPrompt + userMessage;
  }

  return { history, userMessage };
}

/**
 * Generate a completion using Gemini
 */
export async function generateCompletion(
  messages: LLMMessage[],
  options?: {
    temperature?: number;
    maxTokens?: number;
  }
): Promise<LLMResponse> {
  if (!geminiModel) {
    // Try to initialize
    if (!initializeGemini()) {
      throw new Error("Gemini is not configured. Please set GOOGLE_API_KEY.");
    }
  }

  const { history, userMessage } = convertToGeminiFormat(messages);

  try {
    // Start a chat session if there's history
    if (history.length > 0) {
      const chat = geminiModel!.startChat({
        history,
        generationConfig: {
          temperature: options?.temperature ?? 0.7,
          maxOutputTokens: options?.maxTokens ?? 2048,
        },
      });

      const result = await chat.sendMessage(userMessage);
      const response = result.response;

      return {
        content: response.text(),
        usage: {
          promptTokens: 0, // Gemini doesn't provide token counts in the same way
          completionTokens: 0,
          totalTokens: 0,
        },
      };
    } else {
      // Single message generation
      const result = await geminiModel!.generateContent({
        contents: [{ role: "user", parts: [{ text: userMessage }] }],
        generationConfig: {
          temperature: options?.temperature ?? 0.7,
          maxOutputTokens: options?.maxTokens ?? 2048,
        },
      });

      const response = result.response;

      return {
        content: response.text(),
        usage: {
          promptTokens: 0,
          completionTokens: 0,
          totalTokens: 0,
        },
      };
    }
  } catch (error) {
    console.error("Gemini generation error:", error);
    throw error;
  }
}

/**
 * Generate a streaming completion using Gemini
 */
export async function generateStreamingCompletion(
  messages: LLMMessage[],
  callbacks: LLMStreamCallbacks,
  options?: {
    temperature?: number;
    maxTokens?: number;
  }
): Promise<void> {
  if (!geminiModel) {
    if (!initializeGemini()) {
      callbacks.onError?.(new Error("Gemini is not configured. Please set GOOGLE_API_KEY."));
      return;
    }
  }

  const { history, userMessage } = convertToGeminiFormat(messages);

  try {
    let fullResponse = "";

    if (history.length > 0) {
      const chat = geminiModel!.startChat({
        history,
        generationConfig: {
          temperature: options?.temperature ?? 0.7,
          maxOutputTokens: options?.maxTokens ?? 2048,
        },
      });

      const result = await chat.sendMessageStream(userMessage);

      for await (const chunk of result.stream) {
        const text = chunk.text();
        fullResponse += text;
        callbacks.onToken?.(text);
      }
    } else {
      const result = await geminiModel!.generateContentStream({
        contents: [{ role: "user", parts: [{ text: userMessage }] }],
        generationConfig: {
          temperature: options?.temperature ?? 0.7,
          maxOutputTokens: options?.maxTokens ?? 2048,
        },
      });

      for await (const chunk of result.stream) {
        const text = chunk.text();
        fullResponse += text;
        callbacks.onToken?.(text);
      }
    }

    callbacks.onComplete?.(fullResponse);
  } catch (error) {
    console.error("Gemini streaming error:", error);
    callbacks.onError?.(error instanceof Error ? error : new Error(String(error)));
  }
}

/**
 * Generate JSON output using Gemini
 */
export async function generateJSON<T>(
  messages: LLMMessage[],
  options?: {
    temperature?: number;
    maxTokens?: number;
  }
): Promise<T> {
  // Add instruction to return JSON
  const jsonMessages: LLMMessage[] = [
    ...messages.slice(0, -1),
    {
      ...messages[messages.length - 1],
      content: messages[messages.length - 1].content + "\n\nRespond with valid JSON only, no markdown or explanation.",
    },
  ];

  const response = await generateCompletion(jsonMessages, options);

  // Extract JSON from response (handle potential markdown code blocks)
  let jsonString = response.content.trim();

  // Remove markdown code blocks if present
  if (jsonString.startsWith("```json")) {
    jsonString = jsonString.slice(7);
  } else if (jsonString.startsWith("```")) {
    jsonString = jsonString.slice(3);
  }
  if (jsonString.endsWith("```")) {
    jsonString = jsonString.slice(0, -3);
  }

  jsonString = jsonString.trim();

  try {
    return JSON.parse(jsonString) as T;
  } catch {
    console.error("Failed to parse JSON response:", jsonString);
    throw new Error("Failed to parse LLM response as JSON");
  }
}

// Export default instance methods
const geminiProvider = {
  initialize: initializeGemini,
  isAvailable: isGeminiAvailable,
  generate: generateCompletion,
  generateStream: generateStreamingCompletion,
  generateJSON,
};

export default geminiProvider;
