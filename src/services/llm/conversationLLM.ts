/**
 * LLM-powered Conversation Handler
 * Uses Gemini to generate natural, contextual responses
 */

import { generateCompletion } from "./geminiProvider";
import type { Itinerary, POI } from "@/types";
import { getSeasonInfo } from "@/services/mcp/weatherAdjustment";

/**
 * Generate a natural response for itinerary creation with day-by-day summary
 */
export async function generateItineraryResponse(params: {
  itinerary: Itinerary;
  userRequest: string;
  highlights?: string[];
  warnings?: string[];
}): Promise<string> {
  const { itinerary, userRequest, highlights, warnings } = params;

  const totalActivities = itinerary.days.reduce((sum, d) => sum + d.blocks.length, 0);

  // Get weather info
  const weatherInfo = getSeasonInfo(itinerary.preferences.startDate || new Date());

  // Build day-by-day summary
  const daySummaries = itinerary.days.map((day) => {
    const places = day.blocks.map((b) => b.poi.name).join(", ");
    const theme = day.theme || "Mixed activities";
    return `Day ${day.dayNumber} (${theme}): ${places}`;
  }).join("\n");

  const prompt = `You are a friendly travel assistant who just created an Ooty trip itinerary.

User's request: "${userRequest}"

ITINERARY SUMMARY:
${daySummaries}

Details:
- Total: ${itinerary.preferences.numDays} days, ${totalActivities} activities
- Pace: ${itinerary.preferences.pace}
- Weather: ${weatherInfo.typicalWeather.condition}, around ${weatherInfo.typicalWeather.temperature}°C

${highlights && highlights.length > 0 ? `Highlights: ${highlights.join(", ")}` : ""}
${warnings && warnings.length > 0 ? `Notes: ${warnings.join(", ")}` : ""}

Generate a warm response that:
1. Briefly confirms the trip is ready
2. Lists each day with its theme and 2-3 key places (be specific!)
3. Mentions the weather briefly
4. Invites modifications

Format like:
"Here's your [X]-day Ooty adventure!

Day 1 focuses on [theme] - you'll visit [place1], [place2], and [place3].
Day 2 is all about [theme] with [place1] and [place2].
...

The weather should be [condition]. Let me know if you'd like any changes!"

Be natural and conversational. No emojis.`;

  try {
    const result = await generateCompletion([{ role: "user", content: prompt }]);
    return result?.content || generateFallbackResponse(itinerary);
  } catch {
    return generateFallbackResponse(itinerary);
  }
}

function generateFallbackResponse(itinerary: Itinerary): string {
  const total = itinerary.days.reduce((sum, d) => sum + d.blocks.length, 0);

  // Build day summaries
  const daySummaries = itinerary.days.map((day) => {
    const places = day.blocks.slice(0, 3).map((b) => b.poi.name).join(", ");
    return `Day ${day.dayNumber}: ${places}`;
  }).join(". ");

  return `I've created a ${itinerary.preferences.numDays}-day itinerary with ${total} activities! ${daySummaries}. Let me know if you'd like to make any changes!`;
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

/**
 * LLM-based intent parser for edit requests
 */
export interface ParsedEditIntent {
  action: "add" | "remove" | "replace" | "swap" | "suggest" | "swap_days" | "unknown";
  dayNumber?: number;
  timeSlot?: "morning" | "afternoon" | "evening";
  targetDayNumber?: number; // For swapping days
  poiName?: string; // Specific place mentioned
  poiType?: string; // Type of place (tea garden, restaurant, etc.)
  needsOptions?: boolean; // User wants to see options first
  confidence: number;
}

export async function parseEditIntent(params: {
  userText: string;
  currentItinerary: Itinerary;
}): Promise<ParsedEditIntent> {
  const { userText, currentItinerary } = params;

  // Build context about current itinerary
  const daysSummary = currentItinerary.days.map(d => {
    const activities = d.blocks.map(b => `${b.timeSlot}: ${b.poi.name}`).join(", ");
    return `Day ${d.dayNumber}: ${activities}`;
  }).join("\n");

  const prompt = `You are parsing a user's request to modify their Ooty trip itinerary.

CURRENT ITINERARY:
${daysSummary}

USER REQUEST: "${userText}"

Parse the request and return a JSON object with these fields:
- action: One of "add", "remove", "replace", "swap", "suggest", "swap_days", or "unknown"
- dayNumber: Which day (1, 2, etc.) or null if not specified
- timeSlot: "morning", "afternoon", "evening" or null
- targetDayNumber: For swapping days, the other day number
- poiName: Specific place name mentioned or null
- poiType: Type of place wanted (tea, food, nature, museum, etc.) or null
- needsOptions: true if user wants to see options before deciding, false otherwise
- confidence: 0-1 how confident you are in this interpretation

Examples:
- "replace the morning activity" -> {"action":"replace","timeSlot":"morning","needsOptions":true,"confidence":0.9}
- "add a tea garden to day 2" -> {"action":"add","dayNumber":2,"poiType":"tea","needsOptions":false,"confidence":0.95}
- "swap day 1 and day 2" -> {"action":"swap_days","dayNumber":1,"targetDayNumber":2,"confidence":0.95}
- "suggest something else" -> {"action":"suggest","needsOptions":true,"confidence":0.9}
- "remove botanical garden" -> {"action":"remove","poiName":"botanical garden","confidence":0.9}
- "I want to change something" -> {"action":"replace","needsOptions":true,"confidence":0.7}

Return ONLY the JSON object, no other text.`;

  try {
    const result = await generateCompletion([{ role: "user", content: prompt }]);
    const content = result?.content || "";

    // Extract JSON from response
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]) as ParsedEditIntent;
      return {
        action: parsed.action || "unknown",
        dayNumber: parsed.dayNumber,
        timeSlot: parsed.timeSlot,
        targetDayNumber: parsed.targetDayNumber,
        poiName: parsed.poiName,
        poiType: parsed.poiType,
        needsOptions: parsed.needsOptions ?? true,
        confidence: parsed.confidence || 0.5,
      };
    }
  } catch (error) {
    console.error("Error parsing edit intent with LLM:", error);
  }

  // Fallback to basic regex parsing
  return fallbackParseIntent(userText);
}

