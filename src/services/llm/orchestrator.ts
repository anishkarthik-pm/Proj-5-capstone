import type {
  ConversationContext,
  AgentResponse,
  VoiceIntent,
  Message,
  Itinerary,
} from "@/types";
import { classifyIntent } from "./intentClassifier";
import { planningAgent } from "./planningAgent";
import { editAgent } from "./editAgent";
import { queryAgent } from "./queryAgent";
import { generateContextualHelp } from "./conversationLLM";

interface OrchestratorState {
  context: ConversationContext;
  isWaitingForClarification: boolean;
  lastIntent: VoiceIntent | null;
}

/**
 * Main LLM Orchestrator - routes voice input to appropriate agents
 */
export class Orchestrator {
  private state: OrchestratorState;

  constructor() {
    this.state = {
      context: {
        messages: [],
        currentItinerary: null,
        preferences: null,
        pendingQuestion: null,
        clarificationCount: 0,
      },
      isWaitingForClarification: false,
      lastIntent: null,
    };
  }

  /**
   * Main entry point for handling voice input
   */
  async handleVoiceInput(transcript: string): Promise<AgentResponse> {
    // Add user message to context
    this.addMessage("user", transcript);

    // 1. Classify the intent first to see if it's a "fresh" command
    const intent = await classifyIntent(
      transcript,
      this.state.context.currentItinerary !== null
    );

    // 2. Identify if this is a Query (Info button) or a definitive Edit command
    const isQuery = intent.type === "query" || /why|what|how|explain|tell me|details/i.test(transcript);
    const isDefinitiveEdit = intent.type === "edit" && (intent.action !== undefined || intent.dayNumber !== undefined);

    // 3. If it's a fresh Query or definitive Edit, we MUST clear the pending edit state
    // This fixed the bug where clicking "Info" would trigger "I didn't catch which option you want"
    if (isQuery || isDefinitiveEdit) {
      if (editAgent.hasPendingModification()) {
        console.log("Forcibly clearing pending edit state due to new definitive intent:", intent.type);
        editAgent.clearPending();
      }
    }

    // 4. Check if we're waiting for a clarification answer for planning
    if (
      this.state.isWaitingForClarification &&
      this.state.lastIntent?.type === "plan" &&
      !isQuery && !isDefinitiveEdit
    ) {
      return this.handleClarificationAnswer(transcript);
    }

    // 5. Check if editAgent has a pending modification (two-step flow)
    // Only proceed if it's not a fresh Query or definitive Edit that already cleared it
    if (editAgent.hasPendingModification() && this.state.context.currentItinerary) {
      const editIntent: VoiceIntent = {
        type: "edit",
        rawText: transcript,
        confidence: 1.0,
      };
      this.state.lastIntent = editIntent;
      const response = await this.handleEditIntent(editIntent);
      this.addMessage("assistant", response.message, editIntent, response.sources);

      // Update itinerary if returned from edit operation
      const editData = response.data as { itinerary?: Itinerary } | undefined;
      if (editData?.itinerary) {
        this.state.context.currentItinerary = editData.itinerary;
      }

      return response;
    }

    // Continue with the classified intent
    this.state.lastIntent = intent;

    // Route to appropriate agent
    let response: AgentResponse;

    switch (intent.type) {
      case "plan":
        response = await this.handlePlanningIntent(intent);
        break;

      case "edit":
        response = await this.handleEditIntent(intent);
        break;

      case "query":
        response = await this.handleQueryIntent(intent);
        break;

      case "confirm":
        response = await this.handleConfirmation(intent);
        break;

      case "closure":
        response = await this.handleClosureIntent();
        break;

      case "unclear":
      default:
        // Double check if query keywords are present even if score was low
        if (isQuery) {
          response = await this.handleQueryIntent({
            type: "query",
            rawText: transcript,
            confidence: 0.5
          });
        } else {
          response = await this.handleUnclearIntent(transcript);
        }
        break;
    }

    // Add assistant message to context
    this.addMessage("assistant", response.message, intent, response.sources);

    // Update state based on response
    const data = response.data as { needsClarification?: boolean; itinerary?: Itinerary } | undefined;
    if (data?.needsClarification) {
      this.state.isWaitingForClarification = true;
      this.state.context.pendingQuestion = response.message;
    } else {
      this.state.isWaitingForClarification = false;
      this.state.context.pendingQuestion = null;
    }

    // Update itinerary if returned
    if (data?.itinerary) {
      this.state.context.currentItinerary = data.itinerary;
    }

    return response;
  }

  /**
   * Handle planning intent
   */
  private async handlePlanningIntent(intent: VoiceIntent): Promise<AgentResponse> {
    // If there's an existing itinerary, confirm before creating new one
    if (this.state.context.currentItinerary) {
      // Check if they explicitly want a new trip
      if (/new|different|another|fresh|start over/.test(intent.rawText.toLowerCase())) {
        planningAgent.reset();
        this.state.context.currentItinerary = null;
      } else {
        return {
          success: true,
          message:
            "You already have an itinerary. Would you like to modify it, or start planning a completely new trip?",
          shouldSpeak: true,
        };
      }
    }

    return planningAgent.handle(intent, this.state.context);
  }

  /**
   * Handle edit intent
   */
  private async handleEditIntent(intent: VoiceIntent): Promise<AgentResponse> {
    if (!this.state.context.currentItinerary) {
      return {
        success: false,
        message:
          "I don't have an itinerary to edit yet. Would you like me to help you plan a trip to Ooty first?",
        shouldSpeak: true,
      };
    }

    return editAgent.handle(intent, this.state.context);
  }

