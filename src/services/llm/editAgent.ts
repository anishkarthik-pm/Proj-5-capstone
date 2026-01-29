import type {
  VoiceIntent,
  Itinerary,
  DayPlan,
  TimeBlock,
  ConversationContext,
  AgentResponse,
  POI,
} from "@/types";
import { searchPOIs } from "@/services/mcp/poiSearch";
import travelTimesData from "@/data/ooty-travel-times.json";
import {
  generateEditResponse,
  generateSuggestionResponse,
  generatePOIReasoning,
  parseEditIntent,
  type ParsedEditIntent,
} from "./conversationLLM";

interface EditOperation {
  type: "add" | "remove" | "swap" | "replace" | "move" | "adjust_pace" | "swap_days" | "suggest" | "replace_with_options";
  dayNumber: number;
  blockId?: string;
  timeSlot?: "morning" | "afternoon" | "evening";
  newPOI?: POI;
  targetDayNumber?: number;
  description: string;
  replacementOptions?: POI[];
}

// Pending modification state for two-step flow
interface PendingModification {
  type: "awaiting_replacement_choice" | "awaiting_slot_choice";
  dayNumber: number;
  blockToReplace?: TimeBlock;
  options?: POI[];
  selectedPOI?: POI;
}

/**
 * Edit Agent - handles modification requests to existing itineraries
 */
export class EditAgent {
  private pendingModification: PendingModification | null = null;
  /**
   * Handle an edit intent
   */
  async handle(
    intent: VoiceIntent,
    context: ConversationContext
  ): Promise<AgentResponse> {
    const { currentItinerary } = context;

    if (!currentItinerary) {
      return {
        success: false,
        message:
          "I don't have an itinerary to edit yet. Would you like me to create one first?",
        shouldSpeak: true,
      };
    }

    // Check if there's a pending modification that needs a response
    if (this.pendingModification) {
      return this.handlePendingModification(intent, currentItinerary);
    }

    try {
      // Parse the edit request
      const operation = await this.parseEditOperation(intent, currentItinerary);

      if (!operation) {
        return {
          success: false,
          message:
            "I'm not sure what you'd like to change. Could you be more specific? For example, 'Remove the morning activity on Day 2' or 'Add a tea garden to Day 1'.",
          shouldSpeak: true,
        };
      }

      // Apply the edit
      const result = await this.applyEdit(currentItinerary, operation);

      return result;
    } catch (error) {
      console.error("Edit error:", error);
      return {
        success: false,
        message:
          "I had trouble making that change. Could you try rephrasing your request?",
        shouldSpeak: true,
      };
    }
  }

