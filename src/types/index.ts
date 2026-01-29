// ============================================
// POI (Point of Interest) Types
// ============================================

export interface Coordinates {
  lat: number;
  lng: number;
}

export interface POI {
  id: string;
  name: string;
  category: string[];
  coordinates: Coordinates;
  estimated_duration_mins: number;
  best_time: "morning" | "afternoon" | "evening" | "any";
  crowd_level: "low" | "medium" | "high";
  accessibility: "easy" | "moderate" | "difficult";
  cost_inr: number;
  description: string;
  tips: string[];
  source: "osm" | "wikivoyage" | "local";
  dietary?: "veg" | "non-veg" | "both"; // For food spots
  mealType?: "breakfast" | "lunch" | "dinner" | "snack" | "any"; // For food spots
}

export interface POIDataset {
  city: string;
  lastUpdated: string;
  pois: POI[];
}

// ============================================
// Trip Preferences (from user)
// ============================================

export interface TripPreferences {
  city: string;
  startDate: Date;
  endDate: Date;
  numDays: number;
  interests: string[]; // nature, food, culture, adventure, relaxation
  pace: "relaxed" | "moderate" | "packed";
  budget: "budget" | "moderate" | "luxury";
  mobility: "full" | "limited";
  travelParty: "solo" | "couple" | "family" | "group";
  groupSize?: number; // Number of people for vehicle selection
  vehicleType?: "hatchback" | "sedan" | "suv" | "tempo"; // For cost calculation
  dietaryPreference?: "veg" | "non-veg" | "any"; // Food preference
  specialRequests?: string;
}

// ============================================
// Time Block in Itinerary
// ============================================

export interface TimeBlock {
  id: string;
  timeSlot: "morning" | "afternoon" | "evening";
  startTime: string; // "09:00"
  endTime: string; // "12:00"
  poi: POI;
  travelTimeFromPrev: number; // mins
  notes?: string;
  reasoning?: string; // why this POI was selected
}

// ============================================
// Day Plan
// ============================================

export interface DayWeather {
  temperature: { min: number; max: number };
  condition: string; // "sunny" | "cloudy" | "rainy" | "misty"
  humidity?: number;
  tip?: string;
}

export interface DayPlan {
  dayNumber: number;
  date: Date;
  blocks: TimeBlock[];
  totalDuration: number; // total activity time in mins
  totalTravelTime: number; // total travel time in mins
  totalDistanceKm?: number; // total travel distance
  travelCostInr?: number; // estimated vehicle cost
  weatherNote?: string;
  weather?: DayWeather; // Weather forecast for the day
  theme?: string; // e.g., "Nature Day", "Cultural Exploration"
}

// ============================================
// Full Itinerary
// ============================================

export interface Itinerary {
  id: string;
  preferences: TripPreferences;
  days: DayPlan[];
  createdAt: Date;
  lastModified: Date;
  version: number;
  sources: Citation[];
}

// ============================================
// Voice Command Intent
// ============================================

export type IntentType = "plan" | "edit" | "query" | "confirm" | "unclear";

export interface VoiceIntent {
  type: IntentType;
  action?: string; // e.g., "add", "remove", "swap", "replace"
  target?: "day" | "block" | "full" | "poi";
  dayNumber?: number;
  timeSlot?: "morning" | "afternoon" | "evening";
  blockId?: string;
  parameters?: Record<string, unknown>;
  rawText: string;
  confidence: number;
}

// ============================================
// MCP Tool Interfaces
// ============================================

export interface MCPToolRequest {
  tool: string;
  inputs: Record<string, unknown>;
}

export interface MCPToolResponse {
  success: boolean;
  data: unknown;
  sources: string[];
  processingTime: number;
}

// POI Search specific
export interface POISearchInput {
  city: string;
  interests: string[];
  pace: string;
  excludeIds?: string[];
  timeSlot?: "morning" | "afternoon" | "evening";
  maxResults?: number;
}

export interface POISearchOutput {
  pois: POI[];
  reasoning: string;
  sources: string[];
}

// Itinerary Builder specific
export interface ItineraryBuilderInput {
  pois: POI[];
  numDays: number;
  pace: "relaxed" | "moderate" | "packed";
  startTime: string;
  endTime: string;
  travelTimeMatrix: Record<string, Record<string, number>>;
}

export interface ItineraryBuilderOutput {
  days: DayPlan[];
  unscheduled: POI[];
  feasibilityScore: number;
  warnings: string[];
}

// ============================================
// Evaluation Result
// ============================================

export type EvalType = "feasibility" | "edit_correctness" | "grounding";

export interface EvalIssue {
  day?: number;
  blockId?: string;
  issue: string;
  severity: "low" | "medium" | "high";
}

