/**
 * LLM-powered Conversation Handler
 * Uses Gemini to generate natural, contextual responses
 */

import { generateCompletion } from "./geminiProvider";
import type { Itinerary, POI } from "@/types";
import { getSeasonInfo } from "@/services/mcp/weatherAdjustment";

/**
 * Generate a natural response for itinerary creation
 */
export async function generateItineraryResponse(params: {
  itinerary: Itinerary;
  userRequest: string;
  highlights?: string[];
  warnings?: string[];
}): Promise<string> {
  const { itinerary, userRequest, highlights, warnings } = params;

  const totalActivities = itinerary.days.reduce((sum, d) => sum + d.blocks.length, 0);
  const dayThemes = itinerary.days.map((d) => d.theme || "Mixed").join(", ");

  // Get weather info
  const weatherInfo = getSeasonInfo(itinerary.preferences.startDate || new Date());

  const prompt = `You are a friendly travel assistant who just created an Ooty trip itinerary.

User's request: "${userRequest}"

Itinerary created:
- ${itinerary.preferences.numDays} days, ${totalActivities} activities
- Pace: ${itinerary.preferences.pace}
- Day themes: ${dayThemes}
- Weather: ${weatherInfo.typicalWeather.condition}, around ${weatherInfo.typicalWeather.temperature}°C

${highlights && highlights.length > 0 ? `Key highlights: ${highlights.join(", ")}` : ""}
${warnings && warnings.length > 0 ? `Notes: ${warnings.join(", ")}` : ""}

Generate a warm, conversational response (2-3 sentences) that:
1. Confirms what you created
2. Mentions 1-2 specific highlights
3. Mentions the weather briefly
4. Invites them to modify if needed

Be natural and friendly. Don't use emojis. Speak directly to the traveler.`;

  try {
    const result = await generateCompletion([{ role: "user", content: prompt }]);
    return result?.content || generateFallbackResponse(itinerary);
  } catch {
    return generateFallbackResponse(itinerary);
  }
}

function generateFallbackResponse(itinerary: Itinerary): string {
  const total = itinerary.days.reduce((sum, d) => sum + d.blocks.length, 0);
  return `I've created a ${itinerary.preferences.numDays}-day itinerary with ${total} activities for you. Let me know if you'd like to make any changes!`;
}

/**
 * Generate natural response for edits
 */
export async function generateEditResponse(params: {
  action: string;
  changedItems: string[];
  itinerary: Itinerary;
  userRequest: string;
}): Promise<string> {
  const { action, changedItems, itinerary, userRequest } = params;

  const prompt = `You are a friendly travel assistant who just modified an Ooty trip itinerary.

User asked: "${userRequest}"
Action taken: ${action}
Changed: ${changedItems.join(", ")}
Itinerary now has ${itinerary.days.length} days with ${itinerary.days.reduce((s, d) => s + d.blocks.length, 0)} activities.

Generate a brief, warm confirmation (1-2 sentences) that:
1. Confirms the change was made
2. Mentions what specifically changed
3. Optionally suggests what else they can do

Be conversational and friendly. No emojis.`;

  try {
    const result = await generateCompletion([{ role: "user", content: prompt }]);
    return result?.content || `Done! I've ${action.toLowerCase()}. Let me know if you need anything else.`;
  } catch {
    return `Done! I've ${action.toLowerCase()}. Let me know if you need anything else.`;
  }
}

/**
 * Generate POI explanation using LLM
 */
export async function generatePOIReasoning(params: {
  poi: POI;
  userInterests: string[];
  timeSlot: string;
  dayTheme?: string;
}): Promise<string> {
  const { poi, userInterests, timeSlot, dayTheme } = params;

  const prompt = `You're a local Ooty travel guide. Explain briefly (1-2 sentences) why ${poi.name} is perfect for this traveler.

Place: ${poi.name}
Categories: ${poi.category.join(", ")}
Description: ${poi.description}
Best time: ${poi.best_time}
Scheduled for: ${timeSlot}
Traveler interests: ${userInterests.join(", ")}
${dayTheme ? `Day theme: ${dayTheme}` : ""}

Give a personal, specific reason. Mention something unique about the place. Be enthusiastic but not over the top. No emojis.`;

  try {
    const result = await generateCompletion([{ role: "user", content: prompt }]);
    return result?.content || `${poi.name} matches your interest in ${userInterests[0] || "exploring Ooty"}.`;
  } catch {
    return `${poi.name} matches your interest in ${userInterests[0] || "exploring Ooty"}.`;
  }
}

/**
 * Generate suggestions with reasons
 */