  /**
   * Handle response to a pending modification (two-step flow)
   */
  private async handlePendingModification(
    intent: VoiceIntent,
    itinerary: Itinerary
  ): Promise<AgentResponse> {
    const pending = this.pendingModification!;
    const text = intent.rawText.toLowerCase();

    // User wants to cancel
    if (/cancel|nevermind|no|stop|forget/i.test(text)) {
      this.pendingModification = null;
      return {
        success: true,
        message: "No problem, I've cancelled that change. What else would you like to do?",
        shouldSpeak: true,
      };
    }

    if (pending.type === "awaiting_replacement_choice" && pending.options) {
      // User is selecting from options
      let selectedPOI: POI | undefined;

      // Check for number selection (e.g., "1", "option 1", "first one")
      const numberMatch = text.match(/(\d+)|first|second|third|fourth|fifth/i);
      if (numberMatch) {
        const numberMap: Record<string, number> = { first: 1, second: 2, third: 3, fourth: 4, fifth: 5 };
        const num = numberMatch[1] ? parseInt(numberMatch[1], 10) : numberMap[numberMatch[0].toLowerCase()];
        if (num >= 1 && num <= pending.options.length) {
          selectedPOI = pending.options[num - 1];
        }
      }

      // Check for name match
      if (!selectedPOI) {
        for (const option of pending.options) {
          if (text.includes(option.name.toLowerCase())) {
            selectedPOI = option;
            break;
          }
        }
      }

      if (selectedPOI) {
        // Now ask for the slot
        this.pendingModification = {
          type: "awaiting_slot_choice",
          dayNumber: pending.dayNumber,
          blockToReplace: pending.blockToReplace,
          selectedPOI,
        };

        const day = itinerary.days[pending.dayNumber - 1];
        const slots = day.blocks.map(b => `${b.timeSlot} (${b.poi.name})`).join(", ");

        return {
          success: true,
          message: `Great choice! ${selectedPOI.name} it is. Which time slot would you like to replace? Your Day ${pending.dayNumber} currently has: ${slots}. Just say "morning", "afternoon", or "evening".`,
          data: { needsClarification: true, awaitingSlotChoice: true },
          shouldSpeak: true,
        };
      } else {
        return {
          success: false,
          message: "I didn't catch which option you want. Please say the number (1, 2, 3...) or the name of the place.",
          data: { needsClarification: true },
          shouldSpeak: true,
        };
      }
    }

    if (pending.type === "awaiting_slot_choice" && pending.selectedPOI) {
      // User is selecting a slot
      let targetSlot: "morning" | "afternoon" | "evening" | undefined;

      if (/morning/i.test(text)) targetSlot = "morning";
      else if (/afternoon/i.test(text)) targetSlot = "afternoon";
      else if (/evening/i.test(text)) targetSlot = "evening";

      if (targetSlot) {
        const day = itinerary.days[pending.dayNumber - 1];
        const blockToReplace = day.blocks.find(b => b.timeSlot === targetSlot);

        if (blockToReplace) {
          // Clear pending and execute the replacement
          this.pendingModification = null;

          const operation: EditOperation = {
            type: "replace",
            dayNumber: pending.dayNumber,
            blockId: blockToReplace.id,
            timeSlot: targetSlot,
            newPOI: pending.selectedPOI,
            description: `Replace ${blockToReplace.poi.name} with ${pending.selectedPOI.name}`,
          };

          return this.applyEdit(itinerary, operation);
        } else {
          return {
            success: false,
            message: `There's no activity in the ${targetSlot} slot on Day ${pending.dayNumber}. Please choose morning, afternoon, or evening.`,
            data: { needsClarification: true },
            shouldSpeak: true,
          };
        }
      } else {
        return {
          success: false,
          message: "Please say which slot to replace: morning, afternoon, or evening.",
          data: { needsClarification: true },
          shouldSpeak: true,
        };
      }
    }

    // Something went wrong, clear pending
    this.pendingModification = null;
    return {
      success: false,
      message: "I got a bit confused. Let's start over. What would you like to change?",
      shouldSpeak: true,
    };
  }

  /**
   * Clear any pending modification state
   */
  clearPending(): void {
    this.pendingModification = null;
  }

  /**
   * Parse the user's edit request into an operation using LLM
   */
  private async parseEditOperation(
    intent: VoiceIntent,
    itinerary: Itinerary
  ): Promise<EditOperation | null> {
    const text = intent.rawText;

    // Use LLM to understand the intent
    let parsedIntent: ParsedEditIntent;
    try {
      parsedIntent = await parseEditIntent({
        userText: text,
        currentItinerary: itinerary,
      });
      console.log("LLM parsed intent:", parsedIntent);
    } catch (error) {
      console.error("LLM parsing failed, using fallback:", error);
      // Fallback to basic parsing
      parsedIntent = this.fallbackParseIntent(text, itinerary);
    }

    // Determine target day
    let targetDay = parsedIntent.dayNumber || intent.dayNumber || 1;
    if (targetDay > itinerary.days.length) targetDay = itinerary.days.length;
    if (targetDay < 1) targetDay = 1;

    const timeSlot = parsedIntent.timeSlot || intent.timeSlot;

    // Handle based on parsed action
    switch (parsedIntent.action) {
      case "suggest":
        return {
          type: "suggest",
          dayNumber: targetDay,
          description: `Suggest places for Day ${targetDay}`,
        };

      case "swap_days":
        if (parsedIntent.targetDayNumber) {
          return {
            type: "swap_days",
            dayNumber: targetDay,
            targetDayNumber: parsedIntent.targetDayNumber,
            description: `Swap Day ${targetDay} and Day ${parsedIntent.targetDayNumber}`,
          };
        }
        return this.createSwapOperation(targetDay, text.toLowerCase(), itinerary);

      case "add":
        return this.createAddOperation(targetDay, timeSlot, text.toLowerCase(), itinerary);

      case "remove":
        return this.createRemoveOperation(
          targetDay,
          timeSlot,
          text.toLowerCase(),
          itinerary.days[targetDay - 1]
        );

      case "replace":
        // If user wants options first, use two-step flow
        if (parsedIntent.needsOptions) {
          return this.createReplaceWithOptionsOperation(targetDay, timeSlot, text.toLowerCase(), itinerary);
        }
        return this.createReplaceOperation(targetDay, timeSlot, text.toLowerCase(), itinerary);

      case "swap":
        return this.createSwapOperation(targetDay, text.toLowerCase(), itinerary);

      default:
        // Low confidence or unknown - ask for clarification
        if (parsedIntent.confidence < 0.5) {
          return null;
        }
        // Try to make a best guess
        return this.createReplaceWithOptionsOperation(targetDay, timeSlot, text.toLowerCase(), itinerary);
    }
  }

