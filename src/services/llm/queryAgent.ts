import type {
  VoiceIntent,
  ConversationContext,
  AgentResponse,
} from "@/types";
import { retrieve } from "@/services/rag/retriever";
import { generateQueryResponse } from "./conversationLLM";

/**
 * Query Agent - handles "why" and "what if" questions
 */
export class QueryAgent {
  /**
   * Handle a query intent
   */
  async handle(
    intent: VoiceIntent,
    context: ConversationContext
  ): Promise<AgentResponse> {
    const text = intent.rawText.toLowerCase();

    // Categorize the type of query
    if (this.isWhyQuestion(text)) {
      return this.handleWhyQuestion(intent, context);
    }

    if (this.isWhatIfQuestion(text)) {
      return this.handleWhatIfQuestion(intent, context);
    }

    if (this.isInfoQuestion(text)) {
      return this.handleInfoQuestion(intent, context);
    }

    if (this.isFeasibilityQuestion(text)) {
      return this.handleFeasibilityQuestion(intent, context);
    }

    // Check if user is mentioning a place name from the itinerary
    if (this.mentionsItinerarySpot(text, context)) {
      return this.handleInfoQuestion(intent, context);
    }

    // General query - use RAG
    return this.handleGeneralQuery(intent, context);
  }

  /**
   * Check if user mentions any spot from current itinerary
   */
  private mentionsItinerarySpot(text: string, context: ConversationContext): boolean {
    const { currentItinerary } = context;
    if (!currentItinerary) return false;

    for (const day of currentItinerary.days) {
      for (const block of day.blocks) {
        const poiNameLower = block.poi.name.toLowerCase();
        const poiWords = poiNameLower.split(/\s+/);
        // Check if any significant word from POI name is in the user text
        const hasMatch = poiWords.some(pw =>
          pw.length > 3 && text.includes(pw)
        );
        if (hasMatch || text.includes(poiNameLower)) {
          return true;
        }
      }
    }
    return false;
  }

  /**
   * Check if this is a "why" question
   */
  private isWhyQuestion(text: string): boolean {
    return /^why|why did|why is|reason for|how come/.test(text);
  }

  /**
   * Check if this is a "what if" question
   */
  private isWhatIfQuestion(text: string): boolean {
    return /what if|what happens if|in case of|suppose|if it/.test(text);
  }

  /**
   * Check if this is an information question about a specific place
   */
  private isInfoQuestion(text: string): boolean {
    // Check for general info patterns - expanded to catch more variations
    if (/what's special|tell me about|more about|details|how long|what is|where is|explain|describe|talk about|tell about|info on|information on/.test(text)) {
      return true;
    }
    // Check if user is asking about a specific place by just mentioning it
    // This catches patterns like "Botanical Garden?" or "what about Rose Garden"
    if (/what about|about the|the .+ garden|the .+ lake|the .+ museum|the .+ point|the .+ falls|the .+ peak|the .+ dam/.test(text)) {
      return true;
    }
    // Catch "explain [spot name]" patterns or "explain spot [number]"
    if (/^explain\s+(?:this\s+)?(?:spot|place|location|attraction|restaurant)/i.test(text) || /explain\s+[A-Z][a-z]+/i.test(text) || /explain\s+spot\s+\d+/i.test(text)) {
      return true;
    }
    return false;
  }

  /**
   * Check if this is a feasibility question
   */
  private isFeasibilityQuestion(text: string): boolean {
    return /doable|feasible|possible|can we|suitable|good for|safe for|accessible/.test(
      text
    );
  }

  /**
   * Handle "why" questions about itinerary choices - uses LLM
   */
  private async handleWhyQuestion(
    intent: VoiceIntent,
    context: ConversationContext
  ): Promise<AgentResponse> {
    const text = intent.rawText.toLowerCase();
    const { currentItinerary } = context;

    // Try to identify what POI they're asking about and build context
    let poiContext = "";
    let sources: AgentResponse["sources"] = [];

    if (currentItinerary) {
      for (const day of currentItinerary.days) {
        for (const block of day.blocks) {
          if (text.includes(block.poi.name.toLowerCase())) {
            const poi = block.poi;
            const userInterests = currentItinerary.preferences.interests || [];

            poiContext = `
Place: ${poi.name}
Description: ${poi.description}
Categories: ${poi.category.join(", ")}
Best time to visit: ${poi.best_time}
Scheduled: Day ${day.dayNumber}, ${block.timeSlot}
User interests: ${userInterests.join(", ")}
Accessibility: ${poi.accessibility}
Crowd level: ${poi.crowd_level}
User pace preference: ${currentItinerary.preferences.pace}
Tips: ${poi.tips.join(". ")}`;

            sources = [{ text: poi.description, source: poi.source }];
            break;
          }
        }
        if (poiContext) break;
      }
    }

    // If no specific POI found, use RAG
    if (!poiContext) {
      const ragResult = await retrieve(intent.rawText);
      poiContext = ragResult.context || "";
      sources = ragResult.sources;
    }

    // Use LLM to generate a natural response
    const message = await generateQueryResponse({
      userQuestion: intent.rawText,
      ragContext: poiContext,
      currentItinerary,
      questionType: "why",
      instructions: "Explain the reasoning behind the choice, connecting it to user preferences and the place's qualities.",
    });

    return {
      success: true,
      message,
      sources,
      shouldSpeak: true,
    };
  }