  /**
   * Handle query intent
   */
  private async handleQueryIntent(intent: VoiceIntent): Promise<AgentResponse> {
    return queryAgent.handle(intent, this.state.context);
  }

  /**
   * Handle closure intent (e.g., "thank you", "that's it")
   */
  private async handleClosureIntent(): Promise<AgentResponse> {
    const messages = [
      "You're very welcome! I'm glad I could help you plan your Ooty adventure. I've opened your finalized itinerary in a new tab for you to save or print. Have an amazing trip!",
      "It was my pleasure! I hope you have a fantastic time exploring Ooty. Your PDF itinerary is now ready and opening in a separate tab. Bon voyage!",
      "Happy to help! Ooty is a beautiful place, and I'm sure you'll have a wonderful time. I've generated your PDF itinerary for you. Enjoy your trip!",
    ];

    const randomMessage = messages[Math.floor(Math.random() * messages.length)];

    return {
      success: true,
      message: randomMessage,
      shouldSpeak: true,
      data: {
        shouldExportPdf: true,
        itinerary: this.state.context.currentItinerary || undefined,
      },
    };
  }

  /**
   * Handle confirmation
   */
  private async handleConfirmation(intent: VoiceIntent): Promise<AgentResponse> {
    const text = intent.rawText.toLowerCase();

    // Check for negative confirmation
    if (/no|don't|not|cancel|nevermind/.test(text)) {
      this.state.isWaitingForClarification = false;
      this.state.context.pendingQuestion = null;

      return {
        success: true,
        message: "No problem. What would you like to do instead?",
        shouldSpeak: true,
      };
    }

    // Check for "thank you" after itinerary is finalized - trigger PDF export
    // (This is now handled by the 'closure' intent, but keeping a simpler check here for robustness if needed)
    if ((/thank|thanks|thank you|appreciate/.test(text)) && this.state.context.currentItinerary) {
      return this.handleClosureIntent();
    }

    // Positive confirmation
    if (this.state.context.currentItinerary) {
      return {
        success: true,
        message:
          "Great! Your itinerary is confirmed. Let me know if you'd like any changes.",
        shouldSpeak: true,
      };
    }

    return {
      success: true,
      message: "Sure! What would you like me to help you with?",
      shouldSpeak: true,
    };
  }

  /**
   * Handle unclear intent - uses LLM for contextual, helpful responses
   */
  private async handleUnclearIntent(transcript: string): Promise<AgentResponse> {
    // Build conversation history for context
    const conversationHistory = this.state.context.messages.slice(-6).map(m => ({
      role: m.role,
      content: m.content,
    }));

    // Use LLM to generate contextual help
    const helpMessage = await generateContextualHelp({
      userText: transcript,
      currentItinerary: this.state.context.currentItinerary,
      conversationHistory,
    });

    return {
      success: true,
      message: helpMessage,
      shouldSpeak: true,
    };
  }

  /**
   * Handle answer to clarification question
   */
  private async handleClarificationAnswer(transcript: string): Promise<AgentResponse> {
    this.state.context.clarificationCount++;

    const response = await planningAgent.processAnswer(transcript, this.state.context);

    // Add to message history
    this.addMessage("assistant", response.message);

    // Update state
    const responseData = response.data as { needsClarification?: boolean; itinerary?: Itinerary } | undefined;
    if (responseData?.needsClarification) {
      this.state.context.pendingQuestion = response.message;
    } else {
      this.state.isWaitingForClarification = false;
      this.state.context.pendingQuestion = null;
    }

    if (responseData?.itinerary) {
      this.state.context.currentItinerary = responseData.itinerary;
    }

    return response;
  }

  /**
   * Add a message to the conversation context
   */
  private addMessage(
    role: "user" | "assistant",
    content: string,
    intent?: VoiceIntent,
    sources?: AgentResponse["sources"]
  ): void {
    const message: Message = {
      id: `msg-${Date.now()}`,
      role,
      content,
      timestamp: new Date(),
      intent,
      sources,
    };

    this.state.context.messages.push(message);

    // Keep only last 20 messages to manage context size
    if (this.state.context.messages.length > 20) {
      this.state.context.messages = this.state.context.messages.slice(-20);
    }
  }

  /**
   * Get the current conversation context
   */
  getContext(): ConversationContext {
    return this.state.context;
  }

  /**
   * Get the current itinerary
   */
  getItinerary(): Itinerary | null {
    return this.state.context.currentItinerary;
  }

  /**
   * Set an itinerary (for loading saved itineraries)
   */
  setItinerary(itinerary: Itinerary): void {
    this.state.context.currentItinerary = itinerary;
    this.state.context.preferences = itinerary.preferences;
  }

  /**
   * Clear the current itinerary
   */
  clearItinerary(): void {
    this.state.context.currentItinerary = null;
    this.state.context.preferences = null;
    planningAgent.reset();
  }

  /**
   * Reset the orchestrator state
   */
  reset(): void {
    this.state = {
      context: {
        messages: [],
        currentItinerary: null,
        preferences: null,
        pendingQuestion: null,
        clarificationCount: 0,
      },
      isWaitingForClarification: false,
      lastIntent: null,
    };
    planningAgent.reset();
  }
}

// Export singleton instance
export const orchestrator = new Orchestrator();

// Convenience function
export async function handleVoiceInput(transcript: string): Promise<AgentResponse> {
  return orchestrator.handleVoiceInput(transcript);
}

export default Orchestrator;