  /**
   * Fallback intent parsing when LLM is unavailable
   */
  private fallbackParseIntent(text: string, itinerary: Itinerary): ParsedEditIntent {
    const lowerText = text.toLowerCase();

    // Extract day number
    let dayNumber: number | undefined;
    const dayMatch = lowerText.match(/day\s*(\d+)/i);
    if (dayMatch) dayNumber = parseInt(dayMatch[1], 10);
    else if (lowerText.includes("first day")) dayNumber = 1;
    else if (lowerText.includes("last day")) dayNumber = itinerary.days.length;
    else if (lowerText.includes("second day")) dayNumber = 2;

    // Extract time slot
    let timeSlot: "morning" | "afternoon" | "evening" | undefined;
    if (/morning/i.test(lowerText)) timeSlot = "morning";
    else if (/afternoon/i.test(lowerText)) timeSlot = "afternoon";
    else if (/evening/i.test(lowerText)) timeSlot = "evening";

    // Determine action
    if (/suggest|recommend|other|options|ideas|what else/i.test(lowerText)) {
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
      const hasTarget = /with\s+(a\s+)?\w+/i.test(lowerText);
      return { action: "replace", dayNumber, timeSlot, needsOptions: !hasTarget, confidence: 0.75 };
    }

    return { action: "unknown", dayNumber, timeSlot, confidence: 0.3 };
  }

  /**
   * Create a remove operation
   */
  private createRemoveOperation(
    dayNumber: number,
    timeSlot: "morning" | "afternoon" | "evening" | undefined,
    text: string,
    day: DayPlan
  ): EditOperation | null {
    // Find the block to remove
    let blockId: string | undefined;

    if (timeSlot) {
      const block = day.blocks.find((b) => b.timeSlot === timeSlot);
      if (block) {
        blockId = block.id;
      }
    } else {
      // Try to find by POI name
      for (const block of day.blocks) {
        if (text.includes(block.poi.name.toLowerCase())) {
          blockId = block.id;
          break;
        }
      }
    }

    // If no specific block found, remove the last one
    if (!blockId && day.blocks.length > 0) {
      blockId = day.blocks[day.blocks.length - 1].id;
    }

    if (!blockId) return null;

    const block = day.blocks.find((b) => b.id === blockId);
    return {
      type: "remove",
      dayNumber,
      blockId,
      timeSlot,
      description: `Remove ${block?.poi.name || "activity"} from Day ${dayNumber}`,
    };
  }

  /**
   * Create an add operation
   */
  private async createAddOperation(
    dayNumber: number,
    timeSlot: "morning" | "afternoon" | "evening" | undefined,
    text: string,
    itinerary: Itinerary
  ): Promise<EditOperation | null> {
    // Try to identify what to add
    const existingPOIIds = itinerary.days
      .flatMap((d) => d.blocks)
      .map((b) => b.poi.id);

    // Search for a POI matching the request
    const searchTerms: string[] = [];

    if (/tea|garden|factory/.test(text)) searchTerms.push("tea");
    if (/restaurant|food|eat|lunch|dinner/.test(text)) searchTerms.push("food");
    if (/church|museum|heritage/.test(text)) searchTerms.push("culture");
    if (/view|scenic|peak|point/.test(text)) searchTerms.push("nature");
    if (/chocolate/.test(text)) searchTerms.push("shopping");
    if (/lake|boat/.test(text)) searchTerms.push("boating");

    // Default to the user's existing interests if no specific request
    const interests =
      searchTerms.length > 0
        ? searchTerms
        : itinerary.preferences.interests || ["nature"];

    const result = await searchPOIs({
      city: "ooty",
      interests,
      pace: itinerary.preferences.pace,
      excludeIds: existingPOIIds,
      timeSlot,
      maxResults: 1,
    });

    if (!result.pois || result.pois.length === 0) {
      return null;
    }

    return {
      type: "add",
      dayNumber,
      timeSlot,
      newPOI: result.pois[0],
      description: `Add ${result.pois[0].name} to Day ${dayNumber}${timeSlot ? ` (${timeSlot})` : ""}`,
    };
  }