function fallbackParseIntent(text: string): ParsedEditIntent {
  const lowerText = text.toLowerCase();

  // Extract day number
  let dayNumber: number | undefined;
  const dayMatch = lowerText.match(/day\s*(\d+)/i);
  if (dayMatch) dayNumber = parseInt(dayMatch[1], 10);

  // Extract time slot
  let timeSlot: "morning" | "afternoon" | "evening" | undefined;
  if (/morning/i.test(lowerText)) timeSlot = "morning";
  else if (/afternoon/i.test(lowerText)) timeSlot = "afternoon";
  else if (/evening/i.test(lowerText)) timeSlot = "evening";

  // Determine action
  if (/suggest|recommend|other|options|ideas/i.test(lowerText)) {
    return { action: "suggest", dayNumber, timeSlot, needsOptions: true, confidence: 0.8 };
  }
  if (/swap\s+day.*and.*day|switch.*days/i.test(lowerText)) {
    const swapMatch = lowerText.match(/day\s*(\d+).*day\s*(\d+)/i);
    return {
      action: "swap_days",
      dayNumber: swapMatch ? parseInt(swapMatch[1], 10) : 1,
      targetDayNumber: swapMatch ? parseInt(swapMatch[2], 10) : 2,
      confidence: 0.85,
    };
  }
  if (/add|include|put/i.test(lowerText)) {
    return { action: "add", dayNumber, timeSlot, needsOptions: false, confidence: 0.8 };
  }
  if (/remove|delete|cancel|skip/i.test(lowerText)) {
    return { action: "remove", dayNumber, timeSlot, needsOptions: false, confidence: 0.8 };
  }
  if (/replace|change|swap|instead/i.test(lowerText)) {
    const hasTarget = /with\s+\w+/i.test(lowerText);
    return { action: "replace", dayNumber, timeSlot, needsOptions: !hasTarget, confidence: 0.75 };
  }

  return { action: "unknown", confidence: 0.3 };
}

/**
 * Generate contextual help response using LLM
 * This handles unclear intents by explaining what's on screen and how to interact
 */
