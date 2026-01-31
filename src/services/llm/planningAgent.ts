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
import { getRecommendedVehicle, formatCostBreakdown } from "@/services/mcp/travelCostCalculator";
import travelTimesData from "@/data/ooty-travel-times.json";
import {
  generateItineraryResponse,
  generateClarifyingQuestion,
  generateConfirmationMessage,
} from "./conversationLLM";

// Professional travel agent style clarifying questions
const CLARIFYING_QUESTIONS = [
  {
    key: "startDate",
    question: "What is your travel date? When are you planning to visit Ooty?",
    priority: 1, // Required
    extract: (text: string) => {
      // Try to parse date patterns
      const today = new Date();
      const datePatterns = [
        /(\d{1,2})[\/\-](\d{1,2})[\/\-]?(\d{2,4})?/i, // DD/MM or DD/MM/YYYY
        /(\d{1,2})(?:st|nd|rd|th)?\s*(?:of\s*)?(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i,
        /(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\s*(\d{1,2})(?:st|nd|rd|th)?/i,
      ];

      // Check for relative dates
      if (/today/i.test(text)) return today;
      if (/tomorrow/i.test(text)) {
        const d = new Date(today);
        d.setDate(d.getDate() + 1);
        return d;
      }
      if (/next week/i.test(text)) {
        const d = new Date(today);
        d.setDate(d.getDate() + 7);
        return d;
      }
      if (/this weekend/i.test(text)) {
        const d = new Date(today);
        const daysUntilSat = (6 - d.getDay() + 7) % 7 || 7;
        d.setDate(d.getDate() + daysUntilSat);
        return d;
      }

      // Try date patterns
      for (const pattern of datePatterns) {
        const match = text.match(pattern);
        if (match) {
          try {
            const months: Record<string, number> = {
              jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
              jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11
            };
            let day: number, month: number, year: number = today.getFullYear();

            if (match[1] && !isNaN(parseInt(match[1])) && match[2] && !isNaN(parseInt(match[2]))) {
              day = parseInt(match[1]);
              month = parseInt(match[2]) - 1;
              if (match[3]) year = parseInt(match[3].length === 2 ? '20' + match[3] : match[3]);
            } else if (match[1] && !isNaN(parseInt(match[1]))) {
              day = parseInt(match[1]);
              month = months[match[2].toLowerCase().slice(0, 3)];
            } else {
              month = months[match[1].toLowerCase().slice(0, 3)];
              day = parseInt(match[2]);
            }

            return new Date(year, month, day);
          } catch {
            return null;
          }
        }
      }
      return null;
    },
  },
  {
    key: "numDays",
    question: "How many days will you be staying in Ooty?",
    priority: 1, // Required
    extract: (text: string) => {
      const match = text.match(/(\d+)\s*(?:day|days|nights?)?/i);
      return match ? parseInt(match[1], 10) : null;
    },
  },
  {
    key: "groupSize",
    question: "How many people are traveling? This helps me arrange the right vehicle and hotel rooms.",
    priority: 1, // Required - needed for vehicle and room calculation
    extract: (text: string) => {
      // Look for numbers
      const match = text.match(/(\d+)\s*(?:people|person|of us|members|travelers|adults?|guests?)?/i);
      if (match) return parseInt(match[1], 10);
      // Handle word forms
      if (/alone|solo|just me|myself|single/i.test(text)) return 1;
      if (/two|couple|2 of us|both of us/i.test(text)) return 2;
      if (/three|3 of us/i.test(text)) return 3;
      if (/four|4 of us/i.test(text)) return 4;
      if (/five|5 of us/i.test(text)) return 5;
      if (/six|6 of us/i.test(text)) return 6;
      if (/seven|7 of us/i.test(text)) return 7;
      if (/eight|8 of us/i.test(text)) return 8;
      return null;
    },
  },
  {
    key: "ticketsBooked",
    question: "Have you already booked your tickets to reach Ooty, or do you need help with that?",
    priority: 1, // Required
    extract: (text: string) => {
      if (/yes|booked|done|confirmed|already|have tickets?|got tickets?/i.test(text)) return true;
      if (/no|not yet|need help|haven't|need to book|planning to/i.test(text)) return false;
      if (/self.?drive|driving|own car|by car/i.test(text)) return true; // Self-drive counts as booked
      return null;
    },
  },
  {
    key: "arrivalPoint",
    question: "How will you be arriving - by flight to Coimbatore airport, train to Mettupalayam/Coimbatore, bus, or self-drive?",
    priority: 1, // Required for pickup planning
    extract: (text: string) => {
      if (/flight|fly|airport|plane/i.test(text)) return "airport";
      if (/train|rail|railway|mettupalayam/i.test(text)) return "railway";
      if (/bus|coach/i.test(text)) return "bus";
      if (/self.?drive|own car|driving|car|bike|two wheeler/i.test(text)) return "self-drive";
      return null;
    },
  },
  {
    key: "needsPickupDrop",
    question: "Would you like me to arrange pickup and drop from your arrival point?",
    priority: 2, // Optional but helpful
    extract: (text: string) => {
      if (/yes|please|need|want|arrange|book|would like|definitely/i.test(text)) return true;
      if (/no|not needed|self|own|don't need|we'll manage|will manage/i.test(text)) return false;
      return null;
    },
  },
  {
    key: "hotelCategory",
    question: "What type of hotel do you prefer - 3-star (budget-friendly), 4-star (comfortable), or 5-star (luxury)?",
    priority: 1, // Required for hotel booking
    extract: (text: string) => {
      if (/5.?star|luxury|premium|best|high.?end|five star/i.test(text)) return "5-star";
      if (/4.?star|comfort|good|nice|four star/i.test(text)) return "4-star";
      if (/3.?star|budget|economy|basic|affordable|three star|cheap/i.test(text)) return "3-star";
      return null;
    },
  },
  {
    key: "dietaryPreference",
    question: "For food and hotel dining, do you prefer pure vegetarian, or are you open to non-veg options?",
    priority: 1, // Required - affects hotel and restaurant suggestions
    extract: (text: string) => {
      if (/pure veg|vegetarian|veg only|no meat|no non-?veg|only veg/i.test(text)) return "veg";
      if (/non-?veg|meat|chicken|fish|egg|both|any|no preference|anything|don't mind|either/i.test(text)) return "non-veg";
      return null;
    },
  },
  {
    key: "interests",
    question: "What kind of experiences interest you - nature and viewpoints, tea gardens and food, heritage and culture, or adventure activities?",
    priority: 2, // Optional
    extract: (text: string) => {
      const interests: string[] = [];
      if (/nature|scenic|view|landscape|garden|mountain|lake|waterfall/i.test(text)) interests.push("nature");
      if (/food|tea|eat|restaurant|chocolate|cuisine|cafe/i.test(text)) interests.push("food");
      if (/culture|heritage|history|museum|church|temple|tribal/i.test(text)) interests.push("culture");
      if (/adventure|trek|hike|activity|sport|boating|biking/i.test(text)) interests.push("adventure");
      if (/relax|peaceful|quiet|spa|leisure/i.test(text)) interests.push("relaxation");
      if (/everything|all|mix|varied|bit of everything/i.test(text)) {
        interests.push("nature", "food", "culture");
      }
      return interests.length > 0 ? interests : null;
    },
  },
  {
    key: "pace",
    question: "Would you prefer a relaxed trip with fewer activities, or a packed schedule to see as much as possible?",
    priority: 2, // Optional
    extract: (text: string) => {
      if (/relax|easy|slow|leisurely|chill|take it easy|calm/i.test(text)) return "relaxed";
      if (/pack|busy|full|lots|many|maximum|everything|see all/i.test(text)) return "packed";
      if (/moderate|normal|regular|balanced|mix|in between/i.test(text)) return "moderate";
      return null;
    },
  },
  {
    key: "specialRequests",
    question: "Any must-visit places or special requirements I should keep in mind?",
    priority: 3, // Optional
    extract: (text: string) => {
      if (/no|none|nothing|that's it|nope|not really|that's all/i.test(text)) return "";
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
      // Use LLM for natural question generation
      let question: string;
      try {
        question = await generateClarifyingQuestion({
          questionType: missingFields[0],
          previousAnswers: this.state.preferences,
          questionNumber: this.state.clarificationCount + 1,
          maxQuestions: MAX_CLARIFICATIONS,
        });
      } catch {
        question = this.getNextQuestion(missingFields);
      }
      this.state.clarificationCount++;
      this.state.questionsAsked.push(question);

      return {
        success: true,
        message: question,
        data: { needsClarification: true, missingFields },
        shouldSpeak: true,
      };
    }

    // Show confirmation before generating
    return await this.showConfirmation();
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
      // Use LLM for natural question generation
      let question: string;
      try {
        question = await generateClarifyingQuestion({
          questionType: missingFields[0],
          previousAnswers: this.state.preferences,
          questionNumber: this.state.clarificationCount + 1,
          maxQuestions: MAX_CLARIFICATIONS,
        });
      } catch {
        question = this.getNextQuestion(missingFields);
      }
      this.state.clarificationCount++;
      this.state.questionsAsked.push(question);

      return {
        success: true,
        message: question,
        data: { needsClarification: true, missingFields },
        shouldSpeak: true,
      };
    }

    // Show confirmation before generating
    return await this.showConfirmation();
  }

  /**
   * Show confirmation of understood constraints with all correlations
   */
  private async showConfirmation(): Promise<AgentResponse> {
    const prefs = this.state.preferences;
    this.state.awaitingConfirmation = true;

    // Get seasonal info
    const seasonInfo = getSeasonInfo(prefs.startDate || new Date());

    // Calculate correlations based on group size
    const groupSize = prefs.groupSize || 2;
    const recommendedVehicle = getRecommendedVehicle(groupSize);
    const roomsNeeded = Math.ceil(groupSize / 2); // 2 people per room

    // Build comprehensive preferences object for confirmation
    const prefsForLLM = {
      // Travel dates
      startDate: prefs.startDate,
      numDays: prefs.numDays || 2,
      // Group details
      groupSize,
      roomsNeeded,
      // Transport
      ticketsBooked: prefs.ticketsBooked,
      arrivalPoint: prefs.arrivalPoint,
      needsPickupDrop: prefs.needsPickupDrop,
      vehicleRecommendation: recommendedVehicle,
      // Accommodation
      hotelCategory: prefs.hotelCategory || "4-star",
      // Preferences
      dietaryPreference: prefs.dietaryPreference || "any",
      interests: prefs.interests,
      pace: prefs.pace || "moderate",
    };

    // Use LLM to generate natural confirmation message
    let message: string;
    try {
      message = await generateConfirmationMessage({
        preferences: prefsForLLM,
        weatherInfo: seasonInfo.typicalWeather,
      });
    } catch {
      // Fallback to professional travel agent style confirmation
      const dateStr = prefs.startDate
        ? (prefs.startDate as Date).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })
        : "soon";

      const parts: string[] = [];
      parts.push(`Travel date: ${dateStr}`);
      parts.push(`Duration: ${prefs.numDays || 2} days`);
      parts.push(`Guests: ${groupSize} (${roomsNeeded} ${roomsNeeded === 1 ? "room" : "rooms"})`);
      parts.push(`Vehicle: ${recommendedVehicle}`);
      parts.push(`Hotel: ${prefs.hotelCategory || "4-star"}`);
      if (prefs.dietaryPreference) {
        parts.push(`Food: ${prefs.dietaryPreference === "veg" ? "Pure Vegetarian" : "Veg & Non-veg"}`);
      }
      if (prefs.needsPickupDrop) {
        parts.push(`Pickup/drop: ${prefs.arrivalPoint || "arranged"}`);
      }

      message = `Here's your trip summary:\n${parts.join("\n")}\n\nWeather in Ooty will be ${seasonInfo.typicalWeather.condition} around ${seasonInfo.typicalWeather.temperature}°C. Should I proceed with creating your itinerary?`;
    }

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
      const daysMatch = text.match(/(\d+)\s*(?:day|days|nights?)/i);
      if (daysMatch) {
        this.state.preferences.numDays = parseInt(daysMatch[1], 10);
      }
    }

    // Extract group size from text
    if (!this.state.preferences.groupSize) {
      const sizeMatch = text.match(/(\d+)\s*(?:people|person|of us|members|travelers|guests?)/i);
      if (sizeMatch) {
        this.state.preferences.groupSize = parseInt(sizeMatch[1], 10);
      } else if (/alone|solo|just me|myself/i.test(text)) {
        this.state.preferences.groupSize = 1;
      } else if (/two|couple|2 of us/i.test(text)) {
        this.state.preferences.groupSize = 2;
      }
    }

    // Extract hotel preference
    if (!this.state.preferences.hotelCategory) {
      if (/5.?star|luxury|premium/i.test(text)) this.state.preferences.hotelCategory = "5-star";
      else if (/4.?star|comfort/i.test(text)) this.state.preferences.hotelCategory = "4-star";
      else if (/3.?star|budget|cheap/i.test(text)) this.state.preferences.hotelCategory = "3-star";
    }

    // Extract dietary preference
    if (!this.state.preferences.dietaryPreference) {
      if (/pure veg|vegetarian|veg only/i.test(text)) this.state.preferences.dietaryPreference = "veg";
      else if (/non-?veg|meat|chicken|fish/i.test(text)) this.state.preferences.dietaryPreference = "non-veg";
    }

    // Extract arrival mode
    if (!this.state.preferences.arrivalPoint) {
      if (/flight|fly|airport/i.test(text)) this.state.preferences.arrivalPoint = "airport";
      else if (/train|rail/i.test(text)) this.state.preferences.arrivalPoint = "railway";
      else if (/bus/i.test(text)) this.state.preferences.arrivalPoint = "bus";
      else if (/self.?drive|own car|driving/i.test(text)) this.state.preferences.arrivalPoint = "self-drive";
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

    // Note: Don't set default startDate here - we want to ask the user
  }

  /**
   * Get list of missing required fields - prioritized for travel agent flow
   */
  private getMissingFields(): string[] {
    // Priority order: essential booking info first, then preferences
    const required = [
      "startDate",       // When are they traveling?
      "numDays",         // How long?
      "groupSize",       // How many people? (needed for rooms & vehicle)
      "ticketsBooked",   // Do they have tickets?
      "arrivalPoint",    // How are they arriving?
      "hotelCategory",   // What hotel tier?
      "dietaryPreference", // Food preference (affects hotel & restaurant suggestions)
    ];

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
   * Get the next clarifying question (prioritize required fields in travel agent order)
   */
  private getNextQuestion(missingFields: string[]): string {
    // Ask questions in travel agent priority order
    for (const field of missingFields) {
      const questionConfig = CLARIFYING_QUESTIONS.find((q) => q.key === field);
      if (questionConfig && !this.state.questionsAsked.includes(questionConfig.question)) {
        return questionConfig.question;
      }
    }

    // Then ask optional questions (interests, pace, special requests) if we have room
    if (this.state.clarificationCount < MAX_CLARIFICATIONS - 1) {
      const optionalFields = ["interests", "pace", "needsPickupDrop", "specialRequests"];
      for (const field of optionalFields) {
        const questionConfig = CLARIFYING_QUESTIONS.find((q) => q.key === field);
        if (questionConfig && !this.state.questionsAsked.includes(questionConfig.question)) {
          const value = (this.state.preferences as Record<string, unknown>)[field];
          if (value === undefined || value === null) {
            return questionConfig.question;
          }
        }
      }
    }

    // Fallback
    return "Is there anything specific you'd like me to include in your Ooty trip?";
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

      // Build the itinerary with per-POI reasoning, food preferences, and travel costs
      const itineraryResult = await buildItinerary({
        pois: poiResult.pois,
        numDays: preferences.numDays,
        pace: preferences.pace,
        startTime: "09:00",
        endTime: "20:00",
        travelTimeMatrix: travelTimesData.matrix,
        poiReasons: poiResult.poiReasons,
        dietaryPreference: preferences.dietaryPreference,
        startDate: preferences.startDate,
        groupSize: preferences.groupSize,
        vehicleType: preferences.vehicleType,
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

      // Generate response message with grounded explanations using LLM
      const message = await this.generateItineraryMessage(itinerary, itineraryResult, poiResult.reasoning);

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
   * Finalize preferences with defaults and calculated correlations
   */
  private finalizePreferences(): TripPreferences {
    const prefs = this.state.preferences;

    // Calculate group size from travel party if not explicitly set
    const groupSize = prefs.groupSize || (prefs.travelParty === "solo" ? 1 : prefs.travelParty === "couple" ? 2 : 4);

    // Calculate rooms needed (2 people per room)
    const roomsNeeded = Math.ceil(groupSize / 2);

    // Get recommended vehicle based on group size
    const vehicleType = getRecommendedVehicle(groupSize);

    // Calculate end date from start date and number of days
    const startDate = prefs.startDate || new Date();
    const numDays = prefs.numDays || 2;
    const endDate = new Date(startDate.getTime() + numDays * 24 * 60 * 60 * 1000);

    // Map hotel category to budget
    const budgetFromHotel = prefs.hotelCategory === "5-star" ? "luxury" :
                            prefs.hotelCategory === "3-star" ? "budget" : "moderate";

    return {
      city: "ooty",
      numDays,
      startDate,
      endDate,
      interests: prefs.interests || ["nature", "food"],
      pace: prefs.pace || "moderate",
      budget: prefs.budget || budgetFromHotel,
      mobility: prefs.mobility || "full",
      travelParty: prefs.travelParty || (groupSize === 1 ? "solo" : groupSize === 2 ? "couple" : "group"),
      groupSize,
      vehicleType,
      hotelCategory: prefs.hotelCategory || "4-star",
      dietaryPreference: prefs.dietaryPreference || "any",
      specialRequests: prefs.specialRequests,
      // New travel agent fields
      ticketsBooked: prefs.ticketsBooked,
      needsPickupDrop: prefs.needsPickupDrop,
      arrivalPoint: prefs.arrivalPoint,
      roomsNeeded,
    };
  }

  /**
   * Generate a human-readable message with grounded explanations
   */
  private async generateItineraryMessage(
    itinerary: Itinerary,
    result: { warnings: string[]; unscheduled: unknown[] },
    reasoning?: string
  ): Promise<string> {
    const { days, preferences } = itinerary;

    // Calculate total travel cost
    const totalDistanceKm = days.reduce((sum, d) => sum + (d.totalDistanceKm || 0), 0);
    const totalTravelCost = days.reduce((sum, d) => sum + (d.travelCostInr || 0), 0);

    // Get highlights for LLM
    const highlights: string[] = [];
    if (days.length > 0) {
      for (const day of days) {
        if (day.blocks.length > 0) {
          highlights.push(`Day ${day.dayNumber}: ${day.blocks.map(b => b.poi.name).slice(0, 2).join(", ")}`);
        }
      }
    }

    // Try LLM-powered response
    try {
      const llmMessage = await generateItineraryResponse({
        itinerary,
        userRequest: reasoning || "plan a trip to Ooty",
        highlights: highlights.slice(0, 3),
        warnings: result.warnings,
      });

      // Append travel cost info
      if (totalTravelCost > 0 && preferences.vehicleType) {
        return `${llmMessage} Estimated travel cost: ${formatCostBreakdown({ totalDistanceKm, vehicleType: preferences.vehicleType, numDays: preferences.numDays })}.`;
      }

      return llmMessage;
    } catch {
      // Fallback to generated message
      const totalPOIs = days.reduce((sum, day) => sum + day.blocks.length, 0);
      let message = `I've created a ${preferences.numDays}-day ${preferences.pace} itinerary with ${totalPOIs} activities. `;

      if (reasoning) {
        message += reasoning + " ";
      }

      if (days.length > 0 && days[0].blocks.length > 0) {
        const firstPOI = days[0].blocks[0];
        message += `Day 1 starts with ${firstPOI.poi.name}`;
        if (firstPOI.notes) {
          message += ` - ${firstPOI.notes.split(".")[0]}.`;
        } else {
          message += ". ";
        }
      }

      if (result.warnings && result.warnings.length > 0) {
        message += `Note: ${result.warnings[0]} `;
      }

      if (totalTravelCost > 0) {
        message += `Estimated travel: ${Math.round(totalDistanceKm)}km, around ₹${totalTravelCost}. `;
      }

      message += "You can ask me to modify anything - add places, remove activities, or shuffle the order.";

      return message;
    }
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
