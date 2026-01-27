import type {
  VoiceIntent,
  TripPreferences,
  Itinerary,
  ConversationContext,
  AgentResponse,
} from "@/types";
import { searchPOIs } from "@/services/mcp/poiSearch";
import { buildItinerary } from "@/services/mcp/itineraryBuilder";
import travelTimesData from "@/data/ooty-travel-times.json";

// Clarifying questions to gather trip preferences
const CLARIFYING_QUESTIONS = [
  {
    key: "numDays",
    question: "How many days are you planning to stay in Ooty?",
    extract: (text: string) => {
      const match = text.match(/(\d+)\s*(?:day|days)/i);
      return match ? parseInt(match[1], 10) : null;
    },
  },
  {
    key: "pace",
    question: "Do you prefer a relaxed pace with fewer activities, a moderate pace, or a packed schedule seeing as much as possible?",
    extract: (text: string) => {
      if (/relax|easy|slow|leisurely/i.test(text)) return "relaxed";
      if (/pack|busy|full|lots|many/i.test(text)) return "packed";
      if (/moderate|normal|regular|balanced/i.test(text)) return "moderate";
      return null;
    },
  },
  {
    key: "interests",
    question: "What interests you most - nature and scenic views, food and tea, culture and heritage, or adventure activities?",
    extract: (text: string) => {
      const interests: string[] = [];
      if (/nature|scenic|view|landscape|garden/i.test(text)) interests.push("nature");
      if (/food|tea|eat|restaurant|chocolate/i.test(text)) interests.push("food");
      if (/culture|heritage|history|museum|church/i.test(text)) interests.push("culture");
      if (/adventure|trek|hike|activity/i.test(text)) interests.push("adventure");
      if (/relax|peaceful|quiet/i.test(text)) interests.push("relaxation");
      return interests.length > 0 ? interests : null;
    },
  },
  {
    key: "travelParty",
    question: "Who are you traveling with - solo, as a couple, with family, or a group?",
    extract: (text: string) => {
      if (/solo|alone|myself|by myself/i.test(text)) return "solo";
      if (/couple|partner|spouse|romantic|two of us/i.test(text)) return "couple";
      if (/family|kids|children|parents/i.test(text)) return "family";
      if (/group|friends/i.test(text)) return "group";
      return null;
    },
  },
  {
    key: "mobility",
    question: "Any mobility constraints I should consider? For example, difficulty with stairs or long walks?",
    extract: (text: string) => {
      if (/no|none|fine|good|full/i.test(text)) return "full";
      if (/limited|difficult|senior|elderly|wheelchair|mobility issue/i.test(text)) return "limited";
      return "full"; // Default to full mobility
    },
  },
  {
    key: "specialRequests",
    question: "Any specific places you definitely want to visit, or anything else I should know?",
    extract: (text: string) => {
      if (/no|none|nothing|that's it|nope/i.test(text)) return "";
      return text;
    },
  },
];

const MAX_CLARIFICATIONS = 6;

interface PlanningState {
  preferences: Partial<TripPreferences>;
  questionsAsked: string[];
  clarificationCount: number;
}

/**
 * Planning Agent - handles initial trip planning
 */
export class PlanningAgent {
  private state: PlanningState;

  constructor() {
    this.state = {
      preferences: {
        city: "ooty",
      },
      questionsAsked: [],
      clarificationCount: 0,
    };
  }

  /**
   * Handle a planning intent
   */
  async handle(
    intent: VoiceIntent,
    context: ConversationContext
  ): Promise<AgentResponse> {
    // Extract any preferences from the initial request
    this.extractPreferencesFromIntent(intent);

    // Check if we have enough information to generate itinerary
    const missingFields = this.getMissingFields();

    if (missingFields.length > 0 && this.state.clarificationCount < MAX_CLARIFICATIONS) {
      const question = this.getNextQuestion(missingFields);
      this.state.clarificationCount++;

      return {
        success: true,
        message: question,
        data: { needsClarification: true, missingFields },
        shouldSpeak: true,
      };
    }

    // We have enough info, generate the itinerary
    return this.generateItinerary();
  }

  /**
   * Process an answer to a clarifying question
   */
  async processAnswer(
    transcript: string,
    context: ConversationContext
  ): Promise<AgentResponse> {
    // Find which question we're answering
    const lastQuestion = this.state.questionsAsked[this.state.questionsAsked.length - 1];
    const questionConfig = CLARIFYING_QUESTIONS.find(
      (q) => q.question === lastQuestion
    );

    if (questionConfig) {
      const extracted = questionConfig.extract(transcript);
      if (extracted !== null) {
        (this.state.preferences as Record<string, unknown>)[questionConfig.key] = extracted;
      }
    }

    // Check if we need more information
    const missingFields = this.getMissingFields();

    if (missingFields.length > 0 && this.state.clarificationCount < MAX_CLARIFICATIONS) {
      const question = this.getNextQuestion(missingFields);
      this.state.clarificationCount++;

      return {
        success: true,
        message: question,
        data: { needsClarification: true, missingFields },
        shouldSpeak: true,
      };
    }

    // Generate the itinerary
    return this.generateItinerary();
  }

  /**
   * Extract preferences from the initial intent
   */
  private extractPreferencesFromIntent(intent: VoiceIntent): void {
    const params = intent.parameters || {};

    if (params.numDays) {
      this.state.preferences.numDays = params.numDays as number;
    }

    if (params.pace) {
      this.state.preferences.pace = params.pace as TripPreferences["pace"];
    }

    if (params.interests) {
      this.state.preferences.interests = params.interests as string[];
    }

    // Try to extract from raw text
    const text = intent.rawText.toLowerCase();

    // Extract number of days
    if (!this.state.preferences.numDays) {
      const daysMatch = text.match(/(\d+)\s*(?:day|days)/i);
      if (daysMatch) {
        this.state.preferences.numDays = parseInt(daysMatch[1], 10);
      }
    }

    // Extract dates if mentioned
    // For now, use current date as start date
    if (!this.state.preferences.startDate) {
      this.state.preferences.startDate = new Date();
    }
  }

  /**
   * Get list of missing required fields
   */
  private getMissingFields(): string[] {
    const required = ["numDays", "pace", "interests"];
    const missing: string[] = [];

    for (const field of required) {
      const value = (this.state.preferences as Record<string, unknown>)[field];
      if (value === undefined || value === null || (Array.isArray(value) && value.length === 0)) {
        missing.push(field);
      }
    }

    return missing;
  }

  /**
   * Get the next clarifying question
   */
  private getNextQuestion(missingFields: string[]): string {
    for (const field of missingFields) {
      const questionConfig = CLARIFYING_QUESTIONS.find((q) => q.key === field);
      if (questionConfig && !this.state.questionsAsked.includes(questionConfig.question)) {
        this.state.questionsAsked.push(questionConfig.question);
        return questionConfig.question;
      }
    }

    // Fallback
    return "Could you tell me more about what you'd like from your Ooty trip?";
  }

  /**
   * Generate the itinerary
   */
  private async generateItinerary(): Promise<AgentResponse> {
    try {
      // Set defaults for any missing optional fields
      const preferences = this.finalizePreferences();

      // Search for relevant POIs
      const poiResult = await searchPOIs({
        city: "ooty",
        interests: preferences.interests,
        pace: preferences.pace,
        maxResults: preferences.numDays * 4, // ~4 activities per day
      });

      if (!poiResult.pois || poiResult.pois.length === 0) {
        return {
          success: false,
          message: "I couldn't find suitable places matching your interests. Could you tell me more about what you'd like to see?",
          shouldSpeak: true,
        };
      }

      // Build the itinerary
      const itineraryResult = await buildItinerary({
        pois: poiResult.pois,
        numDays: preferences.numDays,
        pace: preferences.pace,
        startTime: "09:00",
        endTime: "20:00",
        travelTimeMatrix: travelTimesData.matrix,
      });

      // Create the full itinerary object
      const itinerary: Itinerary = {
        id: `itinerary-${Date.now()}`,
        preferences,
        days: itineraryResult.days,
        createdAt: new Date(),
        lastModified: new Date(),
        version: 1,
        sources: poiResult.sources.map((s) => ({
          text: s,
          source: s,
        })),
      };

      // Generate response message
      const message = this.generateItineraryMessage(itinerary, itineraryResult);

      return {
        success: true,
        message,
        data: { itinerary, warnings: itineraryResult.warnings },
        sources: itinerary.sources,
        shouldSpeak: true,
      };
    } catch (error) {
      console.error("Error generating itinerary:", error);
      return {
        success: false,
        message: "I had trouble creating your itinerary. Let me try again.",
        shouldSpeak: true,
      };
    }
  }

  /**
   * Finalize preferences with defaults
   */
  private finalizePreferences(): TripPreferences {
    const prefs = this.state.preferences;

    return {
      city: "ooty",
      numDays: prefs.numDays || 2,
      startDate: prefs.startDate || new Date(),
      endDate: new Date(
        (prefs.startDate || new Date()).getTime() +
          (prefs.numDays || 2) * 24 * 60 * 60 * 1000
      ),
      interests: prefs.interests || ["nature", "food"],
      pace: prefs.pace || "moderate",
      budget: prefs.budget || "moderate",
      mobility: prefs.mobility || "full",
      travelParty: prefs.travelParty || "couple",
      specialRequests: prefs.specialRequests,
    };
  }

  /**
   * Generate a human-readable message for the itinerary
   */
  private generateItineraryMessage(
    itinerary: Itinerary,
    result: { warnings: string[]; unscheduled: unknown[] }
  ): string {
    const { days, preferences } = itinerary;
    const totalPOIs = days.reduce((sum, day) => sum + day.blocks.length, 0);

    let message = `I've created a ${preferences.numDays}-day itinerary for you with ${totalPOIs} activities. `;

    // Add highlights
    if (days.length > 0 && days[0].blocks.length > 0) {
      message += `Day 1 starts with ${days[0].blocks[0].poi.name}. `;
    }

    // Add warnings if any
    if (result.warnings && result.warnings.length > 0) {
      message += `Note: ${result.warnings[0]} `;
    }

    message += "Take a look at the itinerary and let me know if you'd like any changes.";

    return message;
  }

  /**
   * Reset the agent state
   */
  reset(): void {
    this.state = {
      preferences: { city: "ooty" },
      questionsAsked: [],
      clarificationCount: 0,
    };
  }
}

// Export singleton instance
export const planningAgent = new PlanningAgent();