  /**
   * Create a swap operation
   */
  private createSwapOperation(
    dayNumber: number,
    text: string,
    itinerary: Itinerary
  ): EditOperation | null {
    const day = itinerary.days[dayNumber - 1];
    if (!day || day.blocks.length < 2) {
      return null;
    }

    // Check for specific swap patterns
    // "swap morning and afternoon"
    const timeSwapMatch = text.match(/(morning|afternoon|evening)\s+(?:and|with)\s+(morning|afternoon|evening)/i);
    if (timeSwapMatch) {
      const slot1 = timeSwapMatch[1].toLowerCase() as "morning" | "afternoon" | "evening";
      const slot2 = timeSwapMatch[2].toLowerCase() as "morning" | "afternoon" | "evening";
      const block1 = day.blocks.find(b => b.timeSlot === slot1);
      const block2 = day.blocks.find(b => b.timeSlot === slot2);

      if (block1 && block2) {
        return {
          type: "swap",
          dayNumber,
          blockId: block1.id,
          targetDayNumber: dayNumber, // Same day swap
          description: `Swap ${slot1} and ${slot2} activities on Day ${dayNumber}`,
        };
      }
    }

    // "shuffle" or "reorder" - reverse the order of activities
    if (/shuffle|reorder|rearrange/i.test(text)) {
      return {
        type: "swap",
        dayNumber,
        description: `Shuffle activities on Day ${dayNumber}`,
      };
    }

    // Default: swap first two activities
    return {
      type: "swap",
      dayNumber,
      blockId: day.blocks[0].id,
      description: `Swap activities on Day ${dayNumber}`,
    };
  }

  /**
   * Create a replace operation
   */
  private async createReplaceOperation(
    dayNumber: number,
    timeSlot: "morning" | "afternoon" | "evening" | undefined,
    text: string,
    itinerary: Itinerary
  ): Promise<EditOperation | null> {
    const day = itinerary.days[dayNumber - 1];
    if (!day) return null;

    // Find which block to replace
    let blockToReplace: TimeBlock | undefined;

    if (timeSlot) {
      blockToReplace = day.blocks.find((b) => b.timeSlot === timeSlot);
    } else {
      // Try to find by name
      for (const block of day.blocks) {
        if (text.includes(block.poi.name.toLowerCase())) {
          blockToReplace = block;
          break;
        }
      }
      // Default to first block
      if (!blockToReplace) {
        blockToReplace = day.blocks[0];
      }
    }

    if (!blockToReplace) return null;

    // Find a replacement POI
    const existingPOIIds = itinerary.days
      .flatMap((d) => d.blocks)
      .map((b) => b.poi.id);

    // Try to identify what kind of replacement is wanted
    let interests = itinerary.preferences.interests || ["nature"];

    if (/indoor|inside|rain/.test(text)) {
      interests = ["culture", "food", "shopping"];
    } else if (/outdoor|outside|nature/.test(text)) {
      interests = ["nature", "adventure"];
    }

    const result = await searchPOIs({
      city: "ooty",
      interests,
      pace: itinerary.preferences.pace,
      excludeIds: existingPOIIds,
      timeSlot: blockToReplace.timeSlot,
      maxResults: 1,
    });

    if (!result.pois || result.pois.length === 0) {
      return null;
    }

    return {
      type: "replace",
      dayNumber,
      blockId: blockToReplace.id,
      timeSlot: blockToReplace.timeSlot,
      newPOI: result.pois[0],
      description: `Replace ${blockToReplace.poi.name} with ${result.pois[0].name}`,
    };
  }