  /**
   * Handle "what if" questions (weather, changes, etc.) - uses LLM
   */
  private async handleWhatIfQuestion(
    intent: VoiceIntent,
    context: ConversationContext
  ): Promise<AgentResponse> {
    const text = intent.rawText.toLowerCase();

    // Build relevant context based on question type
    let ragContext = "";
    let sources: AgentResponse["sources"] = [];

    // Weather-related questions - get relevant info
    if (/rain|rainy|weather|monsoon|fog|mist/.test(text)) {
      const ragResult = await retrieve("what to do if it rains in Ooty weather alternatives indoor activities");
      ragContext = ragResult.context || "Indoor alternatives include the Tribal Museum, Thread Garden, chocolate factories, and tea tasting rooms.";
      sources = ragResult.sources;
    }
    // Time/schedule changes
    else if (/late|early|delay|change time|reschedule/.test(text)) {
      ragContext = "Ooty itineraries have flexibility built in. Activities typically allow 30-60 minutes buffer. Morning fog usually clears by 10am.";
    }
    // General what-if
    else {
      const ragResult = await retrieve(intent.rawText);
      ragContext = ragResult.context || "";
      sources = ragResult.sources;
    }

    // Use LLM to generate natural response
    const message = await generateQueryResponse({
      userQuestion: intent.rawText,
      ragContext,
      currentItinerary: context.currentItinerary,
      questionType: "what_if",
      instructions: "Address their hypothetical scenario with practical advice and alternatives if needed.",
    });

    return {
      success: true,
      message,
      sources,
      shouldSpeak: true,
    };
  }

  /**
   * Handle information questions about specific places - uses LLM
   * Provides comprehensive details about what's on screen
   */
  private async handleInfoQuestion(
    intent: VoiceIntent,
    context: ConversationContext
  ): Promise<AgentResponse> {
    const text = intent.rawText.toLowerCase();
    const { currentItinerary } = context;

    let infoContext = "";
    let sources: AgentResponse["sources"] = [];
    let foundInItinerary = false;

    // Try to find the POI in the itinerary - be more flexible with matching
    if (currentItinerary) {
      for (const day of currentItinerary.days) {
        for (const block of day.blocks) {
          // More flexible matching - partial name match or spot number match
          const poiNameLower = block.poi.name.toLowerCase();
          const poiWords = poiNameLower.split(/\s+/);
          const textWords = text.split(/\s+/);

          // Check for spot number match (e.g., "explain spot 2")
          const spotNumberMatch = text.match(/spot\s*(\d+)/i);
          const isSpotNumberMatch = spotNumberMatch && parseInt(spotNumberMatch[1], 10) === day.blocks.indexOf(block) + 1;

          const hasMatch = isSpotNumberMatch || poiWords.some(pw => textWords.some(tw =>
            tw.length > 3 && (pw.includes(tw) || tw.includes(pw))
          )) || text.includes(poiNameLower);

          if (hasMatch) {
            const poi = block.poi;
            foundInItinerary = true;

            // Build comprehensive info about what's shown on screen
            const isFood = poi.category.some(c =>
              c.toLowerCase().includes("food") ||
              c.toLowerCase().includes("restaurant") ||
              c.toLowerCase().includes("cafe")
            );

            infoContext = `
PLACE IN YOUR ITINERARY:
Name: ${poi.name}
Scheduled: Day ${day.dayNumber}, ${block.timeSlot} (${block.startTime} - ${block.endTime})

DETAILS ON SCREEN:
Description: ${poi.description}
Duration: ${poi.estimated_duration_mins} minutes recommended
Entry cost: ${poi.cost_inr > 0 ? `₹${poi.cost_inr} per person` : "Free entry"}
Best time to visit: ${poi.best_time}
Type: ${poi.category.join(", ")}
Crowd level: ${poi.crowd_level}
Accessibility: ${poi.accessibility}
${isFood && poi.dietary ? `Dietary: ${poi.dietary === "veg" ? "Pure Vegetarian" : "Veg & Non-veg available"}` : ""}

${poi.tips && poi.tips.length > 0 ? `LOCAL TIPS:\n${poi.tips.map((t, i) => `${i + 1}. ${t}`).join("\n")}` : ""}

${block.reasoning ? `WHY I PICKED THIS: ${block.reasoning}` : ""}`;

            sources = [{ text: poi.description, source: poi.source }];
            break;
          }
        }
        if (infoContext) break;
      }
    }

    // If not in itinerary, use RAG for general info
    if (!infoContext) {
      const ragResult = await retrieve(intent.rawText);
      infoContext = ragResult.context || "";
      sources = ragResult.sources;
    }

    // Build specific instructions based on whether POI was found
    const instructions = foundInItinerary
      ? "This place is in the user's itinerary. Explain briefly what's displayed and why it's a good choice for their current plan."
      : "This place may not be in their current itinerary. Provide brief, general information about it.";

    // Use LLM to generate natural response
    const message = await generateQueryResponse({
      userQuestion: intent.rawText,
      ragContext: infoContext,
      currentItinerary,
      questionType: "info",
      instructions,
    });

    return {
      success: true,
      message,
      sources,
      shouldSpeak: true,
    };
  }

