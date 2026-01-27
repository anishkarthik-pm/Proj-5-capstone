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

    // Check if we're waiting for a clarification answer
    if (
      this.state.isWaitingForClarification &&
      this.state.lastIntent?.type === "plan"
    ) {
      return this.handleClarificationAnswer(transcript);
    }

    // Classify the intent
    const intent = await classifyIntent(
      transcript,
      this.state.context.currentItinerary !== null
    );

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

      case "unclear":
      default:
        response = await this.handleUnclearIntent(transcript);
        break;
    }

    // Add assistant message to context
    this.addMessage("assistant", response.message, intent, response.sources);

    // Update state based on response
    if (response.data?.needsClarification) {
      this.state.isWaitingForClarification = true;
      this.state.context.pendingQuestion = response.message;
    } else {
      this.state.isWaitingForClarification = false;
      this.state.context.pendingQuestion = null;
    }

    // Update itinerary if returned
    if (response.data?.itinerary) {
      this.state.context.currentItinerary = response.data.itinerary as Itinerary;
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

    // Positive confirmation
    if (this.state.context.currentItinerary) {
      return {
        success: true,
        message:
          "Great! Your itinerary is confirmed. You can ask me to email it to you, or let me know if you'd like any changes.",
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
   * Handle unclear intent
   */
  private async handleUnclearIntent(transcript: string): Promise<AgentResponse> {
    // Try to be helpful based on context
    if (!this.state.context.currentItinerary) {
      return {
        success: true,
        message:
          "I'm here to help you plan a trip to Ooty. You can say something like 'Plan a 3-day trip to Ooty' or ask me about places to visit.",
        shouldSpeak: true,
      };
    }

    return {
      success: true,
      message:
        "I'm not sure what you'd like me to do. You can ask me to modify your itinerary, explain why I chose certain places, or answer questions about Ooty.",
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
    if (response.data?.needsClarification) {
      this.state.context.pendingQuestion = response.message;
    } else {
      this.state.isWaitingForClarification = false;
      this.state.context.pendingQuestion = null;
    }

    if (response.data?.itinerary) {
      this.state.context.currentItinerary = response.data.itinerary as Itinerary;
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