  /**
   * Create a replace operation that shows options first (two-step flow)
   */
  private async createReplaceWithOptionsOperation(
    dayNumber: number,
    timeSlot: "morning" | "afternoon" | "evening" | undefined,
    text: string,
    itinerary: Itinerary
  ): Promise<EditOperation | null> {
    const day = itinerary.days[dayNumber - 1];
    if (!day) return null;

    // Find which block user wants to replace (if specified)
    let blockToReplace: TimeBlock | undefined;

    if (timeSlot) {
      blockToReplace = day.blocks.find((b) => b.timeSlot === timeSlot);
    } else {
      // Try to find by name
      for (const block of day.blocks) {
        if (text.includes(block.poi.name.toLowerCase())) {
          blockToReplace = block;
          break;
        }
      }
    }

    // Search for replacement options
    const existingPOIIds = itinerary.days
      .flatMap((d) => d.blocks)
      .map((b) => b.poi.id);

    const result = await searchPOIs({
      city: "ooty",
      interests: itinerary.preferences.interests || ["nature"],
      pace: itinerary.preferences.pace,
      excludeIds: existingPOIIds,
      maxResults: 5,
    });

    if (!result.pois || result.pois.length === 0) {
      return null;
    }

    // Store pending modification for two-step flow
    this.pendingModification = {
      type: "awaiting_replacement_choice",
      dayNumber,
      blockToReplace,
      options: result.pois,
    };

    return {
      type: "replace_with_options",
      dayNumber,
      blockId: blockToReplace?.id,
      description: "Show replacement options",
      replacementOptions: result.pois,
    };
  }

