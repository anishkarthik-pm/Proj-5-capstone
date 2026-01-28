import type {
  VoiceIntent,
  TripPreferences,
  Itinerary,
  ConversationContext,
  AgentResponse,
} from "@/types";
import { searchPOIs } from "@/services/mcp/poiSearch";
import { buildItinerary } from "@/services/mcp/itineraryBuilder";
import { getSeasonInfo } from "@/services/mcp/weatherAdjustment";
import travelTimesData from "@/data/ooty-travel-times.json";

// Clarifying questions to gather trip preferences (max 6)
const CLARIFYING_QUESTIONS = [
  {
    key: "numDays",
    question: "How many days are you planning to stay in Ooty?",
    priority: 1, // Required
    extract: (text: string) => {
      const match = text.match(/(\d+)\s*(?:day|days)/i);
      return match ? parseInt(match[1], 10) : null;
    },
  },
  {
    key: "pace",
    question: "Do you prefer a relaxed pace with fewer activities, or a packed schedule seeing as much as possible?",
    priority: 1, // Required
    extract: (text: string) => {
      if (/relax|easy|slow|leisurely|chill/i.test(text)) return "relaxed";
      if (/pack|busy|full|lots|many|maximum/i.test(text)) return "packed";
      if (/moderate|normal|regular|balanced|mix/i.test(text)) return "moderate";
      return null;
    },
  },
  {
    key: "interests",
    question: "What interests you most - nature and scenic views, food and tea, culture and heritage, or adventure activities?",
    priority: 1, // Required
    extract: (text: string) => {
      const interests: string[] = [];
      if (/nature|scenic|view|landscape|garden|mountain/i.test(text)) interests.push("nature");
      if (/food|tea|eat|restaurant|chocolate|cuisine/i.test(text)) interests.push("food");
      if (/culture|heritage|history|museum|church|temple/i.test(text)) interests.push("culture");
      if (/adventure|trek|hike|activity|sport/i.test(text)) interests.push("adventure");
      if (/relax|peaceful|quiet|spa/i.test(text)) interests.push("relaxation");
      return interests.length > 0 ? interests : null;
    },
  },
  {
    key: "travelParty",
    question: "Who are you traveling with - solo, couple, family with kids, or a group of friends?",
    priority: 2, // Optional but helpful
    extract: (text: string) => {
      if (/solo|alone|myself|by myself/i.test(text)) return "solo";
      if (/couple|partner|spouse|romantic|two of us/i.test(text)) return "couple";
      if (/family|kids|children|parents|elderly/i.test(text)) return "family";
      if (/group|friends/i.test(text)) return "group";
      return null;
    },
  },
  {
    key: "dietaryPreference",
    question: "For food spots, do you prefer vegetarian only, or are you open to non-veg options?",
    priority: 2, // Optional
    extract: (text: string) => {
      if (/veg|vegetarian|pure veg|no meat|no non-veg/i.test(text)) return "veg";
      if (/non-veg|non veg|meat|chicken|fish|egg/i.test(text)) return "non-veg";
      if (/any|both|either|no preference|anything|don't mind/i.test(text)) return "any";
      return null;
    },
  },
  {
    key: "specialRequests",
    question: "Any specific places you definitely want to visit or any constraints I should know about?",
    priority: 3, // Optional
    extract: (text: string) => {
      if (/no|none|nothing|that's it|nope|not really/i.test(text)) return "";
      return text;
    },
  },
];

const MAX_CLARIFICATIONS = 6;

interface PlanningState {
  preferences: Partial<TripPreferences>;
  questionsAsked: string[];
  clarificationCount: number;
  awaitingConfirmation: boolean;
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
      awaitingConfirmation: false,
    };
  }

  /**
   * Handle a planning intent
   */
  async handle(
    intent: VoiceIntent,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _context: ConversationContext
  ): Promise<AgentResponse> {
    // Extract any preferences from the initial request
    this.extractPreferencesFromIntent(intent);

    // Check if we have enough information
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

    // Show confirmation before generating
    return this.showConfirmation();
  }

  /**
   * Process an answer to a clarifying question or confirmation
   */
  async processAnswer(
    transcript: string,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _context: ConversationContext
  ): Promise<AgentResponse> {
    // Check if awaiting confirmation
    if (this.state.awaitingConfirmation) {
      return this.handleConfirmationResponse(transcript);
    }

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

    // Show confirmation before generating
    return this.showConfirmation();
  }

  /**
   * Show confirmation of understood constraints
   */
  private showConfirmation(): AgentResponse {
    const prefs = this.state.preferences;
    this.state.awaitingConfirmation = true;

    // Build confirmation message
    const constraints: string[] = [];

    constraints.push(`${prefs.numDays || 2} days in Ooty`);
    constraints.push(`${prefs.pace || "moderate"} pace`);

    if (prefs.interests && prefs.interests.length > 0) {
      constraints.push(`interests in ${prefs.interests.join(", ")}`);
    }

    if (prefs.travelParty) {
      constraints.push(`traveling ${prefs.travelParty === "solo" ? "solo" : `as a ${prefs.travelParty}`}`);
    }

    if (prefs.dietaryPreference && prefs.dietaryPreference !== "any") {
      constraints.push(`${prefs.dietaryPreference} food preference`);
    }

    if (prefs.specialRequests) {
      constraints.push(`special request: ${prefs.specialRequests.slice(0, 50)}...`);
    }

    // Get seasonal info
    const seasonInfo = getSeasonInfo(prefs.startDate || new Date());

    const message = `Let me confirm your trip details: ${constraints.join(", ")}. ` +
      `The weather in Ooty is typically ${seasonInfo.typicalWeather.condition} this time of year. ` +
      `Should I create your itinerary based on these preferences? Say yes to proceed or tell me what to change.`;

    return {
      success: true,
      message,
      data: { needsClarification: true, awaitingConfirmation: true, preferences: prefs },
      shouldSpeak: true,
    };
  }

  /**
   * Handle confirmation response
   */
  private async handleConfirmationResponse(transcript: string): Promise<AgentResponse> {
    const text = transcript.toLowerCase();

    // Check for positive confirmation
    if (/yes|yeah|sure|ok|okay|proceed|go ahead|sounds good|perfect|correct|right/i.test(text)) {
      this.state.awaitingConfirmation = false;
      return this.generateItinerary();
    }

    // Check for negative/change request
    if (/no|change|modify|different|wrong|actually|wait/i.test(text)) {
      this.state.awaitingConfirmation = false;

      // Try to extract what they want to change
      for (const q of CLARIFYING_QUESTIONS) {
        const extracted = q.extract(text);
        if (extracted !== null) {
          (this.state.preferences as Record<string, unknown>)[q.key] = extracted;
        }
      }

      return {
        success: true,
        message: "No problem! What would you like to change? You can tell me about the number of days, pace, interests, or any other preferences.",
        data: { needsClarification: true },
        shouldSpeak: true,
      };
    }

    // Unclear response - ask again
    return {
      success: true,
      message: "I didn't catch that. Should I proceed with creating your itinerary, or would you like to change something?",
      data: { needsClarification: true, awaitingConfirmation: true },
      shouldSpeak: true,
    };
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

    // Extract pace from text
    if (!this.state.preferences.pace) {
      if (/relax|easy|slow|leisurely/i.test(text)) this.state.preferences.pace = "relaxed";
      else if (/pack|busy|full|lots/i.test(text)) this.state.preferences.pace = "packed";
      else if (/moderate|normal|balanced/i.test(text)) this.state.preferences.pace = "moderate";
    }

    // Extract interests from text
    if (!this.state.preferences.interests || this.state.preferences.interests.length === 0) {
      const interests: string[] = [];
      if (/nature|scenic|view|garden/i.test(text)) interests.push("nature");
      if (/food|tea|eat|chocolate/i.test(text)) interests.push("food");
      if (/culture|heritage|history|museum/i.test(text)) interests.push("culture");
      if (/adventure|trek|hike/i.test(text)) interests.push("adventure");
      if (interests.length > 0) this.state.preferences.interests = interests;
    }

    // Extract dates if mentioned - use current date as start date
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
   * Get the next clarifying question (prioritize required fields)
   */
  private getNextQuestion(missingFields: string[]): string {
    // First ask required questions
    for (const field of missingFields) {
      const questionConfig = CLARIFYING_QUESTIONS.find(
        (q) => q.key === field && q.priority === 1
      );
      if (questionConfig && !this.state.questionsAsked.includes(questionConfig.question)) {
        this.state.questionsAsked.push(questionConfig.question);
        return questionConfig.question;
      }
    }

    // Then ask optional questions if we have room
    if (this.state.clarificationCount < MAX_CLARIFICATIONS - 1) {
      for (const q of CLARIFYING_QUESTIONS.filter(q => q.priority > 1)) {
        if (!this.state.questionsAsked.includes(q.question)) {
          const value = (this.state.preferences as Record<string, unknown>)[q.key];
          if (value === undefined || value === null) {
            this.state.questionsAsked.push(q.question);
            return q.question;
          }
        }
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

      // Build the itinerary with per-POI reasoning and food preferences
      const itineraryResult = await buildItinerary({
        pois: poiResult.pois,
        numDays: preferences.numDays,
        pace: preferences.pace,
        startTime: "09:00",
        endTime: "20:00",
        travelTimeMatrix: travelTimesData.matrix,
        poiReasons: poiResult.poiReasons,
        dietaryPreference: preferences.dietaryPreference,
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

      // Generate response message with grounded explanations
      const message = this.generateItineraryMessage(itinerary, itineraryResult, poiResult.reasoning);

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
      dietaryPreference: prefs.dietaryPreference || "any",
      specialRequests: prefs.specialRequests,
    };
  }

  /**
   * Generate a human-readable message with grounded explanations
   */
  private generateItineraryMessage(
    itinerary: Itinerary,
    result: { warnings: string[]; unscheduled: unknown[] },
    reasoning?: string
  ): string {
    const { days, preferences } = itinerary;
    const totalPOIs = days.reduce((sum, day) => sum + day.blocks.length, 0);

    let message = `I've created a ${preferences.numDays}-day ${preferences.pace} itinerary with ${totalPOIs} activities. `;

    // Add grounded explanation
    if (reasoning) {
      message += reasoning + " ";
    }

    // Add highlights with reasons
    if (days.length > 0 && days[0].blocks.length > 0) {
      const firstPOI = days[0].blocks[0];
      message += `Day 1 starts with ${firstPOI.poi.name}`;
      if (firstPOI.notes) {
        message += ` - ${firstPOI.notes.split(".")[0]}.`;
      } else {
        message += ". ";
      }
    }

    // Add warnings if any
    if (result.warnings && result.warnings.length > 0) {
      message += `Note: ${result.warnings[0]} `;
    }

    message += "You can ask me to modify anything - add places, remove activities, or shuffle the order.";

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
      awaitingConfirmation: false,
    };
  }

  /**
   * Check if awaiting confirmation
   */
  isAwaitingConfirmation(): boolean {
    return this.state.awaitingConfirmation;
  }
}

// Export singleton instance
export const planningAgent = new PlanningAgent();
