"use client";

import React, { useEffect, useCallback, useState } from "react";
import { Mountain, RefreshCw, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { VoiceInput } from "@/components/voice/VoiceInput";
import { VoiceOutput } from "@/components/voice/VoiceOutput";
import { TextInput } from "@/components/voice/TextInput";
import { ItineraryView } from "@/components/itinerary/ItineraryView";
import { SourcesPanel } from "@/components/itinerary/SourcesPanel";
import { SuggestionList, type SuggestionItem } from "@/components/itinerary/SuggestionList";
import { EmailDialog } from "@/components/email/EmailDialog";
import { DebugPanel, DebugButton } from "@/components/debug/DebugPanel";
import { useTripStore } from "@/lib/stores/tripStore";
import { useVoiceStore } from "@/lib/stores/voiceStore";
import { useConversationStore } from "@/lib/stores/conversationStore";
import { useUIStore } from "@/lib/stores/uiStore";
import { useDebugStore } from "@/lib/stores/debugStore";
import type { POI, Itinerary } from "@/types";
// LLM calls go through API routes (not direct imports) for Vercel compatibility
async function processWithOrchestrator(transcript: string, itinerary?: Itinerary | null) {
  const response = await fetch("/api/orchestrator", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "process", transcript, itinerary }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.details || error.error || "Failed to process");
  }

  const data = await response.json();
  return { response: data.response, itinerary: data.itinerary };
}

async function resetOrchestrator() {
  await fetch("/api/orchestrator", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "reset" }),
  });
}
import { speak, stopSpeaking } from "@/services/tts";
import { initializeRAG } from "@/services/rag";