  /**
   * Apply an edit operation to the itinerary
   */
  private async applyEdit(
    itinerary: Itinerary,
    operation: EditOperation
  ): Promise<AgentResponse> {
    const updatedItinerary = JSON.parse(JSON.stringify(itinerary)) as Itinerary;
    const day = updatedItinerary.days[operation.dayNumber - 1];

    if (!day) {
      return {
        success: false,
        message: `Day ${operation.dayNumber} doesn't exist in the itinerary.`,
        shouldSpeak: true,
      };
    }

    switch (operation.type) {
      case "remove":
        if (operation.blockId) {
          const blockIndex = day.blocks.findIndex(
            (b) => b.id === operation.blockId
          );
          if (blockIndex !== -1) {
            const removed = day.blocks.splice(blockIndex, 1)[0];
            // Recalculate times
            this.recalculateTimes(day);
            updatedItinerary.lastModified = new Date();
            updatedItinerary.version++;

            // Use LLM for natural response
            let message: string;
            try {
              message = await generateEditResponse({
                action: "removed an activity",
                changedItems: [removed.poi.name],
                itinerary: updatedItinerary,
                userRequest: `remove ${removed.poi.name}`,
              });
            } catch {
              message = `I've removed ${removed.poi.name} from Day ${operation.dayNumber}. The schedule has been adjusted.`;
            }

            return {
              success: true,
              message,
              data: {
                itinerary: updatedItinerary,
                changedBlocks: [operation.blockId],
              },
              shouldSpeak: true,
            };
          }
        }
        break;

      case "add":
        if (operation.newPOI) {
          // Generate LLM-powered reasoning for this POI
          let poiReasoning = operation.newPOI.tips?.[0] || "";
          try {
            poiReasoning = await generatePOIReasoning({
              poi: operation.newPOI,
              userInterests: updatedItinerary.preferences.interests || ["nature"],
              timeSlot: operation.timeSlot || "afternoon",
              dayTheme: day.theme,
            });
          } catch {
            // Use fallback
          }

          const newBlock = this.createTimeBlock(
            operation.newPOI,
            operation.timeSlot || "afternoon",
            day.blocks
          );
          newBlock.reasoning = poiReasoning;
          day.blocks.push(newBlock);
          // Sort blocks by time slot
          day.blocks.sort((a, b) => {
            const order = { morning: 0, afternoon: 1, evening: 2 };
            return order[a.timeSlot] - order[b.timeSlot];
          });
          this.recalculateTimes(day);
          updatedItinerary.lastModified = new Date();
          updatedItinerary.version++;

          // Use LLM for natural response
          let message: string;
          try {
            message = await generateEditResponse({
              action: "added a new activity",
              changedItems: [operation.newPOI.name],
              itinerary: updatedItinerary,
              userRequest: `add ${operation.newPOI.name}`,
            });
            message += ` ${poiReasoning}`;
          } catch {
            message = `I've added ${operation.newPOI.name} to Day ${operation.dayNumber}. ${poiReasoning}`;
          }

          return {
            success: true,
            message,
            data: {
              itinerary: updatedItinerary,
              changedBlocks: [newBlock.id],
            },
            shouldSpeak: true,
          };
        }
        break;

      case "replace":
        if (operation.blockId && operation.newPOI) {
          const blockIndex = day.blocks.findIndex(
            (b) => b.id === operation.blockId
          );
          if (blockIndex !== -1) {
            const oldPOI = day.blocks[blockIndex].poi;

            // Generate LLM-powered reasoning for the new POI
            let poiReasoning = operation.newPOI.tips?.[0] || "";
            try {
              poiReasoning = await generatePOIReasoning({
                poi: operation.newPOI,
                userInterests: updatedItinerary.preferences.interests || ["nature"],
                timeSlot: day.blocks[blockIndex].timeSlot,
                dayTheme: day.theme,
              });
            } catch {
              // Use fallback
            }

            day.blocks[blockIndex].poi = operation.newPOI;
            day.blocks[blockIndex].reasoning = poiReasoning;
            day.blocks[blockIndex].notes = `Replaced ${oldPOI.name}`;
            this.recalculateTimes(day);
            updatedItinerary.lastModified = new Date();
            updatedItinerary.version++;

            // Use LLM for natural response
            let message: string;
            try {
              message = await generateEditResponse({
                action: "replaced an activity",
                changedItems: [oldPOI.name, operation.newPOI.name],
                itinerary: updatedItinerary,
                userRequest: `replace ${oldPOI.name} with something else`,
              });
              message += ` ${poiReasoning}`;
            } catch {
              message = `I've replaced ${oldPOI.name} with ${operation.newPOI.name}. ${poiReasoning}`;
            }

            return {
              success: true,
              message,
              data: {
                itinerary: updatedItinerary,
                changedBlocks: [operation.blockId],
              },
              shouldSpeak: true,
            };
          }
        }
        break;

      case "swap":
        if (day.blocks.length >= 2) {
          // Check if it's a shuffle/reorder (reverse order)
          if (operation.description.includes("Shuffle")) {
            // Reverse the order of activities
            day.blocks.reverse();
            this.recalculateTimes(day);
            updatedItinerary.lastModified = new Date();
            updatedItinerary.version++;

            return {
              success: true,
              message: `I've shuffled the activities on Day ${operation.dayNumber}. The order is now: ${day.blocks.map(b => b.poi.name).join(", ")}.`,
              data: {
                itinerary: updatedItinerary,
                changedBlocks: day.blocks.map(b => b.id),
              },
              shouldSpeak: true,
            };
          }

          // Swap specific blocks (morning/afternoon or first two)
          if (operation.blockId) {
            const idx1 = day.blocks.findIndex(b => b.id === operation.blockId);
            const idx2 = idx1 === 0 ? 1 : 0; // Swap with first or second

            if (idx1 !== -1 && day.blocks.length > 1 && idx1 !== idx2) {
              const temp = day.blocks[idx1];
              day.blocks[idx1] = day.blocks[idx2];
              day.blocks[idx2] = temp;
              this.recalculateTimes(day);
              updatedItinerary.lastModified = new Date();
              updatedItinerary.version++;

              return {
                success: true,
                message: `I've swapped ${day.blocks[idx1].poi.name} and ${day.blocks[idx2].poi.name} on Day ${operation.dayNumber}.`,
                data: {
                  itinerary: updatedItinerary,
                  changedBlocks: [day.blocks[idx1].id, day.blocks[idx2].id],
                },
                shouldSpeak: true,
              };
            }
          } else {
            // Default: swap first two
            const temp = day.blocks[0];
            day.blocks[0] = day.blocks[1];
            day.blocks[1] = temp;
            this.recalculateTimes(day);
            updatedItinerary.lastModified = new Date();
            updatedItinerary.version++;

            return {
              success: true,
              message: `I've swapped the first two activities on Day ${operation.dayNumber}: ${day.blocks[0].poi.name} and ${day.blocks[1].poi.name}.`,
              data: {
                itinerary: updatedItinerary,
                changedBlocks: [day.blocks[0].id, day.blocks[1].id],
              },
              shouldSpeak: true,
            };
          }
        }
        break;

      case "adjust_pace":
        if (operation.description.includes("relaxed")) {
          // Remove one activity if there are more than 2
          if (day.blocks.length > 2) {
            const removed = day.blocks.pop()!;
            this.recalculateTimes(day);
            updatedItinerary.lastModified = new Date();
            updatedItinerary.version++;

            return {
              success: true,
              message: `I've made Day ${operation.dayNumber} more relaxed by removing ${removed.poi.name}. You'll have more time to enjoy each place.`,
              data: {
                itinerary: updatedItinerary,
                changedBlocks: [removed.id],
              },
              shouldSpeak: true,
            };
          } else {
            return {
              success: true,
              message: `Day ${operation.dayNumber} already has a relaxed schedule with ${day.blocks.length} activities.`,
              shouldSpeak: true,
            };
          }
        }
        // Handle making it more packed (would search for additional POIs)
        break;

      case "replace_with_options":
        // Show options to user and wait for their selection
        if (operation.replacementOptions && operation.replacementOptions.length > 0) {
          const currentActivities = day.blocks.map(b => `${b.timeSlot}: ${b.poi.name}`).join(", ");

          // Format options with LLM
          try {
            const llmResult = await generateSuggestionResponse({
              suggestions: operation.replacementOptions,
              userInterests: updatedItinerary.preferences.interests || ["nature"],
              currentItinerary: updatedItinerary,
            });

            let message = `Here are some options to replace an activity on Day ${operation.dayNumber}:\n\n`;
            for (let i = 0; i < llmResult.formattedSuggestions.length; i++) {
              const s = llmResult.formattedSuggestions[i];
              message += `${i + 1}. ${s.name}: ${s.reason}\n`;
            }
            message += `\nYour Day ${operation.dayNumber} currently has: ${currentActivities}.\n`;
            message += `Which option would you like? Just say the number or name.`;

            return {
              success: true,
              message,
              data: {
                needsClarification: true,
                awaitingReplacementChoice: true,
                options: operation.replacementOptions,
                formattedSuggestions: llmResult.formattedSuggestions,
                isSelectableList: true,
              },
              shouldSpeak: true,
            };
          } catch {
            // Fallback without LLM
            let message = `Here are some options for Day ${operation.dayNumber}:\n\n`;
            operation.replacementOptions.slice(0, 3).forEach((poi, i) => {
              message += `${i + 1}. ${poi.name} - ${poi.description.slice(0, 50)}...\n`;
            });
            message += `\nWhich would you like? Say the number or name.`;

            return {
              success: true,
              message,
              data: {
                needsClarification: true,
                awaitingReplacementChoice: true,
                options: operation.replacementOptions,
                isSelectableList: true,
              },
              shouldSpeak: true,
            };
          }
        }
        break;

      case "swap_days":
        if (operation.targetDayNumber) {
          const day1Idx = operation.dayNumber - 1;
          const day2Idx = operation.targetDayNumber - 1;

          if (day1Idx >= 0 && day2Idx >= 0 &&
              day1Idx < updatedItinerary.days.length &&
              day2Idx < updatedItinerary.days.length) {
            // Swap the days' blocks and themes
            const day1 = updatedItinerary.days[day1Idx];
            const day2 = updatedItinerary.days[day2Idx];

            // Swap blocks
            const tempBlocks = day1.blocks;
            day1.blocks = day2.blocks;
            day2.blocks = tempBlocks;

            // Swap themes
            const tempTheme = day1.theme;
            day1.theme = day2.theme;
            day2.theme = tempTheme;

            // Recalculate times for both days
            this.recalculateTimes(day1);
            this.recalculateTimes(day2);

            updatedItinerary.lastModified = new Date();
            updatedItinerary.version++;

            const day1Activities = day1.blocks.map(b => b.poi.name).join(", ");
            const day2Activities = day2.blocks.map(b => b.poi.name).join(", ");

            return {
              success: true,
              message: `Done! I've swapped Day ${operation.dayNumber} and Day ${operation.targetDayNumber}. Day ${operation.dayNumber} now has: ${day1Activities}. Day ${operation.targetDayNumber} now has: ${day2Activities}.`,
              data: {
                itinerary: updatedItinerary,
                changedBlocks: [...day1.blocks.map(b => b.id), ...day2.blocks.map(b => b.id)],
              },
              shouldSpeak: true,
            };
          }
        }
        break;

      case "suggest":
        // Search for places not in the itinerary
        const existingPOIIds = updatedItinerary.days
          .flatMap((d) => d.blocks)
          .map((b) => b.poi.id);

        const suggestResult = await searchPOIs({
          city: "ooty",
          interests: updatedItinerary.preferences.interests || ["nature"],
          pace: updatedItinerary.preferences.pace,
          excludeIds: existingPOIIds,
          maxResults: 5, // Get more suggestions for LLM to choose from
        });

        if (suggestResult.pois && suggestResult.pois.length > 0) {
          // Use LLM to generate compelling suggestions with reasons
          try {
            const llmResult = await generateSuggestionResponse({
              suggestions: suggestResult.pois,
              userInterests: updatedItinerary.preferences.interests || ["nature"],
              currentItinerary: updatedItinerary,
            });

            // Format as a numbered list for easy selection
            let message = llmResult.message + "\n\n";
            for (let i = 0; i < llmResult.formattedSuggestions.length; i++) {
              const s = llmResult.formattedSuggestions[i];
              message += `${i + 1}. ${s.name}: ${s.reason}\n`;
            }
            message += `\nJust say "add [name] to Day [number]" to include any of these.`;

            return {
              success: true,
              message,
              data: {
                suggestions: suggestResult.pois.slice(0, llmResult.formattedSuggestions.length),
                formattedSuggestions: llmResult.formattedSuggestions,
                isSelectableList: true, // Flag for UI to show as selectable
              },
              shouldSpeak: true,
            };
          } catch {
            // Fallback
            const suggestions = suggestResult.pois
              .slice(0, 3)
              .map((poi, i) => `${i + 1}. ${poi.name} - ${poi.description.slice(0, 60)}...`)
              .join("\n");

            return {
              success: true,
              message: `Here are some places you might enjoy:\n\n${suggestions}\n\nSay "add [place name] to Day [number]" to include any.`,
              data: {
                suggestions: suggestResult.pois.slice(0, 3),
                isSelectableList: true,
              },
              shouldSpeak: true,
            };
          }
        } else {
          return {
            success: true,
            message: "Your itinerary already covers the best spots in Ooty! Would you like to replace any existing activity instead?",
            shouldSpeak: true,
          };
        }
    }

    return {
      success: false,
      message: "I couldn't complete that edit. Please try rephrasing your request.",
      shouldSpeak: true,
    };
  }