  /**
   * Handle feasibility questions - uses LLM
   */
  private async handleFeasibilityQuestion(
    intent: VoiceIntent,
    context: ConversationContext
  ): Promise<AgentResponse> {
    const text = intent.rawText.toLowerCase();
    const { currentItinerary } = context;

    let feasibilityContext = "";
    let sources: AgentResponse["sources"] = [];

    // Senior/accessibility questions
    if (/senior|elderly|old|wheelchair|mobility|walking/.test(text)) {
      if (currentItinerary) {
        // Analyze current itinerary for accessibility
        const allBlocks = currentItinerary.days.flatMap((d) => d.blocks);
        const easySpots = allBlocks.filter((b) => b.poi.accessibility === "easy");
        const difficultSpots = allBlocks.filter((b) => b.poi.accessibility === "difficult");

        feasibilityContext = `
Accessibility analysis for current itinerary:
- Total places: ${allBlocks.length}
- Easy access places: ${easySpots.map(b => b.poi.name).join(", ") || "None"}
- Challenging places: ${difficultSpots.map(b => b.poi.name).join(", ") || "None"}
- Overall: ${difficultSpots.length === 0 ? "All places are accessible" : "Some places may be challenging"}`;
      } else {
        feasibilityContext = "No itinerary created yet. Can prioritize easily accessible attractions for seniors when planning.";
      }
    }
    // Family/kids questions
    else if (/family|kids|children|child/.test(text)) {
      const ragResult = await retrieve("Ooty activities for families with children kid-friendly");
      feasibilityContext = ragResult.context || "Ooty is family-friendly with Toy Train, Ooty Lake boating, Botanical Gardens, Wax Museum, and Thread Garden.";
      sources = ragResult.sources;
    }
    // General feasibility
    else if (currentItinerary) {
      const totalTime = currentItinerary.days.reduce((sum, d) =>
        sum + d.blocks.reduce((s, b) => s + b.poi.estimated_duration_mins + (b.travelTimeFromPrev || 0), 0), 0);
      feasibilityContext = `
Itinerary feasibility:
- ${currentItinerary.days.length} days planned
- ${currentItinerary.days.reduce((s, d) => s + d.blocks.length, 0)} total activities
- Estimated total time: ${Math.round(totalTime / 60)} hours
- Pace: ${currentItinerary.preferences.pace || "moderate"}`;
    }

    // Use LLM to generate natural response
    const message = await generateQueryResponse({
      userQuestion: intent.rawText,
      ragContext: feasibilityContext,
      currentItinerary,
      questionType: "feasibility",
      instructions: "Assess whether their idea is practical and provide honest, helpful guidance.",
    });

    return {
      success: true,
      message,
      sources,
      shouldSpeak: true,
    };
  }

  /**
   * Handle general queries using RAG + LLM
   */
  private async handleGeneralQuery(
    intent: VoiceIntent,
    context: ConversationContext
  ): Promise<AgentResponse> {
    const ragResult = await retrieve(intent.rawText);

    // Use LLM to generate a natural response from RAG context
    const message = await generateQueryResponse({
      userQuestion: intent.rawText,
      ragContext: ragResult.context,
      currentItinerary: context.currentItinerary,
      questionType: "general",
      instructions: "Answer their question directly and helpfully based on the available information.",
    });

    return {
      success: true,
      message,
      sources: ragResult.sources,
      shouldSpeak: true,
    };
  }
}

// Export singleton instance
export const queryAgent = new QueryAgent();