export async function generateSuggestionResponse(params: {
  suggestions: POI[];
  userInterests: string[];
  currentItinerary: Itinerary;
}): Promise<{ message: string; formattedSuggestions: Array<{ name: string; reason: string }> }> {
  const { suggestions, userInterests, currentItinerary } = params;

  if (suggestions.length === 0) {
    return {
      message: "Your itinerary already covers the best spots in Ooty! Would you like to replace any activity instead?",
      formattedSuggestions: [],
    };
  }

  const existingPlaces = currentItinerary.days.flatMap((d) => d.blocks.map((b) => b.poi.name));

  const suggestionsInfo = suggestions
    .slice(0, 5)
    .map((p) => `- ${p.name}: ${p.category.join(", ")}. ${p.description.slice(0, 100)}`)
    .join("\n");

  const prompt = `You're a helpful Ooty travel guide. The traveler wants suggestions for new places to add.

Their interests: ${userInterests.join(", ")}
Already visiting: ${existingPlaces.slice(0, 5).join(", ")}

Available suggestions:
${suggestionsInfo}

For each suggestion, provide a compelling 1-sentence reason why it's worth adding. Format each as:
PLACE_NAME: reason

Then write a brief intro message (1 sentence) inviting them to choose.`;

  try {
    const result = await generateCompletion([{ role: "user", content: prompt }]);
    const content = result?.content || "";

    // Parse the response
    const lines = content.split("\n").filter((l) => l.includes(":"));
    const formattedSuggestions: Array<{ name: string; reason: string }> = [];

    for (const line of lines) {
      const colonIdx = line.indexOf(":");
      if (colonIdx > 0) {
        const name = line.slice(0, colonIdx).replace(/^[\d\.\-\*]+\s*/, "").trim();
        const reason = line.slice(colonIdx + 1).trim();

        const matched = suggestions.find(
          (s) => s.name.toLowerCase().includes(name.toLowerCase()) || name.toLowerCase().includes(s.name.toLowerCase())
        );

        if (matched && reason) {
          formattedSuggestions.push({ name: matched.name, reason });
        }
      }
    }

    // Use defaults if parsing failed
    if (formattedSuggestions.length === 0) {
      for (const s of suggestions.slice(0, 3)) {
        formattedSuggestions.push({
          name: s.name,
          reason: `Great for ${s.category[0] || "exploring"} lovers - ${s.description.slice(0, 50)}...`,
        });
      }
    }

    const introMessage = `Here are some places you might enjoy that aren't in your itinerary yet. Just say "add [place name] to Day [number]" to include any of these:`;

    return { message: introMessage, formattedSuggestions };
  } catch {
    return {
      message: "Here are some suggestions for you:",
      formattedSuggestions: suggestions.slice(0, 3).map((s) => ({
        name: s.name,
        reason: `${s.category[0] || "A great"} spot worth visiting.`,
      })),
    };
  }
}

/**
 * Generate clarifying question response
 */
export async function generateClarifyingQuestion(params: {
  questionType: string;
  previousAnswers: Record<string, unknown>;
  questionNumber: number;
  maxQuestions: number;
}): Promise<string> {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { questionType, previousAnswers: _previousAnswers, questionNumber, maxQuestions } = params;

  const questionsMap: Record<string, string> = {
    numDays: "How many days are you planning to spend in Ooty?",
    pace: "Do you prefer a relaxed pace with fewer activities, or a packed schedule seeing as much as possible?",
    interests: "What interests you most - nature and scenic views, food and tea, culture and heritage, or adventure activities?",
    travelParty: "Who are you traveling with - solo, couple, family with kids, or a group of friends?",
    groupSize: "How many people will be traveling? This helps me suggest the right vehicle.",
    dietaryPreference: "For food recommendations, do you prefer vegetarian only or are you open to non-veg options?",
    specialRequests: "Any specific places you definitely want to visit, or any other preferences I should know about?",
  };

  const baseQuestion = questionsMap[questionType] || "Could you tell me more about your preferences?";

  // For first question, add a friendly intro
  if (questionNumber === 1) {
    return `Great, let's plan your Ooty adventure! ${baseQuestion}`;
  }

  // For last question, mention we're almost done
  if (questionNumber >= maxQuestions - 1) {
    return `Almost there! ${baseQuestion}`;
  }

  return baseQuestion;
}

/**
 * Generate confirmation summary
 */
export async function generateConfirmationMessage(params: {
  preferences: Record<string, unknown>;
  weatherInfo: { condition: string; temperature: number; humidity?: number };
}): Promise<string> {
  const { preferences, weatherInfo } = params;

  const parts: string[] = [];

  if (preferences.numDays) parts.push(`${preferences.numDays} days`);
  if (preferences.pace) parts.push(`${preferences.pace} pace`);
  if (preferences.interests && Array.isArray(preferences.interests)) {
    parts.push(`interested in ${(preferences.interests as string[]).join(", ")}`);
  }
  if (preferences.travelParty) {
    parts.push(`traveling ${preferences.travelParty === "solo" ? "solo" : `as a ${preferences.travelParty}`}`);
  }
  if (preferences.groupSize) parts.push(`${preferences.groupSize} people`);

  const summary = parts.join(", ");

  return `Let me confirm: ${summary}. The weather in Ooty is typically ${weatherInfo.condition} with temperatures around ${weatherInfo.temperature}°C. Should I create your itinerary based on these preferences? Say yes to proceed, or tell me what to change.`;
}

const conversationLLM = {
  generateItineraryResponse,
  generateEditResponse,
  generatePOIReasoning,
  generateSuggestionResponse,
  generateClarifyingQuestion,
  generateConfirmationMessage,
};

export default conversationLLM;