  /**
   * Create a new time block for a POI
   */
  private createTimeBlock(
    poi: POI,
    timeSlot: "morning" | "afternoon" | "evening",
    existingBlocks: TimeBlock[]
  ): TimeBlock {
    const startTimes = {
      morning: "09:00",
      afternoon: "14:00",
      evening: "18:00",
    };

    // Calculate travel time from previous block
    let travelTime = 0;
    if (existingBlocks.length > 0) {
      const lastBlock = existingBlocks[existingBlocks.length - 1];
      const matrix = travelTimesData.matrix as Record<string, Record<string, number>>;
      travelTime = matrix[lastBlock.poi.id]?.[poi.id] || 15;
    }

    const startTime = startTimes[timeSlot];
    const endHour =
      parseInt(startTime.split(":")[0], 10) +
      Math.ceil(poi.estimated_duration_mins / 60);
    const endTime = `${endHour.toString().padStart(2, "0")}:00`;

    return {
      id: `block-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timeSlot,
      startTime,
      endTime,
      poi,
      travelTimeFromPrev: travelTime,
    };
  }

  /**
   * Recalculate times for a day's blocks
   */
  private recalculateTimes(day: DayPlan): void {
    let currentTime = 9 * 60; // Start at 9:00 (in minutes)

    for (let i = 0; i < day.blocks.length; i++) {
      const block = day.blocks[i];

      // Add travel time
      currentTime += block.travelTimeFromPrev;

      // Set start time
      const startHours = Math.floor(currentTime / 60);
      const startMins = currentTime % 60;
      block.startTime = `${startHours.toString().padStart(2, "0")}:${startMins.toString().padStart(2, "0")}`;

      // Add activity duration
      currentTime += block.poi.estimated_duration_mins;

      // Set end time
      const endHours = Math.floor(currentTime / 60);
      const endMins = currentTime % 60;
      block.endTime = `${endHours.toString().padStart(2, "0")}:${endMins.toString().padStart(2, "0")}`;

      // Update time slot based on actual time
      if (startHours < 12) {
        block.timeSlot = "morning";
      } else if (startHours < 17) {
        block.timeSlot = "afternoon";
      } else {
        block.timeSlot = "evening";
      }

      // Add buffer
      currentTime += 15;
    }

    // Update day totals
    day.totalDuration = day.blocks.reduce(
      (sum, b) => sum + b.poi.estimated_duration_mins,
      0
    );
    day.totalTravelTime = day.blocks.reduce(
      (sum, b) => sum + b.travelTimeFromPrev,
      0
    );
  }
}

// Export singleton instance
export const editAgent = new EditAgent();