export interface EvalResult {
  evalType: EvalType;
  passed: boolean;
  score: number; // 0-100
  issues: EvalIssue[];
  details: Record<string, unknown>;
  timestamp: Date;
}

// ============================================
// RAG and Citations
// ============================================

export interface Citation {
  text: string;
  source: string;
  url?: string;
  relevanceScore?: number;
}

export interface Document {
  id: string;
  content: string;
  source: string;
  metadata: Record<string, unknown>;
}

export interface SearchResult {
  document: Document;
  score: number;
  highlights?: string[];
}

export interface RetrievalResult {
  context: string;
  sources: Citation[];
}

// ============================================
// Conversation and Messages
// ============================================

export type MessageRole = "user" | "assistant" | "system";

export interface Message {
  id: string;
  role: MessageRole;
  content: string;
  timestamp: Date;
  intent?: VoiceIntent;
  sources?: Citation[];
}

export interface ConversationContext {
  messages: Message[];
  currentItinerary: Itinerary | null;
  preferences: TripPreferences | null;
  pendingQuestion: string | null;
  clarificationCount: number;
}

// ============================================
// Voice State
// ============================================

export type VoiceStatus = "idle" | "listening" | "processing" | "speaking" | "error";

export interface VoiceState {
  status: VoiceStatus;
  isListening: boolean;
  transcript: string;
  interimTranscript: string;
  error: string | null;
}

export interface VoiceHistoryEntry {
  text: string;
  timestamp: Date;
  isUser: boolean;
}

// ============================================
// UI State
// ============================================

export interface UIState {
  activeDay: number;
  isSourcesPanelOpen: boolean;
  isEvalPanelOpen: boolean;
  highlightedBlocks: string[];
  isDemoMode: boolean;
}

// ============================================
// Travel Time Matrix
// ============================================

export interface TravelTimeData {
  description: string;
  lastUpdated: string;
  mode: string;
  notes: string[];
  locations: string[];
  matrix: Record<string, Record<string, number>>;
}

// ============================================
// City Guide Types
// ============================================

export interface WeatherSeason {
  name: string;
  months: string[];
  temperature: {
    min: number;
    max: number;
    unit: string;
  };
  description: string;
  tips: string[];
}

export interface TransportOption {
  mode: string;
  details: string;
  duration?: string;
  cost?: string;
  tips?: string[];
}

export interface FoodSpecialty {
  name: string;
  description: string;
  whereToTry: string[];
}

export interface CityGuide {
  city: string;
  fullName: string;
  state: string;
  country: string;
  description: string;
  lastUpdated: string;
  bestMonthsToVisit: {
    peak: string[];
    good: string[];
    offSeason: string[];
    notes: Record<string, string>;
  };
  weather: {
    overview: string;
    seasons: WeatherSeason[];
  };
  localEtiquette: Array<{ topic: string; advice: string }>;
  safetyTips: Array<{ category: string; tips: string[] }>;
  transportation: {
    gettingThere: TransportOption[];
    gettingAround: TransportOption[];
  };
  foodSpecialties: FoodSpecialty[];
  packingRecommendations: Record<string, string[]>;
  emergencyContacts: Record<string, string>;
  usefulPhrases: {
    tamil: Array<{ english: string; local: string }>;
    notes: string;
  };
}

// ============================================
// n8n Workflow Types
// ============================================

export interface EmailWorkflowPayload {
  itinerary: FormattedItinerary;
  email: string;
  name: string;
  generatedAt: string;
}

export interface FormattedItinerary {
  title: string;
  tripDates: string;
  summary: string;
  days: FormattedDay[];
  sources: string[];
}

export interface FormattedDay {
  dayNumber: number;
  date: string;
  activities: FormattedActivity[];
}

export interface FormattedActivity {
  time: string;
  name: string;
  duration: string;
  description: string;
  tips: string[];
  travelTime?: string;
}

// ============================================
// LLM Response Types
// ============================================

export interface LLMResponse {
  text: string;
  intent?: VoiceIntent;
  itineraryUpdate?: Partial<Itinerary>;
  sources?: Citation[];
  followUpQuestion?: string;
}

export interface AgentResponse {
  success: boolean;
  message: string;
  data?: unknown;
  sources?: Citation[];
  shouldSpeak?: boolean;
}

// ============================================
// Configuration Types
// ============================================

export type LLMProvider = "openai" | "anthropic" | "gemini";

export interface AppConfig {
  llm: {
    provider: LLMProvider;
    model: string;
    apiKey?: string;
  };
  voice: {
    silenceTimeout: number;
    maxDuration: number;
  };
  itinerary: {
    defaultStartTime: string;
    defaultEndTime: string;
    bufferMins: number;
  };
}
