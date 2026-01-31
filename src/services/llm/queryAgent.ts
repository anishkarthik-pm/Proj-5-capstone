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

    // General query - use RAG
    return this.handleGeneralQuery(intent, context);
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
   * Check if this is an information question
   */
  private isInfoQuestion(text: string): boolean {
    return /what's special|tell me about|more about|details|how long|what is|where is/.test(
      text
    );
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
   */
  private async handleInfoQuestion(
    intent: VoiceIntent,
    context: ConversationContext
  ): Promise<AgentResponse> {
    const text = intent.rawText.toLowerCase();
    const { currentItinerary } = context;

    let infoContext = "";
    let sources: AgentResponse["sources"] = [];

    // Try to find the POI in the itinerary
    if (currentItinerary) {
      for (const day of currentItinerary.days) {
        for (const block of day.blocks) {
          if (text.includes(block.poi.name.toLowerCase())) {
            const poi = block.poi;

            infoContext = `
Place: ${poi.name}
Description: ${poi.description}
Duration: ${poi.estimated_duration_mins} minutes
Entry cost: ${poi.cost_inr > 0 ? `₹${poi.cost_inr}` : "Free"}
Best time: ${poi.best_time}
Categories: ${poi.category.join(", ")}
Accessibility: ${poi.accessibility}
Tips: ${poi.tips.join(". ")}`;

            sources = [{ text: poi.description, source: poi.source }];
            break;
          }
        }
        if (infoContext) break;
      }
    }

    // Use RAG for general info if not found in itinerary
    if (!infoContext) {
      const ragResult = await retrieve(intent.rawText);
      infoContext = ragResult.context || "";
      sources = ragResult.sources;
    }

    // Use LLM to generate natural response
    const message = await generateQueryResponse({
      userQuestion: intent.rawText,
      ragContext: infoContext,
      currentItinerary,
      questionType: "info",
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
