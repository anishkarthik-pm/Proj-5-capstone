import type { VoiceIntent, IntentType } from "@/types";

// Keywords for intent classification
const PLAN_KEYWORDS = [
  "plan",
  "create",
  "make",
  "generate",
  "build",
  "schedule",
  "trip",
  "visit",
  "itinerary",
  "days",
  "weekend",
  "vacation",
  "holiday",
  "going to",
  "want to go",
  "help me plan",
  "traveling to",
];

const EDIT_KEYWORDS = [
  "change",
  "modify",
  "update",
  "remove",
  "delete",
  "add",
  "swap",
  "replace",
  "move",
  "instead",
  "rather",
  "different",
  "make it",
  "can we",
  "could you",
  "switch",
  "adjust",
  "more relaxed",
  "more packed",
  "cancel",
  "skip",
  "shuffle",
  "reorder",
  "rearrange",
  "drop",
  "take out",
  "put in",
  "include",
];

const QUERY_KEYWORDS = [
  "why",
  "what",
  "how",
  "tell me",
  "explain",
  "what if",
  "is it",
  "are there",
  "can you tell",
  "what's special",
  "more about",
  "details",
  "recommend",
  "suggestion",
  "opinion",
  "doable",
  "feasible",
  "about the",
  "about this",
  "describe",
  "info about",
  "information",
  "what about",
  "know about",
  "talk about",
  "tell me about",
  "explain this",
  "explain that",
  "explain the",
  "tell me more",
  "more info",
  "info on",
];

const CONFIRM_KEYWORDS = [
  "yes",
  "okay",
  "ok",
  "sure",
  "confirm",
  "that's good",
  "sounds good",
  "perfect",
  "great",
  "go ahead",
  "proceed",
  "do it",
  "approve",
  "accept",
  "no changes",
  "looks good",
];

const NEGATIVE_KEYWORDS = [
  "no",
  "don't",
  "not",
  "cancel",
  "nevermind",
  "never mind",
  "forget",
  "stop",
];

const CLOSURE_KEYWORDS = [
  "thank you",
  "thanks",
  "that's it",
  "i'm done",
  "finished",
  "nothing else",
  "that's all",
  "no more",
  "thank you very much",
  "perfect thanks",
  "all set",
  "bye",
  "goodbye",
];

// Day number extraction patterns
const DAY_PATTERNS = [
  /day\s*(\d+)/i,
  /(\d+)(?:st|nd|rd|th)\s*day/i,
  /on\s*day\s*(\d+)/i,
  /for\s*day\s*(\d+)/i,
];

// Time slot extraction patterns
const TIME_SLOT_PATTERNS = {
  morning: /morning|breakfast|early|am\b|first/i,
  afternoon: /afternoon|lunch|midday|noon/i,
  evening: /evening|dinner|night|sunset|late/i,
};

// Action patterns for edits
const ACTION_PATTERNS = {
  add: /add|include|put\s+in|insert/i,
  remove: /remove|delete|cancel|skip|drop|take\s+out/i,
  swap: /swap|switch|exchange|shuffle|reorder|rearrange/i,
  replace: /replace|change.*to|instead\s+of|substitute/i,
  move: /move|shift|reschedule/i,
};

/**
 * Classify the intent from a user's voice transcript
 */
export async function classifyIntent(
  transcript: string,
  hasExistingItinerary: boolean = false
): Promise<VoiceIntent> {
  const normalizedText = transcript.toLowerCase().trim();

  // Extract features from the transcript
  const dayNumber = extractDayNumber(normalizedText);
  const timeSlot = extractTimeSlot(normalizedText);
  const action = extractAction(normalizedText);

  // Calculate scores for each intent type
  const scores: Record<IntentType, number> = {
    plan: calculateScore(normalizedText, PLAN_KEYWORDS),
    edit: calculateScore(normalizedText, EDIT_KEYWORDS),
    query: calculateScore(normalizedText, QUERY_KEYWORDS),
    confirm: calculateScore(normalizedText, CONFIRM_KEYWORDS),
    closure: calculateScore(normalizedText, CLOSURE_KEYWORDS),
    unclear: 0,
  };

  // Adjust scores based on context
  if (hasExistingItinerary) {
    // More likely to be edit or query if itinerary exists
    scores.edit *= 1.2;
    scores.query *= 1.1;
    scores.plan *= 0.7;
  } else {
    // More likely to be planning if no itinerary
    scores.plan *= 1.3;
    scores.edit *= 0.5;
  }

  // Boost edit score if day/time mentioned and not a query
  if ((dayNumber || timeSlot) && !normalizedText.includes("why")) {
    scores.edit *= 1.3;
  }

  // Strongly boost edit score if action pattern is detected
  if (action) {
    scores.edit *= 1.5;
    // Reduce plan score when clear edit action is present
    scores.plan *= 0.5;
  }

  // Check for negative responses
  if (NEGATIVE_KEYWORDS.some((kw) => normalizedText.startsWith(kw))) {
    scores.confirm = 0;
  }

  // Find the highest scoring intent
  let maxScore = 0;
  let intentType: IntentType = "unclear";

  for (const [type, score] of Object.entries(scores)) {
    if (score > maxScore && score > 0.1) {
      maxScore = score;
      intentType = type as IntentType;
    }
  }

  // If no clear intent, mark as unclear
  if (maxScore < 0.1) {
    intentType = "unclear";
  }

  // Calculate confidence
  const totalScore = Object.values(scores).reduce((a, b) => a + b, 0);
  const confidence =
    totalScore > 0 ? Math.min(0.95, maxScore / totalScore + 0.2) : 0.2;

  // Determine target for edits
  let target: VoiceIntent["target"] = undefined;
  if (intentType === "edit") {
    if (normalizedText.includes("whole") || normalizedText.includes("entire")) {
      target = "full";
    } else if (dayNumber) {
      target = timeSlot ? "block" : "day";
    } else {
      target = "block";
    }
  }

  return {
    type: intentType,
    action,
    target,
    dayNumber,
    timeSlot,
    rawText: transcript,
    confidence,
    parameters: extractParameters(normalizedText),
  };
}