export default function Home() {
  const { itinerary, setItinerary, setLoading, isLoading } = useTripStore();
  const { setCurrentResponse, addToHistory, setStatus } = useVoiceStore();
  const { addMessage, setProcessing, isProcessing } = useConversationStore();
  const { isDemoMode } = useUIStore();
  const { logInfo, logSuccess, logError } = useDebugStore();
  const [isEmailDialogOpen, setIsEmailDialogOpen] = useState(false);
  const [suggestions, setSuggestions] = useState<SuggestionItem[]>([]);
  const [currentResponseData, setCurrentResponseData] = useState<{
    swapMode?: boolean;
    swapTarget?: { dayNumber: number; timeSlot: "morning" | "afternoon" | "evening" };
  } | null>(null);

  // Initialize RAG on mount
  useEffect(() => {
    logInfo("system", "Initializing application...");
    initializeRAG()
      .then(() => logSuccess("system", "RAG system initialized"))
      .catch((err) => logError("system", "Failed to initialize RAG", err));
  }, [logInfo, logSuccess, logError]);

  // Handle voice transcript completion
  const handleTranscriptComplete = useCallback(
    async (transcript: string) => {
      if (!transcript.trim()) return;

      // Stop any current speech immediately when user starts speaking
      stopSpeaking();

      // Log user input
      logInfo("user", `Voice input: "${transcript}"`);

      // Add user message
      addMessage({ role: "user", content: transcript });
      addToHistory(transcript, true);

      // Set processing state
      setProcessing(true);
      setStatus("processing");
      setLoading(true);

      try {
        // Process with orchestrator via API route
        logInfo("system", "Processing with orchestrator...");
        const startTime = Date.now();
        const result = await processWithOrchestrator(transcript, itinerary);
        const duration = Date.now() - startTime;

        const response = result.response;

        logSuccess("system", `Orchestrator responded in ${duration}ms`, {
          intent: response.data,
        });

        // Update conversation
        addMessage({
          role: "assistant",
          content: response.message,
          sources: response.sources,
        });
        setCurrentResponse(response.message);
        addToHistory(response.message, false);

        // Update itinerary if returned
        if (result.itinerary) {
          setItinerary(result.itinerary);
          logSuccess("system", "Itinerary updated", {
            days: result.itinerary.days.length,
          });
        }

        // Check for PDF export trigger
        const responseData = response.data as {
          suggestions?: POI[];
          formattedSuggestions?: Array<{ name: string; reason: string }>;
          isSelectableList?: boolean;
          shouldExportPdf?: boolean;
          itinerary?: Itinerary;
          swapMode?: boolean;
          swapTarget?: { dayNumber: number; timeSlot: "morning" | "afternoon" | "evening" };
        } | undefined;

        // Store response data for UI components
        setCurrentResponseData(responseData ? {
          swapMode: responseData.swapMode,
          swapTarget: responseData.swapTarget,
        } : null);

        // Auto-export PDF if thank you was detected
        if (responseData?.shouldExportPdf && responseData?.itinerary) {
          logInfo("system", "Auto-exporting PDF after thank you");
          const { exportToPdf } = await import("@/services/pdf/exportPdf");
          exportToPdf(responseData.itinerary);
        }

        if (responseData?.isSelectableList && responseData?.formattedSuggestions) {
          // Use formatted suggestions from LLM
          const formattedSuggestions: SuggestionItem[] = responseData.formattedSuggestions.map((s, i) => ({
            name: s.name,
            reason: s.reason,
            poi: responseData.suggestions?.[i],
          }));
          setSuggestions(formattedSuggestions);
          logInfo("system", `Received ${formattedSuggestions.length} suggestions`);
        } else if (responseData?.suggestions) {
          // Fallback to raw POI suggestions
          const poiSuggestions: SuggestionItem[] = responseData.suggestions.map((poi: POI) => ({
            name: poi.name,
            reason: poi.description.slice(0, 100) + "...",
            poi,
          }));
          setSuggestions(poiSuggestions);
        } else {
          // Clear suggestions if not a suggestion response
          setSuggestions([]);
          setCurrentResponseData(null);
        }

        // Set response for TTS
        setCurrentResponse(response.message);

        // Speak the response
        if (response.shouldSpeak) {
          logInfo("voice", "Speaking response via TTS");
          speak(response.message);
        }
      } catch (error) {
        logError("system", "Error processing voice input", error);
        const errorMessage = "I'm sorry, I had trouble processing that. Please try again.";
        addMessage({ role: "assistant", content: errorMessage });
        setCurrentResponse(errorMessage);
        speak(errorMessage);
      } finally {
        setProcessing(false);
        setStatus("idle");
        setLoading(false);
      }
    },
    [
      itinerary,
      setItinerary,
      addMessage,
      addToHistory,
      setProcessing,
      setStatus,
      setLoading,
      setCurrentResponse,
      setCurrentResponseData,
      logInfo,
      logSuccess,
      logError,
    ]
  );

  // Handle text input submission
  const handleTextSubmit = useCallback(
    async (text: string) => {
      logInfo("user", `Text input: "${text}"`);
      // Reuse the same handler as voice input
      await handleTranscriptComplete(text);
    },
    [handleTranscriptComplete, logInfo]
  );

  // Handle new trip
  const handleNewTrip = useCallback(async () => {
    logInfo("system", "Starting new trip");
    await resetOrchestrator();
    setItinerary(null);
    setCurrentResponse("");
    setSuggestions([]);
    addMessage({
      role: "assistant",
      content: "Let's plan a new trip! Tell me about your Ooty adventure.",
    });
    speak("Let's plan a new trip! Tell me about your Ooty adventure.");
  }, [setItinerary, setCurrentResponse, addMessage, logInfo]);

  // Handle suggestion selection
  const handleSuggestionSelect = useCallback(
    async (suggestion: SuggestionItem, dayNumber?: number, timeSlot?: "morning" | "afternoon" | "evening") => {
      let command: string;
      if (timeSlot && dayNumber) {
        // Swap mode
        command = `replace the ${timeSlot} activity on Day ${dayNumber} with ${suggestion.name}`;
      } else if (dayNumber) {
        // Add mode with day
        command = `add ${suggestion.name} to Day ${dayNumber}`;
      } else {
        // Quick add
        command = `add ${suggestion.name}`;
      }
      logInfo("user", `Suggestion selected: ${command}`);
      setSuggestions([]); // Clear suggestions
      await handleTranscriptComplete(command);
    },
    [handleTranscriptComplete, logInfo]
  );

  // Get available days for suggestions
  const availableDays = itinerary?.days.map(d => d.dayNumber) || [1, 2, 3];

  return (
    <div className="h-screen flex flex-col bg-background">
      {/* Header */}
      <header className="flex-shrink-0 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center">
              <Mountain className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h1 className="font-semibold text-lg">Ooty Trip Planner</h1>
              <p className="text-xs text-muted-foreground">
                Voice-powered travel planning
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {itinerary && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleNewTrip}
                  className="hidden sm:flex"
                >
                  <RefreshCw className="w-4 h-4 mr-2" />
                  New Trip
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="hidden sm:flex"
                  onClick={() => setIsEmailDialogOpen(true)}
                >
                  <Mail className="w-4 h-4 mr-2" />
                  Email
                </Button>
              </>
            )}
            {isDemoMode && (
              <span className="px-2 py-1 bg-amber-100 text-amber-800 text-xs rounded-full">
                Demo Mode
              </span>
            )}
            {/* Debug Button */}
            <DebugButton />
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex overflow-hidden">
        {/* Desktop Layout */}
        <div className="hidden md:flex flex-1">
          {/* Itinerary Panel (70%) */}
          <div className="w-[70%] border-r overflow-hidden flex flex-col">
            <ItineraryView
              className="flex-1"
              onEdit={(dayNum, spotNum) => {
                handleTranscriptComplete(`I want to change spot ${spotNum} on Day ${dayNum}`);
              }}
              onExplain={(poiName) => {
                handleTranscriptComplete(`Explain ${poiName} from my itinerary`);
              }}
            />
          </div>

          {/* Voice Panel (30%) */}
          <div className="w-[30%] flex flex-col bg-muted/20">
            <div className="flex-1 flex flex-col p-6 overflow-y-auto">
              <div className="flex-1 flex flex-col justify-center">
                <VoiceInput
                  onTranscriptComplete={handleTranscriptComplete}
                  disabled={isProcessing || isLoading}
                />
                {/* Text Input */}
                <div className="mt-4">
                  <div className="text-xs text-muted-foreground text-center mb-2">
                    or type your message
                  </div>
                  <TextInput
                    onSubmit={handleTextSubmit}
                    disabled={isProcessing || isLoading}
                    placeholder="Type here to test..."
                  />
                </div>
              </div>

              {/* Suggestions List */}
              {suggestions.length > 0 && (
                <div className="mt-4">
                  <SuggestionList
                    suggestions={suggestions}
                    onSelect={handleSuggestionSelect}
                    availableDays={availableDays}
                    title="Suggested Places"
                    mode={currentResponseData?.swapMode ? "swap" : "add"}
                    swapTarget={currentResponseData?.swapTarget}
                  />
                </div>
              )}
            </div>
            <div className="border-t p-4">
              <VoiceOutput autoSpeak={false} />
            </div>
          </div>
        </div>

        {/* Mobile Layout */}
        <div className="flex md:hidden flex-col flex-1">
          {/* Itinerary */}
          <div className="flex-1 overflow-hidden">
            <ItineraryView
              onEdit={(dayNum, spotNum) => {
                handleTranscriptComplete(`I want to change spot ${spotNum} on Day ${dayNum}`);
              }}
              onExplain={(poiName) => {
                handleTranscriptComplete(`Explain ${poiName} from my itinerary`);
              }}
            />
          </div>

          {/* Suggestions (mobile) */}
          {suggestions.length > 0 && (
            <div className="flex-shrink-0 border-t p-3 max-h-48 overflow-y-auto bg-muted/10">
              <SuggestionList
                suggestions={suggestions}
                onSelect={handleSuggestionSelect}
                availableDays={availableDays}
                title="Suggested Places"
                mode={currentResponseData?.swapMode ? "swap" : "add"}
                swapTarget={currentResponseData?.swapTarget}
              />
            </div>
          )}

          {/* Fixed Voice Panel at Bottom */}
          <div className="flex-shrink-0 border-t bg-background p-4 space-y-3">
            <VoiceOutput autoSpeak={false} className="max-h-20 overflow-y-auto" />
            <div className="flex items-center gap-2">
              <div className="flex-1">
                <TextInput
                  onSubmit={handleTextSubmit}
                  disabled={isProcessing || isLoading}
                  placeholder="Type or use voice..."
                />
              </div>
              <VoiceInput
                onTranscriptComplete={handleTranscriptComplete}
                disabled={isProcessing || isLoading}
                className="pb-safe"
              />
            </div>
          </div>
        </div>
      </main>

      {/* Sources Panel */}
      <SourcesPanel />

      {/* Loading Overlay */}
      {(isProcessing || isLoading) && (
        <div className="fixed inset-0 bg-background/50 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-card p-6 rounded-lg shadow-lg text-center space-y-4">
            <div className="relative w-12 h-12 mx-auto">
              <div className="absolute inset-0 border-4 border-primary/30 rounded-full" />
              <div className="absolute inset-0 border-4 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
            <p className="text-sm text-muted-foreground">
              {isLoading ? "Creating your itinerary..." : "Processing..."}
            </p>
          </div>
        </div>
      )}

      {/* Email Dialog */}
      {itinerary && (
        <EmailDialog
          open={isEmailDialogOpen}
          onOpenChange={setIsEmailDialogOpen}
          itinerary={itinerary}
        />
      )}

      {/* Debug Panel */}
      <DebugPanel />
    </div>
  );
}
