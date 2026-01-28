import { generateCompletion } from "./geminiProvider";
import type { Itinerary } from "@/types";
import { useDebugStore } from "@/lib/stores/debugStore";

type LLMMessage = { role: "user" | "assistant" | "system"; content: string };

/**
 * Helper to create message array for LLM
 */
function createMessages(prompt: string): LLMMessage[] {
  return [{ role: "user", content: prompt }];
}

/**
 * Enhances hardcoded responses using LLM to make them more natural and conversational
 */
export async function enhanceResponse(
  baseResponse: string,
  context?: {
    itinerary?: Itinerary | null;
    action?: string;
    changedItems?: string[];
    userRequest?: string;
  }
): Promise<string> {
  const { log } = useDebugStore.getState();

  try {
    // Build context for the LLM
    let contextInfo = "";

    if (context?.itinerary) {
      const totalActivities = context.itinerary.days.reduce(
        (sum, d) => sum + d.blocks.length,
        0
      );
      contextInfo += `\nItinerary: ${context.itinerary.preferences.numDays} days, ${totalActivities} activities`;
    }

    if (context?.action) {
      contextInfo += `\nAction performed: ${context.action}`;
    }

    if (context?.changedItems && context.changedItems.length > 0) {
      contextInfo += `\nChanged: ${context.changedItems.join(", ")}`;
    }

    const prompt = `You are a friendly travel assistant helping plan an Ooty trip.
Rewrite this response to be more natural, warm, and conversational while keeping the same information.
Keep it concise (1-3 sentences). Don't add emojis. Speak directly to the traveler.

Original response: "${baseResponse}"
${contextInfo ? `Context: ${contextInfo}` : ""}

Rewritten response (just the text, no quotes):`;

    const result = await generateCompletion(createMessages(prompt));
    const enhanced = result?.content;

    if (enhanced && enhanced.trim().length > 10) {
      log({
        level: "info",
        category: "llm",
        message: "Response enhanced via Gemini",
        details: { original: baseResponse.slice(0, 50), enhanced: enhanced.slice(0, 50) },
      });
      return enhanced.trim();
    }

    return baseResponse;
  } catch (error) {
    // Silently fall back to original response if LLM fails
    log({
      level: "warning",
      category: "llm",
      message: "Response enhancement failed, using original",
      details: { error: String(error) },
    });
    return baseResponse;
  }
}

/**
 * Generate a natural explanation for why a POI was selected
 */
export async function generatePOIExplanation(
  poi: { name: string; category: string[]; description: string },
  userInterests: string[],
  userContext?: string
): Promise<string> {
  try {
    const prompt = `You're a travel guide explaining why you're recommending ${poi.name} in Ooty.
The traveler is interested in: ${userInterests.join(", ")}.
POI categories: ${poi.category.join(", ")}.
POI description: ${poi.description}
${userContext ? `Additional context: ${userContext}` : ""}

Give a brief, natural explanation (1-2 sentences) for why this place is a great choice for them. Be specific and personal.`;

    const result = await generateCompletion(createMessages(prompt));
    return result?.content?.trim() || `${poi.name} is a wonderful choice based on your interests.`;
  } catch {
    return `${poi.name} is a wonderful choice based on your interests.`;
  }
}

/**
 * Generate natural suggestions for places to add
 */
export async function generateSuggestions(
  existingPlaces: string[],
  interests: string[],
  availablePlaces: { name: string; category: string[]; description: string }[]
): Promise<{ name: string; reason: string }[]> {
  if (availablePlaces.length === 0) {
    return [];
  }

  try {
    const placesInfo = availablePlaces
      .slice(0, 5)
      .map((p) => `- ${p.name} (${p.category.join(", ")}): ${p.description.slice(0, 100)}`)
      .join("\n");

    const prompt = `Based on the traveler's interests in ${interests.join(", ")}, suggest which of these places would be great additions to their Ooty trip:

Available places:
${placesInfo}

Already visiting: ${existingPlaces.join(", ")}

For each suggestion, provide a brief reason. Format: "Place Name: reason"
Give 2-3 suggestions.`;

    const result = await generateCompletion(createMessages(prompt));
    const response = result?.content;

    if (!response) return [];

    // Parse suggestions
    const suggestions: { name: string; reason: string }[] = [];
    const lines = response.split("\n").filter((l) => l.includes(":"));

    for (const line of lines) {
      const [name, ...reasonParts] = line.split(":");
      const cleanName = name.replace(/^[\d\.\-\*]+\s*/, "").trim();
      const reason = reasonParts.join(":").trim();

      const matchedPlace = availablePlaces.find(
        (p) => p.name.toLowerCase().includes(cleanName.toLowerCase()) ||
               cleanName.toLowerCase().includes(p.name.toLowerCase())
      );

      if (matchedPlace && reason) {
        suggestions.push({ name: matchedPlace.name, reason });
      }
    }

    return suggestions.slice(0, 3);
  } catch {
    return [];
  }
}

/**
 * Validate Gemini API key by making a simple request
 */
export async function validateApiKey(): Promise<{
  valid: boolean;
  message: string;
  model?: string;
}> {
  const { log } = useDebugStore.getState();

  try {
    log({
      level: "info",
      category: "api",
      message: "Validating Gemini API key...",
    });

    const result = await generateCompletion(createMessages("Say 'API key valid' in exactly 3 words."));
    const response = result?.content;

    if (response && response.toLowerCase().includes("valid")) {
      log({
        level: "success",
        category: "api",
        message: "Gemini API key validated successfully",
        details: { response: response.slice(0, 50) },
      });
      return {
        valid: true,
        message: "API key is working",
        model: process.env.NEXT_PUBLIC_LLM_MODEL || "gemini-1.5-flash",
      };
    }

    log({
      level: "warning",
      category: "api",
      message: "Gemini API returned unexpected response",
      details: { response: response?.slice(0, 100) },
    });

    return {
      valid: true,
      message: "API connected but response was unexpected",
      model: process.env.NEXT_PUBLIC_LLM_MODEL || "gemini-1.5-flash",
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);

    log({
      level: "error",
      category: "api",
      message: "Gemini API key validation failed",
      details: { error: errorMsg },
    });

    if (errorMsg.includes("API_KEY") || errorMsg.includes("401") || errorMsg.includes("403")) {
      return {
        valid: false,
        message: "Invalid API key. Check GOOGLE_API_KEY in .env.local",
      };
    }

    return {
      valid: false,
      message: `API error: ${errorMsg.slice(0, 100)}`,
    };
  }
}

export default {
  enhanceResponse,
  generatePOIExplanation,
  generateSuggestions,
  validateApiKey,
};
