import type {
  VoiceIntent,
  ConversationContext,
  AgentResponse,
  Citation,
} from "@/types";
import { retrieve } from "@/services/rag/retriever";

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
   * Handle "why" questions about itinerary choices
   */
  private async handleWhyQuestion(
    intent: VoiceIntent,
    context: ConversationContext
  ): Promise<AgentResponse> {
    const text = intent.rawText.toLowerCase();
    const { currentItinerary } = context;

    // Try to identify what POI they're asking about
    let targetPOI: string | null = null;

    if (currentItinerary) {
      for (const day of currentItinerary.days) {
        for (const block of day.blocks) {
          if (text.includes(block.poi.name.toLowerCase())) {
            targetPOI = block.poi.name;
            const poi = block.poi;

            // Generate explanation based on POI properties and preferences
            const reasons: string[] = [];

            // Check interest match
            const userInterests = currentItinerary.preferences.interests || [];
            const matchingInterests = poi.category.filter((cat) =>
              userInterests.some(
                (interest) =>
                  interest.toLowerCase().includes(cat.toLowerCase()) ||
                  cat.toLowerCase().includes(interest.toLowerCase())
              )
            );

            if (matchingInterests.length > 0) {
              reasons.push(
                `it matches your interest in ${matchingInterests.join(" and ")}`
              );
            }

            // Check best time
            if (poi.best_time === block.timeSlot || poi.best_time === "any") {
              reasons.push(
                `${block.timeSlot} is ${poi.best_time === "any" ? "a good" : "the best"} time to visit`
              );
            }

            // Check accessibility
            if (
              currentItinerary.preferences.mobility === "limited" &&
              poi.accessibility === "easy"
            ) {
              reasons.push("it's easily accessible");
            }

            // Check crowd level vs pace
            if (
              currentItinerary.preferences.pace === "relaxed" &&
              poi.crowd_level === "low"
            ) {
              reasons.push("it tends to be less crowded");
            }

            const message =
              reasons.length > 0
                ? `I picked ${poi.name} because ${reasons.join(", and ")}. ${poi.tips[0] || ""}`
                : `${poi.name} is a popular attraction in Ooty. ${poi.description.slice(0, 150)}...`;

            return {
              success: true,
              message,
              sources: [
                {
                  text: poi.description,
                  source: poi.source,
                },
              ],
              shouldSpeak: true,
            };
          }
        }
      }
    }

    // If we couldn't find a specific POI, give a general response
    const ragResult = await retrieve(intent.rawText);

    return {
      success: true,
      message: ragResult.context || "Could you specify which place you're asking about?",
      sources: ragResult.sources,
      shouldSpeak: true,
    };
  }

  /**
   * Handle "what if" questions (weather, changes, etc.)
   */
  private async handleWhatIfQuestion(
    intent: VoiceIntent,
    context: ConversationContext
  ): Promise<AgentResponse> {
    const text = intent.rawText.toLowerCase();

    // Weather-related questions
    if (/rain|rainy|weather|monsoon|fog|mist/.test(text)) {
      const ragResult = await retrieve("what to do if it rains in Ooty weather alternatives");

      const weatherTips = [
        "If it rains, indoor attractions like the Tribal Museum, Thread Garden, or chocolate factories make great alternatives.",
        "Ooty's weather can change quickly. Morning fog usually clears by mid-morning.",
        "Tea factories and cafes are perfect for rainy afternoons.",
        "Some viewpoints like Doddabetta may be obscured by mist - visit early morning for best visibility.",
      ];

      return {
        success: true,
        message:
          ragResult.context ||
          weatherTips[Math.floor(Math.random() * weatherTips.length)],
        sources: ragResult.sources,
        shouldSpeak: true,
      };
    }

    // Time/schedule changes
    if (/late|early|delay|change time|reschedule/.test(text)) {
      return {
        success: true,
        message:
          "The itinerary has some flexibility built in. If you're running late, you can adjust by spending less time at each stop or skipping one activity. Let me know if you'd like me to help restructure the day.",
        shouldSpeak: true,
      };
    }

    // General what-if
    const ragResult = await retrieve(intent.rawText);
    return {
      success: true,
      message:
        ragResult.context ||
        "That's a good question. Could you provide more details about what scenario you're considering?",
      sources: ragResult.sources,
      shouldSpeak: true,
    };
  }

  /**
   * Handle information questions about specific places
   */
  private async handleInfoQuestion(
    intent: VoiceIntent,
    context: ConversationContext
  ): Promise<AgentResponse> {
    const text = intent.rawText.toLowerCase();
    const { currentItinerary } = context;

    // Try to find the POI in the itinerary
    if (currentItinerary) {
      for (const day of currentItinerary.days) {
        for (const block of day.blocks) {
          if (text.includes(block.poi.name.toLowerCase())) {
            const poi = block.poi;

            // Specific info requests
            if (/how long|duration|time|hours/.test(text)) {
              return {
                success: true,
                message: `${poi.name} typically takes about ${poi.estimated_duration_mins} minutes to explore. ${poi.best_time !== "any" ? `Best visited in the ${poi.best_time}.` : ""}`,
                shouldSpeak: true,
              };
            }

            if (/cost|price|fee|entry|ticket/.test(text)) {
              return {
                success: true,
                message:
                  poi.cost_inr > 0
                    ? `Entry to ${poi.name} costs around ${poi.cost_inr} rupees per person.`
                    : `${poi.name} is free to visit.`,
                shouldSpeak: true,
              };
            }

            // General info
            return {
              success: true,
              message: `${poi.description} ${poi.tips[0] ? `Tip: ${poi.tips[0]}` : ""}`,
              sources: [{ text: poi.description, source: poi.source }],
              shouldSpeak: true,
            };
          }
        }
      }
    }

    // Use RAG for general info
    const ragResult = await retrieve(intent.rawText);

    return {
      success: true,
      message:
        ragResult.context ||
        "I don't have specific information about that. Could you tell me what you'd like to know more about?",
      sources: ragResult.sources,
      shouldSpeak: true,
    };
  }

  /**
   * Handle feasibility questions
   */
  private async handleFeasibilityQuestion(
    intent: VoiceIntent,
    context: ConversationContext
  ): Promise<AgentResponse> {
    const text = intent.rawText.toLowerCase();
    const { currentItinerary } = context;

    // Senior/accessibility questions
    if (/senior|elderly|old|wheelchair|mobility|walking/.test(text)) {
      if (!currentItinerary) {
        return {
          success: true,
          message:
            "I don't have an itinerary yet. When planning, I can prioritize easily accessible attractions for seniors. Would you like me to create a senior-friendly itinerary?",
          shouldSpeak: true,
        };
      }

      // Analyze current itinerary for accessibility
      const difficultSpots = currentItinerary.days
        .flatMap((d) => d.blocks)
        .filter((b) => b.poi.accessibility === "difficult");

      if (difficultSpots.length === 0) {
        return {
          success: true,
          message:
            "Yes, this itinerary is suitable for seniors. All the selected places have easy to moderate accessibility. The Botanical Gardens and Ooty Lake are particularly comfortable for leisurely visits.",
          shouldSpeak: true,
        };
      } else {
        const names = difficultSpots.map((b) => b.poi.name).join(", ");
        return {
          success: true,
          message: `Most of the itinerary is senior-friendly, but ${names} might be challenging due to terrain. Would you like me to suggest alternatives?`,
          shouldSpeak: true,
        };
      }
    }

    // Family/kids questions
    if (/family|kids|children|child/.test(text)) {
      const ragResult = await retrieve("Ooty activities for families with children");
      return {
        success: true,
        message:
          ragResult.context ||
          "Ooty is great for families. The Toy Train, Ooty Lake boating, and Botanical Gardens are particularly popular with kids. The Wax Museum and Thread Garden can also be engaging for children.",
        sources: ragResult.sources,
        shouldSpeak: true,
      };
    }

    // General feasibility
    return {
      success: true,
      message:
        "The itinerary is designed to be feasible based on your preferences. Each day has reasonable travel times and activity durations. Let me know if you have specific concerns.",
      shouldSpeak: true,
    };
  }

  /**
   * Handle general queries using RAG
   */
  private async handleGeneralQuery(
    intent: VoiceIntent,
    context: ConversationContext
  ): Promise<AgentResponse> {
    const ragResult = await retrieve(intent.rawText);

    if (ragResult.context) {
      return {
        success: true,
        message: ragResult.context,
        sources: ragResult.sources,
        shouldSpeak: true,
      };
    }

    return {
      success: true,
      message:
        "I'm not sure about that. Could you rephrase your question or ask about something specific in your itinerary?",
      shouldSpeak: true,
    };
  }
}

// Export singleton instance
export const queryAgent = new QueryAgent();