/**
 * Calculate a score based on keyword matches
 */
function calculateScore(text: string, keywords: string[]): number {
  let score = 0;
  let matches = 0;

  for (const keyword of keywords) {
    if (text.includes(keyword)) {
      matches++;
      // Longer keywords are more specific
      score += keyword.length / 20;
    }
  }

  // Normalize by number of keywords (but give more weight to matches)
  return matches > 0 ? (score * 0.5) + (matches * 0.2) : 0;
}

/**
 * Extract day number from text
 */
function extractDayNumber(text: string): number | undefined {
  for (const pattern of DAY_PATTERNS) {
    const match = text.match(pattern);
    if (match && match[1]) {
      const num = parseInt(match[1], 10);
      if (num > 0 && num <= 14) {
        return num;
      }
    }
  }

  // Check for ordinal references
  if (text.includes("first day")) return 1;
  if (text.includes("second day")) return 2;
  if (text.includes("third day")) return 3;
  if (text.includes("last day")) return -1; // Special marker for last day

  return undefined;
}

/**
 * Extract time slot from text
 */
function extractTimeSlot(
  text: string
): "morning" | "afternoon" | "evening" | undefined {
  for (const [slot, pattern] of Object.entries(TIME_SLOT_PATTERNS)) {
    if (pattern.test(text)) {
      return slot as "morning" | "afternoon" | "evening";
    }
  }
  return undefined;
}

/**
 * Extract action type from text
 */
function extractAction(text: string): string | undefined {
  for (const [action, pattern] of Object.entries(ACTION_PATTERNS)) {
    if (pattern.test(text)) {
      return action;
    }
  }
  return undefined;
}

/**
 * Extract additional parameters from the text
 */
function extractParameters(text: string): Record<string, unknown> {
  const params: Record<string, unknown> = {};

  // Extract POI mentions (basic - would be enhanced with actual POI data)
  const poiPatterns = [
    /(?:visit|go to|add|include|at)\s+(?:the\s+)?([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/g,
    /([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+(?:peak|lake|garden|falls|museum|church)/gi,
  ];

  const poiMentions: string[] = [];
  for (const pattern of poiPatterns) {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      poiMentions.push(match[1] || match[0]);
    }
  }

  if (poiMentions.length > 0) {
    params.poiMentions = poiMentions;
  }

  // Extract duration mentions
  const durationMatch = text.match(/(\d+)\s*(?:day|days)/i);
  if (durationMatch) {
    params.numDays = parseInt(durationMatch[1], 10);
  }

  // Extract pace mentions
  if (text.includes("relaxed") || text.includes("easy") || text.includes("slow")) {
    params.pace = "relaxed";
  } else if (text.includes("packed") || text.includes("busy") || text.includes("full")) {
    params.pace = "packed";
  }

  // Extract interest mentions
  const interests: string[] = [];
  if (text.includes("nature") || text.includes("scenic") || text.includes("view")) {
    interests.push("nature");
  }
  if (text.includes("food") || text.includes("eat") || text.includes("restaurant")) {
    interests.push("food");
  }
  if (text.includes("culture") || text.includes("heritage") || text.includes("history")) {
    interests.push("culture");
  }
  if (text.includes("adventure") || text.includes("trek") || text.includes("hike")) {
    interests.push("adventure");
  }
  if (text.includes("relax") || text.includes("peaceful") || text.includes("quiet")) {
    interests.push("relaxation");
  }

  if (interests.length > 0) {
    params.interests = interests;
  }

  return params;
}

export default classifyIntent;