export async function generateContextualHelp(params: {
  userText: string;
  currentItinerary: Itinerary | null;
  conversationHistory?: Array<{ role: string; content: string }>;
}): Promise<string> {
  const { userText, currentItinerary, conversationHistory } = params;

  // Build context about what's on screen
  let screenContext = "";
  if (currentItinerary) {
    const daySummaries = currentItinerary.days.map(d => {
      const activities = d.blocks.map(b => `${b.timeSlot}: ${b.poi.name}`).join(", ");
      return `Day ${d.dayNumber} (${d.theme || "Mixed"}): ${activities}`;
    }).join("\n");

    const totalCost = currentItinerary.days.reduce((sum, d) =>
      sum + d.blocks.reduce((s, b) => s + (b.poi.cost_inr || 0), 0), 0);

    screenContext = `
CURRENT ITINERARY ON SCREEN:
${daySummaries}

Trip Details:
- ${currentItinerary.preferences.numDays} days
- ${currentItinerary.preferences.groupSize || 2} travelers
- Pace: ${currentItinerary.preferences.pace || "moderate"}
- Estimated entry costs: ₹${totalCost}
`;
  } else {
    screenContext = "NO ITINERARY YET - User hasn't created a trip plan.";
  }

  // Build conversation context
  const recentHistory = conversationHistory?.slice(-4).map(m =>
    `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`
  ).join("\n") || "";

  const prompt = `You are a friendly Ooty travel planning assistant. The user said something you need to respond to helpfully.

${screenContext}

${recentHistory ? `RECENT CONVERSATION:\n${recentHistory}\n` : ""}

USER JUST SAID: "${userText}"

Generate a helpful response that:
1. If they have an itinerary: Briefly describe what's shown (days, key places) and explain how they can modify it
2. If no itinerary: Guide them on how to start planning
3. Answer any question they might have based on context
4. Be specific about what commands/requests work:
   - "Add [place] to Day [X]" - adds a new activity
   - "Remove [place]" - removes an activity
   - "Replace [place] with something else" - swaps activities
   - "Swap Day 1 and Day 2" - reorder days
   - "Tell me about [place]" - get info
   - "Why did you pick [place]?" - get reasoning

${currentItinerary ? `Their itinerary has ${currentItinerary.days.length} days. Mention 2-3 specific places from their plan.` : ""}

Be conversational, helpful, and specific. Keep response to 2-3 sentences. No emojis.`;

  try {
    const result = await generateCompletion([{ role: "user", content: prompt }]);
    return result?.content || generateFallbackHelp(currentItinerary);
  } catch {
    return generateFallbackHelp(currentItinerary);
  }
}

function generateFallbackHelp(itinerary: Itinerary | null): string {
  if (itinerary) {
    const places = itinerary.days.flatMap(d => d.blocks.map(b => b.poi.name)).slice(0, 3).join(", ");
    return `Your itinerary includes ${places} and more. You can ask me to add, remove, or replace activities, swap days around, or ask about any place. What would you like to do?`;
  }
  return "I can help you plan a trip to Ooty. Just say something like 'Plan a 3-day trip' or ask me about places to visit in Ooty.";
}

/**
 * Generate LLM-powered response for queries
 * Enhances RAG results with natural language generation
 */
export async function generateQueryResponse(params: {
  userQuestion: string;
  ragContext: string | null;
  currentItinerary: Itinerary | null;
  questionType: "why" | "what_if" | "info" | "feasibility" | "general";
}): Promise<string> {
  const { userQuestion, ragContext, currentItinerary, questionType } = params;

  // Build itinerary context
  let itineraryContext = "";
  if (currentItinerary) {
    const places = currentItinerary.days.flatMap(d =>
      d.blocks.map(b => `${b.poi.name} (Day ${d.dayNumber}, ${b.timeSlot})`)
    );
    itineraryContext = `\nPlaces in their itinerary: ${places.join(", ")}`;
  }

  const typeInstructions: Record<string, string> = {
    why: "Explain the reasoning behind the choice, connecting it to user preferences and the place's qualities.",
    what_if: "Address their hypothetical scenario with practical advice and alternatives if needed.",
    info: "Provide specific, useful information about the place or topic they're asking about.",
    feasibility: "Assess whether their idea is practical and provide honest, helpful guidance.",
    general: "Answer their question directly and helpfully based on the available information.",
  };

  const prompt = `You are a knowledgeable Ooty travel guide answering a visitor's question.

USER'S QUESTION: "${userQuestion}"
QUESTION TYPE: ${questionType}
${ragContext ? `\nRELEVANT INFORMATION:\n${ragContext}` : ""}
${itineraryContext}

Instructions: ${typeInstructions[questionType] || typeInstructions.general}

Generate a helpful, natural response. Be specific and informative. If you don't have enough information, acknowledge that but still try to be helpful. Keep it to 2-4 sentences. No emojis.`;

  try {
    const result = await generateCompletion([{ role: "user", content: prompt }]);
    return result?.content || ragContext || "I don't have specific information about that. Could you tell me more about what you'd like to know?";
  } catch {
    return ragContext || "I'm having trouble accessing my knowledge base. Could you try asking in a different way?";
  }
}

const conversationLLM = {
  generateItineraryResponse,
  generateEditResponse,
  generatePOIReasoning,
  generateSuggestionResponse,
  generateClarifyingQuestion,
  generateConfirmationMessage,
  parseEditIntent,
  generateContextualHelp,
  generateQueryResponse,
};

export default conversationLLM;
